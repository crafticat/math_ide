// MathBrain Engine v2 - Expression parser (Stage 4 of the pipeline: lexer ->
// document -> disambiguator -> EXPRESSION -> renderer).
//
// Input is ONE math run: the tokens of a single stretch of math, already free
// of NEWLINE/COMMENT tokens (the disambiguator hands prose off separately).
// Output is ONE Expr; a run holding several juxtaposed statements comes back
// as a left-leaning BinOp 'seq' chain.
//
// Shape: a Pratt (precedence-climbing) parser.
//   parseRange -> parseBinary(minBp) -> parseUnary -> parseAtom
// The precedence table is DATA (OP_INFIX / WORD_INFIX / BP below), not a stack
// of ifs, so adding an operator is a one-line table entry. Sub-parsers for the
// bracketed constructs (call, big-op bounds, matrix, cases, set, group, abs,
// angle vector) are small methods that find their own closing bracket and
// re-enter the top of the parser on the enclosed range via parseRange().
//
// Binding powers (higher binds tighter):
//    3 seq (loose adjacency: quantifier clauses, ':' '.' ',' ';' connectors)
//    4 iff / <=>            (n-ary Relation)
//    5 implies / =>         (n-ary Relation)
//    6 or / OR              (BinOp lor)
//    7 and / AND            (BinOp land)
//    8 not / NOT prefix     (UnaryOp lnot)
//   10 relation chain: = != < > <= >= + RELATION_WORDS (ONE n-ary Relation)
//   12 -> +- -+ union intersect | (to pm mp cup cap mid)
//   20 + and binary -
//   25 /                    (Frac; operands are the full level-30 products)
//   30 juxtaposition, * , dot (juxt / cdot)
//   40 unary minus          (UnaryOp neg)
//   50 postfix '            (Prime)
//   60 ^ and _ , right-assoc (Pow / Sub)
//
// Three rules cut across that table; each is a parameter or a lookahead rather
// than a binding power, because none of them is expressible as one:
//   * A DIFFERENTIAL (dx dy dz dt du dv - see DIFFERENTIALS) is always the LAST
//     factor of its product. Collecting a product as a '/'-operand STOPS before
//     one, and nothing juxtaposes onto one inside that operand; what follows
//     joins at the outer juxt level instead. So `integral(0->1) 1/x dx` is
//     (integral (1/x)) dx and `d/dx f(x)` is (d/dx) f(x) - while a differential
//     BY ITSELF is still a fine operand (`dy/dx`). `partial` is deliberately
//     NOT in the set: `partial^2 u/partial x^2` keeps its operand products.
//   * '^' and '_' share bp 60, so plain right-associativity would let each one
//     swallow the other from inside its own ARGUMENT. It does not: a script
//     argument accepts only the SAME operator (`a^b^c` stays right-assoc),
//     while the sibling applies to the whole script - `a_i^2` is (a_i)^2.
//   * A '|' met in infix position opens a JUXTAPOSED Abs when a partner bar
//     follows in the same parse range at the same bracket depth (`2|x|`,
//     `|x||y|`); with no partner bar it is the "divides" relation (`n | m`).
//
// The parser NEVER throws: every unparseable position becomes a Raw node plus
// a warn diagnostic, and parseExpression() has a last-resort try/catch.
//
// Judgment calls (not fixed by the spec) are marked "NOTE:" below.

import type { Token, Diagnostic, Expr, Span } from './types';
import { lex } from './lexer';
import { GREEK, SYMBOL_MAP, MATH_KEYWORDS, FUNCTIONS, MATH_PACKAGE, RELATION_WORDS, STOP_WORDS, isOperatorName, operatorLatex } from './language';

// ---- Binding powers ----
const BP = {
  SEQ: 3, IFF: 4, IMPLIES: 5, LOR: 6, LAND: 7, LNOT: 8,
  REL: 10, ARROW: 12, ADD: 20, FRAC: 25, MUL: 30, NEG: 40, PRIME: 50, SUP: 60,
} as const;

// 'chain' folds a run of same-bp operators into ONE n-ary Relation.
type InfixForm = 'chain' | 'binop' | 'frac' | 'pow' | 'sub';
interface Infix { bp: number; form: InfixForm; op: string }

const OP_INFIX: Record<string, Infix> = {
  '<=>': { bp: BP.IFF, form: 'chain', op: '<=>' },
  '=>': { bp: BP.IMPLIES, form: 'chain', op: '=>' },
  '=': { bp: BP.REL, form: 'chain', op: '=' },
  '!=': { bp: BP.REL, form: 'chain', op: '!=' },
  '<': { bp: BP.REL, form: 'chain', op: '<' },
  '>': { bp: BP.REL, form: 'chain', op: '>' },
  '<=': { bp: BP.REL, form: 'chain', op: '<=' },
  '>=': { bp: BP.REL, form: 'chain', op: '>=' },
  '->': { bp: BP.ARROW, form: 'binop', op: 'to' },
  '+-': { bp: BP.ARROW, form: 'binop', op: 'pm' },
  '-+': { bp: BP.ARROW, form: 'binop', op: 'mp' },
  '+': { bp: BP.ADD, form: 'binop', op: '+' },
  '-': { bp: BP.ADD, form: 'binop', op: '-' },
  '/': { bp: BP.FRAC, form: 'frac', op: '/' },
  '*': { bp: BP.MUL, form: 'binop', op: 'cdot' },
  '^': { bp: BP.SUP, form: 'pow', op: '^' },
  '_': { bp: BP.SUP, form: 'sub', op: '_' },
};

const WORD_INFIX: Record<string, Infix> = {
  iff: { bp: BP.IFF, form: 'chain', op: 'iff' },
  implies: { bp: BP.IMPLIES, form: 'chain', op: 'implies' },
  or: { bp: BP.LOR, form: 'binop', op: 'lor' },
  OR: { bp: BP.LOR, form: 'binop', op: 'lor' },
  and: { bp: BP.LAND, form: 'binop', op: 'land' },
  AND: { bp: BP.LAND, form: 'binop', op: 'land' },
  union: { bp: BP.ARROW, form: 'binop', op: 'cup' },
  intersect: { bp: BP.ARROW, form: 'binop', op: 'cap' },
  dot: { bp: BP.MUL, form: 'binop', op: 'cdot' },
};
// Word relations (in, notin, subset, congruent, ...) all chain at level 10.
for (const w of RELATION_WORDS) WORD_INFIX[w] = { bp: BP.REL, form: 'chain', op: w };

const WORD_PREFIX: Record<string, { bp: number; op: string }> = {
  not: { bp: BP.LNOT, op: 'lnot' },
  NOT: { bp: BP.LNOT, op: 'lnot' },
};

// Quantifier prefixes: these grab the FOLLOWING level-10 expression with
// 'juxt', and consecutive quantified clauses join at the seq level. They are
// deliberately NOT juxtaposition candidates (see startsJuxtAtom) - that is
// what makes `forall eps > 0 exists delta > 0` split into two seq items
// instead of gluing `exists` onto the `0`.
const QUANTIFIERS = new Set(['forall', 'exists', 'suchthat']);

// Differentials. They resolve as ordinary Sym atoms (MATH_KEYWORDS identity)
// but terminate the product they appear in - see the header. `partial` is not
// one of them: it is a factor, not a closer.
const DIFFERENTIALS = new Set(['dx', 'dy', 'dz', 'dt', 'du', 'dv']);

// NOTE (judgment call): the spec names ':' and trailing '.' as seq connectors;
// ',' and ';' get the same treatment here so that ordinary input like
// `x = 1, y = 2` round-trips instead of tripping recovery. Inside brackets,
// call args, sets, matrices and cases these characters are consumed by the
// respective splitters and never reach this level.
const SEQ_CONNECTORS = new Set([':', '.', ',', ';']);

// Relational/arrow operators that veto the AngleVector reading of a '<'.
const VECTOR_VETO = new Set(['=', '!=', '<=', '>=', '<', '=>', '<=>', '->']);

// OP tokens that are ATOMS rather than operators - they stand for a symbol and
// take no operands. `...` is the only one: the lexer emits the three-dot
// ellipsis as a single token precisely so it can resolve to one `\ldots` here.
// NOTE (judgment call): `\ldots` uniformly, never `\cdots`. Baseline dots are
// right between list items (`{1, ..., n}`, `f(x_1, ..., x_n)`) and merely
// low between summands (`a_1 + ... + a_n`); picking per context would need the
// parser to know which operator surrounds the node, which it does not.
const OP_SYMBOLS: Record<string, string> = { '...': '\\ldots' };

const OPENERS: Record<string, string> = { LPAREN: 'RPAREN', LBRACKET: 'RBRACKET', LBRACE: 'RBRACE' };
const CLOSERS = new Set(['RPAREN', 'RBRACKET', 'RBRACE']);

const MATRIX_ENVS: Record<string, 'pmatrix' | 'bmatrix' | 'vmatrix'> = {
  matrix: 'pmatrix', bmatrix: 'bmatrix', vmatrix: 'vmatrix',
};

type Range = [number, number]; // [from, to) over the token array

const joinSpan = (a: Span, b: Span): Span =>
  ({ startLine: a.startLine, startCol: a.startCol, endLine: b.endLine, endCol: b.endCol });

// True when `e` is a differential, or a juxtaposition chain whose LAST factor
// is one - i.e. when the product `e` stands for is already closed.
function endsWithDifferential(e: Expr): boolean {
  if (e.kind === 'Sym') return DIFFERENTIALS.has(e.name);
  return e.kind === 'BinOp' && e.op === 'juxt' && endsWithDifferential(e.right);
}

// Per-call parse context. NEITHER field propagates into nested parseBinary
// calls: both describe the operand being collected AT THIS level, and a nested
// call is by definition a new operand.
interface BinaryOpts {
  // Set while collecting a '/'-operand: the product stops at a differential.
  fracOperand?: boolean;
  // Set while collecting the argument of '^' or '_': that operator may repeat
  // (right-assoc chain), its sibling may not.
  scriptOp?: string;
}

// Splits a juxtaposition chain headed by a big operator into that operator and
// the rest of the chain; null when the chain is not headed by one (or is a
// bare big operator with nothing juxtaposed after it).
function leadingBigOp(e: Expr): { big: Expr; rest: Expr } | null {
  if (e.kind !== 'BinOp' || e.op !== 'juxt') return null;
  if (e.left.kind === 'BigOp') return { big: e.left, rest: e.right };
  const inner = leadingBigOp(e.left);
  if (!inner) return null;
  return { big: inner.big, rest: { kind: 'BinOp', op: 'juxt', left: inner.rest, right: e.right, span: joinSpan(inner.rest.span, e.right.span) } };
}

class Parser {
  private pos = 0;
  private end: number;
  private rangeStart = 0;
  // Depth of currently-open `|...|` pairs. A '|' met in infix position closes
  // the innermost open Abs when this is > 0; with none open it either opens a
  // juxtaposed Abs (`2|x|`) or is the "divides" relation (BinOp 'mid', e.g.
  // `{x : a | x}`), decided by the partner-bar lookahead in parseBinary.
  private absDepth = 0;

  constructor(private toks: Token[], private diags: Diagnostic[], private proseFollows = false) {
    this.end = toks.length;
  }

  // ================= entry =================

  parse(): Expr {
    return this.parseRange(0, this.toks.length);
  }

  // Parses [from, to) as a complete expression, isolated from the enclosing
  // parse state (absDepth resets: a '|' inside brackets cannot close an Abs
  // opened outside them). Trailing junk is folded on as Raw at the seq level.
  private parseRange(from: number, to: number): Expr {
    const savedPos = this.pos, savedEnd = this.end, savedAbs = this.absDepth, savedStart = this.rangeStart;
    this.pos = from; this.end = to; this.absDepth = 0; this.rangeStart = from;

    let expr: Expr;
    if (from >= to) {
      expr = { kind: 'Raw', text: '', span: this.emptySpan(from) };
    } else {
      expr = this.parseBinary(0);
      while (this.pos < this.end) {
        const before = this.pos;
        const t = this.toks[this.pos];
        // Leftovers that can still start an expression are re-parsed (a stray
        // bracket must not poison the rest of the run); the rest is recovered.
        const tail = this.startsExpr(t) && !this.infixOf(t) ? this.parseBinary(0) : this.recover();
        expr = this.binop('seq', expr, tail);
        if (this.pos === before) break; // defensive: both paths always advance
      }
    }

    this.pos = savedPos; this.end = savedEnd; this.absDepth = savedAbs; this.rangeStart = savedStart;
    return expr;
  }

  // ================= Pratt core =================

  private parseBinary(minBp: number, opts: BinaryOpts = {}): Expr {
    let left = this.parseUnary(minBp, opts);

    for (;;) {
      const t = this.peek();
      if (!t) break;

      // postfix ' (prime), level 50
      if (t.kind === 'OP' && t.text === "'") {
        if (BP.PRIME < minBp) break;
        let count = 0;
        while (this.isOp(this.peek(), "'")) { count++; this.pos++; }
        left = { kind: 'Prime', operand: left, count, span: this.span(left.span, this.toks[this.pos - 1].span) };
        continue;
      }

      // postfix ! (factorial), level 50 - the same node `factorial(n)` builds,
      // so `(j-1)!` and `factorial(j-1)` are one construct with two spellings
      // and one rendering rule. Binds like a prime: tighter than any product,
      // looser than a script, so `n!^2` is (n!)^2 and `2n!` is 2(n!).
      if (t.kind === 'OP' && t.text === '!') {
        if (BP.PRIME < minBp) break;
        this.pos++;
        left = { kind: 'Call', fn: 'factorial', args: [left], span: this.span(left.span, t.span) };
        continue;
      }

      // '|' : closes the innermost open Abs, opens a juxtaposed one at level
      // 30, else "divides" at level 12
      if (t.kind === 'OP' && t.text === '|') {
        if (this.absDepth > 0) break; // the Abs sub-parser owns this token
        // NOTE (judgment call): with no Abs open, a partner bar decides - but
        // only one found BEFORE the search crosses a top-level relation/logic
        // token (findPartnerBar stops at anything infixOf() places at or
        // below BP.REL: = != < > <= >= => <=> and/or/AND/OR iff implies in
        // notin subset congruent similar parallel perp corresponds) or a
        // clause boundary (isClauseBoundary: closers, seq connectors ',' ';'
        // ':' '.', or a quantifier word). `2|x|`, `|x||y|`, `f(x)|g(x)|` are
        // products with an absolute value - the reading the old "always mid"
        // rule got wrong - while `n | m`, `{x : a | x}`, `p | a AND p | b`,
        // `d | n AND |S| = 3` and `d | n, |S| = 3` all stay "divides",
        // because their AND (or comma, or other boundary) now stops the
        // search before it can reach an unrelated bar from a later clause.
        // The remaining cost: a CHAIN of divides sharing one clause with no
        // boundary between them (`a | b | c`) still reads as `a` times `|b|`
        // then `c`.
        if (this.findPartnerBar(this.pos + 1, this.end) < 0) {
          if (BP.ARROW < minBp) break;
          this.pos++;
          const right = this.parseBinary(BP.ARROW + 1);
          left = this.binop('mid', left, right);
          continue;
        }
        // A '/'-operand's product stops at a differential (see the fracOperand
        // guard down at the MUL-level juxt branch); a juxtaposed Abs must not
        // glue onto one either, or `d/dx |x|` would read as `d / (dx |x|)`
        // instead of `(d/dx) |x|`. Mirrors that guard.
        if (opts.fracOperand && endsWithDifferential(left)) break;
        if (BP.MUL < minBp) break;
        // Re-enter at the factor level so parseAtom sees the '|' in prefix
        // position (-> parseAbs) and any script binds to the Abs: `2|x|^2`.
        left = this.binop('juxt', left, this.parseBinary(BP.MUL + 1));
        continue;
      }

      const inf = this.infixOf(t);
      if (inf) {
        if (inf.bp < minBp) break;
        // Inside a script argument the SIBLING script operator stops here, so
        // that it applies to the whole script instead: `a_i^2` = (a_i)^2.
        if (opts.scriptOp && (inf.form === 'pow' || inf.form === 'sub') && inf.op !== opts.scriptOp) break;
        left = this.applyInfix(left, inf);
        continue;
      }

      // level 3: seq connectors and quantifier-headed clauses
      if (BP.SEQ >= minBp) {
        if (t.kind === 'OP' && SEQ_CONNECTORS.has(t.text)) {
          this.pos++;
          left = this.binop('seq', left, { kind: 'Sym', name: t.text, latex: t.text, span: t.span });
          // Whatever follows a connector is a NEW seq item, not a factor of the
          // one before it: `x = 1, y = 2` must not juxtapose `y` onto the `1`.
          const after = this.peek();
          if (after && !this.infixOf(after) && this.startsExpr(after)) {
            left = this.binop('seq', left, this.parseBinary(BP.SEQ + 1));
          }
          continue;
        }
        if (t.kind === 'WORD' && QUANTIFIERS.has(t.text)) {
          left = this.binop('seq', left, this.parseBinary(BP.SEQ + 1));
          continue;
        }
      }

      // level 30: implicit product
      if (BP.MUL >= minBp && this.startsJuxtAtom(t)) {
        // A '/'-operand's product ends at a differential (before one, and
        // after the one it already holds); the outer level picks the rest up.
        if (opts.fracOperand && (this.isDifferential(t) || endsWithDifferential(left))) break;
        left = this.binop('juxt', left, this.parseBinary(BP.MUL + 1));
        continue;
      }

      break;
    }

    return left;
  }

  private applyInfix(left: Expr, inf: Infix): Expr {
    switch (inf.form) {
      case 'chain': {
        // Collect the WHOLE same-level chain into ONE n-ary Relation:
        // `a = b < c` -> ops ['=','<'], operands [a,b,c].
        const ops: string[] = [];
        const operands: Expr[] = [left];
        let cur: Infix | null = inf;
        while (cur && cur.form === 'chain' && cur.bp === inf.bp) {
          this.pos++;
          ops.push(cur.op);
          operands.push(this.parseBinary(inf.bp + 1));
          const next = this.peek();
          cur = next ? this.infixOf(next) : null;
        }
        return {
          kind: 'Relation', ops, operands,
          span: this.span(operands[0].span, operands[operands.length - 1].span),
        };
      }
      case 'frac': {
        this.pos++;
        return this.makeFrac(left, this.parseBinary(BP.FRAC + 1, { fracOperand: true }));
      }
      case 'pow':
      case 'sub': {
        this.pos++;
        // `x^(1/n)` / `a_(n+1)`: the paren CONTENT is parsed as a fresh full
        // expression and is NOT wrapped in a Group.
        const arg = this.parseSupSubArg(inf.op);
        return inf.form === 'pow'
          ? { kind: 'Pow', base: left, exp: arg, span: this.span(left.span, arg.span) }
          : { kind: 'Sub', base: left, sub: arg, span: this.span(left.span, arg.span) };
      }
      default: {
        this.pos++;
        const right = this.parseBinary(inf.bp + 1); // all binops here are left-assoc
        return this.binop(inf.op, left, right);
      }
    }
  }

  private makeFrac(num: Expr, den: Expr): Expr {
    // A big operator heading the numerator's juxtaposition chain scopes OVER
    // the fraction: `sum(i=1 -> n) 1/i` is sum(1/i), not (sum 1)/i - which is
    // also what the regex compiler renders (\sum_{i=1}^{n}\frac{1}{i}).
    // `partial^2 u/partial x^2` is untouched: its chain is headed by a Pow.
    const head = leadingBigOp(num);
    if (head) return this.binop('juxt', head.big, this.makeFrac(head.rest, den));
    // The legacy compiler's fraction idiom (compiler.ts ~line 650,
    // "(...)/(...) or (...)/simple"): when the NUMERATOR is written
    // parenthesized, those parens are the fraction's delimiters rather than
    // grouping, so they dissolve - and the denominator's parens dissolve with
    // them. `1/(1 + 1/n)` keeps its parens because the numerator is bare, i.e.
    // there the author's parens are their own grouping.
    const numIsGroup = num.kind === 'Group' && num.bracket === '(';
    return {
      kind: 'Frac',
      num: numIsGroup ? num.operand : num,
      den: numIsGroup && den.kind === 'Group' && den.bracket === '(' ? den.operand : den,
      span: joinSpan(num.span, den.span),
    };
  }

  // `scriptOp` is the operator ('^' or '_') this argument belongs to; only it
  // may chain inside the argument (see the header's script rule).
  private parseSupSubArg(scriptOp: string): Expr {
    const t = this.peek();
    if (t && t.kind === 'LPAREN') {
      const close = this.findMatch(this.pos);
      if (close >= 0) {
        const open = this.pos;
        const inner = this.parseRange(open + 1, close);
        this.pos = close + 1;
        // Re-span onto the full `(...)` extent so the caret over a paren still
        // lands on a node (the Group wrapper itself is intentionally dropped).
        return { ...inner, span: this.spanOf(open, close + 1) } as Expr;
      }
    }
    // The superscript-limit convention: in `a^+`, `b^-`, `x -> 0^+` the SIGN
    // itself is the whole script. Without this, parseUnary read the '-' as a
    // prefix sign reaching for an operand and parseAtom read the '+' as a
    // misplaced infix operator - either way the script argument swallowed
    // tokens past the sign, so `a^+ + b^-` recovered the binary '+' as Raw.
    // A sign that DOES have an operand after it (`x^-1`, `x^-n`) is untouched
    // and still parses as the unary minus it is.
    if (t && t.kind === 'OP' && (t.text === '+' || t.text === '-')) {
      const after = this.peek(1);
      if (!after || !this.startsExpr(after) || this.infixOf(after)) {
        this.pos++;
        return { kind: 'Sym', name: t.text, latex: t.text, span: t.span };
      }
    }
    return this.parseBinary(BP.SUP, { scriptOp }); // right-assoc: x^y^z = x^(y^z)
  }

  private parseUnary(minBp: number, opts: BinaryOpts = {}): Expr {
    const t = this.peek();
    const pre = !t ? undefined
      : t.kind === 'OP' && t.text === '-' ? { bp: BP.NEG, op: 'neg' }
      : t.kind === 'WORD' ? WORD_PREFIX[t.text]
      : undefined;
    if (!pre || !t) return this.parseAtom();
    this.pos++;
    // max(prefixBp, minBp): keeps a prefix operator from reaching past the
    // context that invoked it (e.g. `a * not b + c`). The operand continues the
    // SAME operand this level is collecting, so `opts` carries over to it.
    const operand = this.parseBinary(Math.max(pre.bp, minBp), opts);
    return { kind: 'UnaryOp', op: pre.op, operand, span: this.span(t.span, operand.span) };
  }

  // ================= atoms =================

  private parseAtom(): Expr {
    const t = this.peek();
    if (!t) {
      const span = this.emptySpan(this.pos);
      // Mirror image of the continuation-line idiom in the OP case below: a
      // run that ENDS on an infix operator is not truncated input when the
      // operand it is reaching for is the PROSE that follows it - `aRb =>
      // bRa` segments as prose / `=>` / prose, so the whole math run is that
      // one operator and BOTH its operands are next door. Only the renderer
      // can see that (it holds the run list), so it passes proseFollows; the
      // operand then goes missing exactly as silently as a leading operator's
      // does. Everything else - `x +` with nothing after it, an operand
      // missing inside brackets (pos < toks.length) - still reports.
      if (!(this.proseFollows && this.pos === this.toks.length)) {
        this.diags.push({ span, severity: 'warn', message: 'expression ends early — missing operand' });
      }
      return { kind: 'Raw', text: '', span };
    }
    switch (t.kind) {
      case 'NUMBER':
        this.pos++;
        return { kind: 'Num', value: t.text, span: t.span };
      case 'STRING':
        this.pos++;
        return { kind: 'Text', text: t.text, span: t.span };
      case 'MATH_QUOTE':
        return this.parseMathQuote(t);
      case 'WORD':
        return this.parseWord();
      case 'LPAREN':
      case 'LBRACKET':
        return this.parseGroup();
      case 'LBRACE':
        return this.parseBrace();
      case 'OP':
        if (OP_SYMBOLS[t.text]) {
          this.pos++;
          return { kind: 'Sym', name: t.text, latex: OP_SYMBOLS[t.text], span: t.span };
        }
        if (t.text === '|') return this.parseAbs();
        if (t.text === '<') {
          const vec = this.tryAngleVector();
          if (vec) return vec;
        }
        // NOTE (judgment call): a run that BEGINS with an infix operator is an
        // equation-continuation line, a shipped MathScript idiom (see the
        // `= lim_(h -> 0) ...` / `= f(x)` lines of INITIAL_CONTENT). It gets an
        // implicit empty left operand - no token consumed here, so the loop in
        // parseBinary applies the operator normally - and no diagnostic, since
        // nothing is actually wrong with the input. A zero-width Raw is the one
        // node in the frozen Expr union that can stand for "nothing here"; a
        // renderer emits nothing for it, leaving `=f(x)`.
        if (OP_INFIX[t.text] && this.pos === this.rangeStart) {
          return { kind: 'Raw', text: '', span: { startLine: t.span.startLine, startCol: t.span.startCol, endLine: t.span.startLine, endCol: t.span.startCol } };
        }
        break;
      default:
        break;
    }
    return this.recover();
  }

  // Word resolution order (spec): function call / big-op / matrix / cases ->
  // Math.x -> GREEK -> SYMBOL_MAP -> single letter / MATH_KEYWORDS / ident.
  private parseWord(): Expr {
    const start = this.pos;
    const tok = this.toks[start];
    const w = tok.text;
    const fn = FUNCTIONS[w];

    // Big operators bind their bounds themselves and must be reached BEFORE
    // the SYMBOL_MAP lookup, so that a bare `sum` is a BigOp rather than a Sym.
    if (fn && fn.kind === 'big') return this.parseBigOp(w as 'sum' | 'integral' | 'lim');
    if (w === 'cases' && this.kindAt(start + 1) === 'LBRACE') return this.parseCases();
    if (fn && fn.kind === 'matrix' && MATRIX_ENVS[w] && this.kindAt(start + 1) === 'LPAREN') return this.parseMatrix(MATRIX_ENVS[w]);

    // WORD ['...] LPAREN -> Call (known or unknown function alike); primes seen
    // between the word and its parens attach AFTER the Call: F'(x).
    //
    // A word that already NAMES A SYMBOL is the exception: `phi(x)`,
    // `sigma(n)`, `partial(x)^2` are that symbol applied to a group, and
    // calling them functions would print the symbol's own spelling as an
    // upright identifier (`\mathrm{phi}(x)`) instead of the letter the author
    // asked for. Only symbols with no FUNCTIONS entry take this exit - `sin`,
    // `sqrt`, `det` and friends are in both tables and stay calls.
    let k = start + 1;
    let primes = 0;
    while (this.kindAt(k) === 'OP' && this.toks[k].text === "'") { primes++; k++; }
    if (this.kindAt(k) === 'LPAREN' && !this.namesSymbol(w)) return this.parseCall(start, k, primes);

    // Math.xxx
    if (w === 'Math' && this.isOp(this.toks[start + 1], '.') && this.kindAt(start + 2) === 'WORD') {
      const name = `Math.${this.toks[start + 2].text}`;
      this.pos = start + 3;
      const span = this.spanOf(start, start + 3);
      const latex = MATH_PACKAGE[name];
      return latex ? { kind: 'Sym', name, latex, span } : { kind: 'Ident', name, span };
    }

    this.pos = start + 1;
    const span = tok.span;
    // A named operator with no argument list (`sin x`, `det A`, `log n`) is
    // the operator GLYPH applied by juxtaposition - the spelling working
    // mathematicians use - so it resolves to the same `\sin`/`\det` macro the
    // call form emits, NOT to the bare letters `sin`. Reached before the
    // MATH_KEYWORDS fallback below, which is what used to hand back
    // `Sym(latex: 'sin')` and render `sin x` as `sinx`: with no backslash to
    // end the control word, cat() had nothing to space and the operator glued
    // to its operand. Must stay AFTER the call check above so `sin(x)` is
    // still a Call.
    if (isOperatorName(w)) return { kind: 'Sym', name: w, latex: operatorLatex(w), span };
    if (GREEK[w]) return this.quantified({ kind: 'Sym', name: w, latex: GREEK[w], span });
    if (SYMBOL_MAP[w]) return this.quantified({ kind: 'Sym', name: w, latex: SYMBOL_MAP[w], span });
    if (w.length === 1) return { kind: 'Var', name: w, span };
    if (MATH_KEYWORDS.has(w)) return { kind: 'Sym', name: w, latex: SYMBOL_MAP[w] ?? w, span };
    return { kind: 'Ident', name: w, span };
  }

  /** True when `w` resolves to a symbol below (greek letter, SYMBOL_MAP entry
   *  or bare MATH_KEYWORD) and is not also a function name - i.e. when the
   *  word is a glyph, not a callee. */
  private namesSymbol(w: string): boolean {
    if (FUNCTIONS[w] !== undefined) return false;
    return GREEK[w] !== undefined || SYMBOL_MAP[w] !== undefined || MATH_KEYWORDS.has(w);
  }

  // Quantifier-prefix rule: `forall eps > 0` -> juxt(forall, Relation(>)).
  private quantified(sym: Expr & { kind: 'Sym' }): Expr {
    if (!QUANTIFIERS.has(sym.name)) return sym;
    const next = this.peek();
    if (!next || this.infixOf(next) || !this.startsExpr(next)) return sym;
    const body = this.parseBinary(BP.REL);
    return this.binop('juxt', sym, body);
  }

  private parseCall(start: number, lparen: number, primes: number): Expr {
    const close = this.findMatch(lparen);
    if (close < 0) return this.rawTail(start);
    const args = this.splitTop(lparen + 1, close, (t) => this.isOp(t, ',')).map(([a, b]) => this.parseRange(a, b));
    this.pos = close + 1;
    const span = this.spanOf(start, close + 1);
    // NOTE: for `F'(x)` the Call and the Prime share this span (the primes sit
    // inside the extent); caret lookup resolves to the innermost node, the Call.
    const call: Expr = { kind: 'Call', fn: this.toks[start].text, args, span };
    return primes > 0 ? { kind: 'Prime', operand: call, count: primes, span } : call;
  }

  // Two spellings of the same thing:
  //   MathScript bounds  `sum(i=1 -> n)`, `integral(a -> b)`, `lim_(h -> 0)`
  //   LaTeX-style scripts `sum_(i=1)^(n)`, `integral_(0)^(1)`, `sum_(n=1)^(inf)`
  // The second is what a LaTeX-fluent user types, and it used to fall through
  // this function entirely: the bare BigOp came back with `pos` still on the
  // `_`, so the ordinary script operators picked it up and built
  // `((\sum)_{i=1})^{n}` - and, since the Σ was then buried inside a Pow
  // rather than heading a juxtaposition chain, makeFrac's big-operator rule
  // no longer saw it and `sum_(n=1)^(inf) 1/n^2` dragged the Σ into the
  // numerator. Bounds bound here instead, and the node returned is the SAME
  // BigOp the arrow form produces, so the summand-scope rule applies to both.
  //
  // Parens whose content has no top-level '->' and no leading `_` are NOT
  // bounds: the bare BigOp is returned and the parens are left for the
  // juxtaposition level to pick up as an ordinary Group.
  private parseBigOp(op: 'sum' | 'integral' | 'lim'): Expr {
    const start = this.pos;
    this.pos++;
    let k = this.pos;
    const scripted = this.isOp(this.toks[k], '_') && this.kindAt(k + 1) === 'LPAREN';
    if (scripted) k++; // optional `_` before bounds
    if (this.kindAt(k) === 'LPAREN') {
      const close = this.findMatch(k);
      if (close < 0) return this.rawTail(start);
      const arrow = this.findTop(k + 1, close, (t) => this.isOp(t, '->'));
      if (arrow < 0 && scripted) {
        // `_(from)` plus an optional `^(to)`. The arrow form is checked first
        // (above) so `lim_(h -> 0)` keeps taking it - it means one subscript
        // with an arrow in it, not a lower bound.
        const from = this.parseRange(k + 1, close);
        let end = close + 1;
        let to: Expr | null = null;
        if (this.isOp(this.toks[end], '^') && this.kindAt(end + 1) === 'LPAREN') {
          const supClose = this.findMatch(end + 1);
          if (supClose >= 0) {
            to = this.parseRange(end + 2, supClose);
            end = supClose + 1;
          }
        }
        this.pos = end;
        return { kind: 'BigOp', op, from, to, span: this.spanOf(start, end) };
      }
      if (arrow >= 0) {
        // NOTE (judgment call): an empty bound (`sum( -> n)`, `sum(i=1 -> )`)
        // parses to a silent Raw("") - parseRange's from>=to case builds the
        // Raw directly rather than through raw(), which is the one that warns.
        // That silence is INTENTIONAL, not an oversight: this is a live-typing
        // editor, and a bound sits empty for a moment on every keystroke while
        // it's mid-edit (e.g. `sum(i= -> n)` before the lower limit is typed).
        // A diagnostic here would fire constantly for a completely normal
        // typing state rather than flagging a real error.
        const from = this.parseRange(k + 1, arrow);
        const to = this.parseRange(arrow + 1, close);
        this.pos = close + 1;
        return { kind: 'BigOp', op, from, to, span: this.spanOf(start, close + 1) };
      }
    }
    return { kind: 'BigOp', op, from: null, to: null, span: this.toks[start].span };
  }

  private parseMatrix(env: 'pmatrix' | 'bmatrix' | 'vmatrix'): Expr {
    const start = this.pos;
    const lparen = start + 1;
    const close = this.findMatch(lparen);
    if (close < 0) return this.rawTail(start);
    const outer = lparen + 1;
    // Expect the whole paren content to be one [[...],[...]] literal.
    if (this.kindAt(outer) === 'LBRACKET' && this.findMatch(outer) === close - 1) {
      const rows = this.splitTop(outer + 1, close - 1, (t) => this.isOp(t, ',')).map(([a, b]) => {
        if (this.kindAt(a) === 'LBRACKET' && this.findMatch(a) === b - 1) {
          return this.splitTop(a + 1, b - 1, (t) => this.isOp(t, ',')).map(([c, d]) => this.parseRange(c, d));
        }
        return [this.parseRange(a, b)]; // tolerate a single-cell row: matrix([a,b])
      });
      this.pos = close + 1;
      return { kind: 'Matrix', env, rows, span: this.spanOf(start, close + 1) };
    }
    // NOTE: anything else (e.g. `matrix(A)`) degrades to a plain Call rather
    // than to Raw - it still renders something meaningful.
    return this.parseCall(start, lparen, 0);
  }

  // `cases { v1 if c1; v2 otherwise }`
  private parseCases(): Expr {
    const start = this.pos;
    const lbrace = start + 1;
    const close = this.findMatch(lbrace);
    if (close < 0) return this.rawTail(start);
    const branches = this.splitTop(lbrace + 1, close, (t) => this.isOp(t, ';')).map(([a, b]) => {
      const ifIdx = this.findTop(a, b, (t) => t.kind === 'WORD' && t.text === 'if');
      if (ifIdx >= 0) return { value: this.parseRange(a, ifIdx), condition: this.parseRange(ifIdx + 1, b) };
      // `otherwise` only acts as the no-condition marker when it trails the
      // branch; anywhere else it is just a word (so no tokens get dropped).
      // The flag keeps it distinguishable from a branch with no condition at
      // all, which must not grow one in the renderer (see types.ts).
      if (this.kindAt(b - 1) === 'WORD' && this.toks[b - 1].text === 'otherwise') {
        return { value: this.parseRange(a, b - 1), condition: null, otherwise: true };
      }
      return { value: this.parseRange(a, b), condition: null };
    });
    this.pos = close + 1;
    return { kind: 'Cases', branches, span: this.spanOf(start, close + 1) };
  }

  private parseGroup(): Expr {
    const start = this.pos;
    const bracket: '(' | '[' = this.toks[start].kind === 'LPAREN' ? '(' : '[';
    const close = this.findMatch(start);
    if (close < 0) return this.rawTail(start);
    const parts = this.splitTop(start + 1, close, (t) => this.isOp(t, ','));
    let inner: Expr;
    if (parts.length <= 1) {
      inner = this.parseRange(start + 1, close);
    } else {
      // Intervals / tuples: `(a, b)` -> Group(BinOp(',', a, b)).
      inner = parts.map(([a, b]) => this.parseRange(a, b)).reduce((l, r) => this.binop(',', l, r));
    }
    this.pos = close + 1;
    return { kind: 'Group', operand: inner, bracket, span: this.spanOf(start, close + 1) };
  }

  // `{}` -> emptyset; `{ e : c }` / `{ e | c }` -> SetBuilder; else SetLiteral.
  private parseBrace(): Expr {
    const start = this.pos;
    const close = this.findMatch(start);
    if (close < 0) return this.rawTail(start);
    const from = start + 1, to = close;
    const span = this.spanOf(start, close + 1);
    this.pos = close + 1;

    // latex is SYMBOL_MAP's entry, not a literal here, so this glyph has one
    // source of truth (render.ts's empty-SetLiteral branch notes the same).
    if (from >= to) return { kind: 'Sym', name: 'emptyset', latex: SYMBOL_MAP.emptyset, span };

    const colon = this.findTop(from, to, (t) => this.isOp(t, ':'));
    const pipes = this.findAllTop(from, to, (t) => this.isOp(t, '|'));
    // A single top-level '|' separates a set-builder; two or more are Abs bars.
    let sep = colon;
    if (pipes.length === 1 && (sep < 0 || pipes[0] < sep)) sep = pipes[0];

    if (sep >= 0) {
      return { kind: 'SetBuilder', element: this.parseRange(from, sep), condition: this.parseCondition(sep + 1, to), span };
    }
    const elements = this.splitTop(from, to, (t) => this.isOp(t, ',')).map(([a, b]) => this.parseRange(a, b));
    return { kind: 'SetLiteral', elements, span };
  }

  // The condition side of a set-builder tolerates written-out English:
  // `{n : n is prime}` is standard notation for a set whose membership test is
  // a sentence, and the convention is to typeset that sentence as TEXT inside
  // the braces - `\{n \mid n \text{ is prime}\}` - which is only possible if
  // the words reach the parser at all. They now do: the disambiguator keeps a
  // set-builder in one run however much English it holds (the rule `(...)`
  // groups already had). This turns each maximal run of those words into ONE
  // Text node and parses everything between them normally, juxtaposing the
  // pieces.
  //
  // Only the CONDITION gets this. The element side of a set-builder is a term
  // (`{n^2 : ...}`, `{x in R : ...}`), not a sentence, so there is no English
  // there to rescue and no reason to widen the blast radius.
  private parseCondition(from: number, to: number): Expr {
    const runs = this.proseRunsIn(from, to);
    if (runs.length === 0) return this.parseRange(from, to);
    const parts: Expr[] = [];
    let at = from;
    for (const [a, b] of runs) {
      if (a > at) parts.push(this.parseRange(at, a));
      parts.push(this.textAtom(a, b, from, to));
      at = b;
    }
    if (to > at) parts.push(this.parseRange(at, to));
    return parts.reduce((l, r) => this.binop('juxt', l, r));
  }

  // Maximal runs of prose words in [from, to), at the TOP bracket level only:
  // a run inside a nested group would leave parseCondition splitting the range
  // at a point where the brackets are unbalanced, and prose there (`{x : f(x
  // is big)}`) is not a shape worth supporting.
  private proseRunsIn(from: number, to: number): Range[] {
    const runs: Range[] = [];
    let depth = 0;
    let start = -1;
    for (let i = from; i < to; i++) {
      const t = this.toks[i];
      if (OPENERS[t.kind]) depth++;
      else if (CLOSERS.has(t.kind)) depth = Math.max(0, depth - 1);
      const prose = depth === 0 && this.isProseWord(i);
      if (prose && start < 0) start = i;
      if (!prose && start >= 0) { runs.push([start, i]); start = -1; }
    }
    if (start >= 0) runs.push([start, to]);
    return runs;
  }

  // Is the word at `i` English rather than notation? Deliberately LEXICAL -
  // tables only, no scoring: the disambiguator has already settled that this
  // whole group is mathematics, so the only question left is which of its
  // words spell out a condition in words. Order matters - `exists`, `in`,
  // `suchthat` and `not` are all English words that this language ALSO defines
  // as symbols, so the math tables get the first say.
  private isProseWord(i: number): boolean {
    const t = this.toks[i];
    if (t.kind !== 'WORD') return false;
    const w = t.text;
    if (w.length === 1 || /^[A-Za-z][0-9]+$/.test(w)) return false; // `n`, `x1` - variables
    if (this.kindAt(i + 1) === 'LPAREN') return false;              // a callee, whatever it is called
    // `Math.naturals`: the member is not an English word just because it is in
    // no table (mirrors the disambiguator's own Math.* absolute).
    if (this.isOp(this.toks[i - 1], '.') && this.kindAt(i - 2) === 'WORD' && this.toks[i - 2].text === 'Math') return false;
    return GREEK[w] === undefined && SYMBOL_MAP[w] === undefined &&
      !MATH_KEYWORDS.has(w) && FUNCTIONS[w] === undefined;
  }

  // The Text node for one prose run. Spacing follows the same model as a
  // statement's prose/math boundary (see render.ts's header): the space lives
  // INSIDE the \text{} braces, added on whichever side the source has a gap
  // AND there is something within the condition to separate from - the braces
  // and the `\middle|` bring their own spacing, so a run at either end of the
  // condition gets none.
  private textAtom(a: number, b: number, from: number, to: number): Expr {
    const lead = a > from && this.hasGap(a - 1, a) ? ' ' : '';
    const trail = b < to && this.hasGap(b - 1, b) ? ' ' : '';
    return { kind: 'Text', text: `${lead}${this.textOf(a, b)}${trail}`, span: this.spanOf(a, b) };
  }

  private hasGap(i: number, j: number): boolean {
    const left = this.toks[i].span, right = this.toks[j].span;
    return right.startLine !== left.endLine || right.startCol > left.endCol;
  }

  // '|' in operand (prefix) position opens an Abs; the matching close is found
  // by the state machine in parseBinary (see absDepth).
  private parseAbs(): Expr {
    const start = this.pos;
    this.pos++;
    this.absDepth++;
    const inner = this.parseBinary(0);
    this.absDepth--;
    if (this.isOp(this.peek(), '|')) {
      this.pos++;
    } else {
      // NOTE: an unclosed '|' keeps its Abs (more useful downstream than Raw)
      // and reports the problem.
      this.diags.push({ span: this.spanOf(start, this.pos), severity: 'warn', message: 'unclosed | — treated as absolute value' });
    }
    return { kind: 'Abs', operand: inner, span: this.spanOf(start, this.pos) };
  }

  // `<a, b, c>` is a vector only when a matching '>' exists on this run with no
  // relational/arrow operator in between AND at least one top-level comma;
  // otherwise '<' is (and stays) a relation - `|x-y| < delta => ...`.
  private tryAngleVector(): Expr | null {
    const start = this.pos;
    let depth = 0;
    let commas = 0;
    let close = -1;
    for (let i = start + 1; i < this.end; i++) {
      const t = this.toks[i];
      if (OPENERS[t.kind]) { depth++; continue; }
      if (CLOSERS.has(t.kind)) { if (depth === 0) break; depth--; continue; }
      if (depth > 0 || t.kind !== 'OP') continue;
      if (t.text === '>') { close = i; break; }
      if (VECTOR_VETO.has(t.text)) return null;
      if (t.text === ',') commas++;
    }
    if (close < 0 || commas === 0) return null;
    const elements = this.splitTop(start + 1, close, (t) => this.isOp(t, ',')).map(([a, b]) => this.parseRange(a, b));
    this.pos = close + 1;
    return { kind: 'AngleVector', elements, span: this.spanOf(start, close + 1) };
  }

  // `$...$`: lex + parse the quoted content, re-spanning its tokens onto the
  // quote's own position first, so the resulting nodes carry real source spans.
  private parseMathQuote(tok: Token): Expr {
    this.pos++;
    const { tokens, diagnostics } = lex(tok.text);
    const colDelta = tok.span.startCol + 1; // past the opening '$'
    const shift = (s: Span): Span => ({
      startLine: tok.span.startLine, startCol: s.startCol + colDelta,
      endLine: tok.span.startLine, endCol: s.endCol + colDelta,
    });
    for (const d of diagnostics) this.diags.push({ ...d, span: shift(d.span) });
    const inner = tokens
      .filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT')
      .map((t) => ({ ...t, span: shift(t.span) }));
    if (inner.length === 0) return { kind: 'Raw', text: '', span: tok.span };
    return new Parser(inner, this.diags).parse();
  }

  // ================= recovery =================

  // Consumes the offending token, then runs to the next resync point
  // (`,` `;` `)` `]` `}` or a seq boundary), reporting the skipped text once.
  // It also stops at the next token that could START an expression, so one
  // stray operator cannot swallow the perfectly good expression behind it
  // (that turned a single bad token into a cascade of Raw fragments).
  private recover(): Expr {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.end) {
      const t = this.toks[this.pos];
      if (this.isResync(t) || this.startsExpr(t)) break;
      this.pos++;
    }
    return this.raw(start, this.pos);
  }

  private rawTail(start: number): Expr {
    this.pos = this.end;
    return this.raw(start, this.end);
  }

  private raw(from: number, to: number): Expr {
    const span = this.spanOf(from, to);
    const text = this.textOf(from, to);
    this.diags.push({ span, severity: 'warn', message: `could not parse '${text}' — rendered as-is` });
    return { kind: 'Raw', text, span };
  }

  private isResync(t: Token): boolean {
    return this.isClauseBoundary(t);
  }

  // A token that ends the current clause: a closing bracket, a seq connector
  // (',' ';' ':' '.'), or a quantifier word (forall/exists/suchthat) starting
  // the next one. Shared by isResync's error-recovery scan and
  // findPartnerBar's bar-partner lookahead below - in both cases, crossing
  // one of these means whatever comes next belongs to a different clause.
  private isClauseBoundary(t: Token): boolean {
    if (CLOSERS.has(t.kind)) return true;
    if (t.kind === 'OP' && SEQ_CONNECTORS.has(t.text)) return true;
    return t.kind === 'WORD' && QUANTIFIERS.has(t.text);
  }

  // ================= token helpers =================

  private peek(k = 0): Token | undefined {
    const i = this.pos + k;
    return i < this.end ? this.toks[i] : undefined;
  }

  private kindAt(i: number): string | undefined {
    return i >= 0 && i < this.end ? this.toks[i].kind : undefined;
  }

  private isOp(t: Token | undefined, text: string): boolean {
    return !!t && t.kind === 'OP' && t.text === text;
  }

  private isDifferential(t: Token): boolean {
    return t.kind === 'WORD' && DIFFERENTIALS.has(t.text);
  }

  private infixOf(t: Token): Infix | null {
    if (t.kind === 'OP') return OP_INFIX[t.text] ?? null;
    if (t.kind === 'WORD') return WORD_INFIX[t.text] ?? null;
    return null;
  }

  // Tokens that continue the current expression as an implicit product. Infix
  // words never reach here (infixOf claims them first); quantifiers are
  // excluded so they start a new seq item instead.
  private startsJuxtAtom(t: Token): boolean {
    switch (t.kind) {
      case 'NUMBER': case 'STRING': case 'MATH_QUOTE': case 'LPAREN': case 'LBRACKET': case 'LBRACE':
        return true;
      case 'WORD':
        return !QUANTIFIERS.has(t.text);
      case 'OP':
        // An ellipsis is an operand, so `x_1 x_2 ... x_n` juxtaposes it like
        // any other factor; every other OP is an operator here.
        return OP_SYMBOLS[t.text] !== undefined;
      default:
        return false;
    }
  }

  private startsExpr(t: Token): boolean {
    if (this.startsJuxtAtom(t)) return true;
    return t.kind === 'OP' && (t.text === '-' || t.text === '|' || t.text === '<');
  }

  // Index of the bracket matching the opener at `i`, or -1 if unbalanced
  // within this range.
  private findMatch(i: number): number {
    const want = OPENERS[this.toks[i].kind];
    if (!want) return -1;
    let depth = 0;
    for (let j = i; j < this.end; j++) {
      const k = this.toks[j].kind;
      if (OPENERS[k]) depth++;
      else if (CLOSERS.has(k)) {
        depth--;
        if (depth === 0) return k === want ? j : -1;
        if (depth < 0) return -1;
      }
    }
    return -1;
  }

  private findTop(from: number, to: number, pred: (t: Token) => boolean): number {
    const hits = this.findAllTop(from, to, pred, true);
    return hits.length ? hits[0] : -1;
  }

  // Like findTop for a bare '|', but the search gives up the moment it
  // crosses a top-level relation/logic token, or a clause boundary (seq
  // connector / quantifier - see isClauseBoundary), instead of scanning to
  // `to`: a '|' beyond that point opens (or closes) an Abs in a DIFFERENT
  // clause, so it is never this bar's partner (see the NOTE at the '|' call
  // site).
  private findPartnerBar(from: number, to: number): number {
    let depth = 0;
    for (let i = from; i < to; i++) {
      const t = this.toks[i];
      if (OPENERS[t.kind]) { depth++; continue; }
      if (CLOSERS.has(t.kind)) { depth = Math.max(0, depth - 1); continue; }
      if (depth > 0) continue;
      if (this.isOp(t, '|')) return i;
      if (this.isClauseBoundary(t)) return -1;
      const inf = this.infixOf(t);
      if (inf && inf.bp <= BP.REL) return -1;
    }
    return -1;
  }

  private findAllTop(from: number, to: number, pred: (t: Token) => boolean, firstOnly = false): number[] {
    const out: number[] = [];
    let depth = 0;
    for (let i = from; i < to; i++) {
      const t = this.toks[i];
      if (OPENERS[t.kind]) { depth++; continue; }
      if (CLOSERS.has(t.kind)) { depth = Math.max(0, depth - 1); continue; }
      if (depth === 0 && pred(t)) {
        out.push(i);
        if (firstOnly) return out;
      }
    }
    return out;
  }

  // Splits [from, to) at top-level separators; empty pieces are dropped, so
  // `f()` yields no args and a trailing `;` adds no empty branch.
  private splitTop(from: number, to: number, pred: (t: Token) => boolean): Range[] {
    const cuts = this.findAllTop(from, to, pred);
    const parts: Range[] = [];
    let start = from;
    for (const c of cuts) {
      if (c > start) parts.push([start, c]);
      start = c + 1;
    }
    if (to > start) parts.push([start, to]);
    return parts;
  }

  // ================= span / node helpers =================

  private span(a: Span, b: Span): Span {
    return joinSpan(a, b);
  }

  private spanOf(from: number, to: number): Span {
    if (to <= from) return this.emptySpan(from);
    return this.span(this.toks[from].span, this.toks[to - 1].span);
  }

  // Zero-width span at token `at` (or just past the last token when `at` is
  // out of range) - used for empty ranges and missing operands.
  private emptySpan(at: number): Span {
    const t = this.toks[Math.min(at, this.toks.length - 1)];
    if (!t) return { startLine: 1, startCol: 0, endLine: 1, endCol: 0 };
    const anchor = at < this.toks.length ? t.span.startLine : t.span.endLine;
    const col = at < this.toks.length ? t.span.startCol : t.span.endCol;
    return { startLine: anchor, startCol: col, endLine: anchor, endCol: col };
  }

  private binop(op: string, left: Expr, right: Expr): Expr {
    return { kind: 'BinOp', op, left, right, span: this.span(left.span, right.span) };
  }

  // Reconstructs source text for a token range from the spans (columns are
  // measured against the lexer's NORMALIZED text). STRING/MATH_QUOTE tokens
  // carry their inner text only, so their delimiters are not reproduced.
  private textOf(from: number, to: number): string {
    let out = '';
    let prev: Token | null = null;
    for (let i = from; i < to; i++) {
      const t = this.toks[i];
      if (prev) {
        if (t.span.startLine !== prev.span.endLine) out += '\n';
        else out += ' '.repeat(Math.max(0, t.span.startCol - prev.span.endCol));
      }
      out += t.text;
      prev = t;
    }
    return out;
  }
}

/**
 * Parses one math run into a single Expr. Diagnostics from recovery are pushed
 * onto `diagnostics`. Never throws: a failure inside the parser itself still
 * yields a Raw node covering the run.
 *
 * `proseFollows` says a PROSE run comes next in the same statement. It only
 * ever silences one diagnostic - the operand a trailing infix operator is
 * reaching for, which in that case is the prose (see parseAtom).
 */
export function parseExpression(tokens: Token[], diagnostics: Diagnostic[], proseFollows = false): Expr {
  if (tokens.length === 0) {
    return { kind: 'Raw', text: '', span: { startLine: 1, startCol: 0, endLine: 1, endCol: 0 } };
  }
  const first = tokens[0].span;
  const last = tokens[tokens.length - 1].span;
  const span: Span = { startLine: first.startLine, startCol: first.startCol, endLine: last.endLine, endCol: last.endCol };
  try {
    return new Parser(tokens, diagnostics, proseFollows).parse();
  } catch (err) {
    const text = tokens.map((t) => t.text).join(' ');
    diagnostics.push({
      span, severity: 'warn',
      message: `could not parse '${text}' — rendered as-is`,
      hint: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'Raw', text, span };
  }
}
