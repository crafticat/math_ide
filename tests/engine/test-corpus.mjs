/**
 * MathBrain Engine v2 - Golden Corpus Suite
 *
 * The migration-safety gate. All 175 inputs of the legacy suite
 * (test-advanced.mjs) run through the REAL v2 engine (services/engine/
 * engine.ts, bundled by build.mjs) - never through the drifted inline copy
 * of the legacy compiler that test-advanced.mjs carries.
 *
 * Each case asserts in one of two modes:
 *
 *   legacy mode  - `expected` / `contains` / `notContains`, exactly the
 *                  assertion the legacy suite used. Kept whenever the v2
 *                  output still satisfies it, whether or not the two engines
 *                  agree byte-for-byte.
 *   frozen mode  - `latex`, the v2 output asserted BYTE-FOR-BYTE, used where
 *                  v2 deliberately diverges from the legacy expectation. Every
 *                  such case carries `class` (the approved-improvement class
 *                  from docs/superpowers/specs/2026-08-04-golden-migration-notes.md)
 *                  and `why`. A frozen golden is a contract: changing one is a
 *                  behaviour change that has to be justified, not a test fixup.
 *
 * On top of the per-case assertion, EVERY case must also:
 *   - render under KaTeX with throwOnError:true (the output is only useful if
 *     it is valid LaTeX), and
 *   - compile with zero diagnostics, unless the case is marked
 *     `allowDiagnostics` - the exemption for an input that legitimately falls
 *     into Raw recovery (a construct the v2 grammar does not accept). Such a
 *     case is still held to KaTeX validity. NO case carries the flag today:
 *     all 175 compile clean, and that is itself part of the gate.
 *
 * KaTeX is a devDependency of this repo (the APP still loads it from a CDN;
 * the pin here exists so this gate can run), and it is a GATE, not an optional
 * extra: it resolves from $MATHBRAIN_KATEX_DIR - the escape hatch for a
 * pinned install kept outside the repo - and otherwise from the repo's own
 * node_modules. If neither resolves the suite FAILS. There is deliberately no
 * skip path: a run that could not check LaTeX validity has not run this gate,
 * and reporting it green would be a lie.
 *
 * Run with: node tests/engine/test-corpus.mjs
 */

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { bundle } from './build.mjs';

// ============================================
// THE CORPUS - 175 inputs ported verbatim from test-advanced.mjs
// (ids and categories preserved; see the migration notes doc for every
// golden that changed and why)
// ============================================

export const CORPUS = [
  // === BASIC FRACTIONS (1-10) ===
  { id: 1, category: 'Fractions', input: 'a/b', expected: '\\frac{a}{b}' },
  { id: 2, category: 'Fractions', input: '(a+b)/c', expected: '\\frac{a+b}{c}' },
  { id: 3, category: 'Fractions', input: '(a)/(b+c)', contains: '\\frac{a}{b+c}' },  // Need parens on numerator for simple/complex
  { id: 4, category: 'Fractions', input: '(a+b)/(c+d)', expected: '\\frac{a+b}{c+d}' },
  { id: 5, category: 'Fractions', input: '((a+b))/(c)', latex: '\\frac{a+b}{c}', class: 11,
    why: 'the parens around a fraction operand are grouping, not notation, so v2 dissolves them all the way down; legacy consumed the outer pair and printed the inner one' },
  { id: 6, category: 'Fractions', input: 'x/y/z', latex: '\\cfrac{\\cfrac{x}{y}}{z}', class: 3,
    why: 'fraction tower gets \\cfrac; legacy built only the first \\frac and left the second slash raw' },
  { id: 7, category: 'Fractions', input: '1/2 + 3/4', contains: '\\frac{1}{2}' },
  { id: 8, category: 'Fractions', input: 'Math.pi/2', expected: '\\frac{\\pi}{2}' },
  { id: 9, category: 'Fractions', input: 'Math.pi/4', expected: '\\frac{\\pi}{4}' },
  { id: 10, category: 'Fractions', input: '(2*Math.pi)/n', contains: '\\frac' },

  // === EXPONENTS (11-25) ===
  { id: 11, category: 'Exponents', input: 'x^2', expected: 'x^{2}' },
  { id: 12, category: 'Exponents', input: 'x^(1/2)', contains: '\\frac{1}{2}' },
  { id: 13, category: 'Exponents', input: 'x^(1/n)', contains: '\\frac{1}{n}' },
  { id: 14, category: 'Exponents', input: 'x^(a+b)', contains: '^{a+b}' },
  { id: 15, category: 'Exponents', input: 'x^(a/b)', contains: '\\frac{a}{b}' },
  { id: 16, category: 'Exponents', input: 'e^(i*Math.pi)', contains: '\\pi' },
  { id: 17, category: 'Exponents', input: 'x^(1/n)^2', contains: '^{2}' },
  { id: 18, category: 'Exponents', input: 'x^(a)^(b)', notContains: '^(' },
  { id: 19, category: 'Exponents', input: 'x^(a)^(b)^(c)', notContains: '^(' },
  { id: 20, category: 'Exponents', input: '(a+b)^(c+d)', contains: '^{c+d}' },
  { id: 21, category: 'Exponents', input: '((a/b))^(1/n)', contains: '\\frac' },
  { id: 22, category: 'Exponents', input: 'x^(1/n)^(x_i)', contains: 'x_{i}' },
  { id: 23, category: 'Exponents', input: '2^10', expected: '2^{10}' },
  { id: 24, category: 'Exponents', input: 'x^n^m', latex: 'x^{n^{m}}', class: 6,
    why: 'legacy emitted x^{n}^m, which KaTeX rejects outright ("Double superscript"); v2 nests the chain' },
  { id: 25, category: 'Exponents', input: 'e^(-x^2)', contains: '^{-x^{2}}' },

  // === TRIGONOMETRIC FUNCTIONS (26-35) ===
  { id: 26, category: 'Trig', input: 'sin(x)', expected: '\\sin(x)' },
  { id: 27, category: 'Trig', input: 'cos(x)', expected: '\\cos(x)' },
  { id: 28, category: 'Trig', input: 'tan(x)', expected: '\\tan(x)' },
  { id: 29, category: 'Trig', input: 'sin(Math.pi/2)', contains: '\\sin' },
  { id: 30, category: 'Trig', input: 'cos(2*Math.pi)', contains: '\\cos' },
  { id: 31, category: 'Trig', input: 'sin(x)^2', contains: '\\sin(x)' },
  { id: 32, category: 'Trig', input: 'sin(x/2)', contains: '\\frac{x}{2}' },
  { id: 33, category: 'Trig', input: 'cos((a+b)/2)', contains: '\\frac{a+b}{2}' },
  { id: 34, category: 'Trig', input: 'tan(Math.pi/4)', contains: '\\frac{\\pi}{4}' },
  { id: 35, category: 'Trig', input: 'sin(cos(x))', contains: '\\sin' },  // Nested functions - inner cos may not transform

  // === FACTORIAL (36-45) ===
  { id: 36, category: 'Factorial', input: 'factorial(n)', expected: 'n!' },
  { id: 37, category: 'Factorial', input: 'factorial(n-1)', expected: '(n-1)!' },
  { id: 38, category: 'Factorial', input: 'factorial(n+1)', expected: '(n+1)!' },
  { id: 39, category: 'Factorial', input: 'factorial(2*n)', latex: '(2\\cdot n)!', class: 2,
    why: '* renders as \\cdot' },
  { id: 40, category: 'Factorial', input: 'factorial(k)/factorial(n)', contains: '\\frac' },
  { id: 41, category: 'Factorial', input: 'factorial(n)/factorial(k)/factorial(n-k)', contains: '!' },
  { id: 42, category: 'Factorial', input: 'factorial(factorial(n))', contains: '!' },
  { id: 43, category: 'Factorial', input: 'n * factorial(n-1)', contains: '(n-1)!' },
  { id: 44, category: 'Factorial', input: 'factorial(j-1) + 1', contains: '(j-1)!' },
  { id: 45, category: 'Factorial', input: 'sqrt(factorial(n))', contains: '\\sqrt' },

  // === SUMMATION (46-52) ===
  { id: 46, category: 'Sum', input: 'sum(i=1 -> n) a_i', contains: '\\sum_{i=1}^{n}' },
  { id: 47, category: 'Sum', input: 'sum(k=0 -> inf) x^k', contains: '\\sum_{k=0}^{' },  // inf becomes \infty
  { id: 48, category: 'Sum', input: 'sum(j=0 -> i) cos(x)', contains: '\\sum_{j=0}^{i}' },
  { id: 49, category: 'Sum', input: 'sum(i=1 -> n) i^2', contains: '\\sum_{i=1}^{n}' },
  { id: 50, category: 'Sum', input: 'sum(k=1 -> n) 1/k', contains: '\\sum' },
  { id: 51, category: 'Sum', input: '(sum(i=1 -> n) a_i)/n', contains: '\\frac' },
  { id: 52, category: 'Sum', input: 'sum(i=0 -> n) choose(n, i)', contains: '\\binom' },

  // === INTEGRALS (53-58) ===
  { id: 53, category: 'Integral', input: 'integral(0 -> 1) x dx', contains: '\\int_{0}^{1}' },
  { id: 54, category: 'Integral', input: 'integral(a -> b) f(x) dx', contains: '\\int_{a}^{b}' },
  { id: 55, category: 'Integral', input: 'integral(-inf -> inf) e^(-x^2) dx', contains: '\\int' },  // inf -> \infty breaks pattern
  { id: 56, category: 'Integral', input: 'integral(0 -> Math.pi) sin(x) dx', contains: '\\int_{0}^{\\pi}' },
  { id: 57, category: 'Integral', input: 'integral(0 -> 2*Math.pi) cos(x) dx', contains: '\\int' },
  { id: 58, category: 'Integral', input: '(1/n) * integral(0 -> n) f(x) dx', contains: '\\int' },

  // === LIMITS (59-64) ===
  { id: 59, category: 'Limit', input: 'lim(x -> 0) sin(x)/x', latex: '\\lim_{x\\to 0}\\frac{\\sin(x)}{x}', class: 7,
    why: 'spacing only: no space before \\to (the control word ends at the backslash), none after the bound' },
  { id: 60, category: 'Limit', input: 'lim(n -> inf) (1 + 1/n)^n', latex: '\\lim_{n\\to\\infty}\\left(1+\\frac{1}{n}\\right)^{n}', class: 7,
    why: 'spacing (class 7) plus \\left...\\right around the tall base and a braced exponent (class 4)' },
  { id: 61, category: 'Limit', input: 'lim(h -> 0) (f(x+h) - f(x))/h', latex: '\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}', class: 7,
    why: 'spacing only' },
  { id: 62, category: 'Limit', input: 'lim_(x -> a) f(x)', latex: '\\lim_{x\\to a} f(x)', class: 7,
    why: 'spacing only' },
  { id: 63, category: 'Limit', input: 'lim(x -> inf) x^(1/x)', contains: '\\lim' },
  { id: 64, category: 'Limit', input: 'lim(x -> 0) (1 - cos(x))/x^2', contains: '\\lim' },

  // === BINOMIAL/CHOOSE (65-70) ===
  { id: 65, category: 'Binomial', input: 'choose(n, k)', expected: '\\binom{n}{k}' },
  { id: 66, category: 'Binomial', input: 'choose(n, 0)', expected: '\\binom{n}{0}' },
  { id: 67, category: 'Binomial', input: 'choose(n, n)', expected: '\\binom{n}{n}' },
  { id: 68, category: 'Binomial', input: 'choose(n+1, k)', contains: '\\binom{n+1}{k}' },
  { id: 69, category: 'Binomial', input: 'choose(2n, n)', expected: '\\binom{2n}{n}' },
  { id: 70, category: 'Binomial', input: 'sum(k=0 -> n) choose(n, k) * a^k', contains: '\\binom' },

  // === SQRT (71-75) ===
  { id: 71, category: 'Sqrt', input: 'sqrt(x)', expected: '\\sqrt{x}' },
  { id: 72, category: 'Sqrt', input: 'sqrt(a^2 + b^2)', contains: '\\sqrt{a^{2}' },
  { id: 73, category: 'Sqrt', input: 'sqrt(x/y)', contains: '\\sqrt' },
  { id: 74, category: 'Sqrt', input: 'sqrt(2)', expected: '\\sqrt{2}' },
  { id: 75, category: 'Sqrt', input: '1/sqrt(2)', contains: '\\frac' },

  // === GREEK LETTERS (76-82) ===
  { id: 76, category: 'Greek', input: 'alpha + beta', contains: '\\alpha' },
  { id: 77, category: 'Greek', input: 'delta x', contains: '\\delta' },
  { id: 78, category: 'Greek', input: 'epsilon > 0', contains: '\\epsilon' },
  { id: 79, category: 'Greek', input: 'theta = pi/4', contains: '\\theta' },
  { id: 80, category: 'Greek', input: 'lambda * x', contains: '\\lambda' },
  { id: 81, category: 'Greek', input: 'sigma^2', contains: '\\sigma' },
  { id: 82, category: 'Greek', input: 'omega = 2*pi*f', contains: '\\omega' },

  // === SUBSCRIPTS (83-87) ===
  { id: 83, category: 'Subscripts', input: 'x_i', expected: 'x_{i}' },
  { id: 84, category: 'Subscripts', input: 'a_ij', expected: 'a_{ij}' },
  { id: 85, category: 'Subscripts', input: 'x_1 + x_2', contains: 'x_{1}' },
  { id: 86, category: 'Subscripts', input: 'a_n/b_n', contains: 'a_{n}' },
  { id: 87, category: 'Subscripts', input: 'sum(i=1 -> n) x_i^2', contains: 'x_{i}' },

  // === OPERATORS (88-93) ===
  { id: 88, category: 'Operators', input: 'a => b', contains: '\\implies' },
  { id: 89, category: 'Operators', input: 'a <=> b', contains: '\\iff' },
  { id: 90, category: 'Operators', input: 'a <= b', contains: '\\le' },
  { id: 91, category: 'Operators', input: 'a >= b', contains: '\\ge' },
  { id: 92, category: 'Operators', input: 'a != b', contains: '\\neq' },
  { id: 93, category: 'Operators', input: 'a +- b', contains: '\\pm' },

  // === FLOOR/CEIL (94-100) ===
  { id: 94, category: 'Floor/Ceil', input: 'floor(x)', contains: '\\lfloor x \\rfloor' },
  { id: 95, category: 'Floor/Ceil', input: 'ceil(y)', contains: '\\lceil y \\rceil' },
  { id: 96, category: 'Floor/Ceil', input: 'floor(x/2)', contains: '\\lfloor' },
  { id: 97, category: 'Floor/Ceil', input: 'ceil(n + 0.5)', contains: '\\lceil' },
  { id: 98, category: 'Floor/Ceil', input: 'floor((j-1)! + 1)', latex: '\\lfloor (j-1)!+1 \\rfloor', class: 7,
    why: 'spacing only around + (the postfix ! now parses; it used to fall into Raw recovery)' },
  { id: 99, category: 'Floor/Ceil', input: 'floor(x) + ceil(y)', contains: '\\lfloor' },
  { id: 100, category: 'Floor/Ceil', input: '((sum(j=0 -> i) cos(Math.pi * floor((j-1)!  + 1)/j))/i)^(1/n)^(x_i)', contains: '\\lfloor' },

  // === COMPLEX EXPRESSIONS (101-107) ===
  { id: 101, category: 'Complex', input: '((sum(j=0 -> i) cos(Math.pi * ((j-1)! + 1)/j))/i)^(1/n)', contains: '\\frac' },
  { id: 102, category: 'Complex', input: 'lim(n -> inf) (1 + 1/n)^n = Math.e', contains: '\\lim' },
  { id: 103, category: 'Complex', input: 'integral(0 -> inf) e^(-x^2) dx = sqrt(Math.pi)/2', contains: '\\int' },
  { id: 104, category: 'Complex', input: 'sum(n=0 -> inf) x^n/factorial(n) = e^x', contains: '\\sum' },
  { id: 105, category: 'Complex', input: 'choose(n, k) = factorial(n)/(factorial(k)*factorial(n-k))', contains: '\\binom' },
  { id: 106, category: 'Complex', input: 'sin(x)^2 + cos(x)^2 = 1', contains: '\\sin' },
  { id: 107, category: 'Complex', input: '((a+b)/(c+d))^(1/n)^(x_i)', contains: '^{x_{i}}' },

  // === PDE FEATURES (108-125) ===
  // Partial derivative symbol
  { id: 108, category: 'PDE', input: 'partial', expected: '\\partial' },
  { id: 109, category: 'PDE', input: 'partial u/partial x', contains: '\\partial' },
  { id: 110, category: 'PDE', input: 'partial^2/partial(x)^2', contains: '\\partial' },

  // Epsilon shorthand
  { id: 111, category: 'PDE', input: 'eps', expected: '\\varepsilon' },
  { id: 112, category: 'PDE', input: 'eps > 0', contains: '\\varepsilon' },

  // Hat/Bar/Tilde accents
  { id: 113, category: 'Accents', input: 'hat(u)', contains: '\\hat{u}' },
  { id: 114, category: 'Accents', input: 'bar(x)', contains: '\\bar{x}' },
  { id: 115, category: 'Accents', input: 'tilde(f)', contains: '\\tilde{f}' },
  { id: 116, category: 'Accents', input: 'hat(u) + bar(v)', contains: '\\hat{u}' },

  // Cases environment
  { id: 117, category: 'Cases', input: 'cases { x = 0; y = 1 }', contains: '\\begin{cases}' },
  { id: 118, category: 'Cases', input: 'cases { x = 0; y = 1 }', contains: '\\end{cases}' },
  { id: 119, category: 'Cases', input: 'cases { a_1 = 0; a_2 = 1 }', contains: '\\\\' },

  // Matrix environments
  { id: 120, category: 'Matrix', input: 'matrix([[a, b], [c, d]])', contains: '\\begin{pmatrix}' },
  { id: 121, category: 'Matrix', input: 'matrix([[a, b], [c, d]])', contains: 'a & b' },
  { id: 122, category: 'Matrix', input: 'matrix([[a, b], [c, d]])', contains: '\\\\' },
  { id: 123, category: 'Matrix', input: 'bmatrix([[1, 0], [0, 1]])', contains: '\\begin{bmatrix}' },
  { id: 124, category: 'Matrix', input: 'vmatrix([[a, b], [c, d]])', contains: '\\begin{vmatrix}' },
  { id: 125, category: 'Matrix', input: 'matrix([[1]])', contains: '\\begin{pmatrix}1\\end{pmatrix}' },

  // === SYMBOL PROCESSING INSIDE ENVIRONMENTS (126-130) ===
  { id: 126, category: 'EnvSymbols', input: 'cases { alpha = 0; beta = 1 }', contains: '\\alpha' },
  { id: 127, category: 'EnvSymbols', input: 'cases { partial u = 0; eps > 0 }', contains: '\\partial' },
  { id: 128, category: 'EnvSymbols', input: 'matrix([[alpha, beta], [gamma, delta]])', contains: '\\alpha' },
  { id: 129, category: 'EnvSymbols', input: 'matrix([[partial, eps], [inf, pi]])', contains: '\\partial' },
  { id: 130, category: 'EnvSymbols', input: 'cases { lambda_n = 0; eps_n > 0 }', contains: '\\lambda_{n}' },

  // === NESTED SETS AND CHAINED SUBSCRIPTS (131-140) ===
  // Nested set braces: set of sets
  { id: 131, category: 'NestedSets', input: '{{a, b}, {c, d}}', contains: '\\{a, b\\}' },
  { id: 132, category: 'NestedSets', input: '{{a, b}, {c, d}}', contains: '\\{c, d\\}' },
  { id: 133, category: 'NestedSets', input: '{(0,0), (1,1)}', contains: '\\{(0,0)' },
  // Chained subscripts: R_B_i -> R_{B_{i}}
  { id: 134, category: 'ChainedSubs', input: 'R_B_i', contains: '_{B_{i}}' },
  { id: 135, category: 'ChainedSubs', input: 'a_b_c', contains: '_{b_{c}}' },
  { id: 136, category: 'ChainedSubs', input: 'x_1_2', contains: '_{1_{2}}' },
  // Parenthesized subscripts inside sets
  { id: 137, category: 'ParenSubsInSet', input: '{x_i, x_(i+1)}', contains: 'x_{i+1}' },
  { id: 138, category: 'ParenSubsInSet', input: '{x_(i+1) : i > 0}', contains: 'x_{i+1}' },
  // Complex combined example
  { id: 139, category: 'ComplexSets', input: '{{x_i, x_(i+1)} : (x_i, x_(i+1)) notin R}', contains: '\\notin' },
  { id: 140, category: 'ComplexSets', input: '{{x_i, x_(i+1)} : (x_i, x_(i+1)) notin R}', contains: 'x_{i+1}' },

  // === SUBTASK FEATURES (141-145) ===
  // Note: Subtask/scope features (-, --, ?:) are tested at the full-file level
  // These tests verify the inline content processing works within subtask contexts
  { id: 141, category: 'Subtask', input: 'forall a in A, aRa', contains: '\\forall' },
  { id: 142, category: 'Subtask', input: 'aRb => bRa', contains: '\\implies' },
  { id: 143, category: 'Subtask', input: '(aRb AND bRc) => aRc', contains: '\\implies' },
  { id: 144, category: 'Subtask', input: 'f(a) = f(b)', notContains: '__PH' },
  { id: 145, category: 'Subtask', input: 'x_i in A', contains: '\\in' },

  // === DOT AND ARROW OPERATORS (146-150) ===
  { id: 146, category: 'DotArrow', input: 'f dot g', contains: '\\cdot' },
  { id: 147, category: 'DotArrow', input: 'a dot b = c', contains: '\\cdot' },
  { id: 148, category: 'DotArrow', input: 'x -> y', contains: '\\to' },
  { id: 149, category: 'DotArrow', input: 'a -> b -> c', contains: '\\to' },
  { id: 150, category: 'DotArrow', input: 'g(x) <= 2 -> f(x) <= 100', contains: '\\to' },

  // === SET BUILDER WITH LOGIC (151-155) ===
  { id: 151, category: 'SetBuilderLogic', input: '{x : x in N and x > 0}', contains: '\\land' },
  { id: 152, category: 'SetBuilderLogic', input: '{x,y : x in N and x != y}', contains: '\\land' },
  { id: 153, category: 'SetBuilderLogic', input: '{x,y : x in N and x != y}', contains: '\\neq' },
  { id: 154, category: 'SetBuilderLogic', input: '{x : x > 0 or x < -1}', contains: '\\lor' },
  { id: 155, category: 'SetBuilderLogic', input: '{x : not x in A}', latex: '\\left\\{x\\ \\middle|\\ \\neg x\\in A\\right\\}', class: 1,
    why: '\\neg is \\lnot under another name (one spelling per symbol), plus \\left...\\middle...\\right sizing' },

  // === UNICODE NORMALIZATION (156-160) ===
  { id: 156, category: 'Unicode', input: '∣x∣', latex: '\\left|x\\right|', class: 4,
    why: 'delimiter sizing - and BYTE-IDENTICAL to the real legacy compiler: the |x| assertion only ever held for the drifted copy inside test-advanced.mjs' },
  { id: 157, category: 'Unicode', input: 'f·g', contains: '\\cdot' },  // Unicode middle dot
  { id: 158, category: 'Unicode', input: '∣Im(f)∣ = 1', latex: '\\left|\\mathrm{Im}(f)\\right|=1', class: 4,
    why: 'delimiter sizing plus \\mathrm for the call name (class 5); v2 used to shatter this statement into Raw spans - fixed by the adjacency call rule' },
  { id: 159, category: 'Unicode', input: 'a·b = c', contains: '\\cdot' },
  { id: 160, category: 'Unicode', input: 'g != f_n AND ∣x∣ = 1', contains: '\\land' },

  // === DOT PRODUCT PATTERNS (161-165) ===
  { id: 161, category: 'DotProduct', input: 'fdotg', contains: '\\cdot' },  // Xdot Y pattern
  { id: 162, category: 'DotProduct', input: 'adotb', contains: '\\cdot' },
  { id: 163, category: 'DotProduct', input: 'Im(fdotg)', contains: '\\cdot' },
  { id: 164, category: 'DotProduct', input: '|Im(fdotg)| = 1', contains: '\\cdot' },
  { id: 165, category: 'DotProduct', input: 'xdoty + zdotw', contains: '\\cdot' },

  // === EMPTY SET (166-167) ===
  { id: 166, category: 'EmptySet', input: '{} AND x', contains: '\\emptyset' },
  { id: 167, category: 'EmptySet', input: 'A = {}', contains: '\\emptyset' },

  // === NESTED CONTENT TRANSFORMATIONS (168-175) ===
  // These test that transformations work INSIDE function arguments and constructs
  { id: 168, category: 'NestedTransform', input: 'sqrt(fdotg)', contains: '\\cdot' },
  { id: 169, category: 'NestedTransform', input: 'sqrt(adotb)', contains: '\\cdot' },
  { id: 170, category: 'NestedTransform', input: 'floor(xdoty)', contains: '\\cdot' },
  { id: 171, category: 'NestedTransform', input: 'ceil(pdotq)', contains: '\\cdot' },
  { id: 172, category: 'NestedTransform', input: 'integral(0 -> 1) fdotg dx', contains: '\\cdot' },
  { id: 173, category: 'NestedTransform', input: 'sum(i=1 -> n) adotb', contains: '\\cdot' },
  { id: 174, category: 'NestedTransform', input: 'lim(x -> 0) fdotg', contains: '\\cdot' },
  { id: 175, category: 'NestedTransform', input: '|Im(fdotg)| = 1 AND g != f_n', contains: '\\cdot' },
];

// ============================================
// Runner (skipped when this module is imported, e.g. by scripts/engine-diff.mjs)
// ============================================

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

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
    const entry = `${dir}/katex/package.json`;
    if (!existsSync(entry)) continue;
    try {
      return createRequire(`${dir}/`)('katex');
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    'KaTeX not found — the corpus cannot check that its output is valid LaTeX.\n' +
    `  looked in: ${dirs.join('\n             ')}\n` +
    '  fix: run `npm install` (katex is a devDependency), or point\n' +
    '       $MATHBRAIN_KATEX_DIR at a node_modules directory containing it.');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   MathBrain Engine v2 - Golden Corpus Suite (175 cases)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const { compile } = await import(bundle('services/engine/engine.ts', 'engine-corpus.mjs'));
  const katex = loadKatex();

  let passed = 0;
  let failed = 0;
  let katexChecked = 0;
  const failures = [];
  const categories = new Map();

  const record = (category, ok) => {
    if (!categories.has(category)) categories.set(category, { passed: 0, failed: 0 });
    categories.get(category)[ok ? 'passed' : 'failed']++;
  };

  const check = (tc, label, ok, detail) => {
    record(tc.category, ok);
    if (ok) {
      passed++;
    } else {
      failed++;
      failures.push({ id: tc.id, category: tc.category, input: tc.input, label, detail });
    }
  };

  for (const tc of CORPUS) {
    const result = compile(tc.input);
    const latex = result.latexLines.map((l) => l.latex).join('\n');

    // 1. The golden.
    if (tc.latex !== undefined) {
      check(tc, `#${tc.id} frozen (class ${tc.class})`, latex === tc.latex,
        `expected: ${tc.latex}\n      actual:   ${latex}`);
    } else if (tc.expected !== undefined) {
      check(tc, `#${tc.id} exact`, latex === tc.expected,
        `expected: ${tc.expected}\n      actual:   ${latex}`);
    } else if (tc.contains !== undefined) {
      check(tc, `#${tc.id} contains`, latex.includes(tc.contains),
        `contains: ${tc.contains}\n      actual:   ${latex}`);
    } else {
      check(tc, `#${tc.id} notContains`, !latex.includes(tc.notContains),
        `notContains: ${tc.notContains}\n      actual:      ${latex}`);
    }

    // 2. Diagnostics - clean unless the case is a known Raw-recovery input.
    const diagnostics = result.diagnostics.map((d) => d.message).join('; ');
    if (tc.allowDiagnostics) {
      check(tc, `#${tc.id} diagnostics (recovery expected)`, result.diagnostics.length > 0,
        `expected at least one diagnostic, got none - if the engine now parses this, drop allowDiagnostics`);
    } else {
      check(tc, `#${tc.id} no diagnostics`, result.diagnostics.length === 0, diagnostics);
    }

    // 3. KaTeX validity - every rendered line, always (loadKatex threw if it
    //    could not be resolved, so there is no "no katex" branch here).
    for (const line of result.latexLines) {
      katexChecked++;
      let error = null;
      try {
        const html = katex.renderToString(line.latex, { throwOnError: true, strict: false, trust: true });
        if (html.includes('katex-error')) error = 'katex-error span in output';
      } catch (e) {
        error = e.message;
      }
      check(tc, `#${tc.id} katex`, error === null, `${error}\n      latex: ${line.latex}`);
    }
  }

  console.log('Category Summary:');
  console.log('─'.repeat(60));
  for (const [category, stats] of categories) {
    const total = stats.passed + stats.failed;
    const ok = stats.failed === 0;
    console.log(`${ok ? GREEN + '✓' : RED + '✗'}${RESET} ${category.padEnd(18)} ${stats.passed}/${total} checks passed`);
  }

  const frozen = CORPUS.filter((c) => c.latex !== undefined).length;
  console.log('\n' + '═'.repeat(60));
  console.log(`Corpus: ${CORPUS.length} inputs (${CORPUS.length - frozen} legacy goldens kept, ${frozen} frozen v2 goldens)`);
  console.log(`KaTeX:  ${katexChecked} rendered lines validated`);
  console.log(`Total:  ${passed}/${passed + failed} checks passed`);

  if (failed > 0) {
    console.log(`\n${RED}${failed} FAILED:${RESET}\n`);
    for (const f of failures) {
      console.log(`  ${f.label} [${f.category}]`);
      console.log(`    input:  ${f.input}`);
      if (f.detail) console.log(`    ${f.detail}`);
      console.log('');
    }
  } else {
    console.log(`\n${GREEN}✓ All checks passed!${RESET}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) await main();
