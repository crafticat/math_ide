/**
 * Hand-curated display content for the Help dialog (SyntaxHelpDialog.tsx via
 * generateSyntaxReference() below). This is NOT read by the compiler -
 * services/engine/ never imports this file - so nothing here is kept in sync
 * automatically, and an entry can silently drift from what compile() actually
 * produces if it is edited (or left un-edited) carelessly.
 *
 * For the verified language reference - every example checked example-by-
 * example against the real compile() output - see docs/mathscript-spec.md.
 * When in doubt about what MathScript really does, that file is the source
 * of truth, not this one.
 */

// Symbol mappings (keyword -> LaTeX)
export const symbolMap: Record<string, string> = {
  // Quantifiers & Logic
  'exists': '\\exists',
  'forall': '\\forall',
  'in': '\\in',
  'notin': '\\notin',
  'subset': '\\subset',
  'union': '\\cup',
  'intersect': '\\cap',
  'implies': '\\implies',
  'iff': '\\iff',
  'suchthat': '\\text{ s.t. }',
  'AND': '\\land',
  'OR': '\\lor',
  'NOT': '\\neg',
  'and': '\\land',
  'or': '\\lor',
  'not': '\\neg',

  // Operators
  '->': '\\to',
  '=>': '\\implies',
  '<=>': '\\iff',
  '!=': '\\neq',
  '<=': '\\le',
  '>=': '\\ge',
  '+-': '\\pm',
  '-+': '\\mp',
  'dot': '\\cdot',
  // A '|' with no partner bar reads as "divides", not absolute value - see
  // the 'a | b' entry in basicMathPatterns below.
  '|': '\\mid',

  // Special
  'inf': '\\infty',
  'QED': '\\blacksquare',

  // PDE/Calculus
  'partial': '\\partial',
  'eps': '\\varepsilon',

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
};

// Greek letters
export const greekLetters: Record<string, string> = {
  // Lowercase
  'alpha': '\\alpha',
  'beta': '\\beta',
  'gamma': '\\gamma',
  'delta': '\\delta',
  'epsilon': '\\epsilon',
  'zeta': '\\zeta',
  'eta': '\\eta',
  'theta': '\\theta',
  'iota': '\\iota',
  'kappa': '\\kappa',
  'lambda': '\\lambda',
  'mu': '\\mu',
  'nu': '\\nu',
  'xi': '\\xi',
  'pi': '\\pi',
  'rho': '\\rho',
  'sigma': '\\sigma',
  'tau': '\\tau',
  'upsilon': '\\upsilon',
  'phi': '\\phi',
  'chi': '\\chi',
  'psi': '\\psi',
  'omega': '\\omega',
  // Uppercase
  'Delta': '\\Delta',
  'Gamma': '\\Gamma',
  'Theta': '\\Theta',
  'Lambda': '\\Lambda',
  'Sigma': '\\Sigma',
  'Omega': '\\Omega',
  'Pi': '\\Pi',
  'Phi': '\\Phi',
  'Psi': '\\Psi',
  'Xi': '\\Xi',
};

// Math package constants
export const mathPackage: Record<string, string> = {
  'Math.pi': '\\pi',
  'Math.e': 'e',
  'Math.inf': '\\infty',
  'Math.reals': '\\mathbb{R}',
  'Math.naturals': '\\mathbb{N}',
  'Math.integers': '\\mathbb{Z}',
  'Math.rationals': '\\mathbb{Q}',
  'Math.complex': '\\mathbb{C}',
};

// Trig and math functions
export const mathFunctions = [
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp',
];

// Document scopes
export const boldScopes = ['Problem', 'Theorem', 'Lemma', 'Definition', 'Corollary', 'Proposition', 'Case', 'Section', 'Part', 'Subproblem'];
export const italicScopes = ['Proof', 'Claim', 'Remark', 'Example'];

// Function syntax patterns
export const functionPatterns: { syntax: string; output: string; description: string }[] = [
  { syntax: 'sqrt(x)', output: '\\sqrt{x}', description: 'Square root' },
  { syntax: 'floor(x)', output: '\\lfloor x \\rfloor', description: 'Floor function' },
  { syntax: 'ceil(x)', output: '\\lceil x \\rceil', description: 'Ceiling function' },
  { syntax: 'vec(v)', output: '\\vec{v}', description: 'Vector arrow' },
  { syntax: 'hat(x)', output: '\\hat{x}', description: 'Hat accent' },
  { syntax: 'bar(x)', output: '\\bar{x}', description: 'Bar accent' },
  { syntax: 'tilde(x)', output: '\\tilde{x}', description: 'Tilde accent' },
  { syntax: 'factorial(n)', output: 'n!', description: 'Factorial' },
  { syntax: 'choose(n, k)', output: '\\binom{n}{k}', description: 'Binomial coefficient' },
  { syntax: 'integral(a -> b)', output: '\\int_{a}^{b}', description: 'Definite integral' },
  { syntax: 'sum(i=1 -> n)', output: '\\sum_{i=1}^{n}', description: 'Summation' },
  { syntax: 'lim(x -> 0)', output: '\\lim_{x \\to 0}', description: 'Limit' },
];

// Environment patterns (cases, matrix)
export const environmentPatterns: { syntax: string; output: string; description: string }[] = [
  { syntax: 'cases { a; b; c }', output: '\\begin{cases}a \\\\ b \\\\ c\\end{cases}', description: 'Piecewise cases' },
  { syntax: 'matrix([[a,b],[c,d]])', output: '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}', description: 'Matrix (parens)' },
  { syntax: 'bmatrix([[a,b],[c,d]])', output: '\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}', description: 'Matrix (brackets)' },
  { syntax: 'vmatrix([[a,b],[c,d]])', output: '\\begin{vmatrix}a & b \\\\ c & d\\end{vmatrix}', description: 'Determinant' },
];

// Geometry function patterns
export const geometryFunctionPatterns: { syntax: string; output: string; description: string }[] = [
  { syntax: 'overline(AB)', output: '\\overline{AB}', description: 'Line segment' },
  { syntax: 'ray(AB)', output: '\\overrightarrow{AB}', description: 'Ray' },
  { syntax: 'arc(AB)', output: '\\overset{\\frown}{AB}', description: 'Arc' },
];

// Basic math patterns
export const basicMathPatterns: { syntax: string; output: string; description: string }[] = [
  { syntax: 'a/b', output: '\\frac{a}{b}', description: 'Fraction' },
  { syntax: '(a+b)/(c+d)', output: '\\frac{a+b}{c+d}', description: 'Complex fraction' },
  { syntax: 'x^2', output: 'x^{2}', description: 'Superscript/power' },
  { syntax: 'x^(1/n)', output: 'x^{\\frac{1}{n}}', description: 'Fractional exponent' },
  { syntax: 'x_i', output: 'x_{i}', description: 'Subscript' },
  { syntax: 'x_ij', output: 'x_{ij}', description: 'Multi-char subscript' },
  { syntax: '|x|', output: '\\left|x\\right|', description: 'Absolute value' },
  // A '|' with no partner bar ahead in the same clause reads as "divides"
  // instead of absolute value (docs/mathscript-spec.md, "Absolute value and
  // divides"). This replaces an earlier entry that claimed the word
  // "divides" itself compiles to '\text{divides}' - it doesn't; an ordinary
  // word next to variables renders glued with no spacing (a known
  // limitation, see docs/mathscript-spec.md). The '|' spelling below is what
  // actually produces clean "divides" notation.
  { syntax: 'a | b', output: 'a \\mid b', description: 'Divides (no partner bar)' },
  { syntax: '<1, 2, 3>', output: '\\langle 1, 2, 3 \\rangle', description: 'Vector notation' },
];

// Generate syntax reference categories for the help dialog
export interface SyntaxItem {
  syntax: string;
  output: string;
  description?: string;
}

export interface SyntaxCategory {
  title: string;
  items: SyntaxItem[];
}

export function generateSyntaxReference(): SyntaxCategory[] {
  return [
    {
      title: 'Basic Math',
      items: basicMathPatterns,
    },
    {
      title: 'Functions',
      items: [
        ...mathFunctions.map(fn => ({
          syntax: `${fn}(x)`,
          output: `\\${fn}(x)`,
          description: fn.charAt(0).toUpperCase() + fn.slice(1),
        })),
        ...functionPatterns.filter(p =>
          !['integral', 'sum', 'lim'].some(c => p.syntax.startsWith(c))
        ),
      ],
    },
    {
      title: 'Calculus',
      items: [
        ...functionPatterns.filter(p =>
          ['integral', 'sum', 'lim'].some(c => p.syntax.startsWith(c))
        ),
        { syntax: 'partial', output: symbolMap['partial'], description: 'Partial derivative' },
        { syntax: 'eps', output: symbolMap['eps'], description: 'Epsilon (shorthand)' },
      ],
    },
    {
      title: 'Environments',
      items: environmentPatterns,
    },
    {
      title: 'Greek Letters',
      items: [
        { syntax: 'alpha, beta, gamma', output: '\\alpha, \\beta, \\gamma' },
        { syntax: 'delta, epsilon, theta', output: '\\delta, \\epsilon, \\theta' },
        { syntax: 'lambda, sigma, omega', output: '\\lambda, \\sigma, \\omega' },
        { syntax: 'pi, phi, psi', output: '\\pi, \\phi, \\psi' },
        { syntax: 'mu, nu, rho, tau', output: '\\mu, \\nu, \\rho, \\tau' },
        { syntax: 'Delta, Gamma, Sigma', output: '\\Delta, \\Gamma, \\Sigma', description: 'Uppercase' },
      ],
    },
    {
      title: 'Math Constants',
      items: Object.entries(mathPackage).map(([syntax, output]) => ({
        syntax,
        output,
        description: syntax.replace('Math.', '').charAt(0).toUpperCase() + syntax.replace('Math.', '').slice(1),
      })),
    },
    {
      title: 'Logic & Quantifiers',
      items: [
        { syntax: 'forall', output: symbolMap['forall'], description: 'For all' },
        { syntax: 'exists', output: symbolMap['exists'], description: 'There exists' },
        { syntax: 'AND', output: symbolMap['AND'], description: 'Logical and' },
        { syntax: 'OR', output: symbolMap['OR'], description: 'Logical or' },
        { syntax: 'NOT', output: symbolMap['NOT'], description: 'Logical not' },
        { syntax: '=>', output: symbolMap['=>'], description: 'Implies' },
        { syntax: '<=>', output: symbolMap['<=>'], description: 'If and only if' },
        { syntax: 'suchthat', output: symbolMap['suchthat'], description: 'Such that' },
      ],
    },
    {
      title: 'Sets',
      items: [
        { syntax: 'in', output: symbolMap['in'], description: 'Element of' },
        { syntax: 'notin', output: symbolMap['notin'], description: 'Not element of' },
        { syntax: 'subset', output: symbolMap['subset'], description: 'Subset' },
        { syntax: 'union', output: symbolMap['union'], description: 'Union' },
        { syntax: 'intersect', output: symbolMap['intersect'], description: 'Intersection' },
        { syntax: '{x in R : x > 0}', output: '\\{x \\in R \\mid x > 0\\}', description: 'Set builder' },
      ],
    },
    {
      title: 'Geometry',
      items: [
        { syntax: 'perp', output: symbolMap['perp'], description: 'Perpendicular' },
        { syntax: 'parallel', output: symbolMap['parallel'], description: 'Parallel' },
        { syntax: 'angle', output: symbolMap['angle'], description: 'Angle' },
        { syntax: 'triangle', output: symbolMap['triangle'], description: 'Triangle' },
        { syntax: 'congruent', output: symbolMap['congruent'], description: 'Congruent' },
        { syntax: 'similar', output: symbolMap['similar'], description: 'Similar' },
        { syntax: 'degree', output: symbolMap['degree'], description: 'Degree' },
        ...geometryFunctionPatterns,
      ],
    },
    {
      title: 'Comparisons & Operators',
      items: [
        { syntax: '<=', output: symbolMap['<='], description: 'Less than or equal' },
        { syntax: '>=', output: symbolMap['>='], description: 'Greater than or equal' },
        { syntax: '!=', output: symbolMap['!='], description: 'Not equal' },
        { syntax: '+-', output: symbolMap['+-'], description: 'Plus-minus' },
        { syntax: '-+', output: symbolMap['-+'], description: 'Minus-plus' },
        { syntax: 'inf', output: symbolMap['inf'], description: 'Infinity' },
        { syntax: 'QED', output: symbolMap['QED'], description: 'End of proof' },
      ],
    },
    {
      title: 'Document Structure',
      items: [
        ...boldScopes.slice(0, 6).map(scope => ({
          syntax: `${scope} Name { ... }`,
          output: '',
          description: `${scope} block (bold)`,
        })),
        ...italicScopes.map(scope => ({
          syntax: `${scope} { ... }`,
          output: '',
          description: `${scope} block (italic)`,
        })),
        { syntax: '// comment', output: '', description: 'Single-line comment' },
        { syntax: '#define short long', output: '', description: 'Macro definition' },
      ],
    },
  ];
}
