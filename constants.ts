

export const INITIAL_CONTENT = `// MathBrain IDE v1.4
// Example: Intermediate Value Theorem Proof

Problem Intermediate Value Theorem {
  
  Theorem IVT {
    Let f be a continuous function on the closed interval [a, b]
    Let y be any value between f(a) and f(b)
    
    Then there exists c in [a, b] suchthat f(c) = y
  }

  Proof {
    // Assume f(a) < y < f(b) without loss of generality
    Let S = { x in [a, b] | f(x) < y }
    
    1. S is non-empty because a in S (since f(a) < y)
    2. S is bounded above by b
    
    Therefore by the Completeness Axiom
    Let c = sup(S)
    
    We claim that f(c) = y
    
    Case 1 (Assumption f(c) < y) {
       Since f is continuous at c
       there exists delta > 0 suchthat f(x) < y forall x in (c - delta, c + delta)
       
       This implies there exists x > c with x in S
       But c = sup(S) therefore this is a contradiction
    }

    Case 2 (Assumption f(c) > y) {
       Since f is continuous at c
       there exists delta > 0 suchthat f(x) > y forall x in (c - delta, c + delta)
       
       This implies that no x in (c - delta, c) can be in S
       Thus c - delta is an upper bound for S
       
       But c = sup(S) is the least upper bound
       Contradiction
    }
    
    Therefore f(c) = y
    QED
  }
}
`;

// Academic Sepia Dark Theme - Scholarly, warm charcoal tones
export const DARK_THEME = {
  // Backgrounds
  bg: '#1a1816',              // Deep warm charcoal (main editor)
  sidebar: '#141210',         // Darker sidebar
  panel: '#221f1c',           // Panels/dropdowns
  surface: '#2a2724',         // Elevated surfaces
  topBar: '#0f0e0d',          // Header bar (darkest)

  // Borders & dividers
  border: '#3d3835',          // Subtle warm borders
  borderStrong: '#524b45',    // Emphasized borders

  // Text hierarchy
  text: '#e8e4df',            // Primary text (warm white)
  textDim: '#a89f94',         // Secondary text (was textDim)
  textMuted: '#706760',       // Muted/disabled

  // Accent colors - scholarly gold
  accent: '#c9a227',          // Gold (primary accent)
  accentHover: '#dbb638',     // Brighter gold
  accentSecondary: '#7a9e7a', // Sage green

  // Interactive states
  activeItem: '#2a2724',      // List selection
  selection: '#3d3530',       // Text selection
  menuHover: '#2a2724',       // Menu hover
  lineNumbers: '#706760',     // Line numbers

  // Popups
  popup: '#221f1c',           // Autocomplete bg
  popupBorder: '#3d3835',     // Popup border
  popupActive: '#3d3530',     // Autocomplete selection

  // Syntax highlighting (for Editor.tsx)
  syntax: {
    keyword: '#d4a373',       // Warm amber (Problem, Theorem, Proof)
    function: '#a8c686',      // Sage green (integral, sum, sqrt)
    symbol: '#87aecd',        // Soft blue (exists, forall, in)
    greek: '#d4a5a5',         // Dusty rose (alpha, beta, delta)
    number: '#b8c4a0',        // Muted green
    comment: '#6b6358',       // Warm gray
    string: '#c9a227',        // Gold
    operator: '#d4a373',      // Warm amber
    bracket: '#c9a227',       // Gold brackets
  },

  // Status colors
  error: '#c75d5d',           // Muted red
  warning: '#c9a227',         // Gold
  success: '#7a9e7a',         // Sage
  info: '#87aecd',            // Soft blue
};

// Academic Sepia Light Theme - Parchment/paper tones
export const LIGHT_THEME = {
  // Backgrounds
  bg: '#faf7f2',              // Warm off-white (like aged paper)
  sidebar: '#f0ebe3',         // Slightly darker parchment
  panel: '#ffffff',           // Pure white panels
  surface: '#f5f1ea',         // Elevated surfaces
  topBar: '#e8e3db',          // Header bar

  // Borders
  border: '#d9d2c7',          // Warm gray borders
  borderStrong: '#c4bab0',    // Emphasized borders

  // Text
  text: '#2c2825',            // Dark warm brown
  textDim: '#5c5550',         // Secondary text
  textMuted: '#8a8278',       // Muted/disabled

  // Accents
  accent: '#8b6914',          // Darker gold for contrast
  accentHover: '#a47d1a',     // Brighter gold
  accentSecondary: '#4a7a4a', // Forest green

  // Interactive states
  activeItem: '#e8e3db',      // List selection
  selection: '#e8dcc8',       // Text selection
  menuHover: '#f0ebe3',       // Menu hover
  lineNumbers: '#8a8278',     // Line numbers

  // Popups
  popup: '#ffffff',           // Autocomplete bg
  popupBorder: '#d9d2c7',     // Popup border
  popupActive: '#e8dcc8',     // Autocomplete selection

  // Syntax highlighting
  syntax: {
    keyword: '#8b5a2b',       // Brown amber
    function: '#4a7a4a',      // Forest green
    symbol: '#4a6a8a',        // Slate blue
    greek: '#8b4a4a',         // Dusty rose
    number: '#4a6a4a',        // Dark green
    comment: '#8a8278',       // Warm gray
    string: '#8b6914',        // Gold
    operator: '#8b5a2b',      // Brown amber
    bracket: '#8b6914',       // Gold brackets
  },

  // Status colors
  error: '#a04040',           // Muted red
  warning: '#8b6914',         // Gold
  success: '#4a7a4a',         // Forest green
  info: '#4a6a8a',            // Slate blue
};

// Legacy THEME export for compatibility (Tailwind classes)
export const THEME = {
  bg: 'bg-[#1e1e1e]',          // Editor Background
  sidebar: 'bg-[#252526]',     // Sidebar Background
  panel: 'bg-[#2d2d2d]',       // Dropdowns/Panels
  border: 'border-[#333333]',  // Borders
  text: 'text-[#d4d4d4]',      // Main Text
  textDim: 'text-[#858585]',   // Comments/Dimmed
  accent: 'bg-[#007acc]',      // Status Bar Blue
  accentHover: 'hover:bg-[#0062a3]',
  activeItem: 'bg-[#37373d]',  // List selection
  selection: 'bg-[#264f78]',   // Text selection
  lineNumbers: 'text-[#858585]',
  popup: 'bg-[#252526]',       // Autocomplete bg
  popupBorder: 'border-[#454545]',
  popupActive: 'bg-[#04395e]', // Autocomplete selection
};

export const DEFAULT_FILE_CONTENT = `// MathScript Example - Feature Showcase
// This file demonstrates the key features of MathScript syntax

Problem Calculus Fundamentals {

  // === BASIC MATH NOTATION ===

  Let f(x) = x^2 + 2x + 1
  Let g(x) = (x + 1)^2

  Therefore f(x) = g(x) forall x in Math.reals

  // === FRACTIONS ===

  The derivative is f'(x) = (2x + 2)/1 = 2(x + 1)

  A complex fraction: ((a + b)/(c + d)) / ((e + f)/(g + h))

  // === INTEGRALS AND LIMITS ===

  Theorem Fundamental Theorem {
    Let F(x) = integral(a -> x) f(t) dt

    Then F'(x) = f(x)

    And lim_(h -> 0) (F(x + h) - F(x))/h = f(x)
  }

  // === SUMMATIONS ===

  Lemma Geometric Series {
    sum(k=0 -> n) r^k = (1 - r^(n+1))/(1 - r) for r != 1
  }

  // === LOGIC AND QUANTIFIERS ===

  Proof {
    Assume exists x suchthat P(x) AND Q(x)

    Case 1 (P(x) implies R(x)) {
      Since P(x) => R(x)
      Therefore R(x) holds
    }

    Case 2 (NOT P(x)) {
      This leads to a contradiction
    }

    Therefore forall x, P(x) OR NOT Q(x)
    QED
  }

  // === GREEK LETTERS ===

  Let epsilon > 0 be arbitrary
  Choose delta = epsilon / (2 * pi)
  Then alpha + beta = gamma

  // === SET THEORY ===

  Let A subset B
  Let x in A union C
  Then x in B union C

  If x notin A intersect B
  Then x notin A OR x notin B

  // === SPECIAL OPERATORS ===

  The solution is x = +- sqrt(b^2 - 4ac) / 2a

  We have a <=> b iff a => b AND b => a

  Since a <= b AND b >= c
  Therefore a != c OR a = c

  // === MATH CONSTANTS ===

  e^(i * Math.pi) + 1 = 0

  The area is Math.pi * r^2

  sqrt(2) is in Math.reals but not in Math.rationals
}
`;

export const AUTOCOMPLETE_DATA = [
    // Scopes / Headers - $0 marks cursor position
    { label: 'Problem', type: 'keyword', insert: 'Problem $0 {\n  \n}', cursorOffset: -5 },
    { label: 'Theorem', type: 'keyword', insert: 'Theorem $0 {\n  \n}', cursorOffset: -5 },
    { label: 'Proof', type: 'keyword', insert: 'Proof {\n  $0\n}', cursorOffset: -2 },
    { label: 'Case', type: 'keyword', insert: 'Case $0 {\n  \n}', cursorOffset: -5 },
    { label: 'Lemma', type: 'keyword', insert: 'Lemma $0 {\n  \n}', cursorOffset: -5 },
    { label: 'Let', type: 'keyword', insert: 'Let $0' },

    // Logic Symbols
    { label: 'exists', type: 'keyword', insert: 'exists ' },
    { label: 'forall', type: 'keyword', insert: 'forall ' },
    { label: 'suchthat', type: 'keyword', insert: 'suchthat ' },
    { label: 'implies', type: 'operator', insert: '=>' },
    { label: 'iff', type: 'operator', insert: '<=>' },
    { label: 'plusminus', type: 'operator', insert: '+-' },
    { label: 'minusplus', type: 'operator', insert: '-+' },
    { label: 'AND', type: 'operator', insert: 'AND ' },
    { label: 'OR', type: 'operator', insert: 'OR ' },
    { label: 'NOT', type: 'operator', insert: 'NOT ' },
    { label: 'QED', type: 'keyword', insert: 'QED' },

    // Calc / Analysis - $0 marks cursor position
    { label: 'sup', type: 'function', insert: 'sup' },
    { label: 'inf', type: 'function', insert: 'inf' },
    { label: 'lim', type: 'function', insert: 'lim_($0 -> )' },
    { label: 'integral', type: 'keyword', insert: 'integral($0 -> )' },
    { label: 'sum', type: 'keyword', insert: 'sum($0 -> )' },
    { label: 'sqrt', type: 'function', insert: 'sqrt($0)' },
    { label: 'vec', type: 'function', insert: 'vec($0)' },
    { label: 'frac', type: 'function', insert: '($0)/()' },
    
    // Set Theory
    { label: 'in', type: 'operator', insert: 'in' },
    { label: 'notin', type: 'operator', insert: 'notin' },
    { label: 'subset', type: 'operator', insert: 'subset' },
    { label: 'union', type: 'operator', insert: 'union' },
    { label: 'intersect', type: 'operator', insert: 'intersect' },
    
    // Common Words
    { label: 'because', type: 'text', insert: 'because' },
    { label: 'since', type: 'text', insert: 'since' },
    { label: 'therefore', type: 'text', insert: 'therefore' },
    { label: 'continuous', type: 'text', insert: 'continuous' },
    { label: 'converges', type: 'text', insert: 'converges' },
    { label: 'bounded', type: 'text', insert: 'bounded' },

    // Greek (Direct)
    { label: 'delta', type: 'greek', insert: 'delta' },
    { label: 'epsilon', type: 'greek', insert: 'epsilon' },
    { label: 'alpha', type: 'greek', insert: 'alpha' },
    { label: 'beta', type: 'greek', insert: 'beta' },
    { label: 'gamma', type: 'greek', insert: 'gamma' },
    { label: 'theta', type: 'greek', insert: 'theta' },
    { label: 'lambda', type: 'greek', insert: 'lambda' },
    { label: 'sigma', type: 'greek', insert: 'sigma' },
    { label: 'omega', type: 'greek', insert: 'omega' },
    { label: 'pi', type: 'greek', insert: 'pi' },

    // Math Package
    { label: 'Math.pi', type: 'constant', insert: 'Math.pi' },
    { label: 'Math.e', type: 'constant', insert: 'Math.e' },
    { label: 'Math.inf', type: 'constant', insert: 'Math.inf' },
    { label: 'Math.reals', type: 'constant', insert: 'Math.reals' },
    { label: 'Math.naturals', type: 'constant', insert: 'Math.naturals' },
    { label: 'Math.integers', type: 'constant', insert: 'Math.integers' },
    { label: 'Math.rationals', type: 'constant', insert: 'Math.rationals' },
    { label: 'Math.complex', type: 'constant', insert: 'Math.complex' },
    { label: 'Math.sqrt', type: 'function', insert: 'Math.sqrt($0)' },
];
