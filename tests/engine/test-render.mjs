/**
 * MathBrain Engine v2 - LaTeX Renderer Test Suite
 *
 * Bundles services/engine/render.ts (which pulls in lexer/document/
 * disambiguate/parser/language) and runs the REAL pipeline for every case:
 *   statement goldens : lex -> strip NEWLINE/COMMENT -> renderStatement()
 *   document golden   : lex -> parseDocument -> renderDocument()
 *
 * The GOLDENS block below is the approved product output ("Engine v2" panels
 * of the product page) and is asserted BYTE-FOR-BYTE - these are the contract
 * the renderer exists to satisfy, so a diff of even one space is a failure.
 *
 * Run with: node tests/engine/test-render.mjs
 */

import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - LaTeX Renderer Test Suite             ║');
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

// Byte-for-byte string equality with a first-difference report, so a failing
// golden points straight at the offending column instead of at two long
// look-alike strings.
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
const lexerUrl = bundle('services/engine/lexer.ts', 'lexer-for-render.mjs');
const documentUrl = bundle('services/engine/document.ts', 'document-for-render.mjs');
const parserUrl = bundle('services/engine/parser.ts', 'parser-for-render.mjs');
const renderUrl = bundle('services/engine/render.ts', 'render.mjs');
check('Bundle', `renderer bundle wrote output under .test-build (${renderUrl})`, renderUrl.includes('.test-build'));
check('Bundle', 'renderer bundled output file exists on disk', existsSync(new URL(renderUrl)));

const { lex } = await import(lexerUrl);
const { parseDocument } = await import(documentUrl);
const { parseExpression } = await import(parserUrl);
const { renderExpr, renderStatement, renderDocument, parseStatement, renderSegments } = await import(renderUrl);
check('Bundle', 'module exports renderExpr()', typeof renderExpr === 'function');
check('Bundle', 'module exports renderStatement()', typeof renderStatement === 'function');
check('Bundle', 'module exports renderDocument()', typeof renderDocument === 'function');
check('Bundle', 'module exports parseStatement()', typeof parseStatement === 'function');
check('Bundle', 'module exports renderSegments()', typeof renderSegments === 'function');

// ============================================
// Helpers
// ============================================

// One statement line, through the whole pipeline the renderer owns.
function render(source, indent = 0, highlight) {
  const { tokens: all } = lex(source);
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  const diagnostics = [];
  const latex = renderStatement(tokens, indent, diagnostics, highlight);
  return { latex, diagnostics };
}

// One MATH run, straight into renderExpr - for policies the disambiguator
// would otherwise reroute to prose (an unknown multi-letter function name
// reads as English on its own, so `unknownfn(x)` never reaches the renderer
// as a Call unless the whole run is already known to be math).
function renderMath(source, highlight) {
  const { tokens: all } = lex(source);
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  return renderExpr(parseExpression(tokens, []), highlight);
}

function renderDoc(source) {
  const { tokens } = lex(source);
  const diagnostics = [];
  const ast = parseDocument(tokens, diagnostics);
  const lines = renderDocument(ast, diagnostics);
  return { lines, diagnostics, ast };
}

// ============================================
// THE GOLDENS - approved product output, byte-for-byte
// ============================================
const GOLDENS = [
  ['Let a and b be real numbers suchthat a^2 + b^2 = 1', String.raw`\text{Let }a\text{ and }b\text{ be real numbers s.t. }a^{2}+b^{2}=1`],
  ['We use the sum and product rules', String.raw`\text{We use the sum and product rules}`],
  ['x in A and y in B => x + y in A union B', String.raw`x\in A\land y\in B\implies x+y\in A\cup B`],
  ['sqrt((a+b)/(c+d))^2', String.raw`\left(\sqrt{\frac{a+b}{c+d}}\right)^{2}`],
  ['1/(1 + 1/(1 + 1/n))', String.raw`\cfrac{1}{1+\cfrac{1}{1+\cfrac{1}{n}}}`],
  ['||x| - |y|| <= |x - y|', String.raw`\left|\left|x\right|-\left|y\right|\right|\le\left|x-y\right|`],
  ['f(x) = cases { x^2 if x >= 0; -x otherwise }', String.raw`f(x)=\begin{cases}x^{2} & \text{if }x\ge 0\\ -x & \text{otherwise}\end{cases}`],
  ['matrix([[1/2, 0],[0, 1/3]])', String.raw`\begin{pmatrix}\frac{1}{2} & 0\\ 0 & \frac{1}{3}\end{pmatrix}`],
  ['lim(eps -> 0) sin(eps)/eps = 1', String.raw`\lim_{\varepsilon\to 0}\frac{\sin(\varepsilon)}{\varepsilon}=1`],
  ['partial^2 u/partial x^2 + partial^2 u/partial y^2 = 0', String.raw`\frac{\partial^{2}u}{\partial x^{2}}+\frac{\partial^{2}u}{\partial y^{2}}=0`],
  ['integral(0 -> 1) x^2/(1+x^3) dx = ln(2)/3', String.raw`\int_{0}^{1}\frac{x^{2}}{1+x^{3}}\,dx=\frac{\ln(2)}{3}`],
  ['0 <= |a_n - L| < eps/2 < eps', String.raw`0\le\left|a_{n}-L\right|<\frac{\varepsilon}{2}<\varepsilon`],
  ['x = (-b +- sqrt(b^2 - 4*a*c)) / (2*a)', String.raw`x=\frac{-b\pm\sqrt{b^{2}-4\cdot a\cdot c}}{2\cdot a}`],
  ["F'(x) = f(x) forall x in (a, b)", String.raw`F'(x)=f(x)\ \forall x\in(a,b)`],
  ['lim(n -> inf) (1 + 1/n)^n = Math.e', String.raw`\lim_{n\to\infty}\left(1+\frac{1}{n}\right)^{n}=e`],
  ['forall eps > 0 exists delta > 0 suchthat |x - y| < delta => |f(x) - f(y)| < eps', String.raw`\forall\varepsilon>0\ \exists\delta>0\ \text{ s.t. }\left|x-y\right|<\delta\implies\left|f(x)-f(y)\right|<\varepsilon`],
  ['{ x in Math.reals : exists n in Math.naturals suchthat |x| < 1/n } = {0}', String.raw`\left\{x\in\mathbb{R}\ \middle|\ \exists n\in\mathbb{N}\text{ s.t. }|x|<\frac{1}{n}\right\}=\{0\}`],
  ['We write "a | b" when a divides b', String.raw`\text{We write a | b when }a\text{ divides }b`],
  ['Let $speed$ = 5 dot t and note the speed is constant', String.raw`\text{Let }\mathrm{speed}=5\cdot t\ \text{and note the speed is constant}`],
  ['x^2 + sqrt(', String.raw`x^{2}+\htmlClass{raw-span}{\texttt{sqrt(}}`],
];

GOLDENS.forEach(([source, want], i) => {
  const { latex } = render(source);
  checkExact('Golden', `#${i + 1} ${JSON.stringify(source)}`, latex, want);
});

// The renderer is the single home of output policy: rendering the same
// statement twice must be identical (no hidden per-call state).
{
  const a = render(GOLDENS[0][0]).latex;
  const b = render(GOLDENS[0][0]).latex;
  check('Golden', 'rendering is deterministic (same input -> same output twice)', a === b);
}

// ============================================
// Document rendering - the Bernoulli fixture
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

{
  const { lines } = renderDoc(BERNOULLI);
  const content = lines.filter((l) => !l.latex.startsWith('\\rule'));
  check('Document', `Bernoulli produces ${DOC_GOLDEN.length} non-spacer lines (got ${content.length})`,
    content.length === DOC_GOLDEN.length, content.map((l) => l.latex).join('\n      '));
  DOC_GOLDEN.forEach((want, i) => {
    checkExact('Document', `Bernoulli line ${i + 1}`, content[i] ? content[i].latex : '<missing>', want);
  });

  // Blank lines (the #define) produce no output line at all.
  check('Document', 'the #define line emits no output line', !lines.some((l) => l.originalLine === 1));

  // originalLine / id wiring on the content lines.
  const stmt = content[2];
  check('Document', 'theorem statement line maps to source line 4', stmt && stmt.originalLine === 4, stmt && String(stmt.originalLine));
  check('Document', 'theorem statement line id is "line-4"', stmt && stmt.id === 'line-4', stmt && stmt.id);
  check('Document', 'Problem header maps to source line 2 (id line-2)',
    content[0] && content[0].originalLine === 2 && content[0].id === 'line-2', content[0] && `${content[0].id}/${content[0].originalLine}`);
  check('Document', 'every line has a unique id', new Set(lines.map((l) => l.id)).size === lines.length);
  check('Document', 'every line has a positive originalLine', lines.every((l) => Number.isInteger(l.originalLine) && l.originalLine >= 1));

  // Spacers: one before each scope header except the very first output line,
  // one after each scope's children.
  const spacers = lines.filter((l) => l.latex.startsWith('\\rule'));
  check('Document', 'spacer lines all use \\rule{0pt}{Xem}', spacers.every((l) => /^\\rule\{0pt\}\{[\d.]+em\}$/.test(l.latex)), spacers.map((l) => l.latex).join(' '));
  check('Document', 'spacer ids are "spacer-N"', spacers.every((l) => /^spacer-\d/.test(l.id)), spacers.map((l) => l.id).join(' '));
  check('Document', 'no spacer precedes the first output line', !lines[0].latex.startsWith('\\rule'), lines[0].latex);
  check('Document', 'a 1em spacer precedes each depth-1 scope header (Theorem, Proof)',
    lines.filter((l) => l.latex === String.raw`\rule{0pt}{1em}`).length === 2,
    spacers.map((l) => l.latex).join(' '));
  check('Document', 'each of the 3 scopes emits a 0.3em close spacer',
    lines.filter((l) => l.latex === String.raw`\rule{0pt}{0.3em}`).length === 3,
    spacers.map((l) => l.latex).join(' '));
  // Ordering: the close spacer of Theorem sits between the theorem statement
  // and the Proof header's own spacer.
  const idx = lines.findIndex((l) => l.latex === DOC_GOLDEN[3]);
  check('Document', 'Proof header is immediately preceded by its 1em spacer',
    idx > 0 && lines[idx - 1].latex === String.raw`\rule{0pt}{1em}`, idx > 0 ? lines[idx - 1].latex : 'n/a');
}

// Scope header policy, independent of the fixture.
{
  const { lines } = renderDoc('Lemma Key step {\n  x = 1\n}');
  checkExact('Document', 'depth-0 Lemma header (bold, \\huge, titled)', lines[0].latex, String.raw`{\huge \textbf{\text{Lemma Key step}}}`);
}
{
  const { lines } = renderDoc('Remark {\n  x = 1\n}');
  checkExact('Document', 'untitled italic scope renders "Remark." with a period', lines[0].latex, String.raw`{\huge \textit{\text{Remark.}}}`);
}
{
  const src = 'Problem 1 {\n  Section A {\n    Part B {\n      Case C {\n        x = 1\n      }\n    }\n  }\n}';
  const { lines } = renderDoc(src);
  const heads = lines.filter((l) => !l.latex.startsWith('\\rule')).map((l) => l.latex);
  check('Document', 'header sizes step huge/Large/large/normalsize by depth',
    heads[0].startsWith('{\\huge ') && heads[1].startsWith('\\quad {\\Large ') &&
    heads[2].startsWith('\\quad \\quad {\\large ') && heads[3].startsWith('\\quad \\quad \\quad {\\normalsize '),
    heads.join('\n      '));
  const spacerHeights = lines.filter((l) => l.latex.startsWith('\\rule{0pt}')).map((l) => l.latex);
  check('Document', 'spacer heights step 1.5/1/0.5/0.2em by depth',
    spacerHeights.includes(String.raw`\rule{0pt}{1em}`) && spacerHeights.includes(String.raw`\rule{0pt}{0.5em}`) &&
    spacerHeights.includes(String.raw`\rule{0pt}{0.2em}`), spacerHeights.join(' '));
}
{
  // Depth-0 scope that is NOT the first output line gets the 1.5em spacer.
  const { lines } = renderDoc('Problem 1 {\n  x = 1\n}\nProblem 2 {\n  y = 2\n}');
  check('Document', 'a second depth-0 scope is preceded by a 1.5em spacer',
    lines.some((l) => l.latex === String.raw`\rule{0pt}{1.5em}`), lines.map((l) => l.latex).join(' | '));
}

// Subtask labels: roman at depth 1, letters at depth 2+, counters sibling-scoped.
{
  const src = [
    'Proof {',
    '  - first {',
    '    -- alpha {',
    '      x = 1',
    '    }',
    '    -- beta {',
    '      x = 2',
    '    }',
    '  }',
    '  - second {',
    '    -- gamma {',
    '      x = 3',
    '    }',
    '  }',
    '}',
  ].join('\n');
  const { lines } = renderDoc(src);
  const labels = lines.map((l) => l.latex).filter((s) => s.includes('\\textbf{\\text{('));
  checkExact('Subtask', 'label 1 is (i) first', labels[0], String.raw`\quad \textbf{\text{(i) first:}}`);
  checkExact('Subtask', 'nested label is (a) alpha', labels[1], String.raw`\quad \quad \textbf{\text{(a) alpha:}}`);
  checkExact('Subtask', 'nested sibling is (b) beta', labels[2], String.raw`\quad \quad \textbf{\text{(b) beta:}}`);
  checkExact('Subtask', 'second top-level subtask is (ii) second', labels[3], String.raw`\quad \textbf{\text{(ii) second:}}`);
  checkExact('Subtask', 'counter resets in a new parent: (a) gamma', labels[4], String.raw`\quad \quad \textbf{\text{(a) gamma:}}`);
}
{
  // Roman numerals past iii.
  const src = 'Proof {\n' + ['a', 'b', 'c', 'd', 'e'].map((t) => `  - ${t} {\n    x = 1\n  }`).join('\n') + '\n}';
  const { lines } = renderDoc(src);
  const labels = lines.map((l) => l.latex).filter((s) => s.includes('\\textbf{\\text{('));
  check('Subtask', 'roman numerals run (i)(ii)(iii)(iv)(v)',
    labels.map((s) => s.match(/\((\w+)\)/)[1]).join(',') === 'i,ii,iii,iv,v', labels.join(' | '));
}
{
  // An untitled subtask ("- {" with no title text) renders the bare label
  // with no colon and no title (render.ts's Subtask branch: `block.title ?
  // ... : \`(${label})\``) - distinct from the titled path exercised above.
  const { lines } = renderDoc('Proof {\n  - {\n    x = 1\n  }\n}');
  const label = lines.map((l) => l.latex).find((s) => s.includes('\\textbf{\\text{('));
  checkExact('Subtask', 'untitled subtask renders bare (i), no colon', label, String.raw`\quad \textbf{\text{(i)}}`);
}

// Claim (?:) rendering.
{
  const { lines } = renderDoc('Proof {\n  ?: x > 0 {\n    x = 1\n  }\n}');
  const claim = lines.map((l) => l.latex).find((s) => s.includes('Claim: '));
  checkExact('Claim', 'claim label + rendered statement', claim, String.raw`\quad \textit{\text{Claim: }}x>0`);
}

// ============================================
// Highlight hook (Task 11 uses it; the node hook lands now)
// ============================================
{
  const { tokens: all } = lex('x^2 + 1');
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  const diagnostics = [];
  const plain = renderStatement(tokens, 0, diagnostics);
  checkExact('Highlight', 'baseline (no highlight)', plain, String.raw`x^{2}+1`);

  // The span of `x^2` (cols 0..3 on line 1) is the Pow node's span.
  const hl = renderStatement(tokens, 0, [], { span: { startLine: 1, startCol: 0, endLine: 1, endCol: 3 } });
  checkExact('Highlight', 'node whose span EQUALS the highlight span is wrapped', hl, String.raw`\htmlClass{hl-node}{x^{2}}+1`);

  const none = renderStatement(tokens, 0, [], { span: { startLine: 9, startCol: 0, endLine: 9, endCol: 3 } });
  checkExact('Highlight', 'a span matching no node changes nothing', none, plain);
}
{
  // renderExpr's own hook, exercised directly on a leaf node.
  const { tokens: all } = lex('a+b');
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');
  const hl = renderStatement(tokens, 0, [], { span: { startLine: 1, startCol: 2, endLine: 1, endCol: 3 } });
  checkExact('Highlight', 'leaf node hook wraps just that leaf', hl, String.raw`a+\htmlClass{hl-node}{b}`);
}

// ============================================
// Expression-level policies not pinned by a golden
// ============================================
const EXPR_CASES = [
  // functions
  ['sin(x) + cos(x)', String.raw`\sin(x)+\cos(x)`],
  ['floor(x) + ceil(y)', String.raw`\lfloor x \rfloor+\lceil y \rceil`],
  ['choose(n, k)', String.raw`\binom{n}{k}`],
  ['factorial(n)', String.raw`n!`],
  ['factorial(n+1)', String.raw`(n+1)!`],
  ['det(A)', String.raw`\det(A)`],
  // a symbol-named word keeps its glyph in call position
  ['phi(x)', String.raw`\phi(x)`],
  ['partial^2/partial(x)^2', String.raw`\frac{\partial^{2}}{\partial(x)^{2}}`],
  ['gcd(a, b)', String.raw`\gcd(a, b)`],
  ['hat(x) + bar(y) + tilde(z) + vec(v)', String.raw`\hat{x}+\bar{y}+\tilde{z}+\vec{v}`],
  ['overline(AB)', String.raw`\overline{AB}`],
  ['ray(AB)', String.raw`\overrightarrow{AB}`],
  ['arc(AB)', String.raw`\overset{\frown}{AB}`],
  // big operators: one space before the summand, but only when there is
  // something to separate (a summand starting with a backslash needs none).
  ['sum(i=1 -> n) i^2', String.raw`\sum_{i=1}^{n} i^{2}`],
  ['sum(i=1 -> n) 1/i', String.raw`\sum_{i=1}^{n}\frac{1}{i}`],
  // structures
  ['{a, b}', String.raw`\{a, b\}`],
  ['{}', String.raw`\emptyset`],
  ['bmatrix([[1,0],[0,1]])', String.raw`\begin{bmatrix}1 & 0\\ 0 & 1\end{bmatrix}`],
  ['vmatrix([[a,b],[c,d]])', String.raw`\begin{vmatrix}a & b\\ c & d\end{vmatrix}`],
  ['[a, b]', String.raw`[a,b]`],
  // operators / relations
  ['a != b', String.raw`a\neq b`],
  ['x notin S', String.raw`x\notin S`],
  ['A subset B', String.raw`A\subset B`],
  ['x <=> y', String.raw`x\iff y`],
  ['a -+ b', String.raw`a\mp b`],
  ['n | m', String.raw`n\mid m`],
  ['NOT p', String.raw`\neg p`],
  ['x intersect y', String.raw`x\cap y`],
  // scripts
  ['x^(1/n)', String.raw`x^{\frac{1}{n}}`],
  ['a_i^2', String.raw`a_{i}^{2}`],
  ['(1+x)^n', String.raw`(1+x)^{n}`],
  // left-nested script chains: a parenthesized script arg closes off the
  // right-assoc chain (see parser.ts's header), so `x^(a)^(b)` parses as
  // Pow(Pow(x,a),b) - base is itself a Pow. The base must be braced or KaTeX
  // raises "Double superscript"/"Double subscript" on the bare `x^{a}^{b}`
  // juxtaposition (spec-review fix 1). A DIFFERENT kind of script stacked on
  // top (`a_i^2` above) is unaffected: KaTeX accepts sub-then-sup bare.
  ['x^(a)^(b)', String.raw`{x^{a}}^{b}`],
  ['x^(a)^(b)^(c)', String.raw`{{x^{a}}^{b}}^{c}`],
  ['a_(i)_(j)', String.raw`{a_{i}}_{j}`],
  // cases: only a branch that SAYS `otherwise` gets the otherwise column; a
  // braced system of equations gets no second column at all
  ['cases { x = 0; y = 1 }', String.raw`\begin{cases}x=0\\ y=1\end{cases}`],
  ['cases { a if b; c }', String.raw`\begin{cases}a & \text{if }b\\ c\end{cases}`],
  // factorial: both spellings render identically, and a factorial OF a
  // factorial keeps its parens (`n!!` is LaTeX's double factorial)
  ['n!', String.raw`n!`],
  ['floor((j-1)! + 1)', String.raw`\lfloor (j-1)!+1 \rfloor`],
  ['factorial(factorial(n))', String.raw`(n!)!`],
  ['That is amazing!', String.raw`\text{That is amazing!}`],
  // differentials
  ['integral(a -> b) f(x) dx', String.raw`\int_{a}^{b} f(x)\,dx`],
  // QED loses SYMBOL_MAP's legacy \quad prefix at the renderer level
  ['QED', String.raw`\blacksquare`],
];
for (const [source, want] of EXPR_CASES) {
  checkExact('Expr', JSON.stringify(source), render(source).latex, want);
}

// Indentation is the renderStatement caller's `indent` argument.
checkExact('Expr', 'indent=3 prefixes three \\quad', render('x = 1', 3).latex, String.raw`\quad \quad \quad x=1`);

// renderExpr's own policies, exercised without the disambiguator in the way.
const MATH_CASES = [
  ['unknownfn(x)', String.raw`\mathrm{unknownfn}(x)`],
  ['f(x)', String.raw`f(x)`],
  ['lcm(a, b)', String.raw`\operatorname{lcm}(a, b)`],
  ['abs(x)', String.raw`\left|x\right|`],
  ['<1, 2, 3>', String.raw`\langle 1, 2, 3\rangle`],
  ['x = "by parts" + 1', String.raw`x=\text{by parts}+1`],
  ['d/dx f(x)', String.raw`\frac{d}{dx}f(x)`],
  // a Group grows only when its content is tall
  ['(x + 1)', String.raw`(x+1)`],
  ['(1/2 + 1)', String.raw`\left(\frac{1}{2}+1\right)`],
  // an empty Raw (the continuation-line idiom) renders as nothing
  ['= f(x)', String.raw`=f(x)`],
];
for (const [source, want] of MATH_CASES) {
  checkExact('Math', JSON.stringify(source), renderMath(source), want);
}

// A clause break only counts when the clause actually finished: after a
// dangling `y =` the source space stays INSIDE the text braces instead of
// becoming the `\ ` separator a complete clause earns (golden 19).
checkExact('Math', 'dangling relation before prose gets no clause-break space',
  render('y = unknownfn thing').latex, String.raw`y=\text{ unknownfn thing}`);

// Call form is decided by ADJACENCY, not by vocabulary: an unknown name
// written tight against its paren is the application it looks like, while the
// same word with a space before the paren is prose plus a parenthetical.
checkExact('Math', 'unknown name tight against "(" is a call',
  render('y = unknownfn(x)').latex, String.raw`y=\mathrm{unknownfn}(x)`);
checkExact('Math', 'the same name with a space before "(" stays prose',
  render('y = unknownfn (x)').latex, String.raw`y=\text{ unknownfn }(x)`);

// Script typography: an index is not a name. Out in the open a multi-letter
// run is a name and gets \mathrm; inside a Sub/Pow argument an unknown
// ALL-LOWERCASE one is a pair of juxtaposed indices and stays bare (italic).
// Anything with a capital in it is still a label, and known operator names
// (which the parser hands over as Sym, not Ident) are untouched either way.
const SCRIPT_CASES = [
  ['a_ij', String.raw`a_{ij}`],
  ['a_(ij)', String.raw`a_{ij}`],          // the parenthesized spelling agrees
  ['x^(ij)', String.raw`x^{ij}`],
  ['P_AB', String.raw`P_{\mathrm{AB}}`],   // a capital means a label, not indices
  ['x_max', String.raw`x_{max}`],          // MATH_KEYWORDS -> Sym, unchanged
  ['A_det', String.raw`A_{det}`],
  ['speed = 1', String.raw`\mathrm{speed}=1`],  // out of a script, still \mathrm
];
for (const [source, want] of SCRIPT_CASES) {
  checkExact('Scripts', JSON.stringify(source), renderMath(source), want);
}
// The same input through the WHOLE pipeline, disambiguator included: a `_(...)`
// group that leaves the math run takes the subscript's only operand with it,
// and the `_` then renders as a silent empty script (`a_{}\text{(ij) }=0`).
checkExact('Scripts', 'a_(ij) = 0 - end to end, the script argument never leaves the math run',
  render('a_(ij) = 0').latex, String.raw`a_{ij}=0`);

// ============================================
// Robustness - renderStatement must never throw
// ============================================
const ROBUST = [
  '',
  '   ',
  'just some ordinary english prose here',
  'sum(i=1 ->',
  '"',
  '$',
  '((((',
  '}}}}',
  'x = ',
  '= f(x)',
  '1/',
  '|x',
  'cases {',
  'matrix([[1,2],',
  '#$%^&*',
  'x^^^2',
  'a______b',
  '.....',
  'forall',
  '\\ \\ \\',
  'x = "unterminated',
];
for (const source of ROBUST) {
  let ok = true;
  let latex = '';
  try {
    latex = render(source).latex;
    ok = typeof latex === 'string';
  } catch (err) {
    ok = false;
    latex = `THREW: ${err && err.message}`;
  }
  check('Robust', `renderStatement never throws on ${JSON.stringify(source)}`, ok, latex);
}
check('Robust', 'empty token list renders to the empty string', render('').latex === '', JSON.stringify(render('').latex));
check('Robust', 'half-typed sum keeps the typed prefix visible',
  render('sum(i=1 ->').latex.includes('\\sum') || render('sum(i=1 ->').latex.includes('texttt'), render('sum(i=1 ->').latex);

// renderDocument must survive the same abuse.
for (const source of ROBUST) {
  let ok = true;
  let detail = '';
  try {
    const { lines } = renderDoc(source);
    ok = Array.isArray(lines) && lines.every((l) => typeof l.latex === 'string');
    detail = lines.map((l) => l.latex).join(' | ');
  } catch (err) {
    ok = false;
    detail = `THREW: ${err && err.message}`;
  }
  check('Robust', `renderDocument never throws on ${JSON.stringify(source)}`, ok, detail);
}
{
  const messy = 'Problem 1 {\n  Theorem {\n    x = 1\n'; // two unclosed scopes at EOF
  let ok = true;
  let detail = '';
  try {
    const { lines } = renderDoc(messy);
    ok = lines.length > 0 && new Set(lines.map((l) => l.id)).size === lines.length;
    detail = lines.map((l) => `${l.id}:${l.latex}`).join(' | ');
  } catch (err) {
    ok = false;
    detail = `THREW: ${err && err.message}`;
  }
  check('Robust', 'unclosed scopes at EOF still render, with unique ids', ok, detail);
}

// Diagnostics from the parse/segment stages flow through the array parameter.
{
  const { diagnostics } = render('x^2 + sqrt(');
  check('Diagnostics', 'parser recovery diagnostic reaches the caller-supplied array',
    diagnostics.some((d) => d.severity === 'warn' && d.message.includes('could not parse')),
    JSON.stringify(diagnostics));
}
{
  const { diagnostics } = renderDoc('Problem 1 {\n  x^2 + sqrt(\n}');
  check('Diagnostics', 'renderDocument accumulates statement diagnostics',
    diagnostics.some((d) => d.message.includes('could not parse')), JSON.stringify(diagnostics.map((d) => d.message)));
}
// A math run that ends on an operator whose operand is the FOLLOWING prose is
// complete input, not truncated: the symmetric case of the leading-operator
// continuation idiom, and equally silent. A trailing operator with nothing
// after it at all still reports.
{
  const { latex, diagnostics } = render('aRb => bRa');
  check('Diagnostics', '"aRb => bRa" renders prose-implies-prose with NO diagnostic',
    latex === String.raw`\text{aRb }\implies\text{ bRa}` && diagnostics.length === 0,
    `${latex} | ${JSON.stringify(diagnostics.map((d) => d.message))}`);
}
{
  const { diagnostics } = render('x +');
  check('Diagnostics', '"x +" (nothing follows at all) still reports the missing operand',
    diagnostics.some((d) => d.message.includes('missing operand')), JSON.stringify(diagnostics.map((d) => d.message)));
}

// parseStatement/renderSegments must not double-parse (spec-review fix 2):
// parsing happens exactly once, in parseStatement; renderSegments only
// walks the already-parsed Expr trees it is handed, so calling it adds no
// further diagnostics - and renderStatement (the parseStatement+
// renderSegments composition kept for existing callers) still nets exactly
// the same single diagnostic as before the split.
{
  const { tokens: all } = lex('x^2 + sqrt(');
  const tokens = all.filter((t) => t.kind !== 'NEWLINE' && t.kind !== 'COMMENT');

  const diags = [];
  const segments = parseStatement(tokens, diags);
  check('Diagnostics', 'parseStatement on "x^2 + sqrt(" yields exactly 1 diagnostic',
    diags.length === 1, JSON.stringify(diags));

  const before = diags.length;
  renderSegments(segments, 0);
  check('Diagnostics', 'renderSegments on the result adds ZERO new diagnostics',
    diags.length === before, JSON.stringify(diags));

  const diags2 = [];
  renderStatement(tokens, 0, diags2);
  check('Diagnostics', 'renderStatement (compat path) also yields exactly 1 diagnostic',
    diags2.length === 1, JSON.stringify(diags2));
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
