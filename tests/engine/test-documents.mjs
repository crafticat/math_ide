/**
 * MathBrain Engine v2 - Realistic Document Suite
 *
 * The stage suites prove each stage does its part on inputs chosen to isolate
 * one rule at a time. This one asks a different question: does the engine
 * survive a WHOLE HOMEWORK SHEET, written the way a student actually writes
 * one - macros, nested scopes and subtasks, prose lead-ins mixed with
 * notation, matrices, cases, sums, set-builders, English membership
 * conditions?
 *
 * Three sheets, one per course flavour, each exercising a different corner:
 *   Analysis        eps-delta, limits, series/ratio test, a piecewise `cases`,
 *                   a set-builder, an integral
 *   Linear algebra  matrix/vmatrix/bmatrix, det, eigenvalues, a `R^3`
 *                   set-builder, a Section scope, dot products
 *   Discrete        induction, divisibility, binomials, AND/OR/NOT logic, a
 *                   written-out relation set, De Morgan
 *
 * Every sheet is held to three things, and the bar is deliberately absolute:
 *   1. it COMPILES (no throw),
 *   2. with ZERO diagnostics - not "few", zero. A diagnostic on this input
 *      means a shape a real document contains is one the engine cannot parse,
 *      which is exactly the class of bug this suite exists to catch. A sheet
 *      that legitimately needed one would carry an `allowDiagnostics` note
 *      naming it; none does.
 *   3. every rendered line is VALID LaTeX under KaTeX with throwOnError:true.
 *      Silent nonsense that KaTeX rejects is the worst failure mode available
 *      to a renderer, because the user sees an error box rather than a wrong
 *      symbol they could at least argue with.
 *
 * These are FIXTURES, not goldens: no line is pinned byte-for-byte here (the
 * approved product output lives in test-render.mjs). Pinning a 50-line
 * document would fail on every deliberate improvement without telling anyone
 * anything, whereas "compiles clean and renders" stays true across them.
 *
 * KaTeX is a devDependency and is a GATE, not an optional extra - it resolves
 * from $MATHBRAIN_KATEX_DIR or the repo's own node_modules, and the suite
 * FAILS if neither resolves. There is no skip path: a run that could not check
 * LaTeX validity has not run the gate.
 *
 * Run with: node tests/engine/test-documents.mjs
 */

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { bundle } from './build.mjs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ============================================
// THE DOCUMENTS
// ============================================

const ANALYSIS = `// Real Analysis - Homework 6
// due Thursday

#define eps epsilon
#define R Math.reals
#define N Math.naturals

Problem 1 Epsilon-delta {

  Definition Continuity {
    A function f is continuous at c if
    forall eps > 0 exists delta > 0 suchthat
    |x - c| < delta implies |f(x) - f(c)| < eps
  }

  ?: lim(x -> 2) (x^2 - 4)/(x - 2) = 4 {

    - Choosing delta {
      Let eps > 0 be given and set delta = eps
    }

    - The estimate {
      Suppose 0 < |x - 2| < delta
      Then |(x^2 - 4)/(x - 2) - 4| = |x - 2| < delta = eps
      -- Note {
        The cancellation is valid since x != 2
      }
    }
    QED
  }
}

Problem 2 Series and the ratio test {

  Theorem Ratio Test {
    Let a_n != 0 forall n in N and let L = lim(n -> inf) |a_(n+1)/a_n|
    If L < 1 then sum(n=1 -> inf) a_n converges absolutely
  }

  - Apply the test to a_n = x^n/factorial(n) {
    |a_(n+1)/a_n| = |x|/(n+1) -> 0 as n -> inf
    Hence sum(n=0 -> inf) x^n/factorial(n) = e^x converges forall x in R
  }

  - The harmonic series diverges {
    sum_(k=1)^(n) 1/k >= 1 + n/2 for n = 2^m
  }
}

Problem 3 A piecewise function {

  Let f(x) = cases { x^2 sin(1/x) if x != 0; 0 if x = 0 }

  ?: f is differentiable at 0 {
    lim(h -> 0) (f(h) - f(0))/h = lim(h -> 0) h sin(1/h) = 0
  }

  Remark {
    The set S = {x in R : f(x) = 0} is closed and sup S <= 1/pi
    By Euler's theorem 1 + 1/4 + ... + 1/n^2 -> pi^2/6
  }

  Finally integral(0 -> 1) x^2 sqrt(1 + x^3) dx = (2/9) * (2^(3/2) - 1)
}
`;

const LINEAR_ALGEBRA = `// Linear Algebra 2 - Homework 3

#define R Math.reals
#define lam lambda

Problem 1 Eigenvalues of a 2x2 matrix {

  Let A = matrix([[2, 1], [1, 2]])

  ?: the eigenvalues of A are 1 and 3 {

    - The characteristic polynomial {
      det(A - lam * I) = vmatrix([[2 - lam, 1], [1, 2 - lam]]) = (2 - lam)^2 - 1
      So p(lam) = lam^2 - 4 lam + 3 = (lam - 1) * (lam - 3)
    }

    - The eigenvectors {
      For lam = 1 we solve (A - I) v = 0 giving v_1 = bmatrix([[1], [-1]])
      For lam = 3 we solve (A - 3I) v = 0 giving v_2 = bmatrix([[1], [1]])
      -- Check {
        A v_2 = bmatrix([[3], [3]]) = 3 v_2
      }
    }
    QED
  }
}

Problem 2 Vector spaces {

  Definition Subspace {
    W subset V is a subspace if forall u, v in W and forall c in R
    we have u + v in W and c * u in W
  }

  Lemma {
    The set W = {x in R^3 : x_1 + x_2 + x_3 = 0} is a subspace of R^3
  }

  Proof {
    Let u, v in W and c in R
    Then sum_(i=1)^(3) (u_i + v_i) = 0 + 0 = 0
    Hence u + v in W and similarly c * u in W
    QED
  }

  - Dimension {
    A basis is given by {(1, -1, 0), (1, 0, -1)} so dim W = 2
  }
}

Problem 3 Determinants and norms {

  Theorem {
    det(matrix([[a, b], [c, d]])) = a*d - b*c
  }

  Note the following: det A != 0 iff A is invertible

  For the vector v = (3, 4) we get |v| = sqrt(3^2 + 4^2) = 5

  Section Gram-Schmidt {
    u_1 = v_1 and u_2 = v_2 - ((v_2 dot u_1)/(u_1 dot u_1)) * u_1
    The projection satisfies |u_2|^2 = |v_2|^2 - (v_2 dot u_1)^2/|u_1|^2
    This produces an orthogonal list u_1, u_2, ..., u_n
  }
}
`;

const DISCRETE = `// Discrete Math 2 - Homework 5

#define N Math.naturals
#define Z Math.integers

Problem 1 Relations {

  Definition {
    R subset A * A is an equivalence relation if it is reflexive, symmetric and transitive
  }

  Let R = {(x, y) : x in Z and y in Z and x - y in 3*Z}

  ?: R is an equivalence relation {

    - Reflexive {
      forall a in Z we have a - a = 0 in 3*Z so aRa
    }

    - Symmetric {
      If aRb then a - b = 3k for some k in Z
      Hence b - a = 3*(-k) so bRa
    }

    - Transitive {
      (aRb AND bRc) => a - b = 3k and b - c = 3m
      -- Conclusion {
        a - c = 3*(k + m) so aRc
      }
    }
    QED
  }

  Remark {
    The quotient Z/3Z has exactly 3 classes, namely {0, 1, 2}
    Every class is one of [0], [1], ..., [2]
  }
}

Problem 2 Induction {

  ?: forall n in N, sum(i=1 -> n) i = n*(n+1)/2 {

    - Base case {
      For n = 1 both sides equal 1
    }

    - Inductive step {
      Assume sum_(i=1)^(k) i = k*(k+1)/2
      Then sum(i=1 -> k+1) i = k*(k+1)/2 + (k+1) = (k+1)*(k+2)/2
    }
    QED
  }

  Lemma {
    forall n >= 4 we have 2^n < factorial(n)
  }

  - Divisibility {
    Let P = {n : n is prime} and let D = {d : d divides n}
    Then 3 divides n^3 - n forall n in N
  }
}

Problem 3 Counting and logic {

  Theorem {
    choose(n, k) = choose(n-1, k-1) + choose(n-1, k) for 0 < k < n
  }

  Let f(n) = cases { 1 if n = 0; n * f(n-1) if n > 0 }

  The set A = {x in N : x <= 10 AND x mod 2 = 0} has |A| = 5 elements

  Claim De Morgan {
    x notin (A union B) <=> x notin A AND x notin B
  }

  If not p implies q then p or q is true, so the statement holds
}
`;

const DOCUMENTS = [
  { name: 'Analysis HW6 (eps-delta, series, piecewise)', source: ANALYSIS },
  { name: 'Linear Algebra HW3 (matrices, det, subspaces)', source: LINEAR_ALGEBRA },
  { name: 'Discrete HW5 (induction, divisibility, logic)', source: DISCRETE },
];

// ============================================
// Runner
// ============================================

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MathBrain Engine v2 - Realistic Document Suite              ║');
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

/**
 * KaTeX, from $MATHBRAIN_KATEX_DIR or the repo's own node_modules.
 * THROWS when neither resolves - see the header: this check is a gate.
 */
function loadKatex() {
  const dirs = [
    process.env.MATHBRAIN_KATEX_DIR,
    new URL('../../node_modules', import.meta.url).pathname,
  ].filter(Boolean);
  for (const dir of dirs) {
    if (!existsSync(`${dir}/katex/package.json`)) continue;
    try {
      return createRequire(`${dir}/`)('katex');
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    'KaTeX not found — this suite cannot check that its output is valid LaTeX.\n' +
    `  looked in: ${dirs.join('\n             ')}\n` +
    '  fix: run `npm install` (katex is a devDependency), or point\n' +
    '       $MATHBRAIN_KATEX_DIR at a node_modules directory containing it.');
}

const { compile } = await import(bundle('services/engine/engine.ts', 'engine-documents.mjs'));
const katex = loadKatex();

let totalLines = 0;
let totalKatex = 0;
let totalSourceLines = 0;

for (const doc of DOCUMENTS) {
  const sourceLines = doc.source.split('\n').length;
  totalSourceLines += sourceLines;

  // 1. Compiles at all.
  let result = null;
  let threw = null;
  try {
    result = compile(doc.source);
  } catch (err) {
    threw = err;
  }
  check('Compile', `${doc.name} (${sourceLines} source lines) compiles without throwing`,
    threw === null && result !== null && Array.isArray(result.latexLines),
    threw ? `THREW: ${threw && threw.stack}` : undefined);
  if (!result) continue;

  check('Compile', `${doc.name} produces output lines`, result.latexLines.length > 0,
    String(result.latexLines.length));
  totalLines += result.latexLines.length;

  // 2. Zero diagnostics. A diagnostic here names a real-document shape the
  //    engine cannot parse - the report prints the source line so the shape is
  //    identifiable without re-deriving it from a span.
  const src = doc.source.split('\n');
  const detail = result.diagnostics
    .map((d) => `line ${d.span.startLine}: ${d.severity}: ${d.message}\n        ${DIM}${(src[d.span.startLine - 1] ?? '').trim()}${RESET}`)
    .join('\n      ');
  check('Diagnostics', `${doc.name} compiles with ZERO diagnostics`,
    result.diagnostics.length === 0, detail);

  // 3. Every rendered line is valid LaTeX.
  const katexFailures = [];
  for (const line of result.latexLines) {
    totalKatex++;
    try {
      katex.renderToString(line.latex, { throwOnError: true, displayMode: true, trust: true, strict: false });
    } catch (err) {
      katexFailures.push(`source line ${line.originalLine}: ${err && err.message}\n        ${line.latex}`);
    }
  }
  check('KaTeX', `${doc.name}: all ${result.latexLines.length} rendered lines are valid LaTeX (throwOnError)`,
    katexFailures.length === 0, katexFailures.join('\n      '));

  // 4. Structural sanity: the macro table was read, and every line carries the
  //    id/originalLine wiring the app keys its DOM on. A document that
  //    compiled to well-formed nonsense would still pass 1-3.
  check('Structure', `${doc.name}: #define macros are collected (${result.macros ? Object.keys(result.macros).length : 0})`,
    result.macros && Object.keys(result.macros).length > 0, JSON.stringify(result.macros));
  check('Structure', `${doc.name}: every line has a unique id and a positive originalLine`,
    new Set(result.latexLines.map((l) => l.id)).size === result.latexLines.length &&
      result.latexLines.every((l) => Number.isInteger(l.originalLine) && l.originalLine >= 1));
  check('Structure', `${doc.name}: the statement index is populated (${result.index.length} entries)`,
    result.index.length > 0);
}

// Determinism: the same sheet twice must give the same bytes (no hidden
// per-call state anywhere in the pipeline - counters, placeholder ids, maps).
for (const doc of DOCUMENTS) {
  const a = compile(doc.source).latexLines.map((l) => l.latex).join('\n');
  const b = compile(doc.source).latexLines.map((l) => l.latex).join('\n');
  check('Determinism', `${doc.name}: compiling twice gives identical output`, a === b);
}

// ============================================
// Summary
// ============================================
console.log('\n' + '═'.repeat(60));
console.log(`Documents: ${DOCUMENTS.length} sheets, ${totalSourceLines} source lines`);
console.log(`Rendered:  ${totalLines} output lines, ${totalKatex} KaTeX renders`);
console.log(`Total:     ${passed}/${passed + failed} checks passed`);

if (failed > 0) {
  console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('');
} else {
  console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
}

process.exit(failed > 0 ? 1 : 0);
