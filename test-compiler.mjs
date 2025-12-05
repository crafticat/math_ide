// End-to-end test of the compiler
const testCases = [
    '(sqrt(x + 25))/(30)',
    'sqrt(a^2 + b^2)',
    '(a + b)/(c + d)',
    'x/y',
    'a_i = 25',
    'A AND B',
    'A OR B',
    'NOT A',
    'integral(0 -> 10) x^2 dx',
    'x = (-b +- sqrt(b^2 - 4ac))/(2a)',
    '(cos(alpha) * cos(beta) -+ sin(alpha) * sin(beta))/(25)',
    'e^(i * pi) + 1 = 0',
    'x^(2n + 1)',
    'a^(b + c) * d^(e - f)',
];

// Simplified compiler logic for testing
const placeholders = [];
const addPlaceholder = (latex) => {
    const id = `__PH${placeholders.length}__`;
    placeholders.push(latex);
    return id;
};

const greekLetters = {
    'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
    'epsilon': '\\epsilon', 'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma',
    'omega': '\\omega', 'pi': '\\pi', 'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho',
    'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta'
};
const processContent = (content) => {
    let result = content;
    // Apply Greek letters
    Object.entries(greekLetters).forEach(([name, latex]) => {
        result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), latex);
    });
    result = result.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');
    result = result.replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');
    result = result.replace(/\+-/g, '\\pm');
    result = result.replace(/-\+/g, '\\mp');
    return result;
};

function compileLine(inputLine) {
    placeholders.length = 0; // Reset
    let processedLine = inputLine;

    // Integral
    processedLine = processedLine.replace(/integral\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
        return addPlaceholder(`\\int_{${processContent(from)}}^{${processContent(to)}}`);
    });

    // sqrt
    processedLine = processedLine.replace(/sqrt\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`\\sqrt{${processContent(content)}}`);
    });

    // Trig and other functions
    const mathFunctions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp'];
    mathFunctions.forEach(fn => {
        const regex = new RegExp(`\\b${fn}\\s*\\(\\s*([^)]+)\\s*\\)`, 'g');
        processedLine = processedLine.replace(regex, (_, content) => {
            return addPlaceholder(`\\${fn}(${processContent(content)})`);
        });
    });

    // Fractions
    processedLine = processedLine.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, (_, num, den) => {
        return addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
    });
    processedLine = processedLine.replace(/([a-zA-Z0-9]+)\s*\/\s*([a-zA-Z0-9]+)/g, (_, num, den) => {
        return addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
    });

    // Subscripts
    processedLine = processedLine.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');

    // Superscripts with parenthesized content: e^(i * pi) -> e^{i * pi}
    const handleParenthesizedExponent = (line) => {
        let result = '';
        let i = 0;
        while (i < line.length) {
            // Look for pattern: char^(
            if (i > 0 && line[i] === '^' && line[i + 1] === '(') {
                const baseChar = result[result.length - 1];
                if (/[a-zA-Z0-9\}]/.test(baseChar)) {
                    // Find matching closing parenthesis
                    let depth = 1;
                    let j = i + 2;
                    while (j < line.length && depth > 0) {
                        if (line[j] === '(') depth++;
                        else if (line[j] === ')') depth--;
                        j++;
                    }
                    if (depth === 0) {
                        // Extract content between parentheses
                        const exponentContent = line.substring(i + 2, j - 1);
                        // Process the content recursively
                        const processedExponent = processContent(exponentContent);
                        result += `^{${processedExponent}}`;
                        i = j;
                        continue;
                    }
                }
            }
            result += line[i];
            i++;
        }
        return result;
    };
    processedLine = handleParenthesizedExponent(processedLine);

    // Simple superscripts: x^2 -> x^{2}
    processedLine = processedLine.replace(/([a-zA-Z0-9])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');

    // AND/OR/NOT
    processedLine = processedLine.replace(/\bAND\b/g, '\\land');
    processedLine = processedLine.replace(/\bOR\b/g, '\\lor');
    processedLine = processedLine.replace(/\bNOT\b/g, '\\neg');

    // Plus-minus / Minus-plus
    processedLine = processedLine.replace(/\+-/g, '\\pm');
    processedLine = processedLine.replace(/-\+/g, '\\mp');

    // Restore placeholders (loop until all nested placeholders resolved)
    let maxIterations = 10;
    while (maxIterations-- > 0 && processedLine.includes('__PH')) {
        placeholders.forEach((latex, i) => {
            processedLine = processedLine.replace(`__PH${i}__`, latex);
        });
    }

    return processedLine;
}

console.log('=== COMPILER TESTS ===\n');

testCases.forEach((testCase, i) => {
    console.log(`Test ${i + 1}: "${testCase}"`);
    const result = compileLine(testCase);
    console.log(`Output: ${result}`);

    // Validation
    if (testCase.includes('sqrt') && result.includes('\\sqrt{') && !result.includes('\\text{')) {
        console.log('✅ sqrt correct');
    }
    if (testCase.includes('/') && result.includes('\\frac{') && result.match(/\\frac\{[^}]+\}\{[^}]+\}/)) {
        console.log('✅ frac correct');
    }
    if (testCase.includes('AND') && result.includes('\\land')) {
        console.log('✅ AND correct');
    }
    if (testCase.includes('OR') && result.includes('\\lor')) {
        console.log('✅ OR correct');
    }
    if (testCase.includes('+-') && result.includes('\\pm')) {
        console.log('✅ +- correct');
    }
    console.log('');
});
