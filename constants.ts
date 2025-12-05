

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

// VS Code Dark+ Theme Colors
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

export const AUTOCOMPLETE_DATA = [
    // Scopes / Headers
    { label: 'Problem', type: 'keyword', insert: 'Problem  {\n\n}' },
    { label: 'Theorem', type: 'keyword', insert: 'Theorem  {\n\n}' },
    { label: 'Proof', type: 'keyword', insert: 'Proof {\n\n}' },
    { label: 'Case', type: 'keyword', insert: 'Case  {\n\n}' },

    // Logic Symbols
    { label: 'exists', type: 'keyword', insert: 'exists ' },
    { label: 'forall', type: 'keyword', insert: 'forall ' },
    { label: 'suchthat', type: 'keyword', insert: 'suchthat ' },
    { label: 'implies', type: 'operator', insert: '=>' },
    { label: 'iff', type: 'operator', insert: '<=>' },
    { label: 'QED', type: 'keyword', insert: 'QED' },

    // Calc / Analysis
    { label: 'sup', type: 'function', insert: 'sup' },
    { label: 'inf', type: 'function', insert: 'inf' },
    { label: 'lim', type: 'function', insert: 'lim' },
    { label: 'integral', type: 'keyword', insert: 'integral( -> )' },
    { label: 'sum', type: 'keyword', insert: 'sum( -> )' },
    
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
    { label: 'Math.reals', type: 'constant', insert: 'Math.reals' },
    { label: 'Math.naturals', type: 'constant', insert: 'Math.naturals' },
    { label: 'Math.integers', type: 'constant', insert: 'Math.integers' },
    { label: 'Math.sqrt', type: 'function', insert: 'Math.sqrt()' },
];
