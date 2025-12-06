
import { CompilationResult, LogEntry } from '../types';

export const compileMathScript = (input: string): CompilationResult => {
  const lines = input.split('\n');
  const macros: Record<string, string> = {};
  const outputLines: { id: string; latex: string; originalLine: number }[] = [];
  const logs: LogEntry[] = [];
  
  // Track indentation for scopes
  let indentLevel = 0;

  // --- CONFIGURATION ---

  // 1. Math Keywords (Reserved words that are ALWAYS math/symbols)
  const mathKeywords = new Set([
      'integral', 'sum', 'lim', 'sup', 'inf', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sqrt',
      'exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'implies', 'iff', 'suchthat',
      'AND', 'OR', 'NOT', 'and', 'or', 'not',
      'delta', 'alpha', 'beta', 'gamma', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi', 'mu', 'phi', 'rho', 'tau', 'zeta', 'eta', 'chi', 'psi', 'nu', 'kappa', 'iota', 'xi', 'upsilon',
      'Delta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Omega', 'Pi', 'Phi', 'Psi', 'Xi',
      'dx', 'dy', 'dz', 'dt', 'du', 'dv',
      'QED', 'Math', 'det', 'max', 'min'
  ]);

  // 2. Direct Replacements for Keywords -> LaTeX
  const symbolMap: Record<string, string> = {
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
      // Greek
      'delta': '\\delta', 'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'epsilon': '\\epsilon', 
      'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma', 'omega': '\\omega', 'pi': '\\pi',
      'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho', 'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta',
      'Delta': '\\Delta', 'Gamma': '\\Gamma', 'Theta': '\\Theta', 'Lambda': '\\Lambda', 
      'Sigma': '\\Sigma', 'Omega': '\\Omega', 'Pi': '\\Pi', 'Phi': '\\Phi'
  };

  // 3. Math Package Mappings
  const mathPackage: Record<string, string> = {
    'Math.pi': '\\pi', 'Math.e': 'e', 'Math.inf': '\\infty',
    'Math.reals': '\\mathbb{R}', 'Math.naturals': '\\mathbb{N}', 
    'Math.integers': '\\mathbb{Z}', 'Math.rationals': '\\mathbb{Q}', 
    'Math.complex': '\\mathbb{C}',
  };

  // 4. Text Stop Words (Always render as text)
  // Note: 'a' is NOT included - it should be a math variable in most contexts
  const textStopWords = new Set([
      'is', 'the', 'of', 'and', 'or', 'if', 'then', 'else', 'for', 'with',
      'to', 'on', 'at', 'by', 'be', 'let', 'assume', 'suppose', 'since', 'because', 'therefore', 'thus', 'hence',
      'so', 'we', 'have', 'show', 'prove', 'find', 'calculate', 'compute', 'given', 'where', 'when', 'that', 'this', 'it',
      'continuous', 'differentiable', 'integrable', 'bounded', 'converges', 'diverges', 'function', 'set', 'sequence', 'series',
      'exist', 'non', 'empty', 'no', 'any', 'can', 'there' // Added common prose words
  ]);

  lines.forEach((line, index) => {
    let processedLine = line.trim();
    
    // Skip empty lines and comments
    if (!processedLine || processedLine.startsWith('//')) {
      return;
    }

    // Parse #define macros: #define shortcut replacement
    if (processedLine.startsWith('#define')) {
      const defineMatch = processedLine.match(/^#define\s+(\S+)\s+(.+)$/);
      if (defineMatch) {
        const [, shortcut, replacement] = defineMatch;
        macros[shortcut] = replacement;
      }
      return;
    }

    // --- SCOPE HANDLING ---
    // Regex allows trailing whitespace after {
    const scopeMatch = processedLine.match(/^(Problem|Subproblem|Section|Part|Theorem|Proof|Case|Lemma)\s*(.*)\{\s*$/i);
    if (scopeMatch) {
        const type = scopeMatch[1];
        const title = scopeMatch[2].trim();
        const indentStr = Array(indentLevel).fill('\\quad ').join('');
        
        // Dynamic Size & Spacing based on nesting level
        let sizeCmd = '\\normalsize';
        let spaceSize = '0.5em';

        if (indentLevel === 0) {
            // Main Problem
            spaceSize = '1.5em';
            sizeCmd = '\\huge';
        } else if (indentLevel === 1) {
            // Theorem/Proof
            spaceSize = '1em';
            sizeCmd = '\\Large';
        } else if (indentLevel === 2) {
            // Case
            spaceSize = '0.5em';
            sizeCmd = '\\large';
        } else {
            spaceSize = '0.2em';
        }
        
        // Add spacer line before the header to prevent clumping
        if (index > 0) {
             outputLines.push({
                id: `spacer-${index}`,
                latex: `\\rule{0pt}{${spaceSize}}`,
                originalLine: index
             });
        }

        // Correct KaTeX syntax: Size command must wrap the text content, not be inside \text
        // Use { \size \textbf{\text{...}} }
        outputLines.push({
            id: `line-${index}`, 
            latex: `${indentStr}{${sizeCmd} \\textbf{\\text{${type} ${title}}}}`,
            originalLine: index + 1
        });
        indentLevel++; 
        return; 
    }

    if (processedLine === '}') {
        if (indentLevel > 0) indentLevel--;
        outputLines.push({
            id: `line-${index}`,
            latex: '\\rule{0pt}{0.5em}', // Standard vertical break
            originalLine: index + 1
        });
        return;
    }

    // --- MACRO & COMPLEX REPLACEMENT ---
    // Use word boundary regex to avoid matching inside other words (e.g., 'N' inside 'AND')
    Object.keys(macros).forEach(k => {
        const regex = new RegExp(`\\b${k}\\b`, 'g');
        processedLine = processedLine.replace(regex, macros[k]);
    });
    Object.keys(mathPackage).forEach(k => { processedLine = processedLine.split(k).join(mathPackage[k]); });

    // Placeholder system: protect complex LaTeX constructs from tokenization
    const placeholders: string[] = [];
    const addPlaceholder = (latex: string): string => {
        const id = `__PH${placeholders.length}__`;
        placeholders.push(latex);
        return id;
    };

    // Helper to recursively process content (for nested constructs)
    const greekLetters: Record<string, string> = {
        'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
        'epsilon': '\\epsilon', 'theta': '\\theta', 'lambda': '\\lambda', 'sigma': '\\sigma',
        'omega': '\\omega', 'pi': '\\pi', 'mu': '\\mu', 'phi': '\\phi', 'rho': '\\rho',
        'tau': '\\tau', 'zeta': '\\zeta', 'eta': '\\eta', 'chi': '\\chi', 'psi': '\\psi',
        'nu': '\\nu', 'kappa': '\\kappa', 'iota': '\\iota', 'xi': '\\xi', 'upsilon': '\\upsilon',
        'Delta': '\\Delta', 'Gamma': '\\Gamma', 'Theta': '\\Theta', 'Lambda': '\\Lambda',
        'Sigma': '\\Sigma', 'Omega': '\\Omega', 'Pi': '\\Pi', 'Phi': '\\Phi', 'Psi': '\\Psi', 'Xi': '\\Xi'
    };
    const processContent = (content: string): string => {
        let result = content;
        // Apply Greek letters
        Object.entries(greekLetters).forEach(([name, latex]) => {
            result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), latex);
        });
        // Apply common math symbols
        result = result.replace(/\binf\b/g, '\\infty');
        // Apply subscripts/superscripts to content
        result = result.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');
        result = result.replace(/([a-zA-Z0-9])(?<![\\])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');
        // Apply plus-minus/minus-plus
        result = result.replace(/\+-/g, '\\pm');
        result = result.replace(/-\+/g, '\\mp');
        return result;
    };

    // Integral with bounds: integral(a -> b) -> \int_{a}^{b}
    processedLine = processedLine.replace(/integral\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
        return addPlaceholder(`\\int_{${processContent(from)}}^{${processContent(to)}}`);
    });

    // Sum with bounds: sum(i=1 -> n) -> \sum_{i=1}^{n}
    processedLine = processedLine.replace(/sum\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, from, to) => {
        return addPlaceholder(`\\sum_{${processContent(from)}}^{${processContent(to)}}`);
    });

    // Limit: lim_(x -> 0) -> \lim_{x \to 0}
    processedLine = processedLine.replace(/lim\s*_\s*\(\s*(.*?)\s*->\s*(.*?)\s*\)/g, (_, variable, limit) => {
        return addPlaceholder(`\\lim_{${processContent(variable)} \\to ${processContent(limit)}}`);
    });

    // Square root: sqrt(x) -> \sqrt{x}
    processedLine = processedLine.replace(/sqrt\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`\\sqrt{${processContent(content)}}`);
    });

    // Vector: vec(x) -> \vec{x}
    processedLine = processedLine.replace(/vec\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`\\vec{${processContent(content)}}`);
    });

    // Trig and other functions: sin(x) -> \sin(x), cos(x) -> \cos(x), etc.
    const mathFunctions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp'];
    mathFunctions.forEach(fn => {
        const regex = new RegExp(`\\b${fn}\\s*\\(\\s*([^)]+)\\s*\\)`, 'g');
        processedLine = processedLine.replace(regex, (_, content) => {
            return addPlaceholder(`\\${fn}(${processContent(content)})`);
        });
    });

    // Vector notation: <1, 2, 3> -> \langle 1, 2, 3 \rangle
    processedLine = processedLine.replace(/<([^>]+)>/g, (_, content) => {
        return addPlaceholder(`\\langle ${content.replace(/,/g, ', ')} \\rangle`);
    });

    // Choose/Binomial: choose(n, k) -> \binom{n}{k}
    processedLine = processedLine.replace(/choose\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, n, k) => {
        return addPlaceholder(`\\binom{${processContent(n.trim())}}{${processContent(k.trim())}}`);
    });

    // Factorial: factorial(n) -> n!
    processedLine = processedLine.replace(/factorial\s*\(\s*([^)]+)\s*\)/g, (_, content) => {
        return addPlaceholder(`${processContent(content.trim())}!`);
    });

    // Absolute value: |...| -> \left|...\right|
    // Handle nested absolute values by processing from innermost outward
    let absChanged = true;
    while (absChanged) {
        absChanged = false;
        // Match |...| where content doesn't contain unmatched |
        processedLine = processedLine.replace(/\|([^|]+)\|/g, (_, content) => {
            absChanged = true;
            return addPlaceholder(`\\left|${processContent(content)}\\right|`);
        });
    }

    // Fractions: (a)/(b) -> \frac{a}{b}
    // Helper to find matching closing paren, handling nesting
    const findMatchingParen = (str: string, startIdx: number): number => {
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

    // Handle parenthesized fractions with proper nesting: (...)/(...)
    const handleParenFractions = (line: string): string => {
        let result = line;
        let changed = true;
        while (changed) {
            changed = false;
            // Look for pattern: (...)/(...) or (...)/simple
            for (let i = 0; i < result.length; i++) {
                if (result[i] === '(' ) {
                    const closeIdx = findMatchingParen(result, i + 1);
                    if (closeIdx === -1) continue;

                    // Check if followed by /
                    let afterClose = closeIdx + 1;
                    while (afterClose < result.length && result[afterClose] === ' ') afterClose++;

                    if (result[afterClose] === '/') {
                        const num = result.substring(i + 1, closeIdx);
                        let afterSlash = afterClose + 1;
                        while (afterSlash < result.length && result[afterSlash] === ' ') afterSlash++;

                        if (result[afterSlash] === '(') {
                            // (...)/(...) case
                            const denCloseIdx = findMatchingParen(result, afterSlash + 1);
                            if (denCloseIdx !== -1) {
                                const den = result.substring(afterSlash + 1, denCloseIdx);
                                const placeholder = addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
                                result = result.substring(0, i) + placeholder + result.substring(denCloseIdx + 1);
                                changed = true;
                                break;
                            }
                        } else {
                            // (...)/simple case
                            const match = result.substring(afterSlash).match(/^([a-zA-Z0-9_]+|\\_PH\d+__)/);
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
        }
        return result;
    };
    processedLine = handleParenFractions(processedLine);

    // Handle simple a/b (no parens)
    processedLine = processedLine.replace(/([a-zA-Z0-9]+)\s*\/\s*([a-zA-Z0-9]+)/g, (_, num, den) => {
        return addPlaceholder(`\\frac{${processContent(num)}}{${processContent(den)}}`);
    });

    // Subscripts: a_i -> a_{i}
    processedLine = processedLine.replace(/([a-zA-Z])_([a-zA-Z0-9]+)(?![{}])/g, '$1_{$2}');

    // Superscripts with parenthesized content: e^(i * pi) -> e^{i * pi}
    // Use a function to handle nested parentheses properly
    const handleParenthesizedExponent = (line: string): string => {
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
                        // Process the content recursively for any nested constructs
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

    // Superscripts: x^2 -> x^{2} (simple alphanumeric exponents)
    processedLine = processedLine.replace(/([a-zA-Z0-9\}])\^([a-zA-Z0-9]+)(?![{}])/g, '$1^{$2}');

    // --- SMART SEGMENTATION & TEXT DETECTION ---

    // 1. Tokenize: preserve delimiters, punctuation, and spaces
    // Note: We exclude {} from the split to preserve LaTeX commands like \int_{1}^{20}
    const rawTokens = processedLine.split(/([=<>!+\-*/()\[\]|.,;:]+|\s+)/).filter(Boolean);
    
    let segments: { type: 'TEXT' | 'MATH' | 'SPACE'; content: string }[] = [];
    
    for (let i = 0; i < rawTokens.length; i++) {
        const token = rawTokens[i];
        
        // Whitespace
        if (/^\s+$/.test(token)) {
            segments.push({ type: 'SPACE', content: ' ' }); // Normalize space
            continue;
        }

        const cleanToken = token.trim();

        // Operators/Punctuation -> MATH (or just raw chars)
        if (/^[=<>!+\-*/()\[\]|.,;:]+$/.test(cleanToken)) {
             segments.push({ type: 'MATH', content: symbolMap[cleanToken] || cleanToken });
             continue;
        }

        // Numbers -> MATH
        if (/^\d+(\.\d+)?$/.test(cleanToken)) {
            segments.push({ type: 'MATH', content: cleanToken });
            continue;
        }

        // Keywords -> MATH
        if (mathKeywords.has(cleanToken) || symbolMap[cleanToken]) {
            segments.push({ type: 'MATH', content: symbolMap[cleanToken] || cleanToken });
            continue;
        }

        // --- HEURISTIC TEXT DETECTION ---
        // 1. Is it a stop word? (is, the, let...)
        if (textStopWords.has(cleanToken.toLowerCase())) {
             segments.push({ type: 'TEXT', content: token }); 
             continue;
        }

        // 2. Handle single character 'a' - could be article or variable
        // If followed by space + text word (not a math keyword), it's likely the article
        if (cleanToken === 'a' || cleanToken === 'A') {
            // Look ahead: space followed by text?
            const nextToken = rawTokens[i + 1];
            const tokenAfterNext = rawTokens[i + 2];
            if (nextToken && /^\s+$/.test(nextToken) && tokenAfterNext) {
                const nextClean = tokenAfterNext.trim();
                // If next token is a math keyword or symbol, 'a' is a variable
                if (mathKeywords.has(nextClean) || symbolMap[nextClean]) {
                    segments.push({ type: 'MATH', content: token });
                    continue;
                }
                // If next non-space token is a multi-char word, 'a' is the article
                if (nextClean.length > 1 && !/^[=<>!+\-*/()\[\]|.,;:]+$/.test(nextClean)) {
                    segments.push({ type: 'TEXT', content: token });
                    continue;
                }
            }
            // Otherwise it's a math variable
            segments.push({ type: 'MATH', content: token });
            continue;
        }

        // 3. Check if it's a placeholder - always MATH
        if (cleanToken.startsWith('__PH') && cleanToken.endsWith('__')) {
            segments.push({ type: 'MATH', content: token });
            continue;
        }

        // 4. Check if it's a LaTeX command (starts with \) - always MATH
        if (cleanToken.startsWith('\\')) {
            segments.push({ type: 'MATH', content: token });
            continue;
        }

        // 5. Check if it contains subscript/superscript notation (a_{i}, x^{2}) - always MATH
        if (/[_^]/.test(cleanToken)) {
            segments.push({ type: 'MATH', content: token });
            continue;
        }

        // 5. Is it a long word? (>1 char) -> treat as text
        // Single characters are math variables (b, c, x, y, z, etc.)
        const isSingleChar = cleanToken.length === 1;

        if (!isSingleChar) {
             segments.push({ type: 'TEXT', content: token });
        } else {
             segments.push({ type: 'MATH', content: token });
        }
    }

    // --- REGROUPING FOR \text{...} ---
    let finalLatex = '';
    let currentTextGroup = '';
    let lastSegType: 'TEXT' | 'MATH' | 'SPACE' | null = null;
    let lastMathContent = '';
    let hadSpaceBeforeCurrentGroup = false;

    // Brackets/parens that should NOT have space after them
    const openBrackets = new Set(['[', '(', '{', '\\langle']);
    // Brackets/parens that should NOT have space before them
    const closeBrackets = new Set([']', ')', '}', '\\rangle', ',', '.', ';', ':']);

    const flushTextGroup = (addSpaceAfter = false) => {
        if (currentTextGroup) {
            const trimmed = currentTextGroup.trimEnd();
            if (trimmed) {
                finalLatex += `\\text{${trimmed}}`;
                if (addSpaceAfter) {
                    finalLatex += '\\ ';
                }
            }
            currentTextGroup = '';
        }
    };

    segments.forEach((seg, idx) => {
        if (seg.type === 'TEXT') {
            // Check if we need space before this text
            const needsSpace = currentTextGroup === '' && finalLatex.length > 0 &&
                              !openBrackets.has(lastMathContent);

            if (needsSpace && (lastSegType === 'MATH' || lastSegType === 'SPACE')) {
                finalLatex += '\\ ';
            }
            currentTextGroup += seg.content;
            lastSegType = 'TEXT';
            hadSpaceBeforeCurrentGroup = false;
        } else if (seg.type === 'SPACE') {
            if (currentTextGroup.length > 0) {
                currentTextGroup += seg.content;
                hadSpaceBeforeCurrentGroup = true;
            }
            lastSegType = 'SPACE';
        } else {
            // MATH token
            const mathContent = seg.content;

            // Handle hyphen between text words: convert to text hyphen
            if (mathContent === '-' && lastSegType === 'TEXT' && currentTextGroup.length > 0) {
                // Check if next segment is also text
                const nextSeg = segments[idx + 1];
                if (nextSeg && nextSeg.type === 'TEXT') {
                    // Keep hyphen in text group
                    currentTextGroup += '-';
                    return; // Skip normal math processing
                }
            }

            // Determine if we need space after flushing text group
            const needsSpaceAfterText = currentTextGroup.length > 0 &&
                                        hadSpaceBeforeCurrentGroup &&
                                        !closeBrackets.has(mathContent);

            flushTextGroup(needsSpaceAfterText);

            // Add space before math if needed (but not after open brackets or before close brackets)
            // Only if we didn't just add a space after text
            const needsSpaceBefore = !needsSpaceAfterText &&
                                     lastSegType === 'SPACE' &&
                                     finalLatex.length > 0 &&
                                     !openBrackets.has(lastMathContent) &&
                                     !closeBrackets.has(mathContent);

            if (needsSpaceBefore) {
                finalLatex += '\\ ';
            }

            finalLatex += mathContent;
            lastSegType = 'MATH';
            lastMathContent = mathContent;
            hadSpaceBeforeCurrentGroup = false;
        }
    });
    flushTextGroup();

    // Restore placeholders with actual LaTeX (loop until all nested placeholders resolved)
    let outputLatex = finalLatex;
    let maxIterations = 10; // Safety limit
    while (maxIterations-- > 0 && outputLatex.includes('__PH')) {
        placeholders.forEach((latex, i) => {
            outputLatex = outputLatex.replace(`__PH${i}__`, latex);
        });
    }

    const indentStr = Array(indentLevel).fill('\\quad ').join('');

    outputLines.push({
      id: `line-${index}`,
      latex: indentStr + outputLatex,
      originalLine: index + 1
    });
  });

  return { latexLines: outputLines, logs, macros };
};
