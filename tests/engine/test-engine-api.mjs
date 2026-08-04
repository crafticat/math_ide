/**
 * MathBrain Engine v2 - Public API Test Suite (Task 7)
 *
 * Bundles services/engine/engine.ts - which pulls in the WHOLE pipeline
 * (lexer -> document -> disambiguate -> parser -> render) - and exercises the
 * three public entry points against the real compiled output:
 *   compile(source)                       -> CompileResult + statement index
 *   nodeAt(result, line, col)             -> caret -> structural Expr node
 *   renderLineWithHighlight(result, l, c) -> that one line, re-rendered tinted
 *
 * The two properties this suite exists to protect:
 *   1. ONE diagnostics array through all stages, with NO duplicates - the
 *      statement index and the rendered lines come from a SINGLE parse of
 *      each statement (a naive engine that parsed once for the index and
 *      again for rendering would double every diagnostic; (c) and (g) pin
 *      the exact counts).
 *   2. Caret -> node lookup lands on the SMALLEST STRUCTURAL node containing
 *      the caret (walking up from a leaf), so the UI tints a meaningful
 *      sub-expression rather than a bare variable.
 *
 * All caret columns are computed from the source strings with indexOf() -
 * nothing is hardcoded, so editing a fixture cannot silently invalidate a
 * caret assertion.
 *
 * Run with: node tests/engine/test-engine-api.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Public API (compile/nodeAt) Suite     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;
const failures = [];

function check(group, description, condition, detail) {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} [${group}] ${description}`);
  } else {
    failed++;
    failures.push(`[${group}] ${description}${detail ? `\n      ${detail}` : ''}`);
    console.log(`${RED}✗${RESET} [${group}] ${description}`);
    if (detail) console.log(`      ${detail}`);
  }
}

function checkExact(group, description, got, want) {
  if (got === want) {
    passed++;
    console.log(`${GREEN}✓${RESET} [${group}] ${description}`);
    return;
  }
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  const detail = [
    `want: ${want}`,
    `got : ${got}`,
    `first diff at col ${i}: want ${JSON.stringify(want.slice(i, i + 14))} got ${JSON.stringify(got.slice(i, i + 14))}`,
  ].join('\n      ');
  failed++;
  failures.push(`[${group}] ${description}\n      ${detail}`);
  console.log(`${RED}✗${RESET} [${group}] ${description}`);
  console.log(`      ${detail}`);
}

// ============================================
// Bundle + import
// ============================================
const engineUrl = bundle('services/engine/engine.ts', 'engine.mjs');
check('Bundle', `engine bundle wrote output under .test-build (${engineUrl})`, engineUrl.includes('.test-build'));
check('Bundle', 'engine bundled output file exists on disk', existsSync(new URL(engineUrl)));

const engine = await import(engineUrl);
const { compile, nodeAt, renderLineWithHighlight } = engine;
check('Bundle', 'module exports compile()', typeof compile === 'function');
check('Bundle', 'module exports nodeAt()', typeof nodeAt === 'function');
check('Bundle', 'module exports renderLineWithHighlight()', typeof renderLineWithHighlight === 'function');

// ============================================
// Helpers
// ============================================

// 1-based line number of the first source line containing `needle`.
const lineOf = (source, needle) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

// 0-based column of `needle` within its line (spans use 0-based cols).
const colOf = (source, lineText, needle) => {
  const line = source.split('\n').find((l) => l.includes(lineText));
  return line === undefined ? -1 : line.indexOf(needle);
};

const spanStr = (s) => (s ? `${s.startLine}:${s.startCol}-${s.endLine}:${s.endCol}` : 'null');

// compile() walks the block tree to build the index, renderDocument walks it
// to build the lines; `indent` is only trustworthy if the two agree. For
// every entry, the line rendered for that source line must start with
// EXACTLY `indent` \quad's (a Claim's label owns its indentation, so the
// assertion is the same for both block kinds).
const quads = (n) => '\\quad '.repeat(n);
const indentMismatch = (result) => result.index.map((e) => {
  const rendered = result.latexLines.find((l) => l.originalLine === e.line && !l.latex.startsWith('\\rule'));
  if (!rendered) return `line ${e.line}: no rendered line`;
  if (!rendered.latex.startsWith(quads(e.indent))) return `line ${e.line}: indent ${e.indent} vs ${rendered.latex.slice(0, 30)}`;
  if (rendered.latex.startsWith(quads(e.indent + 1))) return `line ${e.line}: indent ${e.indent} too shallow for ${rendered.latex.slice(0, 30)}`;
  return null;
}).filter(Boolean);

// Removes the first \htmlClass{hl-node}{...} wrapper (brace-matched, so a
// wrapped \frac{..}{..} survives intact), leaving its contents - a
// highlighted line stripped this way must equal the compiled line exactly.
const HL_OPEN = '\\htmlClass{hl-node}{';
function stripHighlight(latex) {
  const open = latex.indexOf(HL_OPEN);
  if (open < 0) return latex;
  const start = open + HL_OPEN.length;
  let depth = 1;
  let i = start;
  while (i < latex.length && depth > 0) {
    if (latex[i] === '{') depth++;
    else if (latex[i] === '}') depth--;
    i++;
  }
  return latex.slice(0, open) + latex.slice(start, i - 1) + latex.slice(i);
}

const spanWithin = (inner, outer) => {
  if (inner.startLine < outer.startLine || inner.endLine > outer.endLine) return false;
  if (inner.startLine === outer.startLine && inner.startCol < outer.startCol) return false;
  if (inner.endLine === outer.endLine && inner.endCol > outer.endCol) return false;
  return true;
};

// ============================================
// (a) Bernoulli end-to-end
// The fixture is byte-identical to test-document.mjs's; DOC_GOLDEN is
// byte-identical to test-render.mjs's - compile() must reproduce the approved
// document output exactly, through the pre-parsed-statement path.
// ============================================
const BERNOULLI = `#define N Math.naturals
Problem 3 {
  Theorem Bernoulli inequality {
    forall x >= -1 forall n in N: (1+x)^n >= 1 + n dot x
  }
  Proof {
    - base case {
      ?: (1+x)^0 >= 1 + 0 dot x {
        (1+x)^0 = 1 >= 1 = 1 + 0 dot x
      }
    }
    - inductive step {
      Assume (1+x)^n >= 1 + n dot x
      Then (1+x)^(n+1) = (1+x)^n dot (1+x) >= (1 + n dot x)(1 + x) = 1 + (n+1) dot x + n dot x^2 >= 1 + (n+1) dot x
      QED
    }
  }
}`;

const DOC_GOLDEN = [
  String.raw`{\huge \textbf{\text{Problem 3}}}`,
  String.raw`\quad {\Large \textbf{\text{Theorem Bernoulli inequality}}}`,
  String.raw`\quad \quad \forall x\ge -1\ \forall n\in\mathbb{N}:\ (1+x)^{n}\ge 1+n\cdot x`,
  String.raw`\quad {\Large \textit{\text{Proof.}}}`,
  String.raw`\quad \quad \textbf{\text{(i) base case:}}`,
  String.raw`\quad \quad \quad \textit{\text{Claim: }}(1+x)^{0}\ge 1+0\cdot x`,
  String.raw`\quad \quad \quad \quad (1+x)^{0}=1\ge 1=1+0\cdot x`,
  String.raw`\quad \quad \textbf{\text{(ii) inductive step:}}`,
  String.raw`\quad \quad \quad \text{Assume }(1+x)^{n}\ge 1+n\cdot x`,
  String.raw`\quad \quad \quad \text{Then }(1+x)^{n+1}=(1+x)^{n}\cdot(1+x)\ge(1+n\cdot x)(1+x)=1+(n+1)\cdot x+n\cdot x^{2}\ge 1+(n+1)\cdot x`,
  String.raw`\quad \quad \quad \blacksquare`,
];

const bern = compile(BERNOULLI);
{
  const content = bern.latexLines.filter((l) => !l.latex.startsWith('\\rule'));
  check('Bernoulli', `compile() produces ${DOC_GOLDEN.length} non-spacer lines (got ${content.length})`,
    content.length === DOC_GOLDEN.length, content.map((l) => l.latex).join('\n      '));
  DOC_GOLDEN.forEach((want, i) => {
    checkExact('Bernoulli', `golden line ${i + 1}`, content[i] ? content[i].latex : '<missing>', want);
  });

  check('Bernoulli', 'ZERO diagnostics on the fully-valid fixture',
    bern.diagnostics.length === 0, JSON.stringify(bern.diagnostics));
  checkExact('Bernoulli', 'macros === { N: "Math.naturals" }', JSON.stringify(bern.macros), JSON.stringify({ N: 'Math.naturals' }));
  check('Bernoulli', 'result carries the DocumentAst (blocks array)',
    !!bern.ast && Array.isArray(bern.ast.blocks) && bern.ast.blocks.length === 2);

  // The index: 1 theorem statement + 1 claim + 1 claim-body statement +
  // 3 proof statements (Assume / Then / QED) = 6, verified against the real
  // tree shape (test-document.mjs pins that shape independently).
  check('Bernoulli', `index has exactly 6 entries (got ${bern.index.length})`, bern.index.length === 6,
    bern.index.map((e) => `${e.blockKind}@${e.line}`).join(' | '));

  const wantLines = [
    lineOf(BERNOULLI, 'forall x >= -1'),
    lineOf(BERNOULLI, '?:'),
    lineOf(BERNOULLI, '(1+x)^0 = 1'),
    lineOf(BERNOULLI, 'Assume'),
    lineOf(BERNOULLI, 'Then'),
    lineOf(BERNOULLI, 'QED'),
  ];
  check('Bernoulli', 'fixture line lookups all resolved (assertions below are self-computed)',
    wantLines.every((n) => n > 0) && JSON.stringify(wantLines) === JSON.stringify([4, 8, 9, 13, 14, 15]),
    JSON.stringify(wantLines));
  checkExact('Bernoulli', 'index lines are [4, 8, 9, 13, 14, 15] (document order)',
    JSON.stringify(bern.index.map((e) => e.line)), JSON.stringify(wantLines));
  checkExact('Bernoulli', 'index blockKinds are [Statement, Claim, Statement x4]',
    JSON.stringify(bern.index.map((e) => e.blockKind)),
    JSON.stringify(['Statement', 'Claim', 'Statement', 'Statement', 'Statement', 'Statement']));
  checkExact('Bernoulli', 'index indents match tree depth [2, 3, 4, 3, 3, 3]',
    JSON.stringify(bern.index.map((e) => e.indent)), JSON.stringify([2, 3, 4, 3, 3, 3]));
  check('Bernoulli', 'every entry retains its ParsedSegment[] with at least one math segment',
    bern.index.every((e) => Array.isArray(e.segments) && e.segments.some((s) => s.kind === 'math' && s.expr)),
    bern.index.map((e) => `${e.line}:${e.segments.map((s) => s.kind).join(',')}`).join(' | '));
  check('Bernoulli', 'every entry span starts on its own line',
    bern.index.every((e) => e.span.startLine === e.line), bern.index.map((e) => spanStr(e.span)).join(' | '));
  check('Bernoulli', "every entry's indent equals the \\quad count the renderer actually used",
    indentMismatch(bern).length === 0, indentMismatch(bern).join(' | '));

  // No hidden per-call state: compiling twice is byte-identical and does not
  // accumulate diagnostics anywhere.
  const again = compile(BERNOULLI);
  check('Bernoulli', 'compile is deterministic (same source -> same latex twice)',
    JSON.stringify(again.latexLines) === JSON.stringify(bern.latexLines));
  check('Bernoulli', 'compiling twice still yields zero diagnostics', again.diagnostics.length === 0);
}

// ============================================
// (b) nodeAt precision
// ============================================
const FRAC_SRC = '(x+1)/(x-1) = y^2 + 1';
const frac = compile(FRAC_SRC);
{
  check('nodeAt', 'fraction fixture compiles clean (1 statement, 0 diagnostics)',
    frac.index.length === 1 && frac.diagnostics.length === 0, JSON.stringify(frac.diagnostics));
  checkExact('nodeAt', 'fraction fixture renders as expected',
    frac.latexLines[0] ? frac.latexLines[0].latex : '<missing>', String.raw`\frac{x+1}{x-1}=y^{2}+1`);

  // `1` inside the DENOMINATOR `(x-1)`: the smallest containing node is the
  // Num leaf, whose nearest structural ancestor is the Frac (BinOp `x-1` and
  // the parens are not structural).
  const denomCol = FRAC_SRC.indexOf('x-1') + 2;
  const denom = nodeAt(frac, 1, denomCol);
  check('nodeAt', `caret on the 1 in (x-1) [col ${denomCol}] -> Frac`,
    !!denom && denom.expr.kind === 'Frac', denom ? `${denom.expr.kind} ${spanStr(denom.expr.span)}` : 'null');
  check('nodeAt', 'the hit carries its statement index entry (line 1)',
    !!denom && denom.statement && denom.statement.line === 1 && denom.statement.blockKind === 'Statement',
    denom && denom.statement ? `${denom.statement.blockKind}@${denom.statement.line}` : 'null');

  // `2` in `y^2` -> the Pow itself (exponent leaf walks up one step).
  const expCol = FRAC_SRC.indexOf('y^2') + 2;
  const exp = nodeAt(frac, 1, expCol);
  check('nodeAt', `caret on the 2 in y^2 [col ${expCol}] -> Pow`,
    !!exp && exp.expr.kind === 'Pow', exp ? `${exp.expr.kind} ${spanStr(exp.expr.span)}` : 'null');

  // `y` -> Var walks up to the same Pow.
  const baseCol = FRAC_SRC.indexOf('y^2');
  const base = nodeAt(frac, 1, baseCol);
  check('nodeAt', `caret on the y in y^2 [col ${baseCol}] -> Pow`,
    !!base && base.expr.kind === 'Pow', base ? `${base.expr.kind} ${spanStr(base.expr.span)}` : 'null');
  check('nodeAt', 'y and 2 resolve to the SAME Pow node (same span)',
    !!base && !!exp && spanStr(base.expr.span) === spanStr(exp.expr.span),
    `${base && spanStr(base.expr.span)} vs ${exp && spanStr(exp.expr.span)}`);

  // The `=` sits between two operand spans, so the smallest node containing
  // it is the Relation - already structural, so it is kept as-is.
  const eqCol = FRAC_SRC.indexOf('=');
  const rel = nodeAt(frac, 1, eqCol);
  check('nodeAt', `caret on the = [col ${eqCol}] -> Relation`,
    !!rel && rel.expr.kind === 'Relation', rel ? `${rel.expr.kind} ${spanStr(rel.expr.span)}` : 'null');
  check('nodeAt', 'the Relation hit spans the whole statement',
    !!rel && spanStr(rel.expr.span) === `1:0-1:${FRAC_SRC.length}`, rel ? spanStr(rel.expr.span) : 'null');

  // Outside every span.
  check('nodeAt', 'caret past the end of the line -> null', nodeAt(frac, 1, FRAC_SRC.length + 5) === null);
  check('nodeAt', 'caret on a line with no statement -> null', nodeAt(frac, 7, 0) === null);
  check('nodeAt', 'caret on line 0 / negative col -> null', nodeAt(frac, 0, 0) === null && nodeAt(frac, 1, -3) === null);
}
{
  // Prose positions have no Expr at all.
  const PROSE = 'Let x be a real number';
  const prose = compile(PROSE);
  const proseCol = PROSE.indexOf('real');
  check('nodeAt', `caret inside a prose run [col ${proseCol}] -> null`, nodeAt(prose, 1, proseCol) === null,
    JSON.stringify(nodeAt(prose, 1, proseCol)));
  const mathCol = PROSE.indexOf('x');
  check('nodeAt', 'the same document still has a statement index entry covering the line',
    prose.index.length === 1 && prose.index[0].span.startLine === 1, JSON.stringify(prose.index.map((e) => e.line)));
  // A lone Var has no structural ancestor -> null (nothing meaningful to tint).
  check('nodeAt', `caret on the lone math variable x [col ${mathCol}] -> null (no structural ancestor)`,
    nodeAt(prose, 1, mathCol) === null, JSON.stringify(nodeAt(prose, 1, mathCol)));
}
{
  // Caret between statements (a blank line inside a scope) -> null.
  const src = 'Problem 1 {\n  x^2 = 1\n\n  y^2 = 2\n}';
  const r = compile(src);
  check('nodeAt', 'caret on a blank line between two statements -> null', nodeAt(r, 3, 0) === null);
  check('nodeAt', 'caret on a scope header line -> null', nodeAt(r, 1, 2) === null);
  const hit = nodeAt(r, 2, src.split('\n')[1].indexOf('x^2') + 2);
  check('nodeAt', 'caret inside the first statement still resolves (Pow)',
    !!hit && hit.expr.kind === 'Pow' && hit.statement.line === 2, hit ? `${hit.expr.kind}@${hit.statement.line}` : 'null');
}

// ============================================
// (c) Escape hatch + recovery: ONE diagnostic, not two
// ============================================
{
  const SRC = 'x^2 + sqrt(';
  const r = compile(SRC);
  check('Recovery', `"${SRC}" yields EXACTLY 1 diagnostic (no double-parse)`,
    r.diagnostics.length === 1, JSON.stringify(r.diagnostics.map((d) => d.message)));
  check('Recovery', 'the diagnostic is the parser recovery warn',
    r.diagnostics.length === 1 && r.diagnostics[0].severity === 'warn' && r.diagnostics[0].message.includes('could not parse'),
    JSON.stringify(r.diagnostics));
  check('Recovery', 'latexLines is non-empty (recovery still renders the line)',
    r.latexLines.length > 0 && r.latexLines[0].latex.length > 0, JSON.stringify(r.latexLines));
  check('Recovery', 'the typed prefix survives as real math (x^{2})',
    r.latexLines[0].latex.includes('x^{2}'), r.latexLines[0].latex);

  const powCol = SRC.indexOf('x^2') + 2;
  const hit = nodeAt(r, 1, powCol);
  check('Recovery', `caret in the x^2 region [col ${powCol}] -> Pow (parseable part still navigable)`,
    !!hit && hit.expr.kind === 'Pow', hit ? `${hit.expr.kind} ${spanStr(hit.expr.span)}` : 'null');

  const rawCol = SRC.indexOf('sqrt(') + 1;
  check('Recovery', `caret inside the unparseable Raw span [col ${rawCol}] -> null`,
    nodeAt(r, 1, rawCol) === null, JSON.stringify(nodeAt(r, 1, rawCol)));
}
{
  // Lexer-stage diagnostics reach the SAME array (one array through all stages).
  const r = compile('x = "unterminated');
  check('Recovery', 'lexer diagnostics flow into the same diagnostics array',
    r.diagnostics.some((d) => d.severity === 'warn' && /unterminated/i.test(d.message)),
    JSON.stringify(r.diagnostics.map((d) => d.message)));
}
{
  // Document-stage diagnostics too.
  const r = compile('}');
  check('Recovery', 'document diagnostics ("unmatched }") flow into the same array',
    r.diagnostics.some((d) => d.message.includes('unmatched }')), JSON.stringify(r.diagnostics.map((d) => d.message)));
}

// ============================================
// (d) renderLineWithHighlight
// ============================================
{
  const denomCol = FRAC_SRC.indexOf('x-1') + 2;
  const out = renderLineWithHighlight(frac, 1, denomCol);
  check('Highlight', 'returns { line, latex } for a caret inside the denominator', !!out && out.line === 1 && typeof out.latex === 'string',
    JSON.stringify(out));
  // nodeAt resolves the denominator caret to the Frac (see (b)), so the tint
  // wraps the whole fraction - which is exactly the node containing `x-1`.
  checkExact('Highlight', 'the hl-node wrapper encloses the fraction containing x-1',
    out ? out.latex : '<null>', String.raw`\htmlClass{hl-node}{\frac{x+1}{x-1}}=y^{2}+1`);
  check('Highlight', 'the wrapped region contains the denominator text x-1',
    !!out && /\\htmlClass\{hl-node\}\{[^]*x-1/.test(out.latex), out && out.latex);

  const expCol = FRAC_SRC.indexOf('y^2') + 2;
  const powOut = renderLineWithHighlight(frac, 1, expCol);
  checkExact('Highlight', 'a caret in y^2 tints only the Pow',
    powOut ? powOut.latex : '<null>', String.raw`\frac{x+1}{x-1}=\htmlClass{hl-node}{y^{2}}+1`);

  // Un-highlighted, the same call path reproduces the compiled line exactly -
  // for the fraction wrapper too, whose contents contain braces of their own.
  check('Highlight', 'stripping the wrapper reproduces the compiled line byte-for-byte',
    !!powOut && stripHighlight(powOut.latex) === frac.latexLines[0].latex, powOut && powOut.latex);
  check('Highlight', 'the same holds for the brace-heavy \\frac wrapper',
    !!out && stripHighlight(out.latex) === frac.latexLines[0].latex, out && out.latex);

  check('Highlight', 'caret past the end of the line -> null', renderLineWithHighlight(frac, 1, FRAC_SRC.length + 5) === null);
}
{
  const PROSE = 'Let x be a real number';
  const prose = compile(PROSE);
  check('Highlight', 'caret on prose -> null (nodeAt returned null)',
    renderLineWithHighlight(prose, 1, PROSE.indexOf('real')) === null);
}
{
  // A Claim line keeps its label and indentation when re-rendered: the
  // highlight path must reuse the document renderer's line policy, not a
  // bare renderSegments() that drops "Claim: ".
  const claimLine = lineOf(BERNOULLI, '?:');
  const claimCol = colOf(BERNOULLI, '?:', '(1+x)^0');
  const out = renderLineWithHighlight(bern, claimLine, claimCol + 1);
  check('Highlight', `Claim line ${claimLine} re-renders with its label + indent`,
    !!out && out.line === claimLine && out.latex.startsWith(String.raw`\quad \quad \quad \textit{\text{Claim: }}`),
    JSON.stringify(out));
  check('Highlight', 'the Claim re-render carries an hl-node wrapper',
    !!out && out.latex.includes('\\htmlClass{hl-node}{'), out && out.latex);
  check('Highlight', 'the Claim re-render matches the golden line once the wrapper is stripped',
    !!out && stripHighlight(out.latex) === DOC_GOLDEN[5], out && out.latex);

  // An indented plain statement keeps its \quad prefix too.
  const thenLine = lineOf(BERNOULLI, 'Then');
  const thenOut = renderLineWithHighlight(bern, thenLine, colOf(BERNOULLI, 'Then', '(n+1)') + 1);
  check('Highlight', `statement line ${thenLine} re-renders with its 3-deep indent`,
    !!thenOut && thenOut.line === thenLine && thenOut.latex.startsWith('\\quad \\quad \\quad '),
    JSON.stringify(thenOut && thenOut.latex.slice(0, 40)));
}

// ============================================
// (e) Index integrity on a doc with scopes + subtasks
// ============================================
{
  const SRC = [
    'Problem 1 {',
    '  Section A {',
    '    x^2 = 1',
    '    - first {',
    '      y^2 = 2',
    '      -- deep {',
    '        z^2 = 3',
    '      }',
    '    }',
    '  }',
    '  Theorem T {',
    '    ?: a > 0 {',
    '      a = 1',
    '    }',
    '  }',
    '}',
  ].join('\n');
  const r = compile(SRC);

  // Independent depth walk over the AST: the index's `indent` must equal the
  // depth the renderer itself uses (children of a Scope/Subtask/Claim are one
  // level deeper than their parent).
  const expected = [];
  const walk = (blocks, depth) => {
    for (const b of blocks) {
      if (b.kind === 'Statement' || b.kind === 'Claim') expected.push({ kind: b.kind, line: b.span.startLine, depth });
      if (Array.isArray(b.children)) walk(b.children, depth + 1);
    }
  };
  walk(r.ast.blocks, 0);
  checkExact('Index', 'index (kind, line, indent) matches an independent AST depth walk',
    JSON.stringify(r.index.map((e) => ({ kind: e.blockKind, line: e.line, depth: e.indent }))),
    JSON.stringify(expected));
  check('Index', 'index lines are strictly increasing',
    r.index.every((e, i) => i === 0 || e.line > r.index[i - 1].line), JSON.stringify(r.index.map((e) => e.line)));
  check('Index', 'every math segment expr root span lies within its entry span',
    r.index.every((e) => e.segments.filter((s) => s.kind === 'math').every((s) => spanWithin(s.expr.span, e.span))),
    r.index.map((e) => `${spanStr(e.span)} :: ${e.segments.map((s) => spanStr(s.span)).join(',')}`).join(' | '));
  check('Index', 'every entry line has a matching rendered line (same originalLine)',
    r.index.every((e) => r.latexLines.some((l) => l.originalLine === e.line)),
    r.latexLines.map((l) => l.originalLine).join(','));
  check('Index', "every entry's indent equals the \\quad count the renderer actually used",
    indentMismatch(r).length === 0, indentMismatch(r).join(' | '));
  check('Index', 'the nested subtask statement is at indent 4',
    (r.index.find((e) => e.line === 7) || {}).indent === 4, JSON.stringify(r.index.map((e) => `${e.line}:${e.indent}`)));
  check('Index', 'nodeAt resolves inside the deepest nested statement',
    (() => { const h = nodeAt(r, 7, SRC.split('\n')[6].indexOf('z^2') + 2); return !!h && h.expr.kind === 'Pow' && h.statement.indent === 4; })());
  check('Index', 'the doc compiles without diagnostics', r.diagnostics.length === 0, JSON.stringify(r.diagnostics));
}

// ============================================
// (f) No-throw fuzz-lite
// ============================================
{
  const safeCompile = (source, label) => {
    try {
      const r = compile(source);
      const ok = Array.isArray(r.latexLines) && r.latexLines.every((l) => typeof l.latex === 'string') &&
        Array.isArray(r.index) && Array.isArray(r.diagnostics) && !!r.ast;
      check('Fuzz', `compile never throws on ${label}`, ok, JSON.stringify(r.latexLines.map((l) => l.latex)).slice(0, 200));
      return r;
    } catch (err) {
      check('Fuzz', `compile never throws on ${label}`, false, `THREW: ${err && err.message}`);
      return null;
    }
  };

  const empty = safeCompile('', 'the empty string');
  check('Fuzz', 'the empty document has no lines and no index entries',
    !!empty && empty.latexLines.length === 0 && empty.index.length === 0);
  check('Fuzz', 'nodeAt on the empty document -> null', empty && nodeAt(empty, 1, 0) === null);

  const comments = safeCompile('// just a comment\n// and another', 'a comment-only document');
  check('Fuzz', 'a comment-only document emits no output lines', !!comments && comments.latexLines.length === 0,
    comments && JSON.stringify(comments.latexLines));

  const brace = safeCompile('}', 'a lone closing brace');
  check('Fuzz', 'a lone } emits the unmatched-brace diagnostic and no lines',
    !!brace && brace.latexLines.length === 0 && brace.diagnostics.some((d) => d.message.includes('unmatched }')),
    brace && JSON.stringify(brace.diagnostics.map((d) => d.message)));

  // 50 lines drawn (deterministically) from the inputs of the earlier suites.
  const POOL = [
    'Let a and b be real numbers suchthat a^2 + b^2 = 1', 'We use the sum and product rules',
    'x in A and y in B => x + y in A union B', 'sqrt((a+b)/(c+d))^2', '1/(1 + 1/(1 + 1/n))',
    '||x| - |y|| <= |x - y|', 'f(x) = cases { x^2 if x >= 0; -x otherwise }', 'matrix([[1/2, 0],[0, 1/3]])',
    'lim(eps -> 0) sin(eps)/eps = 1', 'partial^2 u/partial x^2 + partial^2 u/partial y^2 = 0',
    'integral(0 -> 1) x^2/(1+x^3) dx = ln(2)/3', '0 <= |a_n - L| < eps/2 < eps',
    'x = (-b +- sqrt(b^2 - 4*a*c)) / (2*a)', "F'(x) = f(x) forall x in (a, b)", 'lim(n -> inf) (1 + 1/n)^n = Math.e',
    'forall eps > 0 exists delta > 0 suchthat |x - y| < delta => |f(x) - f(y)| < eps',
    '{ x in Math.reals : exists n in Math.naturals suchthat |x| < 1/n } = {0}',
    'We write "a | b" when a divides b', 'Let $speed$ = 5 dot t and note the speed is constant',
    'x^2 + sqrt(', 'sin(x) + cos(x)', 'floor(x) + ceil(y)', 'choose(n, k)', 'factorial(n+1)', 'det(A)',
    'gcd(a, b)', 'hat(x) + bar(y) + tilde(z) + vec(v)', 'overline(AB)', 'ray(AB)', 'arc(AB)',
    'sum(i=1 -> n) i^2', '{a, b}', '{}', 'bmatrix([[1,0],[0,1]])', 'vmatrix([[a,b],[c,d]])', '[a, b]',
    'a != b', 'x notin S', 'A subset B', 'x <=> y', 'a -+ b', 'n | m', 'NOT p', 'x intersect y',
    'x^(1/n)', 'a_i^2', '(1+x)^n', 'x^(a)^(b)', 'integral(a -> b) f(x) dx', 'QED',
    '   ', 'just some ordinary english prose here', 'sum(i=1 ->', '"', '$', '((((', '}}}}', 'x = ', '= f(x)',
    '1/', '|x', 'cases {', 'matrix([[1,2],', '#$%^&*', 'x^^^2', 'a______b', '.....', 'forall',
    'x = "unterminated', '#define M Math.reals', 'Problem 9 {', 'Proof {', '- step {', '?: x > 0 {', '}',
  ];
  // Deterministic LCG so a failure is always reproducible.
  let seed = 20240804;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const picked = Array.from({ length: 50 }, () => POOL[Math.floor(rand() * POOL.length)]);
  const CONCAT = picked.join('\n');

  const fuzz = safeCompile(CONCAT, '50 random lines from the prior suites');
  check('Fuzz', 'the concatenated document produces at least one output line',
    !!fuzz && fuzz.latexLines.length > 0, fuzz && String(fuzz.latexLines.length));

  const probeDocs = [
    ['bernoulli', bern, BERNOULLI.split('\n').length],
    ['fraction', frac, 1],
    ['concat-fuzz', fuzz, CONCAT.split('\n').length],
  ];
  for (const [label, result, lineCount] of probeDocs) {
    if (!result) continue;
    let ok = true;
    let detail = '';
    let hits = 0;
    for (let n = 0; n < 100; n++) {
      const line = 1 + Math.floor(rand() * (lineCount + 3));
      const col = Math.floor(rand() * 130);
      try {
        const hit = nodeAt(result, line, col);
        if (hit !== null) {
          hits++;
          if (!hit.expr || !hit.expr.kind || !hit.statement || typeof hit.statement.line !== 'number') {
            ok = false; detail = `malformed hit at ${line}:${col}: ${JSON.stringify(hit)}`;
          }
        }
        const rendered = renderLineWithHighlight(result, line, col);
        if (rendered !== null && (typeof rendered.latex !== 'string' || typeof rendered.line !== 'number')) {
          ok = false; detail = `malformed render at ${line}:${col}: ${JSON.stringify(rendered)}`;
        }
      } catch (err) {
        ok = false;
        detail = `THREW at ${line}:${col}: ${err && err.message}`;
        break;
      }
    }
    check('Fuzz', `100 random caret probes on ${label} never throw (${hits} hits)`, ok, detail);
  }
}

// ============================================
// (g) Diagnostics dedup proof
// ============================================
{
  // Three independently broken statements: one recovery diagnostic each.
  // A double-parsing engine (index pass + render pass) would report 6.
  const SRC = 'x^2 + sqrt(\ny^2 + sqrt(\nz^2 + sqrt(';
  const r = compile(SRC);
  check('Dedup', '3 broken statements -> EXACTLY 3 diagnostics (one per statement)',
    r.diagnostics.length === 3, JSON.stringify(r.diagnostics.map((d) => `${d.span.startLine}: ${d.message}`)));
  check('Dedup', 'the 3 diagnostics sit on 3 distinct lines',
    new Set(r.diagnostics.map((d) => d.span.startLine)).size === 3,
    JSON.stringify(r.diagnostics.map((d) => d.span.startLine)));
  check('Dedup', 'all 3 lines still render', r.latexLines.length === 3, JSON.stringify(r.latexLines.map((l) => l.latex)));

  // Same statements nested in scopes/subtasks (the walk's recursive path).
  const NESTED = 'Problem 1 {\n  x^2 + sqrt(\n  Proof {\n    y^2 + sqrt(\n    - step {\n      z^2 + sqrt(\n    }\n  }\n}';
  const n = compile(NESTED);
  check('Dedup', 'the same 3 broken statements nested in scopes -> still exactly 3 diagnostics',
    n.diagnostics.length === 3, JSON.stringify(n.diagnostics.map((d) => `${d.span.startLine}: ${d.message}`)));
  check('Dedup', 'a document with no broken statements has zero diagnostics',
    compile('Problem 1 {\n  x^2 = 1\n}').diagnostics.length === 0);
}

// ============================================
// Summary
// ============================================
console.log('\n' + '═'.repeat(50));
console.log(`Total: ${passed}/${passed + failed} checks passed`);

if (failed > 0) {
  console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('');
} else {
  console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);
