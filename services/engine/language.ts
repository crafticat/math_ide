// Language tables for MathBrain Engine v2.
//
// These are data-only ports of the tables baked into the regex-cascade
// compiler at `services/compiler.ts`. Every entry from the source tables is
// preserved exactly (no renames, no drops, no value changes) so the new
// engine starts from the same vocabulary as the old one. Provenance for each
// export is noted with the approximate line range in compiler.ts it was
// ported from.

// ---- SYMBOL_MAP ----
// Ported from compiler.ts `symbolMap` (lines ~106-158). Every entry kept.
export const SYMBOL_MAP: Record<string, string> = {
  'integral': '\\int',
  'sum': '\\sum',
  'exists': '\\exists',
  'forall': '\\forall',
  'in': '\\in',
  'notin': '\\notin',
  'subset': '\\subset',
  'union': '\\cup',
  'intersect': '\\cap',
  'implies': '\\implies',
  'iff': '\\iff',
  '->': '\\to',
  '=>': '\\implies',
  '<=>': '\\iff',
  '!=': '\\neq',
  '<=': '\\le',
  '>=': '\\ge',
  '+-': '\\pm',
  '-+': '\\mp',
  'dot': '\\cdot',
  'inf': '\\infty',
  'suchthat': '\\text{ s.t. }',
  'QED': '\\quad \\blacksquare',
  '|': '\\mid',
  'AND': '\\land',
  'OR': '\\lor',
  'NOT': '\\neg',
  'and': '\\land',
  'or': '\\lor',
  'not': '\\neg',
  // NOTE: greek entries below are legacy-inherited duplicates of GREEK. GREEK is authoritative for greek lookup; these stay only for exact-port fidelity and are asserted identical in tests. Collapse once engine lookup order is final.
  // Greek
  'delta': '\\delta', 'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'epsilon': '\\epsilon',
  'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma', 'omega': '\\omega', 'pi': '\\pi',
  'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho', 'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta',
  'Delta': '\\Delta', 'Gamma': '\\Gamma', 'Theta': '\\Theta', 'Lambda': '\\Lambda',
  'Sigma': '\\Sigma', 'Omega': '\\Omega', 'Pi': '\\Pi', 'Phi': '\\Phi',
  // Geometry
  'perp': '\\perp',
  'parallel': '\\parallel',
  'angle': '\\angle',
  'measuredangle': '\\measuredangle',
  'sphericalangle': '\\sphericalangle',
  'rightangle': '\\measuredangle',
  'degree': '^{\\circ}',
  'congruent': '\\cong',
  'similar': '\\sim',
  'corresponds': '\\triangleq',
  'triangle': '\\triangle',
  // PDE/Calculus
  'partial': '\\partial',
  'eps': '\\varepsilon',
};

// ---- GREEK ----
// Ported from compiler.ts `greekLetters` (lines ~510-518), plus eps/partial/inf
// which are not part of that table in compiler.ts but are required here.
export const GREEK: Record<string, string> = {
  'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
  'epsilon': '\\epsilon', 'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma',
  'omega': '\\omega', 'pi': '\\pi', 'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho',
  'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta', 'chi': '\\chi', 'psi': '\\psi',
  'nu': '\\nu', 'kappa': '\\kappa', 'iota': '\\iota', 'xi': '\\xi', 'upsilon': '\\upsilon',
  'Delta': '\\Delta', 'Gamma': '\\Gamma', 'Theta': '\\Theta', 'Lambda': '\\Lambda',
  'Sigma': '\\Sigma', 'Omega': '\\Omega', 'Pi': '\\Pi', 'Phi': '\\Phi', 'Psi': '\\Psi', 'Xi': '\\Xi',
  // Additions beyond compiler.ts's greekLetters table
  'eps': '\\varepsilon',
  'partial': '\\partial',
  'inf': '\\infty',
};

// ---- MATH_KEYWORDS ----
// Ported from compiler.ts `mathKeywords` (lines ~58-70). Every entry kept.
export const MATH_KEYWORDS: Set<string> = new Set([
  'integral', 'sum', 'lim', 'sup', 'inf', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sqrt',
  'floor', 'ceil', 'partial', 'eps',
  'exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'implies', 'iff', 'suchthat',
  'AND', 'OR', 'NOT',
  'delta', 'alpha', 'beta', 'gamma', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi', 'mu', 'phi', 'rho', 'tau', 'zeta', 'eta', 'chi', 'psi', 'nu', 'kappa', 'iota', 'xi', 'upsilon',
  'Delta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Omega', 'Pi', 'Phi', 'Psi', 'Xi',
  'dx', 'dy', 'dz', 'dt', 'du', 'dv',
  'QED', 'Math', 'det', 'max', 'min',
  // Geometry
  'perp', 'parallel', 'angle', 'measuredangle', 'sphericalangle', 'rightangle',
  'degree', 'congruent', 'triangle', 'corresponds',
]);

// ---- STOP_WORDS ----
// Union of compiler.ts `textStopWords` (~lines 171-180), `proseIndicatorsBefore`
// (~lines 73-83) and `proseIndicatorsAfter` (~lines 86-96). Each source list is
// kept below (unexported) for traceability; STOP_WORDS is their set union.
const TEXT_STOP_WORDS = [
  'is', 'the', 'of', 'if', 'then', 'else', 'for', 'with',
  'to', 'on', 'at', 'by', 'be', 'let', 'assume', 'suppose', 'since', 'because', 'therefore', 'thus', 'hence',
  'so', 'we', 'have', 'show', 'prove', 'find', 'calculate', 'compute', 'given', 'where', 'when', 'that', 'this', 'it',
  'continuous', 'differentiable', 'integrable', 'bounded', 'converges', 'diverges', 'function', 'set', 'sequence', 'series',
  'exist', 'non', 'empty', 'no', 'any', 'can', 'there', 'but', 'also', 'only', 'either', 'neither',
  'does', 'do', 'has', 'are', 'was', 'were', 'been', 'being',
  'may', 'might', 'could', 'would', 'should', 'must', 'shall', 'will',
  'true', 'false', 'yes', 'no', 'both', 'all', 'some', 'each', 'every', 'none',
];

const PROSE_INDICATORS_BEFORE = [
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'could', 'may', 'might', 'will', 'would', 'shall', 'should', 'must',
  'let', 'assume', 'suppose', 'show', 'prove', 'find', 'define', 'solve', 'simplify',
  'calculate', 'compute', 'determine', 'verify', 'check',
  'both', 'either', 'neither', 'whether', 'if', 'when', 'where', 'while',
  'sets', 'functions', 'matrices', 'vectors', 'numbers', 'integers', 'values',
  'continuous', 'bounded', 'positive', 'negative', 'equal', 'zero',
  'true', 'false', 'yes', 'no', 'one', 'more', 'two', 'all', 'any', 'some',
];

const PROSE_INDICATORS_AFTER = [
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'exist', 'exists',
  'can', 'could', 'may', 'might', 'will', 'would', 'shall', 'should', 'must',
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'continuous', 'differentiable', 'integrable', 'bounded', 'convergent', 'divergent',
  'positive', 'negative', 'zero', 'equal', 'defined', 'undefined',
  'finite', 'infinite', 'empty', 'non', 'greater', 'smaller', 'less',
  'only', 'both', 'always', 'necessarily', 'limited', 'similar',
  'simplify', 'solve', 'disprove', 'integers', 'real', 'complex',
];

export const STOP_WORDS: Set<string> = new Set([
  ...TEXT_STOP_WORDS,
  ...PROSE_INDICATORS_BEFORE,
  ...PROSE_INDICATORS_AFTER,
]);

// ---- FUNCTIONS ----
// New table for the v2 engine (not a 1:1 structural port — compiler.ts encodes
// this as scattered regex handlers rather than a single table). Names mirror
// the functions compiler.ts recognizes, plus gcd/lcm/det/max/min for the new
// 'var'-arity named-function class.
export const FUNCTIONS: Record<string, { arity: number | 'var'; kind: 'named' | 'accent' | 'delim' | 'big' | 'matrix' }> = {
  // named, variadic
  sin: { arity: 'var', kind: 'named' },
  cos: { arity: 'var', kind: 'named' },
  tan: { arity: 'var', kind: 'named' },
  sec: { arity: 'var', kind: 'named' },
  csc: { arity: 'var', kind: 'named' },
  cot: { arity: 'var', kind: 'named' },
  arcsin: { arity: 'var', kind: 'named' },
  arccos: { arity: 'var', kind: 'named' },
  arctan: { arity: 'var', kind: 'named' },
  sinh: { arity: 'var', kind: 'named' },
  cosh: { arity: 'var', kind: 'named' },
  tanh: { arity: 'var', kind: 'named' },
  log: { arity: 'var', kind: 'named' },
  ln: { arity: 'var', kind: 'named' },
  exp: { arity: 'var', kind: 'named' },
  det: { arity: 'var', kind: 'named' },
  max: { arity: 'var', kind: 'named' },
  min: { arity: 'var', kind: 'named' },
  gcd: { arity: 'var', kind: 'named' },
  lcm: { arity: 'var', kind: 'named' },
  // accents, arity 1
  hat: { arity: 1, kind: 'accent' },
  bar: { arity: 1, kind: 'accent' },
  tilde: { arity: 1, kind: 'accent' },
  vec: { arity: 1, kind: 'accent' },
  overline: { arity: 1, kind: 'accent' },
  ray: { arity: 1, kind: 'accent' },
  arc: { arity: 1, kind: 'accent' },
  // delimiters, arity 1
  floor: { arity: 1, kind: 'delim' },
  ceil: { arity: 1, kind: 'delim' },
  sqrt: { arity: 1, kind: 'delim' },
  abs: { arity: 1, kind: 'delim' },
  // big operators, arity 1
  sum: { arity: 1, kind: 'big' },
  integral: { arity: 1, kind: 'big' },
  lim: { arity: 1, kind: 'big' },
  // matrix-like environments, arity 1
  matrix: { arity: 1, kind: 'matrix' },
  bmatrix: { arity: 1, kind: 'matrix' },
  vmatrix: { arity: 1, kind: 'matrix' },
  cases: { arity: 1, kind: 'matrix' },
  // named, fixed arity
  choose: { arity: 2, kind: 'named' },
  factorial: { arity: 1, kind: 'named' },
};

// ---- SCOPES ----
// Ported from compiler.ts's scope regex (~line 270) and its `italicScopes`
// set (~line 277): Proof/Claim/Remark/Example render italic, the rest bold.
export const SCOPES: Record<string, 'bold' | 'italic'> = {
  Problem: 'bold',
  Subproblem: 'bold',
  Section: 'bold',
  Part: 'bold',
  Theorem: 'bold',
  Case: 'bold',
  Lemma: 'bold',
  Definition: 'bold',
  Corollary: 'bold',
  Proposition: 'bold',
  Proof: 'italic',
  Claim: 'italic',
  Remark: 'italic',
  Example: 'italic',
};

// ---- MATH_PACKAGE ----
// Ported from compiler.ts `mathPackage` (lines ~161-166). Every entry kept.
export const MATH_PACKAGE: Record<string, string> = {
  'Math.pi': '\\pi',
  'Math.e': 'e',
  'Math.inf': '\\infty',
  'Math.reals': '\\mathbb{R}',
  'Math.naturals': '\\mathbb{N}',
  'Math.integers': '\\mathbb{Z}',
  'Math.rationals': '\\mathbb{Q}',
  'Math.complex': '\\mathbb{C}',
};

// ---- RELATION_WORDS ----
// feeds the Relation.ops whitelist in types.ts (words usable as n-ary relation operators)
export const RELATION_WORDS: Set<string> = new Set([
  'in', 'notin', 'subset', 'congruent', 'similar', 'parallel', 'perp', 'corresponds',
]);
