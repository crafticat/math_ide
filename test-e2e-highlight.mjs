// End-to-end test for syntax highlighting
// This mirrors the EXACT logic from Editor.tsx

const DARK_THEME = {
  syntax: {
    keyword: '#d4a373',
    function: '#a8c686',
    symbol: '#87aecd',
    greek: '#d4a5a5',
    number: '#b8c4a0',
    comment: '#6b6358',
    string: '#c9a227',
    operator: '#d4a373',
    bracket: '#c9a227',
    variable: '#c4b8d4',   // Light lavender for single-letter vars
  },
  accent: '#c9a227',
  accentSecondary: '#a8c686',
  textDim: '#8b8178',
};

function highlightCode(code, theme = 'dark') {
  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const themeColors = DARK_THEME;
  const syntaxColors = themeColors.syntax;

  const colors = {
    comment: syntaxColors.comment,
    keyword: syntaxColors.keyword,
    mathSymbol: syntaxColors.symbol,
    greek: syntaxColors.greek,
    operator: syntaxColors.operator,
    number: syntaxColors.number,
    mathPackage: themeColors.accentSecondary || themeColors.accent,
    function: syntaxColors.function,
    string: syntaxColors.string,
    bracket: syntaxColors.bracket,
    variable: syntaxColors.variable || '#c4b8d4',
  };

  return code.split('\n').map((line) => {
    // 1. Comments
    if (line.trim().startsWith('//')) {
      return `<span style="color: ${colors.comment};">${escapeHtml(line)}</span>`;
    }

    // 1b. Dash subtasks
    const dashSubtaskMatch = line.match(/^(\s*)(-{1,4})(\s+)(.*)(\{)\s*$/);
    if (dashSubtaskMatch) {
      const [, indent, dashes, space, title, brace] = dashSubtaskMatch;
      return `${escapeHtml(indent)}<span style="color: ${colors.keyword};">${escapeHtml(dashes)}</span>${escapeHtml(space)}${escapeHtml(title)}<span style="color: ${colors.bracket};">${escapeHtml(brace)}</span>`;
    }

    // 1c. Show/prove pattern
    const showMatch = line.match(/^(\s*)(\?:)(\s+)(.*)(\{)\s*$/);
    if (showMatch) {
      const [, indent, qmark, space, statement, brace] = showMatch;
      return `${escapeHtml(indent)}<span style="color: ${colors.keyword};">${escapeHtml(qmark)}</span>${escapeHtml(space)}${escapeHtml(statement)}<span style="color: ${colors.bracket};">${escapeHtml(brace)}</span>`;
    }

    // 2. Preprocessor #define
    if (line.trim().startsWith('#define')) {
      const parts = line.split(/(\s+)/);
      return parts.map(part => {
        if (part.trim() === '#define') return `<span style="color: ${colors.keyword};">${escapeHtml(part)}</span>`;
        return escapeHtml(part);
      }).join('');
    }

    let processed = escapeHtml(line);

    // 2b. Mark single-letter variables with placeholders BEFORE any HTML is added
    const varPlaceholders = [];
    let varCounter = 0;
    processed = processed.replace(/(?<![a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g, (match, letter) => {
      const placeholder = `@VAR${varCounter}@`;
      varPlaceholders.push({ placeholder, letter });
      varCounter++;
      return placeholder;
    });

    // 3. Math.Package
    processed = processed.replace(/(Math)(\.)([a-zA-Z0-9_]+)/g,
      `<span style="color: ${colors.mathPackage};">$1</span><span style="color: ${themeColors.textDim};">$2</span><span style="color: ${colors.function};">$3</span>`
    );

    // 4. Scope Keywords
    const scopeKeywords = [
      'Problem', 'Subproblem', 'Part', 'Section', 'Theorem', 'Proof', 'Case', 'Lemma',
      'Definition', 'Corollary', 'Proposition', 'Remark', 'Claim', 'Example',
      'Let', 'Assume', 'Then', 'Therefore', 'Since', 'Consider', 'Given', 'Suppose',
      'Hence', 'Thus', 'And', 'If', 'Show', 'Clearly', 'Note', 'Recall', 'Define'
    ];
    scopeKeywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'g');
      processed = processed.replace(regex, `<span style="color: ${colors.keyword};">${kw}</span>`);
    });

    // 5. Math Functions
    const mathFunctions = [
      'integral', 'sum', 'prod', 'lim', 'diff',
      'sqrt', 'cbrt', 'floor', 'ceil', 'round',
      'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
      'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec', 'arccsc',
      'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
      'log', 'ln', 'exp',
      'factorial', 'choose', 'binom', 'perm',
      'max', 'min', 'sup', 'inf', 'avg', 'mean', 'median',
      'det', 'rank', 'dim', 'ker',
      'matrix', 'bmatrix', 'vmatrix', 'pmatrix',
      'hat', 'tilde', 'vec', 'dot', 'ddot', 'overline', 'underline', 'widehat', 'widetilde',
      'ray', 'angle', 'triangle',
      'gcd', 'lcm', 'mod',
      'dx', 'dy', 'dz', 'dt', 'du', 'dv', 'dr', 'dtheta',
      'cases', 'frac', 'tfrac', 'dfrac', 'partial'
    ];
    mathFunctions.forEach(fn => {
      const regex = new RegExp(`\\b${fn}\\b`, 'g');
      processed = processed.replace(regex, `<span style="color: ${colors.function};">${fn}</span>`);
    });

    // 6. Math Symbols
    const mathSymbols = ['exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'implies', 'iff', 'suchthat', 'QED', 'AND', 'OR', 'NOT', 'and', 'or', 'not', 'if'];
    mathSymbols.forEach(sym => {
      const regex = new RegExp(`\\b${sym}\\b`, 'g');
      processed = processed.replace(regex, `<span style="color: ${colors.mathSymbol};">${sym}</span>`);
    });

    // 7. Greek Letters
    const greekLetters = [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi',
      'mu', 'phi', 'rho', 'tau', 'zeta', 'eta', 'chi', 'psi', 'nu', 'kappa', 'xi',
      'Delta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Omega', 'Pi', 'Phi', 'Psi', 'Xi'
    ];
    greekLetters.forEach(letter => {
      const regex = new RegExp(`\\b${letter}\\b`, 'g');
      processed = processed.replace(regex, `<span style="color: ${colors.greek};">${letter}</span>`);
    });

    // 8. Operators
    processed = processed.replace(/(-&gt;|=&gt;|&lt;=&gt;|!=|&lt;=|&gt;=|\+-|-\+)/g,
      `<span style="color: ${colors.operator};">$1</span>`
    );

    // 9. Numbers
    processed = processed.replace(/(\b\d+\.?\d*\b)/g, `<span style="color: ${colors.number};">$1</span>`);

    // 10. Subscripts and superscripts
    processed = processed.replace(/(_)([a-zA-Z0-9]+)/g,
      `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
    );
    processed = processed.replace(/(\^)([a-zA-Z0-9]+)/g,
      `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
    );

    // 11. Brackets
    processed = processed.replace(/([()\[\]])/g, `<span style="color: ${colors.bracket};">$1</span>`);

    // 12. Restore single-letter variable placeholders with the variable color (lavender)
    varPlaceholders.forEach(({ placeholder, letter }) => {
      processed = processed.replace(placeholder, `<span style="color: ${colors.variable};">${letter}</span>`);
    });

    if (processed === '') return ' ';
    return processed;
  }).join('\n');
}

// Test cases
// Design: Variables (x, A, B) are highlighted in lavender (#c4b8d4)
// Math symbols are highlighted in blue (#87aecd) - providing visual contrast
const testCases = [
  {
    name: 'Variables highlighted in lavender, symbols in blue',
    input: 'x notin A',
    check: (result) => {
      // x and A should be highlighted in lavender (variable color)
      const hasXInLavender = result.includes(`<span style="color: #c4b8d4;">x</span>`);
      const hasAInLavender = result.includes(`<span style="color: #c4b8d4;">A</span>`);
      // notin should be highlighted in blue (symbol color)
      const hasNotinInBlue = result.includes(`<span style="color: #87aecd;">notin</span>`);
      return {
        pass: hasXInLavender && hasAInLavender && hasNotinInBlue,
        details: `x lavender: ${hasXInLavender}, A lavender: ${hasAInLavender}, notin blue: ${hasNotinInBlue}`
      };
    }
  },
  {
    name: 'Quantifiers are highlighted in blue',
    input: 'forall eps > 0 exists del > 0',
    check: (result) => {
      const hasForall = result.includes(`>forall</span>`);
      const hasExists = result.includes(`>exists</span>`);
      return {
        pass: hasForall && hasExists,
        details: `forall: ${hasForall}, exists: ${hasExists}`
      };
    }
  },
  {
    name: 'Keywords highlighted in amber, variables in lavender',
    input: 'Let f be continuous',
    check: (result) => {
      // Let keyword should be highlighted (amber)
      const hasLet = result.includes(`<span style="color: #d4a373;">Let</span>`);
      // Single letter f should be highlighted in lavender (variable color)
      const hasFInLavender = result.includes(`<span style="color: #c4b8d4;">f</span>`);
      return {
        pass: hasLet && hasFInLavender,
        details: `Let amber: ${hasLet}, f lavender: ${hasFInLavender}`
      };
    }
  },
  {
    name: 'Set operations in blue, variables in lavender',
    input: 'x notin A union B',
    check: (result) => {
      // Math symbols should be highlighted in blue
      const hasNotin = result.includes(`>notin</span>`);
      const hasUnion = result.includes(`>union</span>`);
      // Variables should be highlighted in lavender
      const hasXInLavender = result.includes(`<span style="color: #c4b8d4;">x</span>`);
      const hasAInLavender = result.includes(`<span style="color: #c4b8d4;">A</span>`);
      return {
        pass: hasNotin && hasUnion && hasXInLavender && hasAInLavender,
        details: `notin: ${hasNotin}, union: ${hasUnion}, x lavender: ${hasXInLavender}, A lavender: ${hasAInLavender}`
      };
    }
  },
  {
    name: 'No broken HTML',
    input: 'Problem Test {',
    check: (result) => {
      const noBrokenTags = !result.includes('<<') && !result.includes('>>');
      const noUnclosedSpans = (result.match(/<span/g) || []).length === (result.match(/<\/span>/g) || []).length;
      return {
        pass: noBrokenTags && noUnclosedSpans,
        details: `No broken tags: ${noBrokenTags}, Balanced spans: ${noUnclosedSpans}`
      };
    }
  },
  {
    name: 'Color contrast: lavender vars vs blue symbols vs amber operators',
    input: 'x notin A union B <=> x notin A AND x notin B',
    check: (result) => {
      // This tests the user's concern about "everything being the same color"
      // Now: variables are lavender, symbols are blue, operators are amber
      const hasNotin = result.includes(`<span style="color: #87aecd;">notin</span>`);
      const hasAND = result.includes(`<span style="color: #87aecd;">AND</span>`);
      const hasUnion = result.includes(`<span style="color: #87aecd;">union</span>`);
      const hasOperator = result.includes(`<span style="color: #d4a373;">&lt;=&gt;</span>`);
      const hasXInLavender = result.includes(`<span style="color: #c4b8d4;">x</span>`);
      return {
        pass: hasNotin && hasAND && hasUnion && hasOperator && hasXInLavender,
        details: `notin blue: ${hasNotin}, AND blue: ${hasAND}, union blue: ${hasUnion}, <=> amber: ${hasOperator}, x lavender: ${hasXInLavender}`
      };
    }
  }
];

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║       End-to-End Syntax Highlighting Tests                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

testCases.forEach((tc, i) => {
  const result = highlightCode(tc.input);
  const checkResult = tc.check(result);

  if (checkResult.pass) {
    console.log(`\x1b[32m✓\x1b[0m Test ${i + 1}: ${tc.name}`);
    passed++;
  } else {
    console.log(`\x1b[31m✗\x1b[0m Test ${i + 1}: ${tc.name}`);
    console.log(`  Input: ${tc.input}`);
    console.log(`  Details: ${checkResult.details}`);
    console.log(`  Output: ${result}`);
    failed++;
  }
});

console.log(`\n══════════════════════════════════════════════════`);
console.log(`Total: ${passed}/${passed + failed} passed`);

if (failed > 0) {
  console.log(`\n\x1b[31m${failed} tests failed!\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\n\x1b[32m✓ All tests passed!\x1b[0m`);
  process.exit(0);
}
