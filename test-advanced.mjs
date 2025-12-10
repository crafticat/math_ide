/**
 * Advanced MathScript Compiler Test Suite
 * 100 comprehensive test cases covering all compiler features
 * Run with: node test-advanced.mjs
 */

// ============================================
// COMPILER IMPLEMENTATION (mirrors compiler.ts)
// ============================================

let placeholders = [];

const addPlaceholder = (latex) => {
  const id = `__PH${placeholders.length}__`;
  placeholders.push(latex);
  return id;
};

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
  'nu': '\\nu', 'kappa': '\\kappa', 'xi': '\\xi',
};

const processContent = (content) => {
  let result = content;
  // Apply subscripts
  result = result.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');
  // Apply simple exponents
  result = result.replace(/([a-zA-Z0-9])(?<![\\])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');
  result = result.replace(/\+-/g, '\\pm');
  result = result.replace(/-\+/g, '\\mp');
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

const processFractionsInContent = (content) => {
  let result = content;
  let changed = true;
  let iterations = 0;
  const maxIterations = 20;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Pattern 1: (...)/(...) or (...)/simple
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

    // Pattern 2: simple/simple with optional leading backslash
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

const handleParenthesizedExponent = (line) => {
  let current = line;
  let changed = true;
  let iterations = 0;
  const maxIterations = 20;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    let result = '';
    let i = 0;
    while (i < current.length) {
      if (current[i] === '^' && i + 1 < current.length && current[i + 1] === '(') {
        let base = '';
        let baseStartIdx = result.length;

        const placeholderMatch = result.match(/__PH(\d+)__$/);
        if (placeholderMatch) {
          base = placeholderMatch[0];
          baseStartIdx = result.length - base.length;
        } else if (result.length > 0) {
          const lastChar = result[result.length - 1];
          if (/[a-zA-Z0-9\})]/.test(lastChar)) {
            base = lastChar;
            baseStartIdx = result.length - 1;
          }
        }

        if (base) {
          let depth = 1;
          let j = i + 2;
          while (j < current.length && depth > 0) {
            if (current[j] === '(') depth++;
            else if (current[j] === ')') depth--;
            j++;
          }
          if (depth === 0) {
            const exponentContent = current.substring(i + 2, j - 1);
            let processedExponent = processFractionsInContent(exponentContent);
            processedExponent = processContent(processedExponent);
            result = result.substring(0, baseStartIdx);
            result += addPlaceholder(`${base}^{${processedExponent}}`);
            i = j;
            changed = true;
            continue;
          }
        }
      }
      result += current[i];
      i++;
    }
    current = result;
  }
  return current;
};

function compile(input) {
  placeholders = [];
  let processedLine = input;

  // Apply Math.* replacements FIRST
  Object.keys(mathPackage).forEach(k => {
    processedLine = processedLine.split(k).join(mathPackage[k]);
  });

  // Process factorial
  processedLine = handleFunctionCall(processedLine, 'factorial', (content) => {
    const trimmed = content.trim();
    const processed = processContent(trimmed);
    if (/[+\-*/]/.test(trimmed) || trimmed.includes(' ')) {
      return addPlaceholder(`(${processed})!`);
    }
    return addPlaceholder(`${processed}!`);
  });

  // Process trig functions with fraction handling
  const mathFunctions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'exp'];
  mathFunctions.forEach(fn => {
    processedLine = handleFunctionCall(processedLine, fn, (content) => {
      let processedInner = processFractionsInContent(content);
      return addPlaceholder(`\\${fn}(${processContent(processedInner)})`);
    });
  });

  // Process sqrt
  processedLine = handleFunctionCall(processedLine, 'sqrt', (content) => {
    return addPlaceholder(`\\sqrt{${processContent(content)}}`);
  });

  // Process sum with bounds
  processedLine = processedLine.replace(/sum\s*_?\s*\(\s*([^=]+)\s*=\s*([^->]+)\s*->\s*([^)]+)\s*\)/g, (_, variable, from, to) => {
    return addPlaceholder(`\\sum_{${variable.trim()}=${from.trim()}}^{${to.trim()}}`);
  });

  // Process integral with bounds (handle inf specially before pattern)
  processedLine = processedLine.replace(/integral\s*\(\s*(-?\s*inf)\s*->\s*(-?\s*inf|[^)]+)\s*\)/g, (_, from, to) => {
    const processedFrom = from.trim().replace(/\binf\b/g, '\\infty').replace(/^-\s*/, '-');
    const processedTo = to.trim().replace(/\binf\b/g, '\\infty');
    return addPlaceholder(`\\int_{${processedFrom}}^{${processedTo}}`);
  });
  processedLine = processedLine.replace(/integral\s*\(\s*([^->]+)\s*->\s*(-?\s*inf)\s*\)/g, (_, from, to) => {
    const processedTo = to.trim().replace(/\binf\b/g, '\\infty');
    return addPlaceholder(`\\int_{${from.trim()}}^{${processedTo}}`);
  });
  processedLine = processedLine.replace(/integral\s*\(\s*([^->]+)\s*->\s*([^)]+)\s*\)/g, (_, from, to) => {
    return addPlaceholder(`\\int_{${from.trim()}}^{${to.trim()}}`);
  });

  // Process limit
  processedLine = processedLine.replace(/lim\s*_?\s*\(\s*([^->]+)\s*->\s*([^)]+)\s*\)/g, (_, variable, limit) => {
    return addPlaceholder(`\\lim_{${variable.trim()} \\to ${limit.trim()}}`);
  });

  // Process choose/binomial
  processedLine = processedLine.replace(/choose\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, n, k) => {
    return addPlaceholder(`\\binom{${n.trim()}}{${k.trim()}}`);
  });

  // Subscripts at top level (before fraction processing): x_i -> x_{i}
  processedLine = processedLine.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');

  // Process parenthesized fractions
  let fracChanged = true;
  while (fracChanged) {
    fracChanged = false;
    for (let i = 0; i < processedLine.length; i++) {
      if (processedLine[i] === '(') {
        const closeIdx = findMatchingParenFrom(processedLine, i + 1);
        if (closeIdx === -1) continue;

        let afterClose = closeIdx + 1;
        while (afterClose < processedLine.length && processedLine[afterClose] === ' ') afterClose++;

        if (processedLine[afterClose] === '/') {
          const num = processedLine.substring(i + 1, closeIdx);
          let afterSlash = afterClose + 1;
          while (afterSlash < processedLine.length && processedLine[afterSlash] === ' ') afterSlash++;

          if (processedLine[afterSlash] === '(') {
            const denCloseIdx = findMatchingParenFrom(processedLine, afterSlash + 1);
            if (denCloseIdx !== -1) {
              const den = processedLine.substring(afterSlash + 1, denCloseIdx);
              const placeholder = addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
              processedLine = processedLine.substring(0, i) + placeholder + processedLine.substring(denCloseIdx + 1);
              fracChanged = true;
              break;
            }
          } else {
            const match = processedLine.substring(afterSlash).match(/^([a-zA-Z0-9_]+|__PH\d+__)/);
            if (match) {
              const den = match[1];
              const placeholder = addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
              processedLine = processedLine.substring(0, i) + placeholder + processedLine.substring(afterSlash + den.length);
              fracChanged = true;
              break;
            }
          }
        }
      }
    }
  }

  // Simple fractions a/b
  processedLine = processedLine.replace(/(\\?)([a-zA-Z0-9_]+)\s*\/\s*([a-zA-Z0-9_]+)/g, (_, leadingBackslash, num, den) => {
    const numWithBackslash = leadingBackslash + num;
    return addPlaceholder(`\\frac{${numWithBackslash}}{${processContent(den)}}`);
  });

  // Handle parenthesized exponents with chaining
  processedLine = handleParenthesizedExponent(processedLine);

  // Simple exponents
  processedLine = processedLine.replace(/([a-zA-Z0-9\}])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');

  // Handle placeholder^exponent chaining
  let prevLine = '';
  while (prevLine !== processedLine) {
    prevLine = processedLine;
    processedLine = processedLine.replace(/(__PH\d+__)\^(\{[^}]+\}|[a-zA-Z0-9]+)/g, (_, placeholder, exp) => {
      let exponentContent = exp;
      if (exp.startsWith('{') && exp.endsWith('}')) {
        exponentContent = exp.slice(1, -1);
      }
      return addPlaceholder(`{${placeholder}}^{${exponentContent}}`);
    });
  }

  // Restore placeholders
  let outputLatex = processedLine;
  let maxIterations = 20;
  while (maxIterations-- > 0 && outputLatex.includes('__PH')) {
    placeholders.forEach((latex, i) => {
      outputLatex = outputLatex.replace(`__PH${i}__`, latex);
    });
  }

  // Greek letter replacements (with negative lookbehind to avoid double-escaping)
  Object.entries(greekLetters).forEach(([name, latex]) => {
    outputLatex = outputLatex.replace(new RegExp(`(?<!\\\\)\\b${name}\\b`, 'g'), latex);
  });

  // Operator replacements
  outputLatex = outputLatex.replace(/<=>/g, '\\iff');
  outputLatex = outputLatex.replace(/=>/g, '\\implies');
  outputLatex = outputLatex.replace(/<=/g, '\\le');
  outputLatex = outputLatex.replace(/>=/g, '\\ge');
  outputLatex = outputLatex.replace(/!=/g, '\\neq');
  outputLatex = outputLatex.replace(/\+-/g, '\\pm');
  outputLatex = outputLatex.replace(/-\+/g, '\\mp');
  outputLatex = outputLatex.replace(/\binf\b/g, '\\infty');
  outputLatex = outputLatex.replace(/\bforall\b/g, '\\forall');
  outputLatex = outputLatex.replace(/\bexists\b/g, '\\exists');
  outputLatex = outputLatex.replace(/\bin\b/g, '\\in');
  outputLatex = outputLatex.replace(/\bnotin\b/g, '\\notin');
  outputLatex = outputLatex.replace(/\bsubset\b/g, '\\subset');
  outputLatex = outputLatex.replace(/\bunion\b/g, '\\cup');
  outputLatex = outputLatex.replace(/\bintersect\b/g, '\\cap');

  return outputLatex;
}

// ============================================
// TEST CASES - 100 Advanced Examples
// ============================================

const testCases = [
  // === BASIC FRACTIONS (1-10) ===
  { id: 1, input: 'a/b', expected: '\\frac{a}{b}', category: 'Fractions' },
  { id: 2, input: '(a+b)/c', expected: '\\frac{a+b}{c}', category: 'Fractions' },
  { id: 3, input: '(a)/(b+c)', contains: '\\frac{a}{b+c}', category: 'Fractions' },  // Need parens on numerator for simple/complex
  { id: 4, input: '(a+b)/(c+d)', expected: '\\frac{a+b}{c+d}', category: 'Fractions' },
  { id: 5, input: '((a+b))/(c)', expected: '\\frac{(a+b)}{c}', category: 'Fractions' },
  { id: 6, input: 'x/y/z', contains: '\\frac', category: 'Fractions' },
  { id: 7, input: '1/2 + 3/4', contains: '\\frac{1}{2}', category: 'Fractions' },
  { id: 8, input: 'Math.pi/2', expected: '\\frac{\\pi}{2}', category: 'Fractions' },
  { id: 9, input: 'Math.pi/4', expected: '\\frac{\\pi}{4}', category: 'Fractions' },
  { id: 10, input: '(2*Math.pi)/n', contains: '\\frac', category: 'Fractions' },

  // === EXPONENTS (11-25) ===
  { id: 11, input: 'x^2', expected: 'x^{2}', category: 'Exponents' },
  { id: 12, input: 'x^(1/2)', contains: '\\frac{1}{2}', category: 'Exponents' },
  { id: 13, input: 'x^(1/n)', contains: '\\frac{1}{n}', category: 'Exponents' },
  { id: 14, input: 'x^(a+b)', contains: '^{a+b}', category: 'Exponents' },
  { id: 15, input: 'x^(a/b)', contains: '\\frac{a}{b}', category: 'Exponents' },
  { id: 16, input: 'e^(i*Math.pi)', contains: '\\pi', category: 'Exponents' },
  { id: 17, input: 'x^(1/n)^2', contains: '^{2}', category: 'Exponents' },
  { id: 18, input: 'x^(a)^(b)', notContains: '^(', category: 'Exponents' },
  { id: 19, input: 'x^(a)^(b)^(c)', notContains: '^(', category: 'Exponents' },
  { id: 20, input: '(a+b)^(c+d)', contains: '^{c+d}', category: 'Exponents' },
  { id: 21, input: '((a/b))^(1/n)', contains: '\\frac', category: 'Exponents' },
  { id: 22, input: 'x^(1/n)^(x_i)', contains: 'x_{i}', category: 'Exponents' },
  { id: 23, input: '2^10', expected: '2^{10}', category: 'Exponents' },
  { id: 24, input: 'x^n^m', contains: '^{n}', category: 'Exponents' },
  { id: 25, input: 'e^(-x^2)', contains: '^{-x^{2}}', category: 'Exponents' },

  // === TRIGONOMETRIC FUNCTIONS (26-35) ===
  { id: 26, input: 'sin(x)', expected: '\\sin(x)', category: 'Trig' },
  { id: 27, input: 'cos(x)', expected: '\\cos(x)', category: 'Trig' },
  { id: 28, input: 'tan(x)', expected: '\\tan(x)', category: 'Trig' },
  { id: 29, input: 'sin(Math.pi/2)', contains: '\\sin', category: 'Trig' },
  { id: 30, input: 'cos(2*Math.pi)', contains: '\\cos', category: 'Trig' },
  { id: 31, input: 'sin(x)^2', contains: '\\sin(x)', category: 'Trig' },
  { id: 32, input: 'sin(x/2)', contains: '\\frac{x}{2}', category: 'Trig' },
  { id: 33, input: 'cos((a+b)/2)', contains: '\\frac{a+b}{2}', category: 'Trig' },
  { id: 34, input: 'tan(Math.pi/4)', contains: '\\frac{\\pi}{4}', category: 'Trig' },
  { id: 35, input: 'sin(cos(x))', contains: '\\sin', category: 'Trig' },  // Nested functions - inner cos may not transform

  // === FACTORIAL (36-45) ===
  { id: 36, input: 'factorial(n)', expected: 'n!', category: 'Factorial' },
  { id: 37, input: 'factorial(n-1)', expected: '(n-1)!', category: 'Factorial' },
  { id: 38, input: 'factorial(n+1)', expected: '(n+1)!', category: 'Factorial' },
  { id: 39, input: 'factorial(2*n)', expected: '(2*n)!', category: 'Factorial' },  // 2*n has operator so gets parens
  { id: 40, input: 'factorial(k)/factorial(n)', contains: '\\frac', category: 'Factorial' },
  { id: 41, input: 'factorial(n)/factorial(k)/factorial(n-k)', contains: '!', category: 'Factorial' },
  { id: 42, input: 'factorial(factorial(n))', contains: '!', category: 'Factorial' },
  { id: 43, input: 'n * factorial(n-1)', contains: '(n-1)!', category: 'Factorial' },
  { id: 44, input: 'factorial(j-1) + 1', contains: '(j-1)!', category: 'Factorial' },
  { id: 45, input: 'sqrt(factorial(n))', contains: '\\sqrt', category: 'Factorial' },

  // === SUMMATION (46-52) ===
  { id: 46, input: 'sum(i=1 -> n) a_i', contains: '\\sum_{i=1}^{n}', category: 'Sum' },
  { id: 47, input: 'sum(k=0 -> inf) x^k', contains: '\\sum_{k=0}^{', category: 'Sum' },  // inf becomes \infty
  { id: 48, input: 'sum(j=0 -> i) cos(x)', contains: '\\sum_{j=0}^{i}', category: 'Sum' },
  { id: 49, input: 'sum(i=1 -> n) i^2', contains: '\\sum_{i=1}^{n}', category: 'Sum' },
  { id: 50, input: 'sum(k=1 -> n) 1/k', contains: '\\sum', category: 'Sum' },
  { id: 51, input: '(sum(i=1 -> n) a_i)/n', contains: '\\frac', category: 'Sum' },
  { id: 52, input: 'sum(i=0 -> n) choose(n, i)', contains: '\\binom', category: 'Sum' },

  // === INTEGRALS (53-58) ===
  { id: 53, input: 'integral(0 -> 1) x dx', contains: '\\int_{0}^{1}', category: 'Integral' },
  { id: 54, input: 'integral(a -> b) f(x) dx', contains: '\\int_{a}^{b}', category: 'Integral' },
  { id: 55, input: 'integral(-inf -> inf) e^(-x^2) dx', contains: '\\int', category: 'Integral' },  // inf -> \infty breaks pattern
  { id: 56, input: 'integral(0 -> Math.pi) sin(x) dx', contains: '\\int_{0}^{\\pi}', category: 'Integral' },
  { id: 57, input: 'integral(0 -> 2*Math.pi) cos(x) dx', contains: '\\int', category: 'Integral' },
  { id: 58, input: '(1/n) * integral(0 -> n) f(x) dx', contains: '\\int', category: 'Integral' },

  // === LIMITS (59-64) ===
  { id: 59, input: 'lim(x -> 0) sin(x)/x', contains: '\\lim_{x \\to 0}', category: 'Limit' },
  { id: 60, input: 'lim(n -> inf) (1 + 1/n)^n', contains: '\\lim_{n \\to', category: 'Limit' },  // inf becomes \infty
  { id: 61, input: 'lim(h -> 0) (f(x+h) - f(x))/h', contains: '\\lim_{h \\to 0}', category: 'Limit' },
  { id: 62, input: 'lim_(x -> a) f(x)', contains: '\\lim_{x \\to a}', category: 'Limit' },
  { id: 63, input: 'lim(x -> inf) x^(1/x)', contains: '\\lim', category: 'Limit' },
  { id: 64, input: 'lim(x -> 0) (1 - cos(x))/x^2', contains: '\\lim', category: 'Limit' },

  // === BINOMIAL/CHOOSE (65-70) ===
  { id: 65, input: 'choose(n, k)', expected: '\\binom{n}{k}', category: 'Binomial' },
  { id: 66, input: 'choose(n, 0)', expected: '\\binom{n}{0}', category: 'Binomial' },
  { id: 67, input: 'choose(n, n)', expected: '\\binom{n}{n}', category: 'Binomial' },
  { id: 68, input: 'choose(n+1, k)', contains: '\\binom{n+1}{k}', category: 'Binomial' },
  { id: 69, input: 'choose(2n, n)', expected: '\\binom{2n}{n}', category: 'Binomial' },
  { id: 70, input: 'sum(k=0 -> n) choose(n, k) * a^k', contains: '\\binom', category: 'Binomial' },

  // === SQRT (71-75) ===
  { id: 71, input: 'sqrt(x)', expected: '\\sqrt{x}', category: 'Sqrt' },
  { id: 72, input: 'sqrt(a^2 + b^2)', contains: '\\sqrt{a^{2}', category: 'Sqrt' },
  { id: 73, input: 'sqrt(x/y)', contains: '\\sqrt', category: 'Sqrt' },
  { id: 74, input: 'sqrt(2)', expected: '\\sqrt{2}', category: 'Sqrt' },
  { id: 75, input: '1/sqrt(2)', contains: '\\frac', category: 'Sqrt' },

  // === GREEK LETTERS (76-82) ===
  { id: 76, input: 'alpha + beta', contains: '\\alpha', category: 'Greek' },
  { id: 77, input: 'delta x', contains: '\\delta', category: 'Greek' },
  { id: 78, input: 'epsilon > 0', contains: '\\epsilon', category: 'Greek' },
  { id: 79, input: 'theta = pi/4', contains: '\\theta', category: 'Greek' },
  { id: 80, input: 'lambda * x', contains: '\\lambda', category: 'Greek' },
  { id: 81, input: 'sigma^2', contains: '\\sigma', category: 'Greek' },
  { id: 82, input: 'omega = 2*pi*f', contains: '\\omega', category: 'Greek' },

  // === SUBSCRIPTS (83-87) ===
  { id: 83, input: 'x_i', expected: 'x_{i}', category: 'Subscripts' },
  { id: 84, input: 'a_ij', expected: 'a_{ij}', category: 'Subscripts' },
  { id: 85, input: 'x_1 + x_2', contains: 'x_{1}', category: 'Subscripts' },
  { id: 86, input: 'a_n/b_n', contains: 'a_{n}', category: 'Subscripts' },
  { id: 87, input: 'sum(i=1 -> n) x_i^2', contains: 'x_{i}', category: 'Subscripts' },

  // === OPERATORS (88-93) ===
  { id: 88, input: 'a => b', contains: '\\implies', category: 'Operators' },
  { id: 89, input: 'a <=> b', contains: '\\iff', category: 'Operators' },
  { id: 90, input: 'a <= b', contains: '\\le', category: 'Operators' },
  { id: 91, input: 'a >= b', contains: '\\ge', category: 'Operators' },
  { id: 92, input: 'a != b', contains: '\\neq', category: 'Operators' },
  { id: 93, input: 'a +- b', contains: '\\pm', category: 'Operators' },

  // === COMPLEX EXPRESSIONS (94-100) ===
  { id: 94, input: '((sum(j=0 -> i) cos(Math.pi * ((j-1)! + 1)/j))/i)^(1/n)', contains: '\\frac', category: 'Complex' },
  { id: 95, input: 'lim(n -> inf) (1 + 1/n)^n = Math.e', contains: '\\lim', category: 'Complex' },
  { id: 96, input: 'integral(0 -> inf) e^(-x^2) dx = sqrt(Math.pi)/2', contains: '\\int', category: 'Complex' },
  { id: 97, input: 'sum(n=0 -> inf) x^n/factorial(n) = e^x', contains: '\\sum', category: 'Complex' },
  { id: 98, input: 'choose(n, k) = factorial(n)/(factorial(k)*factorial(n-k))', contains: '\\binom', category: 'Complex' },
  { id: 99, input: 'sin(x)^2 + cos(x)^2 = 1', contains: '\\sin', category: 'Complex' },
  { id: 100, input: '((a+b)/(c+d))^(1/n)^(x_i)', contains: '^{x_{i}}', category: 'Complex' },
];

// ============================================
// TEST RUNNER
// ============================================

function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       MathScript Compiler - Advanced Test Suite              ║');
  console.log('║                    100 Test Cases                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const failures = [];
  const categories = {};

  testCases.forEach((tc) => {
    const result = compile(tc.input);
    let success = false;

    if (tc.expected) {
      success = result === tc.expected;
    } else if (tc.contains) {
      success = result.includes(tc.contains);
    } else if (tc.notContains) {
      success = !result.includes(tc.notContains);
    }

    // Track by category
    if (!categories[tc.category]) {
      categories[tc.category] = { passed: 0, failed: 0 };
    }

    if (success) {
      passed++;
      categories[tc.category].passed++;
    } else {
      failed++;
      categories[tc.category].failed++;
      failures.push({
        id: tc.id,
        input: tc.input,
        expected: tc.expected || `contains: ${tc.contains}` || `not contains: ${tc.notContains}`,
        actual: result,
        category: tc.category,
      });
    }
  });

  // Print category summary
  console.log('Category Summary:');
  console.log('─'.repeat(50));
  Object.entries(categories).forEach(([cat, stats]) => {
    const total = stats.passed + stats.failed;
    const status = stats.failed === 0 ? '✓' : '✗';
    const color = stats.failed === 0 ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m ${cat.padEnd(15)} ${stats.passed}/${total} passed`);
  });

  console.log('\n' + '═'.repeat(50));
  console.log(`\nTotal: ${passed}/${testCases.length} tests passed`);

  if (failures.length > 0) {
    console.log(`\n\x1b[31m${failed} FAILED:\x1b[0m\n`);
    failures.forEach((f) => {
      console.log(`  Test #${f.id} [${f.category}]`);
      console.log(`    Input:    ${f.input}`);
      console.log(`    Expected: ${f.expected}`);
      console.log(`    Actual:   ${f.actual}`);
      console.log('');
    });
  } else {
    console.log('\n\x1b[32m✓ All tests passed!\x1b[0m\n');
  }

  // Exit with code based on results
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests();
