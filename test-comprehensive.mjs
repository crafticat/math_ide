// Comprehensive test suite for MathScript compiler - ~100 test cases

const mathPackage = {
  'Math.pi': '\\pi', 'Math.e': 'e', 'Math.inf': '\\infty',
  'Math.reals': '\\mathbb{R}', 'Math.naturals': '\\mathbb{N}',
  'Math.integers': '\\mathbb{Z}', 'Math.rationals': '\\mathbb{Q}',
  'Math.complex': '\\mathbb{C}',
};

const greekLetters = {
  'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
  'epsilon': '\\epsilon', 'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma',
  'omega': '\\omega', 'pi': '\\pi', 'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho',
  'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta', 'chi': '\\chi', 'psi': '\\psi',
  'nu': '\\nu', 'kappa': '\\kappa',
  'Delta': '\\Delta', 'Gamma': '\\Gamma', 'Theta': '\\Theta', 'Lambda': '\\Lambda',
  'Sigma': '\\Sigma', 'Omega': '\\Omega', 'Pi': '\\Pi', 'Phi': '\\Phi',
};

let placeholders = [];

const addPlaceholder = (latex) => {
  const id = `__PH${placeholders.length}__`;
  placeholders.push(latex);
  return id;
};

const processContent = (content) => {
  let result = content;
  result = result.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');
  result = result.replace(/\+-/g, '\\pm');
  result = result.replace(/-\+/g, '\\mp');
  return result;
};

const findClosingParen = (str, openIndex) => {
  let depth = 1;
  for (let i = openIndex + 1; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const handleFunctionCall = (line, fnName, transformer) => {
  const pattern = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    result += line.substring(lastIndex, match.index);
    const openParen = match.index + match[0].length - 1;
    const closeParen = findClosingParen(line, openParen);

    if (closeParen !== -1) {
      const content = line.substring(openParen + 1, closeParen);
      result += transformer(content);
      lastIndex = closeParen + 1;
      pattern.lastIndex = closeParen + 1;
    } else {
      result += match[0];
      lastIndex = match.index + match[0].length;
    }
  }
  result += line.substring(lastIndex);
  return result;
};

const findMatchingParenFrom = (str, startIdx) => {
  let depth = 1;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const processFractionsInContent = (content) => {
  let result = content;
  let changed = true;
  let iterations = 0;
  const maxIterations = 20;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let i = 0; i < result.length; i++) {
      if (result[i] === '(') {
        const closeIdx = findMatchingParenFrom(result, i + 1);
        if (closeIdx === -1) continue;

        let afterClose = closeIdx + 1;
        while (afterClose < result.length && result[afterClose] === ' ') afterClose++;

        if (result[afterClose] === '/') {
          const num = result.substring(i + 1, closeIdx);
          let afterSlash = afterClose + 1;
          while (afterSlash < result.length && result[afterSlash] === ' ') afterSlash++;

          if (result[afterSlash] === '(') {
            const denCloseIdx = findMatchingParenFrom(result, afterSlash + 1);
            if (denCloseIdx !== -1) {
              const den = result.substring(afterSlash + 1, denCloseIdx);
              const placeholder = addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
              result = result.substring(0, i) + placeholder + result.substring(denCloseIdx + 1);
              changed = true;
              break;
            }
          } else {
            const match = result.substring(afterSlash).match(/^([a-zA-Z0-9_]+|__PH\d+__)/);
            if (match) {
              const den = match[1];
              const placeholder = addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
              result = result.substring(0, i) + placeholder + result.substring(afterSlash + den.length);
              changed = true;
              break;
            }
          }
        }
      }
    }

    if (!changed) {
      const simpleMatch = result.match(/(\\?)([a-zA-Z0-9_]+)\s*\/\s*([a-zA-Z0-9_]+)/);
      if (simpleMatch && simpleMatch.index !== undefined) {
        const [fullMatch, leadingBackslash, num, den] = simpleMatch;
        const numWithBackslash = leadingBackslash + num;
        const placeholder = addPlaceholder(`\\frac{${numWithBackslash}}{${processContent(den)}}`);
        result = result.substring(0, simpleMatch.index) + placeholder + result.substring(simpleMatch.index + fullMatch.length);
        changed = true;
      }
    }
  }

  return result;
};

function compile(input) {
  placeholders = [];
  let processedLine = input;

  // Apply Math.* replacements FIRST
  Object.keys(mathPackage).forEach(k => {
    processedLine = processedLine.split(k).join(mathPackage[k]);
  });

  // Integral with bounds
  processedLine = processedLine.replace(/integral\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
    return addPlaceholder(`\\int_{${processContent(from)}}^{${processContent(to)}}`);
  });

  // Sum with bounds
  const handleSumBounds = (line) => {
    const sumPattern = /sum\s*_?\s*\(/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = sumPattern.exec(line)) !== null) {
      result += line.substring(lastIndex, match.index);
      const startParen = match.index + match[0].length - 1;
      let depth = 1;
      let j = startParen + 1;
      while (j < line.length && depth > 0) {
        if (line[j] === '(') depth++;
        else if (line[j] === ')') depth--;
        j++;
      }

      if (depth === 0) {
        const content = line.substring(startParen + 1, j - 1);
        const arrowIndex = content.indexOf('->');
        if (arrowIndex !== -1) {
          const from = content.substring(0, arrowIndex).trim();
          const to = content.substring(arrowIndex + 2).trim();
          result += addPlaceholder(`\\sum_{${processContent(from)}}^{${processContent(to)}}`);
        } else {
          result += addPlaceholder(`\\sum{${processContent(content)}}`);
        }
        lastIndex = j;
        sumPattern.lastIndex = j;
      } else {
        result += match[0];
        lastIndex = match.index + match[0].length;
      }
    }
    result += line.substring(lastIndex);
    return result;
  };
  processedLine = handleSumBounds(processedLine);

  // Limit (underscore optional)
  processedLine = processedLine.replace(/lim\s*_?\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, variable, limit) => {
    return addPlaceholder(`\\lim_{${processContent(variable)} \\to ${processContent(limit)}}`);
  });

  // Sqrt
  processedLine = handleFunctionCall(processedLine, 'sqrt', (content) => {
    return addPlaceholder(`\\sqrt{${processContent(content)}}`);
  });

  // Vec
  processedLine = handleFunctionCall(processedLine, 'vec', (content) => {
    return addPlaceholder(`\\vec{${processContent(content)}}`);
  });

  // Factorial
  processedLine = handleFunctionCall(processedLine, 'factorial', (content) => {
    const trimmed = content.trim();
    const processed = processContent(trimmed);
    if (/[\s+\-*/]/.test(trimmed)) {
      return addPlaceholder(`(${processed})!`);
    }
    return addPlaceholder(`${processed}!`);
  });

  // Trig functions with fraction handling inside
  const mathFunctions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp'];
  mathFunctions.forEach(fn => {
    processedLine = handleFunctionCall(processedLine, fn, (content) => {
      let processedInner = processFractionsInContent(content);
      return addPlaceholder(`\\${fn}(${processContent(processedInner)})`);
    });
  });

  // Choose/Binomial
  processedLine = processedLine.replace(/choose\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, n, k) => {
    return addPlaceholder(`\\binom{${processContent(n.trim())}}{${processContent(k.trim())}}`);
  });

  // Absolute value
  let absChanged = true;
  while (absChanged) {
    absChanged = false;
    processedLine = processedLine.replace(/\|([^|]+)\|/g, (_, content) => {
      absChanged = true;
      return addPlaceholder(`\\left|${processContent(content)}\\right|`);
    });
  }

  // Fractions
  processedLine = processFractionsInContent(processedLine);

  // Simple fractions with backslash support
  processedLine = processedLine.replace(/(\\?)([a-zA-Z0-9_]+)\s*\/\s*([a-zA-Z0-9_]+)/g, (_, leadingBackslash, num, den) => {
    const numWithBackslash = leadingBackslash + num;
    return addPlaceholder(`\\frac{${numWithBackslash}}{${processContent(den)}}`);
  });

  // Subscripts
  processedLine = processedLine.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');

  // Superscripts
  processedLine = processedLine.replace(/([a-zA-Z0-9\}])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');

  // Restore placeholders
  let outputLatex = processedLine;
  let maxIterations = 10;
  while (maxIterations-- > 0 && outputLatex.includes('__PH')) {
    placeholders.forEach((latex, i) => {
      outputLatex = outputLatex.replace(`__PH${i}__`, latex);
    });
  }

  // Apply Greek letter replacements (with negative lookbehind)
  Object.entries(greekLetters).forEach(([name, latex]) => {
    outputLatex = outputLatex.replace(new RegExp(`(?<!\\\\)\\b${name}\\b`, 'g'), latex);
  });

  // Apply inf -> \infty
  outputLatex = outputLatex.replace(/(?<!\\)\binf\b/g, '\\infty');

  // Apply operators (order matters - longer patterns first)
  outputLatex = outputLatex.replace(/\+-/g, '\\pm');
  outputLatex = outputLatex.replace(/-\+/g, '\\mp');
  outputLatex = outputLatex.replace(/->/g, '\\to');
  outputLatex = outputLatex.replace(/<=>/g, '\\iff');  // Must be before <= and =>
  outputLatex = outputLatex.replace(/=>/g, '\\implies');
  outputLatex = outputLatex.replace(/!=/g, '\\neq');
  outputLatex = outputLatex.replace(/<=/g, '\\le');
  outputLatex = outputLatex.replace(/>=/g, '\\ge');

  return outputLatex;
}

// ============ TEST CASES ============

const testCases = [
  // Basic factorial
  { input: 'factorial(n)', category: 'Factorial' },
  { input: 'factorial(j-1)', category: 'Factorial' },
  { input: 'factorial(n+1)', category: 'Factorial' },
  { input: 'factorial(2*n)', category: 'Factorial' },
  { input: 'factorial(factorial(n))', category: 'Factorial' },

  // Basic fractions
  { input: 'a/b', category: 'Fraction' },
  { input: 'x/y', category: 'Fraction' },
  { input: '1/2', category: 'Fraction' },
  { input: 'n/m', category: 'Fraction' },
  { input: '(a+b)/c', category: 'Fraction' },
  { input: '(a+b)/(c+d)', category: 'Fraction' },
  { input: 'a/(b+c)', category: 'Fraction' },
  { input: '(x^2 + 1)/(x - 1)', category: 'Fraction' },

  // Math.pi tests
  { input: 'Math.pi', category: 'Math Package' },
  { input: 'Math.pi/2', category: 'Math Package' },
  { input: '2*Math.pi', category: 'Math Package' },
  { input: 'Math.pi*r^2', category: 'Math Package' },
  { input: 'Math.e', category: 'Math Package' },
  { input: 'Math.inf', category: 'Math Package' },
  { input: 'Math.reals', category: 'Math Package' },
  { input: 'Math.naturals', category: 'Math Package' },
  { input: 'Math.integers', category: 'Math Package' },

  // Trig functions
  { input: 'sin(x)', category: 'Trig' },
  { input: 'cos(x)', category: 'Trig' },
  { input: 'tan(x)', category: 'Trig' },
  { input: 'sin(Math.pi)', category: 'Trig' },
  { input: 'cos(Math.pi/2)', category: 'Trig' },
  { input: 'sin(2*Math.pi*x)', category: 'Trig' },
  { input: 'sin(x)^2 + cos(x)^2', category: 'Trig' },
  { input: 'arcsin(x)', category: 'Trig' },
  { input: 'arccos(x)', category: 'Trig' },
  { input: 'arctan(x)', category: 'Trig' },
  { input: 'sinh(x)', category: 'Trig' },
  { input: 'cosh(x)', category: 'Trig' },
  { input: 'tanh(x)', category: 'Trig' },

  // Logarithms
  { input: 'log(x)', category: 'Log' },
  { input: 'ln(x)', category: 'Log' },
  { input: 'log(x/y)', category: 'Log' },
  { input: 'ln(Math.e)', category: 'Log' },
  { input: 'exp(x)', category: 'Log' },

  // Square root
  { input: 'sqrt(x)', category: 'Sqrt' },
  { input: 'sqrt(x^2 + y^2)', category: 'Sqrt' },
  { input: 'sqrt(2)', category: 'Sqrt' },
  { input: 'sqrt(factorial(n))', category: 'Sqrt' },
  { input: 'sqrt(a/b)', category: 'Sqrt' },

  // Limits
  { input: 'lim(x -> 0)', category: 'Limit' },
  { input: 'lim(x -> inf)', category: 'Limit' },
  { input: 'lim(n -> inf)', category: 'Limit' },
  { input: 'lim(h -> 0)', category: 'Limit' },
  { input: 'lim_(x -> 0)', category: 'Limit' },

  // Sums
  { input: 'sum(i=1 -> n)', category: 'Sum' },
  { input: 'sum(k=0 -> inf)', category: 'Sum' },
  { input: 'sum(j=1 -> 10)', category: 'Sum' },

  // Integrals
  { input: 'integral(0 -> 1)', category: 'Integral' },
  { input: 'integral(a -> b)', category: 'Integral' },
  { input: 'integral(0 -> inf)', category: 'Integral' },
  { input: 'integral(-inf -> inf)', category: 'Integral' },

  // Binomial
  { input: 'choose(n, k)', category: 'Binomial' },
  { input: 'choose(n, 0)', category: 'Binomial' },
  { input: 'choose(10, 5)', category: 'Binomial' },

  // Absolute value
  { input: '|x|', category: 'Absolute' },
  { input: '|x - y|', category: 'Absolute' },
  { input: '|a + b|', category: 'Absolute' },

  // Greek letters
  { input: 'alpha', category: 'Greek' },
  { input: 'beta', category: 'Greek' },
  { input: 'gamma', category: 'Greek' },
  { input: 'delta', category: 'Greek' },
  { input: 'epsilon', category: 'Greek' },
  { input: 'theta', category: 'Greek' },
  { input: 'lambda', category: 'Greek' },
  { input: 'sigma', category: 'Greek' },
  { input: 'omega', category: 'Greek' },
  { input: 'pi', category: 'Greek' },
  { input: 'Delta', category: 'Greek' },
  { input: 'Sigma', category: 'Greek' },
  { input: 'Omega', category: 'Greek' },

  // Subscripts and superscripts
  { input: 'x_i', category: 'Sub/Super' },
  { input: 'a_n', category: 'Sub/Super' },
  { input: 'x^2', category: 'Sub/Super' },
  { input: 'x^n', category: 'Sub/Super' },
  { input: 'x_i^2', category: 'Sub/Super' },
  { input: 'a_n^2', category: 'Sub/Super' },

  // Operators
  { input: 'a + b', category: 'Operators' },
  { input: 'a - b', category: 'Operators' },
  { input: 'a * b', category: 'Operators' },
  { input: 'a +- b', category: 'Operators' },
  { input: 'a -+ b', category: 'Operators' },
  { input: 'x <= y', category: 'Operators' },
  { input: 'x >= y', category: 'Operators' },
  { input: 'x != y', category: 'Operators' },
  { input: 'a => b', category: 'Operators' },
  { input: 'a <=> b', category: 'Operators' },

  // Complex expressions
  { input: 'cos(Math.pi * (factorial(j-1) + 1)/j)', category: 'Complex' },
  { input: '(factorial(n) + 1)/(factorial(n) - 1)', category: 'Complex' },
  { input: 'sin(x)/cos(x)', category: 'Complex' },
  { input: 'sqrt(sin(x)^2 + cos(x)^2)', category: 'Complex' },
  { input: 'lim(x -> 0) sin(x)/x', category: 'Complex' },
  { input: 'sum(i=1 -> n) i^2', category: 'Complex' },
  { input: 'integral(0 -> Math.pi) sin(x)', category: 'Complex' },
  { input: 'e^(i*Math.pi) + 1', category: 'Complex' },
  { input: 'sqrt((x-a)^2 + (y-b)^2)', category: 'Complex' },
  { input: 'choose(n, k) * p^k * (1-p)^(n-k)', category: 'Complex' },

  // Vectors
  { input: 'vec(x)', category: 'Vector' },
  { input: 'vec(AB)', category: 'Vector' },

  // Edge cases
  { input: 'a', category: 'Edge' },
  { input: 'x + y + z', category: 'Edge' },
  { input: '1 + 2 + 3', category: 'Edge' },
  { input: '((a))', category: 'Edge' },
  { input: 'f(x)', category: 'Edge' },
];

console.log('=== Comprehensive MathScript Compiler Tests ===\n');
console.log(`Running ${testCases.length} test cases...\n`);

let passed = 0;
let failed = 0;
const failures = [];

testCases.forEach((tc, i) => {
  try {
    const result = compile(tc.input);
    // Basic sanity checks
    const hasUnmatchedPlaceholder = result.includes('__PH');
    const hasDoubleBraces = result.includes('{{') || result.includes('}}');
    const hasDoubleBackslash = result.includes('\\\\') && !result.includes('\\\\{') && !result.includes('\\\\}');

    if (hasUnmatchedPlaceholder) {
      failed++;
      failures.push({ num: i+1, input: tc.input, result, issue: 'Unmatched placeholder' });
    } else if (hasDoubleBraces) {
      failed++;
      failures.push({ num: i+1, input: tc.input, result, issue: 'Double braces' });
    } else {
      passed++;
      console.log(`✓ ${i+1}. [${tc.category}] ${tc.input}`);
      console.log(`   → ${result}`);
    }
  } catch (e) {
    failed++;
    failures.push({ num: i+1, input: tc.input, result: 'ERROR', issue: e.message });
  }
});

console.log('\n' + '='.repeat(50));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failures.length > 0) {
  console.log('\n=== FAILURES ===');
  failures.forEach(f => {
    console.log(`\n${f.num}. ${f.input}`);
    console.log(`   Result: ${f.result}`);
    console.log(`   Issue: ${f.issue}`);
  });
}
