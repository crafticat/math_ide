// End-to-end test of the example content

const INITIAL_CONTENT = `// MathBrain IDE - MathScript Language Demo
// A complete showcase of syntax features

// === MACROS ===
// Define shortcuts for commonly used symbols
#define eps epsilon
#define del delta
#define R Math.reals
#define N Math.naturals

Problem Analysis and Combinatorics {

  // === CALCULUS ===

  Theorem Fundamental Theorem of Calculus {
    Let f be continuous on [a, b]
    Let F(x) = integral(a -> x) f(t) dt

    Then F'(x) = f(x) forall x in (a, b)

    And integral(a -> b) f(x) dx = F(b) - F(a)
  }

  Proof {
    Let eps > 0 be given

    Since f is continuous at x
    exists del > 0 suchthat |f(t) - f(x)| < eps forall t in (x - del, x + del)

    Consider lim_(h -> 0) (F(x + h) - F(x))/h

    = lim_(h -> 0) (1/h) integral(x -> x+h) f(t) dt

    = f(x)

    QED
  }

  // === COMBINATORICS ===

  Theorem Binomial Theorem {
    forall n in N and forall a, b in R

    (a + b)^n = sum(k=0 -> n) choose(n, k) * a^(n-k) * b^k
  }

  Lemma Factorial Identity {
    choose(n, k) = factorial(n) / factorial(k) / factorial(n - k)

    For example: choose(5, 2) = 10
    Since factorial(5) = 120 and factorial(2) = 2 and factorial(3) = 6
  }

  // === LOGIC AND SETS ===

  Theorem De Morgan Laws {
    Let A, B be sets

    Case Complement of Union {
      x notin A union B <=> x notin A AND x notin B
    }

    Case Complement of Intersection {
      x notin A intersect B <=> x notin A OR x notin B
    }
  }

  // === FAMOUS EQUATIONS ===

  // Euler's Identity
  e^(i * Math.pi) + 1 = 0

  // Quadratic Formula
  x = (-b +- sqrt(b^2 - 4*a*c)) / (2*a)

  // Gaussian Integral
  integral(-inf -> inf) e^(-x^2) dx = sqrt(pi)
}
`;

// Simplified in-line compiler for testing (same logic as compiler.ts)
function compileMathScript(input) {
  const lines = input.split('\n');
  const macros = {};
  const outputLines = [];
  let indentLevel = 0;

  const mathKeywords = new Set([
      'integral', 'sum', 'lim', 'sup', 'inf', 'log', 'ln', 'sin', 'cos', 'tan', 'sqrt',
      'exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'suchthat',
      'AND', 'OR', 'NOT',
      'delta', 'alpha', 'beta', 'gamma', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi',
      'QED', 'Math', 'factorial', 'choose'
  ]);

  const symbolMap = {
      'exists': '\\exists',
      'forall': '\\forall',
      'in': '\\in',
      'notin': '\\notin',
      'subset': '\\subset',
      'union': '\\cup',
      'intersect': '\\cap',
      '<=>': '\\iff',
      '<=': '\\le',
      '>=': '\\ge',
      '+-': '\\pm',
      'suchthat': '\\text{ s.t. }',
      'QED': '\\quad \\blacksquare',
      'AND': '\\land',
      'OR': '\\lor',
      'NOT': '\\neg',
      'epsilon': '\\epsilon',
      'delta': '\\delta',
      'pi': '\\pi',
  };

  const mathPackage = {
    'Math.pi': '\\pi',
    'Math.reals': '\\mathbb{R}',
    'Math.naturals': '\\mathbb{N}',
  };

  const textStopWords = new Set([
      'is', 'the', 'of', 'and', 'or', 'if', 'then', 'for', 'with', 'to', 'on', 'at', 'by', 'be',
      'let', 'since', 'continuous', 'given', 'example'
  ]);

  const processContent = (content) => {
      let result = content;
      result = result.replace(/\bepsilon\b/g, '\\epsilon');
      result = result.replace(/\bdelta\b/g, '\\delta');
      result = result.replace(/\bpi\b/g, '\\pi');
      result = result.replace(/\binf\b/g, '\\infty');
      result = result.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');
      result = result.replace(/\+-/g, '\\pm');
      return result;
  };

  lines.forEach((line, index) => {
    let processedLine = line.trim();

    if (!processedLine || processedLine.startsWith('//')) {
      return;
    }

    // Parse #define macros
    if (processedLine.startsWith('#define')) {
      const defineMatch = processedLine.match(/^#define\s+(\S+)\s+(.+)$/);
      if (defineMatch) {
        macros[defineMatch[1]] = defineMatch[2];
        console.log(`[MACRO DEFINED] ${defineMatch[1]} -> ${defineMatch[2]}`);
      }
      return;
    }

    // Scope handling
    const scopeMatch = processedLine.match(/^(Problem|Theorem|Proof|Case|Lemma)\s*(.*)\{\s*$/i);
    if (scopeMatch) {
        console.log(`[SCOPE] ${scopeMatch[1]} "${scopeMatch[2].trim()}" (level ${indentLevel})`);
        indentLevel++;
        outputLines.push({
            line: index + 1,
            latex: `\\textbf{${scopeMatch[1]} ${scopeMatch[2].trim()}}`,
            status: 'OK'
        });
        return;
    }

    if (processedLine === '}') {
        if (indentLevel > 0) indentLevel--;
        return;
    }

    // Apply macros
    Object.keys(macros).forEach(k => {
      if (processedLine.includes(k)) {
        processedLine = processedLine.split(k).join(macros[k]);
        console.log(`[MACRO APPLIED] ${k} on line ${index + 1}`);
      }
    });

    // Apply Math package
    Object.keys(mathPackage).forEach(k => {
      processedLine = processedLine.split(k).join(mathPackage[k]);
    });

    // Placeholder system
    const placeholders = [];
    const addPlaceholder = (latex) => {
        const id = `__PH${placeholders.length}__`;
        placeholders.push(latex);
        return id;
    };

    // Choose/Binomial
    processedLine = processedLine.replace(/choose\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, n, k) => {
        return addPlaceholder(`\\binom{${n.trim()}}{${k.trim()}}`);
    });

    // Factorial
    processedLine = processedLine.replace(/factorial\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`${content.trim()}!`);
    });

    // Integral with bounds
    processedLine = processedLine.replace(/integral\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
        return addPlaceholder(`\\int_{${processContent(from)}}^{${processContent(to)}}`);
    });

    // Sum with bounds
    processedLine = processedLine.replace(/sum\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
        return addPlaceholder(`\\sum_{${processContent(from)}}^{${processContent(to)}}`);
    });

    // Limit
    processedLine = processedLine.replace(/lim\s*_\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, variable, limit) => {
        return addPlaceholder(`\\lim_{${variable} \\to ${limit}}`);
    });

    // Square root
    processedLine = processedLine.replace(/sqrt\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`\\sqrt{${processContent(content)}}`);
    });

    // Fractions - this is the tricky part
    // Handle (...)/(...)
    processedLine = processedLine.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, (_, num, den) => {
        return addPlaceholder(`\\frac{${num}}{${den}}`);
    });

    // Restore placeholders
    let outputLatex = processedLine;
    placeholders.forEach((latex, i) => {
        outputLatex = outputLatex.replace(`__PH${i}__`, latex);
    });

    // Check for potential issues
    let status = 'OK';
    if (outputLatex.includes('__PH')) {
      status = 'ERROR: Unresolved placeholder';
    }

    // Try to detect unbalanced braces
    const openBraces = (outputLatex.match(/\{/g) || []).length;
    const closeBraces = (outputLatex.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      status = `ERROR: Unbalanced braces (${openBraces} open, ${closeBraces} close)`;
    }

    outputLines.push({
        line: index + 1,
        input: line.trim().substring(0, 60),
        latex: outputLatex.substring(0, 100),
        status: status
    });
  });

  return outputLines;
}

// Run test
console.log('=== COMPILING INITIAL_CONTENT ===\n');
const results = compileMathScript(INITIAL_CONTENT);

console.log('\n=== RESULTS ===\n');
let errors = 0;
results.forEach(r => {
  if (r.status !== 'OK') {
    console.log(`❌ Line ${r.line}: ${r.status}`);
    console.log(`   Input: ${r.input}`);
    console.log(`   LaTeX: ${r.latex}`);
    errors++;
  } else {
    console.log(`✅ Line ${r.line}: ${r.latex.substring(0, 80)}...`);
  }
});

console.log(`\n=== SUMMARY: ${errors} errors found ===`);
