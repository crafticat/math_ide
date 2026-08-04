/**
 * MathBrain Engine v2 - Expression Parser Test Suite
 *
 * Bundles services/engine/parser.ts (which itself pulls in lexer.ts +
 * language.ts) and imports the REAL compiled output, so every case below runs
 * the actual pipeline: lex(line) -> filter NEWLINE/COMMENT -> parseExpression().
 *
 * Run with: node tests/engine/test-parser.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Expression Parser Test Suite          ║');
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

// ============================================
// Bundle + import
// ============================================
const lexerUrl = bundle('services/engine/lexer.ts', 'lexer-for-parser.mjs');
const parserUrl = bundle('services/engine/parser.ts', 'parser.mjs');
check('Bundle', `parser bundle wrote output under .test-build (${parserUrl})`, parserUrl.includes('.test-build'));
check('Bundle', 'parser bundled output file exists on disk', existsSync(new URL(parserUrl)));

const { lex } = await import(lexerUrl);
const { parseExpression } = await import(parserUrl);
check('Bundle', 'parser module imported successfully and exports parseExpression()', typeof parseExpression === 'function');

// ============================================
// Helpers
// ============================================

// One math run: lex a single line, drop NEWLINE/COMMENT (Task 5 hands the
// parser prose-free, newline-free runs), parse.
function parse(source) {
  const { tokens, diagnostics: lexDiags } = lex(source);
  const runTokens = tokens.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  const diagnostics = [];
  const expr = parseExpression(runTokens, diagnostics);
  return { expr, diagnostics, lexDiags };
}

// Compact structural serializer. Spans are deliberately omitted (they are
// checked separately by the span invariants below).
function shape(e) {
  if (e === null || e === undefined) return 'null';
  switch (e.kind) {
    case 'Num': return `Num(${e.value})`;
    case 'Var': return `Var(${e.name})`;
    case 'Ident': return `Ident(${e.name})`;
    case 'Sym': return `Sym(${e.name})`;
    case 'Text': return `Text(${JSON.stringify(e.text)})`;
    case 'Raw': return `Raw(${JSON.stringify(e.text)})`;
    case 'BinOp': return `BinOp(${e.op},${shape(e.left)},${shape(e.right)})`;
    case 'UnaryOp': return `UnaryOp(${e.op},${shape(e.operand)})`;
    case 'Prime': return `Prime(${shape(e.operand)},${e.count})`;
    case 'Frac': return `Frac(${shape(e.num)},${shape(e.den)})`;
    case 'Pow': return `Pow(${shape(e.base)},${shape(e.exp)})`;
    case 'Sub': return `Sub(${shape(e.base)},${shape(e.sub)})`;
    case 'Call': return `Call(${e.fn},[${e.args.map(shape).join(',')}])`;
    case 'BigOp': return `BigOp(${e.op},${shape(e.from)},${shape(e.to)})`;
    case 'SetLiteral': return `SetLiteral([${e.elements.map(shape).join(',')}])`;
    case 'SetBuilder': return `SetBuilder(${shape(e.element)},${shape(e.condition)})`;
    case 'Abs': return `Abs(${shape(e.operand)})`;
    case 'AngleVector': return `AngleVector([${e.elements.map(shape).join(',')}])`;
    case 'Group': return e.bracket === '[' ? `Group[${shape(e.operand)}]` : `Group(${shape(e.operand)})`;
    case 'Matrix': return `Matrix(${e.env},[${e.rows.map((r) => `[${r.map(shape).join(',')}]`).join(',')}])`;
    case 'Cases': return `Cases([${e.branches.map((b) => `{value:${shape(b.value)},cond:${shape(b.condition)}}`).join(',')}])`;
    case 'Relation': return `Relation([${e.ops.join(',')}],[${e.operands.map(shape).join(',')}])`;
    default: return `UNKNOWN(${e && e.kind})`;
  }
}

// Direct (one level) children of a node, in traversal order. Shared by
// walk() (recurses through every descendant) and checkNesting() (checks only
// the immediate ones, recursing itself).
function directChildren(e) {
  const kids = [];
  for (const key of ['left', 'right', 'operand', 'num', 'den', 'base', 'exp', 'sub', 'element', 'condition', 'from', 'to']) {
    if (e[key]) kids.push(e[key]);
  }
  for (const key of ['args', 'elements', 'operands']) {
    if (Array.isArray(e[key])) kids.push(...e[key]);
  }
  if (Array.isArray(e.rows)) for (const row of e.rows) kids.push(...row);
  if (Array.isArray(e.branches)) for (const b of e.branches) { if (b.value) kids.push(b.value); if (b.condition) kids.push(b.condition); }
  return kids;
}

// Every Expr node in the tree, parents before children.
function walk(e, out = []) {
  if (!e || typeof e !== 'object') return out;
  out.push(e);
  for (const k of directChildren(e)) walk(k, out);
  return out;
}

const isSpan = (s) => !!s && ['startLine', 'startCol', 'endLine', 'endCol'].every((k) => typeof s[k] === 'number');
const spanContains = (outer, inner) =>
  (inner.startLine > outer.startLine || (inner.startLine === outer.startLine && inner.startCol >= outer.startCol)) &&
  (inner.endLine < outer.endLine || (inner.endLine === outer.endLine && inner.endCol <= outer.endCol));

// ============================================
// (a) Required cases - structure
// ============================================
// `diags` is the expected number of PARSER diagnostics (recovery only).
const CASES = [
  {
    n: 1,
    src: 'sqrt((a+b)/(c+d))^2',
    want: 'Pow(Call(sqrt,[Frac(BinOp(+,Var(a),Var(b)),BinOp(+,Var(c),Var(d)))]),Num(2))',
    note: 'parenthesized-numerator fraction: both operand Groups dissolve',
  },
  {
    n: 2,
    src: '1/(1 + 1/(1 + 1/n))',
    want: 'Frac(Num(1),Group(BinOp(+,Num(1),Frac(Num(1),Group(BinOp(+,Num(1),Frac(Num(1),Var(n))))))))',
    note: 'bare numerator: the denominator Group is the author\'s own grouping and survives',
  },
  {
    n: 3,
    src: 'partial^2 u/partial x^2',
    want: 'Frac(BinOp(juxt,Pow(Sym(partial),Num(2)),Var(u)),BinOp(juxt,Sym(partial),Pow(Var(x),Num(2))))',
    note: 'juxtaposition (30) binds tighter than / (25)',
  },
  {
    n: 4,
    src: '0 <= |a_n - L| < eps/2 < eps',
    want: 'Relation([<=,<,<],[Num(0),Abs(BinOp(-,Sub(Var(a),Var(n)),Var(L))),Frac(Sym(eps),Num(2)),Sym(eps)])',
    note: 'whole relation chain collapses into ONE n-ary Relation',
  },
  {
    n: 5,
    src: '||x| - |y|| <= |x - y|',
    want: 'Relation([<=],[Abs(BinOp(-,Abs(Var(x)),Abs(Var(y)))),Abs(BinOp(-,Var(x),Var(y)))])',
    note: 'nested Abs via prefix/infix position of |',
  },
  {
    n: 6,
    src: "F'(x) = f(x)",
    want: 'Relation([=],[Prime(Call(F,[Var(x)]),1),Call(f,[Var(x)])])',
    note: 'primes between a callable word and its parens attach AFTER the Call',
  },
  { n: 7, src: '<1, 2, 3>', want: 'AngleVector([Num(1),Num(2),Num(3)])' },
  {
    n: 8,
    src: '|x - y| < delta => |f(x) - f(y)| < eps',
    want: 'Relation([=>],[Relation([<],[Abs(BinOp(-,Var(x),Var(y))),Sym(delta)]),Relation([<],[Abs(BinOp(-,Call(f,[Var(x)]),Call(f,[Var(y)]))),Sym(eps)])])',
    note: 'the < here is a relation, never an AngleVector',
  },
  {
    n: 9,
    src: '{ x in R : |x| < 1/n }',
    want: 'SetBuilder(Relation([in],[Var(x),Var(R)]),Relation([<],[Abs(Var(x)),Frac(Num(1),Var(n))]))',
  },
  {
    n: 10,
    src: 'x^2 + sqrt(',
    want: 'BinOp(+,Pow(Var(x),Num(2)),Raw("sqrt("))',
    diags: 1,
    note: 'unclosed bracket at end -> Raw tail + exactly 1 diagnostic',
  },
  {
    n: 11,
    src: 'sum(i=1 -> n) i^2',
    want: 'BinOp(juxt,BigOp(sum,Relation([=],[Var(i),Num(1)]),Var(n)),Pow(Var(i),Num(2)))',
  },
  {
    n: 12,
    src: 'x = (-b +- sqrt(b^2 - 4*a*c)) / (2*a)',
    want: 'Relation([=],[Var(x),Frac(BinOp(pm,UnaryOp(neg,Var(b)),Call(sqrt,[BinOp(-,Pow(Var(b),Num(2)),BinOp(cdot,BinOp(cdot,Num(4),Var(a)),Var(c)))])),BinOp(cdot,Num(2),Var(a)))])',
  },
  {
    n: 13,
    src: 'forall eps > 0 exists delta > 0 suchthat x < delta',
    want:
      'BinOp(seq,BinOp(seq,BinOp(juxt,Sym(forall),Relation([>],[Sym(eps),Num(0)])),' +
      'BinOp(juxt,Sym(exists),Relation([>],[Sym(delta),Num(0)]))),' +
      'BinOp(juxt,Sym(suchthat),Relation([<],[Var(x),Sym(delta)])))',
    note: 'quantifier-prefix rule + left-assoc seq',
  },
  {
    n: 14,
    src: 'f(x) = cases { x^2 if x >= 0; -x otherwise }',
    want:
      'Relation([=],[Call(f,[Var(x)]),Cases([{value:Pow(Var(x),Num(2)),cond:Relation([>=],[Var(x),Num(0)])},' +
      '{value:UnaryOp(neg,Var(x)),cond:null}])])',
  },
  { n: 15, src: 'det(matrix([[a,b],[c,d]]))', want: 'Call(det,[Matrix(pmatrix,[[Var(a),Var(b)],[Var(c),Var(d)]])])' },
  { n: 16, src: 'Math.reals union Math.naturals', want: 'BinOp(cup,Sym(Math.reals),Sym(Math.naturals))' },
  {
    n: 17,
    src: 'lim(n -> inf) (1 + 1/n)^n',
    want: 'BinOp(juxt,BigOp(lim,Var(n),Sym(inf)),Pow(Group(BinOp(+,Num(1),Frac(Num(1),Var(n)))),Var(n)))',
  },
  { n: 18, src: 'a_(n+1)', want: 'Sub(Var(a),BinOp(+,Var(n),Num(1)))', note: 'paren content becomes the sub directly - no Group' },
];

for (const c of CASES) {
  const { expr, diagnostics } = parse(c.src);
  const got = shape(expr);
  check('Required', `#${c.n} ${JSON.stringify(c.src)}${c.note ? ` - ${c.note}` : ''}`, got === c.want, got === c.want ? '' : `got:  ${got}\n      want: ${c.want}`);
  const wantDiags = c.diags ?? 0;
  check('Required', `#${c.n} produced ${wantDiags} parser diagnostic(s)`, diagnostics.length === wantDiags, `got ${diagnostics.length}: ${diagnostics.map((d) => d.message).join(' | ')}`);
}

// #8 additionally pins that no AngleVector node is anywhere in the tree.
{
  const { expr } = parse('|x - y| < delta => |f(x) - f(y)| < eps');
  const nodes = walk(expr);
  check('Required', '#8 tree contains NO AngleVector node', !nodes.some((nd) => nd.kind === 'AngleVector'));
}

// #10's diagnostic wording + severity.
{
  const { expr, diagnostics } = parse('x^2 + sqrt(');
  check('Required', '#10 diagnostic is a warn mentioning the unparsed text', diagnostics.length === 1 && diagnostics[0].severity === 'warn' && diagnostics[0].message.includes("sqrt("), JSON.stringify(diagnostics));
  check('Required', '#10 Raw node text is exactly "sqrt("', walk(expr).some((nd) => nd.kind === 'Raw' && nd.text === 'sqrt('));
}

// ============================================
// (b) Span invariants (Task 7 caret lookup depends on these)
// ============================================
for (const c of CASES) {
  const { expr } = parse(c.src);
  const nodes = walk(expr);
  check('Spans', `#${c.n} every node has kind + numeric span`, nodes.length > 0 && nodes.every((nd) => typeof nd.kind === 'string' && isSpan(nd.span)));
  check('Spans', `#${c.n} root span covers the whole run (0..${c.src.length})`,
    expr.span.startLine === 1 && expr.span.startCol === 0 && expr.span.endLine === 1 && expr.span.endCol === c.src.length,
    JSON.stringify(expr.span));
}

// Child spans must nest inside their parent's span.
function checkNesting(e, path = 'root') {
  let ok = true;
  for (const kid of directChildren(e)) {
    if (!spanContains(e.span, kid.span)) { ok = false; break; }
    if (!checkNesting(kid, path)) { ok = false; break; }
  }
  return ok;
}
for (const c of CASES) {
  const { expr } = parse(c.src);
  check('Spans', `#${c.n} every child span nests inside its parent's span`, checkNesting(expr));
}

// A hand-checked span: the Pow in `x^2 + 1` covers exactly cols 0..3.
{
  const { expr } = parse('x^2 + 1');
  const pow = walk(expr).find((nd) => nd.kind === 'Pow');
  check('Spans', 'Pow in "x^2 + 1" spans cols 0..3', pow && pow.span.startCol === 0 && pow.span.endCol === 3, JSON.stringify(pow && pow.span));
}

// ============================================
// (c) Recovery robustness - never throws, always an Expr with spans
// ============================================
// `x^2 dx / 3` is pathological (a differential swallowed into a numerator by
// the level it was collected at); it has no golden shape - it only has to come
// back as a sane Expr without throwing.
const ROBUST = [...CASES.map((c) => c.src), 'sum(i=1 ->', 'lim(x -> ', ')', '^', '{ x :', '', '   ', '|x', 'x +', ';', '[[a,b],[c,d]]', '$', '"', 'x^2 dx / 3'];
for (const src of ROBUST) {
  let expr = null;
  let threw = null;
  const diagnostics = [];
  try {
    const { tokens } = lex(src);
    expr = parseExpression(tokens.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT'), diagnostics);
  } catch (err) {
    threw = err;
  }
  check('Robust', `${JSON.stringify(src)} does not throw`, threw === null, threw && String(threw.stack || threw));
  check('Robust', `${JSON.stringify(src)} returns an Expr whose every node has kind + span`,
    !!expr && typeof expr.kind === 'string' && walk(expr).every((nd) => typeof nd.kind === 'string' && isSpan(nd.span)));
}

// ============================================
// (d) Extra coverage - constructs the required 18 do not reach
// ============================================
const EXTRA = [
  // Sets
  ['{}', 'Sym(emptyset)'],
  ['{1, 2, 3}', 'SetLiteral([Num(1),Num(2),Num(3)])'],
  ['{ n^2 : n in Math.naturals }', 'SetBuilder(Pow(Var(n),Num(2)),Relation([in],[Var(n),Sym(Math.naturals)]))'],
  // A single top-level | in a set body is the set-builder separator; a | with
  // no Abs open inside the condition is "divides" (BinOp mid).
  ['{x | x > 0}', 'SetBuilder(Var(x),Relation([>],[Var(x),Num(0)]))'],
  ['{x : a | x}', 'SetBuilder(Var(x),BinOp(mid,Var(a),Var(x)))'],
  ['{ |x| }', 'SetLiteral([Abs(Var(x))])'],
  // Groups / intervals / brackets
  ['(a, b)', 'Group(BinOp(,,Var(a),Var(b)))'],
  ['[0, 1]', 'Group[BinOp(,,Num(0),Num(1))]'],
  // Golden from the plan: F'(x)=f(x) \forall x\in(a,b)
  ["F'(x) = f(x) forall x in (a, b)",
    'BinOp(seq,Relation([=],[Prime(Call(F,[Var(x)]),1),Call(f,[Var(x)])]),BinOp(juxt,Sym(forall),Relation([in],[Var(x),Group(BinOp(,,Var(a),Var(b)))])))'],
  // Logic levels 4..8
  ['not a and b or c', 'BinOp(lor,BinOp(land,UnaryOp(lnot,Var(a)),Var(b)),Var(c))'],
  ['a => b => c', 'Relation([=>,=>],[Var(a),Var(b),Var(c)])'],
  ['a <=> b => c', 'Relation([<=>],[Var(a),Relation([=>],[Var(b),Var(c)])])'],
  ['A union B intersect C', 'BinOp(cap,BinOp(cup,Var(A),Var(B)),Var(C))'],
  ['x -> y', 'BinOp(to,Var(x),Var(y))'],
  // BigOps
  ['sum i^2', 'BinOp(juxt,BigOp(sum,null,null),Pow(Var(i),Num(2)))'],
  ['integral(0 -> 1) x dx', 'BinOp(juxt,BinOp(juxt,BigOp(integral,Num(0),Num(1)),Var(x)),Sym(dx))'],
  ['lim_(h -> 0) f(h)', 'BinOp(juxt,BigOp(lim,Var(h),Num(0)),Call(f,[Var(h)]))'],
  // Parens after a big operator with no `->` inside are NOT bounds: bare BigOp
  // juxtaposed with the Group.
  ['sum(k) k', 'BinOp(juxt,BinOp(juxt,BigOp(sum,null,null),Group(Var(k))),Var(k))'],
  // Matrices
  ['bmatrix([[1]])', 'Matrix(bmatrix,[[Num(1)]])'],
  ['vmatrix([[a,b],[c,d]])', 'Matrix(vmatrix,[[Var(a),Var(b)],[Var(c),Var(d)]])'],
  // Atoms
  ['x^(1/n)', 'Pow(Var(x),Frac(Num(1),Var(n)))'],
  ["x''", 'Prime(Var(x),2)'],
  // postfix '!' is the same node factorial(...) builds, and binds like a prime
  ['n!', 'Call(factorial,[Var(n)])'],
  ['(j-1)! + 1', 'BinOp(+,Call(factorial,[Group(BinOp(-,Var(j),Num(1)))]),Num(1))'],
  ['n!^2', 'Pow(Call(factorial,[Var(n)]),Num(2))'],
  ['2n!', 'BinOp(juxt,Num(2),Call(factorial,[Var(n)]))'],
  ['factorial(n)', 'Call(factorial,[Var(n)])'],
  ['hat(x) + vec(y)', 'BinOp(+,Call(hat,[Var(x)]),Call(vec,[Var(y)]))'],
  ['gcd(a, b)', 'Call(gcd,[Var(a),Var(b)])'],
  // A word that NAMES a symbol is that symbol applied to a group, not a call
  // named after it - but a word in both tables (sin, det, ...) stays a call.
  ['phi(x)', 'BinOp(juxt,Sym(phi),Group(Var(x)))'],
  ['partial(x)', 'BinOp(juxt,Sym(partial),Group(Var(x)))'],
  ['det(A)', 'Call(det,[Var(A)])'],
  ['QED', 'Sym(QED)'],
  ['Math.foo', 'Ident(Math.foo)'],
  ['velocity', 'Ident(velocity)'],
  ['"hello world"', 'Text("hello world")'],
  ['$x^2$', 'Pow(Var(x),Num(2))'],
  ['3.5 * pi', 'BinOp(cdot,Num(3.5),Sym(pi))'],
  ['a dot b', 'BinOp(cdot,Var(a),Var(b))'],
  // seq connectors: ':' '.' ',' ';' become Sym atoms folded at level 3 so the
  // renderer can round-trip them.
  ['x = 1, y = 2', 'BinOp(seq,BinOp(seq,Relation([=],[Var(x),Num(1)]),Sym(,)),Relation([=],[Var(y),Num(2)]))'],
  ['x = 5.', 'BinOp(seq,Relation([=],[Var(x),Num(5)]),Sym(.))'],
  // A big operator heading the numerator's juxt chain scopes OVER the fraction
  // (matches the regex compiler: \lim_{h \to 0}\ \frac{...}{h}). The freed
  // numerator is then a parenthesized group, so its parens dissolve too.
  ['lim_(h -> 0) (f(x+h) - f(x))/h',
    'BinOp(juxt,BigOp(lim,Var(h),Num(0)),Frac(BinOp(-,Call(f,[BinOp(+,Var(x),Var(h))]),Call(f,[Var(x)])),Var(h)))'],
  ['sum(i=1 -> n) 1/i', 'BinOp(juxt,BigOp(sum,Relation([=],[Var(i),Num(1)]),Var(n)),Frac(Num(1),Var(i)))'],
  // ... but a bare big operator as the whole numerator stays in the numerator.
  ['sum(k=1 -> n) / 2', 'Frac(BigOp(sum,Relation([=],[Var(k),Num(1)]),Var(n)),Num(2))'],
  // Legacy `(...)/simple` fraction idiom: parenthesized numerator dissolves.
  ['(a + b)/2', 'Frac(BinOp(+,Var(a),Var(b)),Num(2))'],
  // Equation-continuation lines (INITIAL_CONTENT lines 40/42): a run starting
  // with an infix operator gets an implicit empty left operand, no diagnostic.
  ['= f(x)', 'Relation([=],[Raw(""),Call(f,[Var(x)])])'],
  // Differentials (dx dy dz dt du dv) always CLOSE the product they belong to:
  // they never enter a fraction operand, and nothing juxtaposes onto them
  // inside a product - what follows joins at the outer juxt level.
  ['integral(0 -> 1) x^2/(1+x^3) dx',
    'BinOp(juxt,BinOp(juxt,BigOp(integral,Num(0),Num(1)),Frac(Pow(Var(x),Num(2)),Group(BinOp(+,Num(1),Pow(Var(x),Num(3)))))),Sym(dx))'],
  ['integral(0 -> 1) 1/x dx',
    'BinOp(juxt,BinOp(juxt,BigOp(integral,Num(0),Num(1)),Frac(Num(1),Var(x))),Sym(dx))'],
  // ... but a differential ALONE is a perfectly good fraction operand, and the
  // function after it is not part of the denominator's product.
  ['d/dx f(x)', 'BinOp(juxt,Frac(Var(d),Sym(dx)),Call(f,[Var(x)]))'],
  ['dy/dx', 'Frac(Sym(dy),Sym(dx))'],
  // The juxt-Abs path is a factor of the SAME product, so it must respect the
  // fraction operand's differential termination exactly like plain juxt does:
  // `d/dx |x|` is `(d/dx) |x|`, not `d / (dx |x|)` with the Abs glued into
  // the denominator.
  ['d/dx |x|', 'BinOp(juxt,Frac(Var(d),Sym(dx)),Abs(Var(x)))'],
  // Scripts: '_' and '^' are siblings at bp 60, so neither may be swallowed by
  // the OTHER's argument; same-operator chains stay right-assoc.
  ['a_i^2', 'Pow(Sub(Var(a),Var(i)),Num(2))'],
  ['a^b_c', 'Sub(Pow(Var(a),Var(b)),Var(c))'],
  ['a^b^c', 'Pow(Var(a),Pow(Var(b),Var(c)))'],
  ['a_b_c', 'Sub(Var(a),Sub(Var(b),Var(c)))'],
  ['x_n^2 + y_n^2', 'BinOp(+,Pow(Sub(Var(x),Var(n)),Num(2)),Pow(Sub(Var(y),Var(n)),Num(2)))'],
  // A parenthesized script argument is a fresh expression: the sibling-script
  // restriction does not reach inside it.
  ['a_(i^2)', 'Sub(Var(a),Pow(Var(i),Num(2)))'],
  // A '|' met in infix position with a partner bar later in the range opens a
  // juxtaposed Abs; with no partner it is still "divides" (BinOp mid).
  ['2|x|', 'BinOp(juxt,Num(2),Abs(Var(x)))'],
  ['|x||y|', 'BinOp(juxt,Abs(Var(x)),Abs(Var(y)))'],
  ['f(x)|g(x)|', 'BinOp(juxt,Call(f,[Var(x)]),Abs(Call(g,[Var(x)])))'],
  // The juxtaposed Abs is parsed as a full factor, so a script binds to IT.
  ['2|x|^2', 'BinOp(juxt,Num(2),Pow(Abs(Var(x)),Num(2)))'],
  ['n | m', 'BinOp(mid,Var(n),Var(m))'],
  ['{ x : a | x }', 'SetBuilder(Var(x),BinOp(mid,Var(a),Var(x)))'],
  // The partner-bar lookahead must stop at a top-level relation/logic token:
  // a later '|' across an AND (or any such boundary) belongs to a different
  // clause and is never this bar's partner, so both sides stay "divides".
  ['p | a AND p | b', 'BinOp(land,BinOp(mid,Var(p),Var(a)),BinOp(mid,Var(p),Var(b)))'],
  ['{ d : d | n AND d | m }', 'SetBuilder(Var(d),BinOp(land,BinOp(mid,Var(d),Var(n)),BinOp(mid,Var(d),Var(m))))'],
  ['d | n AND |S| = 3', 'BinOp(land,BinOp(mid,Var(d),Var(n)),Relation([=],[Abs(Var(S)),Num(3)]))'],
  // The boundary rule isn't just for AND: the OTHER clause connectors that
  // share bp 3 (seq connectors ',' ';' ':' '.' and quantifier words) must
  // stop the partner-bar search too, or a later clause's '|' gets misread as
  // THIS bar's partner. `d | n, |S| = 3` used to glue everything from `n`
  // onward into one (unclosed) Abs; it must stay two clauses, `d | n` divides.
  ['d | n, |S| = 3',
    'BinOp(seq,BinOp(seq,BinOp(mid,Var(d),Var(n)),Sym(,)),Relation([=],[Abs(Var(S)),Num(3)]))'],
  // Same bug via a quantifier boundary instead of a comma: `suchthat` must
  // stop the lookahead so `p | q` stays "divides" and `|S| = 1` is its own
  // clause, not swallowed into `p`'s Abs.
  ['p | q suchthat |S| = 1',
    'BinOp(seq,BinOp(mid,Var(p),Var(q)),BinOp(juxt,Sym(suchthat),Relation([=],[Abs(Var(S)),Num(1)])))'],
  // documented tradeoff: bar chains read as juxt-Abs — see parser.ts findPartnerBar NOTE
  ['a | b | c', 'BinOp(juxt,BinOp(juxt,Var(a),Abs(Var(b))),Var(c))'],
  // The real quantifier line from INITIAL_CONTENT.
  ['exists del > 0 suchthat |f(t) - f(x)| < eps forall t in (x - del, x + del)',
    'BinOp(seq,BinOp(seq,BinOp(juxt,Sym(exists),Relation([>],[Ident(del),Num(0)])),' +
    'BinOp(juxt,Sym(suchthat),Relation([<],[Abs(BinOp(-,Call(f,[Var(t)]),Call(f,[Var(x)]))),Sym(eps)]))),' +
    'BinOp(juxt,Sym(forall),Relation([in],[Var(t),Group(BinOp(,,BinOp(-,Var(x),Ident(del)),BinOp(+,Var(x),Ident(del))))])))'],
];
for (const [src, want] of EXTRA) {
  const { expr, diagnostics } = parse(src);
  const got = shape(expr);
  check('Extra', `${JSON.stringify(src)}`, got === want, got === want ? '' : `got:  ${got}\n      want: ${want}`);
  check('Extra', `${JSON.stringify(src)} - no parser diagnostics`, diagnostics.length === 0, diagnostics.map((d) => d.message).join(' | '));
}

// Recovery is local: one stray token costs exactly one diagnostic and does not
// swallow the good expression on either side of it.
{
  const { expr, diagnostics } = parse('x ) y');
  check('Recovery', '"x ) y" -> 1 diagnostic, the trailing y still parses', shape(expr) === 'BinOp(seq,BinOp(seq,Var(x),Raw(")")),Var(y))' && diagnostics.length === 1, `${shape(expr)} / ${diagnostics.length} diags`);
}
{
  const src = '= lim_(h -> 0) (1/h) integral(x -> x+h) f(t) dt';
  const { expr, diagnostics } = parse(src);
  check('Recovery', 'INITIAL_CONTENT continuation line parses with 0 diagnostics', diagnostics.length === 0, diagnostics.map((d) => d.message).join(' | '));
  check('Recovery', 'continuation line root is Relation([=]) with an empty-Raw left operand',
    expr.kind === 'Relation' && expr.ops.join() === '=' && expr.operands[0].kind === 'Raw' && expr.operands[0].text === '', shape(expr));
  check('Recovery', 'continuation line has no non-empty Raw fragments', !walk(expr).some((nd) => nd.kind === 'Raw' && nd.text !== ''), shape(expr));
}

// MATH_QUOTE spans must land inside the quote's own source extent, not at col 0.
{
  const { expr } = parse('a + $x^2$');
  const pow = walk(expr).find((nd) => nd.kind === 'Pow');
  check('Extra', 'MATH_QUOTE inner spans are shifted to the quote position', pow && pow.span.startCol === 5 && pow.span.endCol === 8, JSON.stringify(pow && pow.span));
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
