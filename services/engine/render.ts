// MathBrain Engine v2 - LaTeX renderer (Stage 5, the last one: lexer ->
// document -> disambiguator -> expression parser -> RENDERER).
//
// This file is the SINGLE home of output policy. No other stage decides what
// the LaTeX looks like: the lexer/parser/disambiguator produce meaning, and
// every question of the form "what characters does the user actually see"
// - spacing, delimiter growth, \frac vs \cfrac, indentation, numbering,
// which macro a symbol maps to - is answered here and only here.
//
// Three entry points, one per level of the document:
//   renderExpr(expr, highlight?)                      - one expression
//   renderStatement(tokens, indent, diags, highlight?) - one source line
//   renderDocument(ast, diags, parsed?)               - the whole document
//
// renderStatement is a thin composition of two lower-level exports:
// parseStatement (segment + parse each math run ONCE) and renderSegments
// (render only - adds no diagnostics). They are split out, and renderDocument
// is built on top of them rather than on renderStatement directly, so
// engine.ts can capture the parsed Expr trees per statement (for caret->node
// lookup) without paying for a second parse or duplicating every diagnostic
// the first one already emitted: it hands its own Block -> ParsedSegment[]
// map back in as renderDocument's optional `parsed` argument, and the map's
// entries are used instead of re-parsing. Callers that have no such map
// (the tests, any direct user of the renderer) simply omit it and get the
// parse-as-you-go behaviour.
//
// ---- The spacing model (the part that is easy to get subtly wrong) ----
//
// Almost all math-to-math joins go through cat(), which concatenates TIGHTLY
// and inserts a single space only where LaTeX itself would otherwise mis-lex
// the result: after a control WORD (`\in`, `\forall`, `\cdot`, ...) that is
// immediately followed by a letter, digit or minus sign. So `x` + `\in` + `A`
// is `x\in A` (the space is mandatory), while `0` + `\le` + `\left|` is
// `0\le\left|` (a backslash already ends the control word). This is what
// keeps the output free of `\ ` spam while staying correct.
//
// A visible `\ ` is emitted in exactly three places, all of them clause
// boundaries rather than token boundaries:
//   * between the two sides of a 'seq' BinOp (the parser's "loose adjacency"
//     node: quantifier clauses, ':'/','/'.'/';' connectors) - see seqSep();
//   * between a math run that is a complete clause and a following prose run
//     (renderStatement) - `5\cdot t\ \text{and note ...}`;
//   * inside a set-builder, around the `\middle|`.
//
// Prose spacing works the other way round: the space lives INSIDE the
// \text{...} braces (`\text{Let }a`, `b\text{ and }c`), which is why adjacent
// \text groups are merged by appendMerged() - `\text{ be real numbers }` from
// a prose run and `\text{ s.t. }` from a `suchthat` symbol become one
// `\text{ be real numbers s.t. }` group with a single space at the seam.
//
// Judgment calls that the task spec left open, or where a golden overrode the
// spec prose, are marked "NOTE:" at their site.

import type { Token, Diagnostic, Expr, Span, Block, DocumentAst, EngineLine } from './types';
import type { StatementTokens, TitleTokens } from './document';
import { segment } from './disambiguate';
import { parseExpression } from './parser';
import { FUNCTIONS, MATH_KEYWORDS, SYMBOL_MAP, operatorLatex } from './language';

// ---- Public API ----

/** What a caret asks the renderer to make visible (Task 11). */
export interface HighlightSpec {
  /** The node the caret sits on: the node whose span EQUALS this one is
   *  wrapped in \htmlClass{hl-node}{...} so the view can tint it. */
  span: Span;
  /** Also paint the operand REGIONS of the equation this line states: when a
   *  math segment's ROOT is an equation chain (isEquationChain below), each
   *  of its operands is wrapped in \htmlClass{hl-lhs}/{hl-rhs}, alternating.
   *  This is the "left side / right side" tint, independent of where inside
   *  the line the caret actually landed - so a caret in the denominator of
   *  `(x+1)/(x-1) = y^2 + 1` gets hl-node on the fraction AND hl-lhs around
   *  the whole side that fraction is. Off by default: only the caret-driven
   *  re-render (engine.ts's renderLineWithHighlight) asks for it, never the
   *  document render. */
  sides?: boolean;
}

/** One prose or math run of a statement, already segmented and (for math)
 *  parsed - the unit parseStatement produces and renderSegments consumes
 *  (see the header). Exactly one of `expr`/`text` is populated, matching
 *  `kind`; `tokens` is kept on both so gap/adjacency spacing between
 *  neighboring segments can still be measured without re-touching the
 *  parser or disambiguator. */
export interface ParsedSegment { kind: 'prose' | 'math'; tokens: Token[]; expr?: Expr; text?: string; span: Span }

// ---- Rendering context ----
// Threaded through the whole expression walk. Both flags are "where am I",
// not "what have I seen": they change how a node renders itself.
interface Ctx {
  highlight?: HighlightSpec;
  // At the ROOT of a math segment, where an equation chain still counts as
  // "the equation this line states" and gets its sides painted. Cleared on
  // the way down (render), so a Relation buried in a matrix cell or a
  // set-builder condition is just a relation, not this line's equation.
  sides: boolean;
  // Inside a set-builder's condition, an Abs renders with PLAIN bars: the
  // enclosing \left\{ ... \middle| ... \right\} already owns the delimiter
  // sizing, and a nested \left|...\right| fights with the \middle|.
  inSetBuilderCond: boolean;
  // Inside a \cfrac tower: every Frac below the tower's root renders \cfrac
  // too, so the whole continued fraction keeps one consistent size.
  cfrac: boolean;
  // Inside the ARGUMENT of a Sub/Pow (`a_<here>`, `x^<here>`). An index is not
  // a name: see isBareIndex.
  inScript: boolean;
}

// Typography of a multi-char identifier sitting in a script position.
//
// Out in the open, `\mathrm` is right: a multi-letter run is a NAME (`Aut`,
// `speed`), and an italic name reads as a product of its letters. In an index
// it is the other way round - `a_ij` is the (i,j) entry of a matrix, two
// juxtaposed single-letter indices, and `a_{\mathrm{ij}}` prints them upright
// as though "ij" were a word. So an unknown ALL-LOWERCASE identifier renders
// bare (italic) once it is inside a script, and everything else keeps
// \mathrm: a capital anywhere (`P_AB`, `T_Max`) is a label, not an index pair.
//
// Known operator names are unaffected in practice as well as by this test:
// `max`, `min`, `det` and the rest of MATH_KEYWORDS/FUNCTIONS never reach here
// at all - the parser turns them into Sym/Call nodes, not Ident - and they are
// named in the guard anyway so the policy survives that ceasing to be true.
const isBareIndex = (name: string): boolean =>
  /^[a-z]+$/.test(name) && !MATH_KEYWORDS.has(name) && FUNCTIONS[name] === undefined;

/** ctx for the ARGUMENT of a script (not for its base - see scriptBase). */
const scriptArg = (ctx: Ctx): Ctx => (ctx.inScript ? ctx : { ...ctx, inScript: true });

// ================= symbol / operator tables =================

const BINOP_LATEX: Record<string, string> = {
  '+': '+', '-': '-', 'cdot': '\\cdot', 'pm': '\\pm', 'mp': '\\mp', 'to': '\\to',
  'land': '\\land', 'lor': '\\lor', 'cup': '\\cup', 'cap': '\\cap', 'mid': '\\mid',
  // NOTE (golden over spec): the task spec lists ',' as "comma + space", but
  // golden 14 renders `forall x in (a, b)` as `\forall x\in(a,b)` - tight. The
  // golden wins for the BinOp; the element LISTS below (sets, angle vectors,
  // call arguments) keep the spec's `, ` because no golden constrains them.
  ',': ',',
};

const RELATION_LATEX: Record<string, string> = {
  '=': '=', '!=': '\\neq', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge',
  'in': '\\in', 'notin': '\\notin', 'subset': '\\subset', 'congruent': '\\cong',
  'similar': '\\sim', 'parallel': '\\parallel', 'perp': '\\perp', 'corresponds': '\\triangleq',
  'implies': '\\implies', '=>': '\\implies', 'iff': '\\iff', '<=>': '\\iff',
};

// The relation ops that make a line an EQUATION (or an inequality): the ones
// whose operands are two comparable QUANTITIES, so "the left side" and "the
// right side" are things the reader manipulates. Everything else in
// RELATION_LATEX is excluded on purpose - `x in A` has a member and a set,
// `p => q` two propositions, `AB parallel CD` two figures; none of those is a
// side you would move a term across, and tinting them as if they were would
// teach the wrong shape.
const EQUATION_OPS = new Set(['=', '!=', '<', '>', '<=', '>=']);

/** A Relation whose ops are ALL equation ops - the chain `a = b < c` counts,
 *  the mixed `a = b in C` does not (one link that is not a quantity
 *  comparison makes the whole chain's "sides" meaningless). */
const isEquationChain = (e: Expr): e is Expr & { kind: 'Relation' } =>
  e.kind === 'Relation' && e.ops.length > 0 && e.ops.every((op) => EQUATION_OPS.has(op));

// Mirrors parser.ts's DIFFERENTIALS (module-local there). A juxtaposition
// whose right side is one of these gets a thin space: `\,dx`.
const DIFFERENTIALS = new Set(['dx', 'dy', 'dz', 'dt', 'du', 'dv']);

// Connector symbols the parser hangs off a 'seq': they attach tight to the
// text on their left, and the NEXT seq item gets the `\ ` (so `:` reads as
// `:\ `).
const SEQ_PUNCT = new Set([':', ',', '.', ';']);

// Nodes that make a subtree "tall" - i.e. that force an enclosing pair of
// parens to grow to \left(...\right).
const TALL_KINDS = new Set(['Frac', 'BigOp', 'Matrix', 'Cases', 'Abs', 'SetBuilder']);

// Nodes that already carry their own delimiters, so a script (^ or _) can
// attach to them with no extra wrapping.
const SELF_DELIMITED = new Set(['Group', 'Abs', 'Matrix', 'Cases', 'SetLiteral', 'SetBuilder', 'AngleVector']);

// LaTeX specials, escaped identically for \text{} and \texttt{}.
const ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash ', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&',
  '#': '\\#', '^': '\\^{}', '_': '\\_', '%': '\\%', '~': '\\~{}',
};
// Two Unicode shapes that are well-formed JS strings - so they survive the
// lexer/parser untouched and land verbatim in a Raw/Text node's text - but
// are not valid on their own once dropped into a \text{}/\texttt{} group,
// where KaTeX's PARSER (not just its font metrics) rejects them outright; a
// merely-unrenderable character (an emoji, say) just warns and draws a
// missing-glyph box, which is fine, but these two THROW even with
// strict:false:
//   * one or more combining marks (Unicode category M) at the very START of
//     the group have no preceding base character to attach to within that
//     group - and, verified directly against katex.renderToString, NEITHER
//     does inserting one: a plain space does not work as a base either
//     (KaTeX's parser wants an actual character there, not just something
//     before the mark in the source), so the mark is dropped instead. Only
//     the LEADING run is touched - `á` (an "a" with a combining
//     acute) renders fine, because `a` itself is a valid base; this is
//     reachable even from ordinary input because the disambiguator/parser
//     can split a real base character into an earlier, different segment
//     (`x` followed by stray combining accents becomes Var("x") plus a
//     SEPARATE Raw run that starts with the accents, the base long gone).
//   * an unpaired UTF-16 surrogate (half of a truncated astral character -
//     reachable from malformed paste input) is not a valid Unicode scalar
//     value at all. A genuine surrogate PAIR (a real emoji) is untouched by
//     this regex and only ever hits the harmless missing-metrics case above.
const LEADING_COMBINING_MARKS = /^\p{M}+/u;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function escapeLatex(s: string): string {
  return s.replace(LEADING_COMBINING_MARKS, '').replace(LONE_SURROGATE, '�').replace(/[\\{}$&#^_%~]/g, (ch) => ESCAPES[ch]);
}

// ================= the spacing primitive =================

// A control WORD at the end of `a` (`\in`, `\forall`, ...). A control SYMBOL
// (`\{`, `\,`, `\ `) does not swallow what follows, so it is excluded.
const ENDS_CONTROL_WORD = /\\[a-zA-Z]+$/;
// Characters that would be swallowed by (or read badly against) a preceding
// control word. Digits and '-' are not swallowed by LaTeX's lexer, but the
// approved goldens space them anyway (`\ge 0`, `\ge -1`).
//
// A leading \htmlClass{...}{ wrapper (or a nest of them - a caret's hl-node
// inside its side's hl-lhs) is SKIPPED rather than matched: the wrapper is a
// tint, not content, and `\ge` followed by `\htmlClass{hl-rhs}{1+...}` must
// keep the space it would have had before the plain `1`. Without the skip a
// line would silently change spelling (`\ge 1` -> `\ge1`) the moment a caret
// landed on it, and the highlighted re-render would no longer be the compiled
// line plus wrappers. The extra space is invisible either way: LaTeX eats a
// space that terminates a control word.
const STARTS_AFTER_CONTROL_WORD = /^(?:\\htmlClass\{[^{}]*\}\{)*[A-Za-z0-9-]/;

/** Concatenates two LaTeX fragments, inserting one space only where the
 *  concatenation would otherwise mis-lex or read badly. */
function cat(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return ENDS_CONTROL_WORD.test(a) && STARTS_AFTER_CONTROL_WORD.test(b) ? `${a} ${b}` : a + b;
}

// ================= structural predicates =================

/** Every sub-expression of `e`, in source order. A pure structural walk with
 *  no output policy in it - exported because engine.ts's nodeAt() descends
 *  the same trees looking for the node under the caret, and a second copy of
 *  this switch would be one more place to forget a node kind (the
 *  `_exhaustive: never` guard below makes the compiler catch that here). */
export function childrenOf(e: Expr): Expr[] {
  switch (e.kind) {
    case 'BinOp': return [e.left, e.right];
    case 'UnaryOp': return [e.operand];
    case 'Prime': return [e.operand];
    case 'Frac': return [e.num, e.den];
    case 'Pow': return [e.base, e.exp];
    case 'Sub': return [e.base, e.sub];
    case 'Call': return e.args;
    case 'BigOp': return [e.from, e.to].filter((x): x is Expr => x !== null);
    case 'SetLiteral': return e.elements;
    case 'SetBuilder': return [e.element, e.condition];
    case 'Abs': return [e.operand];
    case 'AngleVector': return e.elements;
    case 'Group': return [e.operand];
    case 'Matrix': return e.rows.flat();
    case 'Cases': return e.branches.flatMap((b) => (b.condition ? [b.value, b.condition] : [b.value]));
    case 'Relation': return e.operands;
    case 'Num': case 'Var': case 'Ident': case 'Sym': case 'Text': case 'Raw':
      return [];
    default: { const _exhaustive: never = e; return []; }
  }
}

/** True when the subtree contains something that needs vertical room, so the
 *  parens/brackets around it must grow. Memoized (by Expr object identity,
 *  never mutated once built - safe as a cache key for the object's whole
 *  lifetime) because callers that walk a script chain (scriptBase's
 *  closesScriptChain, below) ask this same question about the same base
 *  repeatedly, once per enclosing level; without the cache each of those
 *  calls independently re-walks the WHOLE subtree beneath it, turning an
 *  O(depth) chain walk into an O(depth^2) one - and scriptBase's own
 *  exposedKinds recursion (also O(depth)) calls THIS at every one of its
 *  own steps, compounding that to O(depth^3) overall: a 200-deep alternating
 *  `x^a_b^a_b...` chain measured at 344ms, over the fuzz suite's 250ms
 *  budget, before this cache. */
const tallCache = new WeakMap<Expr, boolean>();
function containsTall(e: Expr): boolean {
  const cached = tallCache.get(e);
  if (cached !== undefined) return cached;
  const result = TALL_KINDS.has(e.kind) || childrenOf(e).some(containsTall);
  tallCache.set(e, result);
  return result;
}

/** A Frac nested inside this operand, reachable WITHOUT leaving the visual
 *  fraction (i.e. only through grouping parens and infix operators). Reaching
 *  through a function call or a script would make unrelated fractions
 *  contaminate the tower, so those stop the search. */
function hasNestedFrac(e: Expr): boolean {
  if (e.kind === 'Frac') return true;
  if (e.kind === 'Group') return hasNestedFrac(e.operand);
  if (e.kind === 'BinOp') return hasNestedFrac(e.left) || hasNestedFrac(e.right);
  return false;
}

/** The symbol a seq item VISIBLY starts with (through juxtaposition only -
 *  deliberately not through relations, see seqSep). */
function leadingSym(e: Expr): (Expr & { kind: 'Sym' }) | null {
  if (e.kind === 'Sym') return e;
  if (e.kind === 'BinOp' && e.op === 'juxt') return leadingSym(e.left);
  return null;
}

/** The last factor of a juxtaposition chain is a big operator - used to give
 *  `\sum_{i=1}^{n} i^{2}` its one space before the summand. */
function endsWithBigOp(e: Expr): boolean {
  if (e.kind === 'BigOp') return true;
  return e.kind === 'BinOp' && e.op === 'juxt' && endsWithBigOp(e.right);
}

const isEmptyRaw = (e: Expr): boolean => e.kind === 'Raw' && e.text === '';

/** A COMPLETE statement rather than a bare term. Used at the math->prose
 *  boundary: after a finished clause the following prose gets a `\ `
 *  separator, after a bare term it gets an in-brace space instead.
 *  A clause whose last operand is missing (`y =` mid-typing) does not count:
 *  it ends on a dangling operator, where a clause-break space would read as
 *  an error rather than as punctuation. */
function isClause(e: Expr): boolean {
  if (e.kind === 'Relation') return !isEmptyRaw(e.operands[e.operands.length - 1]);
  if (e.kind === 'BinOp' && e.op === 'seq') return !isEmptyRaw(e.right);
  return false;
}

/** A single visual unit - one that a postfix `!` can attach to without
 *  needing parens around it first. */
function isAtomicOperand(e: Expr): boolean {
  switch (e.kind) {
    case 'Num': case 'Var': case 'Ident': case 'Sym': case 'Group': case 'Call':
    case 'Abs': case 'SetLiteral': case 'SetBuilder': case 'AngleVector': case 'Matrix':
    case 'Prime': case 'Sub': case 'Pow': case 'Text': case 'Raw':
      return true;
    default:
      return false;
  }
}

const sameSpan = (a: Span, b: Span): boolean =>
  a.startLine === b.startLine && a.startCol === b.startCol && a.endLine === b.endLine && a.endCol === b.endCol;

// Cell and row separators for the two grid-shaped nodes (Matrix, Cases) -
// hoisted so the LaTeX array separator policy is one edit, not two.
const CELL_SEP = ' & ';
const ROW_SEP = '\\\\ ';

// ================= expression rendering =================

/**
 * Renders one expression to LaTeX. `highlight` (optional) wraps the node whose
 * span matches it exactly in \htmlClass{hl-node}{...}, and - with
 * `highlight.sides` - paints this expression's operand regions when it is an
 * equation chain.
 */
export function renderExpr(expr: Expr, highlight?: HighlightSpec): string {
  return render(expr, { highlight, inSetBuilderCond: false, cfrac: false, inScript: false, sides: !!highlight?.sides });
}

function render(e: Expr, ctx: Ctx): string {
  // The \cfrac tower only extends through grouping parens and infix
  // operators; any other node starts a fresh fraction context.
  if (ctx.cfrac && e.kind !== 'Frac' && e.kind !== 'Group' && e.kind !== 'BinOp') {
    ctx = { ...ctx, cfrac: false };
  }
  // Consumed HERE - only the FIRST node render() sees can be a segment root -
  // and cleared for everything below: the sides belong to the equation the
  // LINE states, so a Relation further down (a matrix cell, a set-builder
  // condition, a call argument) renders plain.
  const paintSides = ctx.sides && isEquationChain(e);
  if (ctx.sides) ctx = { ...ctx, sides: false };
  // Decided BEFORE rendering `e`'s children, and cleared from the ctx they
  // render with: a macro-expanded subtree can have a child whose span is
  // IDENTICAL to its parent's (expandMacros re-spans every replacement token
  // onto the single usage-site token - document.ts's rule 3), so without
  // clearing it here, both parent and child would independently match
  // ctx.highlight and each wrap the other's output in its own \htmlClass,
  // nesting duplicate wrappers instead of the one the caret actually
  // resolved to.
  const hit = !!ctx.highlight && sameSpan(e.span, ctx.highlight.span);
  const inner = hit ? { ...ctx, highlight: undefined } : ctx;
  // Both wrappers can apply at once - a caret ON the top-level relation tints
  // the whole line hl-node and still splits it into its sides.
  const latex = paintSides ? renderRelation(e as Expr & { kind: 'Relation' }, inner, true) : renderNode(e, inner);
  return latex && hit ? `\\htmlClass{hl-node}{${latex}}` : latex;
}

function renderNode(e: Expr, ctx: Ctx): string {
  switch (e.kind) {
    case 'Num':
      return e.value;
    case 'Var':
      return e.name;
    case 'Ident':
      return ctx.inScript && isBareIndex(e.name)
        ? escapeLatex(e.name)
        : `\\mathrm{${escapeLatex(e.name)}}`;
    case 'Sym':
      // NOTE: SYMBOL_MAP still carries the legacy compiler's layout prefix on
      // QED (`\quad \blacksquare`). Layout is the renderer's business, not the
      // symbol table's, so the prefix is dropped here.
      return e.latex.startsWith('\\quad ') ? e.latex.slice('\\quad '.length) : e.latex;
    case 'Text':
      return `\\text{${escapeLatex(e.text)}}`;
    case 'Raw':
      // An empty Raw is the parser's "nothing here" node (e.g. the implicit
      // left operand of a continuation line `= f(x)`); it renders as nothing.
      return e.text === '' ? '' : `\\htmlClass{raw-span}{\\texttt{${escapeLatex(e.text)}}}`;
    case 'BinOp':
      return renderBinOp(e, ctx);
    case 'UnaryOp':
      return e.op === 'lnot' ? cat('\\neg', render(e.operand, ctx)) : cat('-', render(e.operand, ctx));
    case 'Prime':
      return renderPrime(e, ctx);
    case 'Frac':
      return renderFrac(e, ctx);
    case 'Pow':
      return `${scriptBase(e.base, ctx, 'Pow')}^{${render(e.exp, scriptArg(ctx))}}`;
    case 'Sub':
      return `${scriptBase(e.base, ctx, 'Sub')}_{${render(e.sub, scriptArg(ctx))}}`;
    case 'Call':
      return renderCall(e, ctx, '');
    case 'BigOp':
      return renderBigOp(e, ctx);
    case 'SetLiteral':
      // The ordinary empty-braces spelling `{}` never reaches here - parser.ts's
      // parseBrace already turns it into a Sym node straight from
      // SYMBOL_MAP.emptyset before a SetLiteral ever gets built. This branch is
      // only for a SetLiteral whose elements dropped to zero some other way
      // (e.g. `{,}` - splitTop drops the empty piece on both sides of the comma).
      return e.elements.length === 0
        ? SYMBOL_MAP.emptyset
        : `\\{${e.elements.map((x) => render(x, ctx)).join(', ')}\\}`;
    case 'SetBuilder':
      return `\\left\\{${render(e.element, { ...ctx, inSetBuilderCond: false })}\\ \\middle|\\ ` +
        `${render(e.condition, { ...ctx, inSetBuilderCond: true })}\\right\\}`;
    case 'Abs': {
      const inner = render(e.operand, ctx);
      return ctx.inSetBuilderCond ? `|${inner}|` : `\\left|${inner}\\right|`;
    }
    case 'AngleVector':
      return `${cat('\\langle', e.elements.map((x) => render(x, ctx)).join(', '))}\\rangle`;
    case 'Group':
      return renderGroup(e, ctx);
    case 'Matrix':
      return `\\begin{${e.env}}${e.rows.map((r) => r.map((c) => render(c, ctx)).join(CELL_SEP)).join(ROW_SEP)}\\end{${e.env}}`;
    case 'Cases':
      // A branch with no condition and no `otherwise` gets no second column
      // at all: `cases { x = 0; y = 1 }` is a braced system of equations, and
      // labelling its rows "otherwise" would state a condition the author
      // never wrote (types.ts).
      return `\\begin{cases}${e.branches.map((b) => {
        const value = render(b.value, ctx);
        if (b.condition) return `${value}${CELL_SEP}\\text{if }${render(b.condition, ctx)}`;
        return b.otherwise ? `${value}${CELL_SEP}\\text{otherwise}` : value;
      }).join(ROW_SEP)}\\end{cases}`;
    case 'Relation':
      return renderRelation(e, ctx);
    default: { const _exhaustive: never = e; return ''; }
  }
}

function renderBinOp(e: Expr & { kind: 'BinOp' }, ctx: Ctx): string {
  const left = render(e.left, ctx);
  const right = render(e.right, ctx);

  if (e.op === 'juxt') {
    // A differential closes its product with a thin space: `...\,dx`.
    if (e.right.kind === 'Sym' && DIFFERENTIALS.has(e.right.name)) return `${left}\\,${right}`;
    // A big operator's bounds end in `}`, which cat() will happily butt
    // straight against the summand; one space keeps `\sum_{i=1}^{n} i^{2}`
    // readable. When the summand starts with a backslash there is nothing to
    // separate (`\lim_{n\to\infty}\left(...`), so nothing is added.
    if (endsWithBigOp(e.left) && /^[A-Za-z0-9]/.test(right)) return `${left} ${right}`;
    return cat(left, right);
  }

  if (e.op === 'seq') {
    if (!left) return right;
    if (!right) return left;
    const sep = seqSep(e.right);
    return sep ? left + sep + right : cat(left, right);
  }

  return cat(cat(left, BINOP_LATEX[e.op] ?? e.op), right);
}

// The `\ ` between two seq items, or '' when the right item supplies its own
// separation.
function seqSep(right: Expr): string {
  const sym = leadingSym(right);
  if (sym) {
    // ':' ',' '.' ';' attach tight to the clause they follow; the space then
    // lands after them, via the next seq junction (`\mathbb{N}:\ (1+x)^{n}`).
    if (SEQ_PUNCT.has(sym.name)) return '';
    // A symbol whose macro already carries its own spaces (`suchthat` ->
    // `\text{ s.t. }`) must not be given a second one. Only a symbol the item
    // VISIBLY starts with counts - one nested inside a relation
    // (`... => ...`) is too far in to absorb the clause separator.
    if (sym.latex.startsWith('\\text{ ')) return '';
  }
  return '\\ ';
}

// `sides`: paint each operand REGION (see HighlightSpec.sides). The two
// classes ALTERNATE across the whole chain rather than being "first vs rest",
// so `a = b < c` reads lhs / rhs / lhs and every region is a different colour
// from its neighbours - which is the only thing the tint has to say.
//
// An operand that renders to nothing (the implicit left side of a
// continuation line `= f(x)`) is left unwrapped: an empty \htmlClass would
// tint a zero-width box, and cat() would then be unable to see that there is
// no left side at all.
function renderRelation(e: Expr & { kind: 'Relation' }, ctx: Ctx, sides = false): string {
  const paint = (latex: string, i: number): string =>
    sides && latex ? `\\htmlClass{${i % 2 === 0 ? 'hl-lhs' : 'hl-rhs'}}{${latex}}` : latex;
  let out = paint(render(e.operands[0], ctx), 0);
  for (let i = 0; i < e.ops.length; i++) {
    out = cat(out, RELATION_LATEX[e.ops[i]] ?? e.ops[i]);
    out = cat(out, paint(render(e.operands[i + 1], ctx), i + 1));
  }
  return out;
}

function renderPrime(e: Expr & { kind: 'Prime' }, ctx: Ctx): string {
  const primes = "'".repeat(Math.max(0, e.count));
  // Primes on a function belong to its NAME, not to its argument list: the
  // source `F'(x)` must come back out as `F'(x)`, never `F(x)'`.
  // NOTE: the Call node shares its span with this Prime, so the highlight
  // hook fires once, on the Prime.
  if (e.operand.kind === 'Call') return renderCall(e.operand, ctx, primes);
  return render(e.operand, ctx) + primes;
}

function renderFrac(e: Expr & { kind: 'Frac' }, ctx: Ctx): string {
  // One fraction inside another means the whole tower switches to \cfrac, so
  // the nested numerators/denominators keep full size instead of shrinking
  // twice over: `\cfrac{1}{1+\cfrac{1}{1+\cfrac{1}{n}}}`.
  const useCfrac = ctx.cfrac || hasNestedFrac(e.num) || hasNestedFrac(e.den);
  const sub: Ctx = { ...ctx, cfrac: useCfrac };
  const cmd = useCfrac ? '\\cfrac' : '\\frac';
  return `${cmd}{${render(dissolveParens(e.num), sub)}}{${render(dissolveParens(e.den), sub)}}`;
}

// The fraction bar already groups its operands, so the author's parens around
// one are visual noise: `1/(1 + 1/n)` -> `\frac{1}{1+\frac{1}{n}}`.
const dissolveParens = (e: Expr): Expr => (e.kind === 'Group' && e.bracket === '(' ? e.operand : e);

function renderGroup(e: Expr & { kind: 'Group' }, ctx: Ctx): string {
  const inner = render(e.operand, ctx);
  const [open, close] = e.bracket === '[' ? ['[', ']'] : ['(', ')'];
  return containsTall(e.operand)
    ? `\\left${open}${inner}\\right${close}`
    : `${open}${inner}${close}`;
}

// The base of a `^` or `_`. Bases that already carry delimiters take the
// script as-is; a tall base grows a pair of parens so the script cannot sit
// halfway up it (`\left(\sqrt{\frac{a+b}{c+d}}\right)^{2}`); a bare infix
// expression gets plain braces so the script applies to all of it.
//
// `own` is which of Pow/Sub is doing the wrapping. Beyond the tall/delimited
// cases above, `base` gets braced exactly when rendering it BARE would leave
// an `own`-kind script exposed at ITS OWN outermost level - i.e. gluing the
// new script straight onto base's rendering would collide with one already
// sitting there (see bracesBase/exposedKinds below). A parenthesized script
// argument closes off the parser's right-assoc chain (see parser.ts's
// header), so `x^(a)^(b)` parses LEFT-nested - Pow(base: Pow(x,a), exp: b) -
// and the bare concatenation `x^{a}^{b}` is a KaTeX "Double superscript"
// error; bracing the base fixes it: `{x^{a}}^{b}`. A DIFFERENT kind of
// script underneath (`a_i^2` = Pow(base: Sub(a,i), exp: 2)) is not ambiguous
// to KaTeX and must stay bare to match the approved golden - ONE sub and ONE
// sup on the same atom is fine in either order.
//
// But that atom's two script slots are now BOTH full, and a base is not
// only its OWN kind away from a collision: `x^a_b^a_b` (alternating Pow/
// Sub) parses as Pow(base: Sub(base: Pow(x,a), sub: b), exp: a) - the outer
// Pow's base is a Sub, a DIFFERENT kind, so the old `base.kind === own`
// check waved it through bare, giving `x^{a}_{b}^{a}` - TWO superscripts on
// `x`, KaTeX error, even though no two ADJACENT nodes in the tree share a
// kind. exposedKinds walks past an unbraced base to see what IT exposes too,
// so this braces at the right point: `{x^{a}_{b}}^{a}`.
function scriptBase(base: Expr, ctx: Ctx, own: 'Pow' | 'Sub'): string {
  const latex = render(base, ctx);
  if (SELF_DELIMITED.has(base.kind)) return latex;
  if (containsTall(base)) return `\\left(${latex}\\right)`;
  if (bracesBase(base, own)) return `{${latex}}`;
  return latex;
}

// True when `e`, rendered bare as one side of a script attachment, gets its
// OWN delimiters or braces from scriptBase regardless of which script is
// asking - i.e. nothing of e's is left exposed for a script glued directly
// after it to collide with.
const closesScriptChain = (e: Expr): boolean =>
  SELF_DELIMITED.has(e.kind) || containsTall(e) || e.kind === 'BinOp' || e.kind === 'Relation' || e.kind === 'UnaryOp';

// Whether scriptBase (above) would brace `base` as the operand of an `own`
// script: never when closesScriptChain already handles it (that base gets
// its OWN wrapping there), otherwise exactly when `own` is one of the kinds
// exposedKinds finds already exposed at base's outermost level.
function bracesBase(base: Expr, own: 'Pow' | 'Sub'): boolean {
  return closesScriptChain(base) ? false : exposedKinds(base).has(own);
}

// The script kinds ('Pow' and/or 'Sub') exposed at `e`'s OWN outermost level
// when it is rendered bare - what a NEW script glued directly onto e's
// rendering would collide with. Empty for anything but Pow/Sub: every other
// kind either carries no script at all, or (closesScriptChain) is always
// wrapped by scriptBase, which closes the chain there and exposes nothing
// further up.
//
// A SINGLE linear recursion down e.base: this must call itself (or
// anything that transitively calls back into itself) AT MOST ONCE per
// level. bracesBase and exposedKinds look like they could shell out to one
// another - "is base already braced" vs. "what does base expose" are almost
// the same question - but computing one FROM the other at every level, as
// an earlier version of this function did, revisits the SAME base twice per
// level, and that redundancy compounds: two calls at level k each make two
// more at level k-1, ... giving O(2^N) instead of O(N^2) for a chain of N
// scripts - which is exactly the shape `x^a_b^a_b^a_b...` has, and hung the
// fuzz suite on a 150-deep one. Kept as a plain recursion (no memo table)
// because O(N^2) is already well under budget at the depths real input
// reaches (the fuzz suite's own generator caps a line at 30 fragments).
function exposedKinds(e: Expr): Set<'Pow' | 'Sub'> {
  if (e.kind !== 'Pow' && e.kind !== 'Sub') return new Set();
  const inherited = closesScriptChain(e.base) ? new Set<'Pow' | 'Sub'>() : exposedKinds(e.base);
  return inherited.has(e.kind) ? new Set([e.kind]) : new Set([...inherited, e.kind]);
}

function renderBigOp(e: Expr & { kind: 'BigOp' }, ctx: Ctx): string {
  const from = e.from ? render(e.from, ctx) : '';
  const to = e.to ? render(e.to, ctx) : '';
  if (e.op === 'lim') {
    // `lim(x -> 0)` is one subscript with an arrow in it, not two scripts.
    const bound = from && to ? cat(cat(from, '\\to'), to) : from || (to ? cat('\\to', to) : '');
    return bound ? `\\lim_{${bound}}` : '\\lim';
  }
  const head = e.op === 'sum' ? '\\sum' : '\\int';
  // An empty bound (mid-typing: `sum(i=1 -> `) drops its script rather than
  // emitting a stray `^{}`.
  return `${head}${from ? `_{${from}}` : ''}${to ? `^{${to}}` : ''}`;
}

function renderCall(e: Expr & { kind: 'Call' }, ctx: Ctx, primes: string): string {
  const args = e.args.map((a) => render(a, ctx));
  const first = args[0] ?? '';
  switch (e.fn) {
    case 'sqrt': return `\\sqrt{${first}}`;
    case 'floor': return `\\lfloor ${first} \\rfloor`;
    case 'ceil': return `\\lceil ${first} \\rceil`;
    case 'abs': return `\\left|${first}\\right|`;
    case 'choose': return `\\binom{${first}}{${args[1] ?? ''}}`;
    case 'factorial': {
      const arg = e.args[0];
      // `n!` but `(n+1)!` - a compound operand needs the parens to keep the
      // `!` from attaching to its last term only. A factorial OF a factorial
      // needs them for a different reason: `n!!` is LaTeX's double factorial
      // (n(n-2)(n-4)...), a different function from (n!)!.
      const stacked = !!arg && arg.kind === 'Call' && arg.fn === 'factorial';
      return arg && (!isAtomicOperand(arg) || stacked) ? `(${first})!` : `${first}!`;
    }
    case 'hat': case 'bar': case 'tilde': case 'vec': return `\\${e.fn}{${first}}`;
    // Geometry accents name POINTS, so a multi-letter argument is a point
    // label (`AB`), not an identifier: `\overline{AB}`, not
    // `\overline{\mathrm{AB}}`.
    case 'overline': return `\\overline{${pointLabel(e.args[0], first)}}`;
    case 'ray': return `\\overrightarrow{${pointLabel(e.args[0], first)}}`;
    case 'arc': return `\\overset{\\frown}{${pointLabel(e.args[0], first)}}`;
    default: break;
  }
  const list = args.join(', ');
  const def = FUNCTIONS[e.fn];
  // `choose`/`factorial` - the two non-operator `named` entries - are handled
  // by the switch above, so everything reaching here is an operator and gets
  // the SAME spelling parser.ts gives its bare form (language.ts's
  // operatorLatex): `sin(x)` and `sin x` cannot drift apart.
  if (def && def.kind === 'named') return `${operatorLatex(e.fn)}${primes}(${list})`;
  // Unknown callee: a single letter is a variable-shaped function name and
  // stays italic (`f(x)`); a word is upright (`\mathrm{speed}(t)`).
  const head = e.fn.length === 1 ? e.fn : `\\mathrm{${escapeLatex(e.fn)}}`;
  return `${head}${primes}(${list})`;
}

const pointLabel = (arg: Expr | undefined, rendered: string): string =>
  (arg && arg.kind === 'Ident' ? escapeLatex(arg.name) : rendered);

// ================= statement rendering =================

const quads = (indent: number): string => '\\quad '.repeat(Math.max(0, indent));

// Source text of one prose run: token texts with the source's own inter-token
// spacing preserved (measured from spans, so a STRING's stripped quotes do
// not shift the words after it - `We write "a | b" when` keeps single spaces).
function proseText(tokens: Token[]): string {
  let out = '';
  let prev: Token | null = null;
  for (const t of tokens) {
    if (prev) {
      out += prev.span.endLine !== t.span.startLine ? ' ' : ' '.repeat(Math.max(0, t.span.startCol - prev.span.endCol));
    }
    out += t.text;
    prev = t;
  }
  return out;
}

const hasGap = (left: Token, right: Token): boolean =>
  right.span.startLine !== left.span.endLine || right.span.startCol > left.span.endCol;

// Merges a trailing \text{...} group with a leading one, collapsing the pair
// of boundary spaces into a single space. Prose runs and the `\text{ s.t. }`
// that a `suchthat` symbol renders to are produced by different stages and
// meet here; one group with one space is what the goldens expect.
const TEXT_TAIL = /\\text\{([^{}]*)\}$/;
function appendMerged(acc: string, piece: string): string {
  if (!acc) return piece;
  if (!piece.startsWith('\\text{')) return acc + piece;
  const tail = TEXT_TAIL.exec(acc);
  if (!tail) return acc + piece;
  const close = piece.indexOf('}');
  if (close < 0) return acc + piece;
  const head = piece.slice('\\text{'.length, close);
  if (head.includes('{')) return acc + piece; // escaped brace inside: leave alone
  const left = tail[1];
  const joined = left.endsWith(' ') && head.startsWith(' ') ? left + head.slice(1) : left + head;
  return `${acc.slice(0, acc.length - tail[0].length)}\\text{${joined}}${piece.slice(close + 1)}`;
}

// Span covering a whole token run (its first token's start to its last
// token's end) - used for a prose ParsedSegment's span; a math segment just
// reuses its parsed Expr's own span (see parseStatement).
const spanOfRun = (tokens: Token[]): Span => ({
  startLine: tokens[0].span.startLine,
  startCol: tokens[0].span.startCol,
  endLine: tokens[tokens.length - 1].span.endLine,
  endCol: tokens[tokens.length - 1].span.endCol,
});

/**
 * Segments `tokens` into prose/math runs and parses every math run's
 * expression ONCE, in document order. This is the front half of
 * renderStatement (below), split out because a future engine.ts (Task 7)
 * needs these same Expr trees for nodeAt() caret lookup: re-running
 * parseExpression over the same tokens a second time would both waste the
 * work and duplicate every diagnostic that parse emits (segment()'s own
 * diagnostics - e.g. an ambiguous-word info - are likewise emitted exactly
 * once, here, never again in renderSegments).
 */
export function parseStatement(tokens: Token[], diagnostics: Diagnostic[]): ParsedSegment[] {
  if (!tokens || tokens.length === 0) return [];
  const { runs } = segment(tokens, diagnostics);
  const segments: ParsedSegment[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.tokens.length === 0) continue;
    if (run.kind === 'prose') {
      segments.push({ kind: 'prose', tokens: run.tokens, text: proseText(run.tokens), span: spanOfRun(run.tokens) });
    } else {
      // Whether the NEXT run is prose is something only this loop knows, and
      // the parser needs it: a math run that ends on an infix operator has
      // its right operand right there, in that prose (`aRb => bRa`), and must
      // not report it missing. See parseExpression's `proseFollows`.
      const expr = parseExpression(run.tokens, diagnostics, runs[i + 1]?.kind === 'prose');
      segments.push({ kind: 'math', tokens: run.tokens, expr, span: expr.span });
    }
  }
  return segments;
}

/**
 * Renders already-segmented-and-parsed segments (from parseStatement) to
 * LaTeX, prefixed by `indent` \quad's. Does NO parsing and adds NO
 * diagnostics of its own - both already happened in parseStatement. Spacing
 * at each prose/math boundary is unchanged from before the parseStatement/
 * renderSegments split (see the header's spacing model): a gap after a
 * COMPLETE math clause becomes a real `\ ` clause break, a gap after a bare
 * term stays inside the \text{} braces instead.
 */
export function renderSegments(segments: ParsedSegment[], indent: number, highlight?: HighlightSpec): string {
  const prefix = quads(indent);
  let out = '';
  // The expression of the math segment immediately to the left, or null when
  // the previous segment was prose - decides how the next prose segment is
  // spaced.
  let prevMath: Expr | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const next = segments[i + 1];
    const gapBefore = !!prev && prev.tokens.length > 0 && hasGap(prev.tokens[prev.tokens.length - 1], seg.tokens[0]);
    const gapAfter = !!next && next.tokens.length > 0 && hasGap(seg.tokens[seg.tokens.length - 1], next.tokens[0]);

    if (seg.kind === 'prose') {
      // After a finished clause the boundary reads as a clause break and gets
      // a real `\ ` (`5\cdot t\ \text{and note ...}`); after a bare term the
      // space belongs inside the text, next to the words it separates
      // (`a\text{ and }b`).
      const clauseBreak = gapBefore && prevMath !== null && isClause(prevMath);
      const lead = gapBefore && !clauseBreak ? ' ' : '';
      const trail = gapAfter ? ' ' : '';
      const text = `\\text{${lead}${escapeLatex(seg.text ?? proseText(seg.tokens))}${trail}}`;
      out = appendMerged(clauseBreak ? `${out}\\ ` : out, text);
      prevMath = null;
    } else if (seg.expr) {
      out = appendMerged(out, renderExpr(seg.expr, highlight));
      prevMath = seg.expr;
    }
  }

  return prefix + out;
}

/**
 * The LaTeX of one Statement/Claim block's line, given its already-parsed
 * segments: the ONE place that decides a claim carries the italic "Claim: "
 * label and that a plain statement is indented by its depth. renderDocument
 * emits every such line through here, and so does engine.ts's
 * renderLineWithHighlight - so re-rendering a single line with a highlight
 * yields a string byte-identical to the compiled one apart from the
 * \htmlClass wrapper, instead of quietly dropping the label or the indent.
 */
export function renderStatementLine(
  blockKind: 'Statement' | 'Claim',
  segments: ParsedSegment[],
  depth: number,
  highlight?: HighlightSpec,
): string {
  return blockKind === 'Claim'
    // The label owns the indentation, so the statement itself renders at 0.
    ? `${quads(depth)}\\textit{\\text{Claim: }}${renderSegments(segments, 0, highlight)}`
    : renderSegments(segments, depth, highlight);
}

/**
 * Renders one statement (a single source line's tokens) to LaTeX, prefixed by
 * `indent` \quad's. Thin composition of parseStatement + renderSegments -
 * the one-call convenience API for callers (like renderDocument's Claim/
 * Statement cases) that have no use for the intermediate ParsedSegment[].
 * Diagnostics from both stages are appended to `diagnostics`.
 */
export function renderStatement(
  tokens: Token[],
  indent: number,
  diagnostics: Diagnostic[],
  highlight?: HighlightSpec,
): string {
  return renderSegments(parseStatement(tokens, diagnostics), indent, highlight);
}

// ================= document rendering =================

// Header size and pre-header breathing room, both by nesting depth.
const HEADER_SIZES = ['\\huge', '\\Large', '\\large', '\\normalsize'];
const SPACER_HEIGHTS = ['1.5em', '1em', '0.5em', '0.2em'];
const byDepth = (table: string[], depth: number): string => table[Math.min(Math.max(depth, 0), table.length - 1)];

// ---- Scope / Subtask titles ----
//
// A title is a HEADING WRITTEN IN WORDS unless it holds something that can
// only be notation: a bracket, a quoted run, or an operator that is not
// sentence punctuation. That test is what tells `Theorem Bernoulli
// inequality`, `Problem 3` and `- base case {` (all words and numbers - the
// title IS its own text, and `alpha` in a heading is the word, not the letter)
// apart from `- Apply the test to a_n = x^n/factorial(n) {`, which is a
// statement that happens to be sitting in a heading and used to print as the
// escaped token join `a \_ n = x \^{} n / factorial ( n )`.
const TITLE_SENTENCE_OPS = new Set(['.', ',', ';', '!']);
const TITLE_NOTATION_KINDS = new Set(['LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'LBRACE', 'RBRACE', 'STRING', 'MATH_QUOTE']);
const titleIsNotation = (tokens: Token[]): boolean =>
  tokens.some((t) => (t.kind === 'OP' ? !TITLE_SENTENCE_OPS.has(t.text) : TITLE_NOTATION_KINDS.has(t.kind)));

/**
 * The styled group of a Scope header or Subtask label: `lead` (the scope's
 * name, or `(i) `), the title, and `tail` (the subtask's `:`), all inside the
 * one \textbf/\textit the caller wraps around the result.
 *
 * A words-only title stays exactly what it has always been - ONE \text{} group
 * holding lead, title and tail together, which is what every approved golden
 * asserts. A notation-bearing title goes through the ordinary statement
 * pipeline instead, and its MATH segments are wrapped in `$...$`: `\textbf` is
 * a text-mode command, and KaTeX rejects `\textbf{a^{2}}` outright ("Expected
 * 'EOF', got '^'"), while `\textbf{$a^{2}$}` is how LaTeX has always spelled
 * math inside bold text. appendMerged then collapses the label, any prose
 * segments and the colon back into single \text{} groups, so the words-only
 * shape is what a title with no math still produces.
 */
function titleGroup(lead: string, tokens: Token[], plain: string, tail: string, diagnostics: Diagnostic[]): string {
  if (!titleIsNotation(tokens)) return `\\text{${escapeLatex(lead + plain + tail)}}`;
  let out = `\\text{${escapeLatex(lead)}}`;
  const segments = parseStatement(tokens, diagnostics);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const next = segments[i + 1];
    if (seg.kind === 'prose') {
      // Same spacing model as renderSegments: the space lives inside the
      // braces. There is no `\ ` clause break here - a heading is one line of
      // running text, not a sequence of clauses.
      const lat = prev && hasGap(prev.tokens[prev.tokens.length - 1], seg.tokens[0]) ? ' ' : '';
      const trail = next && hasGap(seg.tokens[seg.tokens.length - 1], next.tokens[0]) ? ' ' : '';
      out = appendMerged(out, `\\text{${lat}${escapeLatex(seg.text ?? proseText(seg.tokens))}${trail}}`);
    } else if (seg.expr) {
      out += `$${renderExpr(seg.expr)}$`;
    }
  }
  return tail ? appendMerged(out, `\\text{${escapeLatex(tail)}}`) : out;
}

const ROMAN: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
function roman(n: number): string {
  let out = '';
  let rest = Math.max(1, n);
  while (rest > 0) {
    for (const [value, numeral] of ROMAN) {
      if (rest >= value) { out += numeral; rest -= value; break; }
    }
  }
  return out;
}

// a..z, then aa, bb, ... (deep sibling lists never realistically get there,
// but the label must stay unique rather than wrap around to 'a').
function letter(n: number): string {
  const i = Math.max(1, n) - 1;
  return String.fromCharCode(97 + (i % 26)).repeat(Math.floor(i / 26) + 1);
}

/**
 * Walks the document AST and produces one EngineLine per visible line, in
 * document order: scope headers (with their spacers), subtask labels, claim
 * labels, statements. Blank blocks produce nothing.
 *
 * `parsed` (optional) is a caller-supplied Block -> ParsedSegment[] map for
 * Statement/Claim blocks that the caller ALREADY ran parseStatement over -
 * see the file header. Blocks missing from it (or all of them, when it is
 * omitted) are parsed here as before. It is keyed by block object identity,
 * so the caller must build it by walking the very same `ast` it passes in.
 */
export function renderDocument(
  ast: DocumentAst,
  diagnostics: Diagnostic[],
  parsed?: Map<Block, ParsedSegment[]>,
): EngineLine[] {
  const out: EngineLine[] = [];
  const used = new Set<string>();

  // The block's pre-parsed segments if the caller supplied them, else a fresh
  // parse (which is where this statement's parse/segment diagnostics come
  // from - a pre-parsed block already emitted them into the caller's array
  // and must NOT emit them twice).
  const segmentsFor = (block: Block): ParsedSegment[] =>
    parsed?.get(block) ?? parseStatement((block as Block & StatementTokens).tokens ?? [], diagnostics);

  // Scope/Subtask titles carry their tokens too (document.ts's TitleTokens).
  // An AST built by an older caller, or hand-built in a test, may not have
  // them - an empty list simply reads as "no notation", i.e. the joined title
  // string is used exactly as before.
  const titleTokensOf = (block: Block): Token[] => (block as Block & TitleTokens).titleTokens ?? [];

  // ids are `line-N` / `spacer-N` for source line N. Two blocks can legally
  // report the same line (e.g. several scopes left unclosed at EOF all end on
  // the last line), so a numeric suffix keeps ids unique for keyed rendering.
  const push = (kind: 'line' | 'spacer', line: number, latex: string): void => {
    let id = `${kind}-${line}`;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    used.add(id);
    out.push({ id, latex, originalLine: line });
  };

  const walk = (blocks: Block[], depth: number): void => {
    // Subtask numbering is sibling-scoped: one counter per dash depth, living
    // as long as this children list, so `(i)/(ii)` continue across a scope's
    // children while a nested list restarts at `(a)`.
    const counters = new Map<number, number>();

    for (const block of blocks) {
      switch (block.kind) {
        case 'Blank':
          break;

        case 'Scope': {
          // Breathing room above a header - but never as the document's very
          // first line, where it would just push everything down.
          if (out.length > 0) push('spacer', block.span.startLine, `\\rule{0pt}{${byDepth(SPACER_HEIGHTS, depth)}}`);
          const style = block.styling === 'italic' ? '\\textit' : '\\textbf';
          const group = block.title
            ? titleGroup(`${block.scopeType} `, titleTokensOf(block), block.title, '', diagnostics)
            : `\\text{${escapeLatex(`${block.scopeType}.`)}}`;
          push('line', block.span.startLine,
            `${quads(depth)}{${byDepth(HEADER_SIZES, depth)} ${style}{${group}}}`);
          walk(block.children, depth + 1);
          push('spacer', block.span.endLine, '\\rule{0pt}{0.3em}');
          break;
        }

        case 'Subtask': {
          const n = (counters.get(block.depth) ?? 0) + 1;
          counters.set(block.depth, n);
          const label = block.depth <= 1 ? roman(n) : letter(n);
          const group = block.title
            ? titleGroup(`(${label}) `, titleTokensOf(block), block.title, ':', diagnostics)
            : `\\text{${escapeLatex(`(${label})`)}}`;
          push('line', block.span.startLine, `${quads(depth)}\\textbf{${group}}`);
          walk(block.children, depth + 1);
          break;
        }

        case 'Claim': {
          push('line', block.span.startLine, renderStatementLine('Claim', segmentsFor(block), depth));
          walk(block.children, depth + 1);
          break;
        }

        case 'Statement': {
          push('line', block.span.startLine, renderStatementLine('Statement', segmentsFor(block), depth));
          break;
        }

        default:
          break;
      }
    }
  };

  walk(ast.blocks, 0);
  return out;
}
