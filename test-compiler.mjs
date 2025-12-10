// Node.js E2E test that mirrors the actual compiler logic

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
  'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta',
};

let placeholders = [];

const addPlaceholder = (latex) => {
  const id = `__PH${placeholders.length}__`;
  placeholders.push(latex);
  return id;
};

const processContent = (content) => {
  let result = content;
  // NOTE: Greek letters and Math.* replacements happen AFTER placeholder restoration
  // Only apply subscripts/superscripts here
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

// Process fractions within content
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

    // Pattern 2: simple/simple (with optional leading backslash for \pi/2 etc.)
    if (!changed) {
      const simpleMatch = result.match(/(\\?)([a-zA-Z0-9_]+)\s*\/\s*([a-zA-Z0-9_]+)/);
      if (simpleMatch && simpleMatch.index !== undefined) {
        const [fullMatch, leadingBackslash, num, den] = simpleMatch;
        // Include the backslash in the numerator if present
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

  // Apply Math.* replacements FIRST (before any fraction processing)
  // This ensures Math.pi/2 becomes \pi/2, which then becomes \frac{\pi}{2}
  Object.keys(mathPackage).forEach(k => {
    processedLine = processedLine.split(k).join(mathPackage[k]);
  });

  // Process factorial FIRST (before trig functions)
  processedLine = handleFunctionCall(processedLine, 'factorial', (content) => {
    const trimmed = content.trim();
    const processed = processContent(trimmed);
    if (/[\s+\-*/]/.test(trimmed)) {
      return addPlaceholder(`(${processed})!`);
    }
    return addPlaceholder(`${processed}!`);
  });

  // Process trig functions with fraction handling inside
  const mathFunctions = ['sin', 'cos', 'tan', 'log', 'ln', 'exp'];
  mathFunctions.forEach(fn => {
    processedLine = handleFunctionCall(processedLine, fn, (content) => {
      let processedInner = content;
      processedInner = processFractionsInContent(processedInner);
      return addPlaceholder(`\\${fn}(${processContent(processedInner)})`);
    });
  });

  // Process sqrt
  processedLine = handleFunctionCall(processedLine, 'sqrt', (content) => {
    return addPlaceholder(`\\sqrt{${processContent(content)}}`);
  });

  // Process remaining fractions at top level
  processedLine = processFractionsInContent(processedLine);

  // Restore placeholders
  let outputLatex = processedLine;
  let maxIterations = 10;
  while (maxIterations-- > 0 && outputLatex.includes('__PH')) {
    placeholders.forEach((latex, i) => {
      outputLatex = outputLatex.replace(`__PH${i}__`, latex);
    });
  }

  // Math.* replacements already happened at the start
  // Now apply Greek letter replacements
  // Use negative lookbehind to avoid replacing already-escaped \pi, \alpha, etc.
  Object.entries(greekLetters).forEach(([name, latex]) => {
    outputLatex = outputLatex.replace(new RegExp(`(?<!\\\\)\\b${name}\\b`, 'g'), latex);
  });

  // Apply inf -> \infty
  outputLatex = outputLatex.replace(/\binf\b/g, '\\infty');

  return outputLatex;
}

// Test cases from the plan
const testCases = [
  { input: 'factorial(n)', desc: 'Simple factorial' },
  { input: 'factorial(j-1)', desc: 'Factorial with expression' },
  { input: 'cos(Math.pi)', desc: 'Cos with pi' },
  { input: 'cos(2*Math.pi)', desc: 'Cos with multiplication' },
  { input: 'cos(Math.pi * (factorial(j-1) + 1)/j)', desc: 'Complex nested expression' },
  { input: 'sin(factorial(n+1))', desc: 'Sin with factorial' },
  { input: '(factorial(n) + 1)/(factorial(n) - 1)', desc: 'Fraction of factorials' },
  { input: 'sqrt(factorial(n))', desc: 'Sqrt of factorial' },
  { input: 'a/b', desc: 'Simple fraction' },
  { input: '(a+b)/c', desc: 'Paren numerator fraction' },
  { input: 'Math.pi/2', desc: 'Pi over 2' },
];

console.log('=== MathScript Compiler E2E Tests ===\n');

testCases.forEach((tc, i) => {
  const result = compile(tc.input);
  console.log(`${i+1}. ${tc.desc}`);
  console.log(`   Input:  ${tc.input}`);
  console.log(`   Output: ${result}`);
  console.log('');
});
