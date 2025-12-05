
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
      'integral', 'sum', 'lim', 'sup', 'inf', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
      'exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'implies', 'iff', 'suchthat',
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
      'dot': '\\cdot',
      'suchthat': '\\text{ s.t. }',
      'QED': '\\hfill \\square',
      '{': '\\{',
      '}': '\\}',
      '|': '\\mid',
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
  const textStopWords = new Set([
      'is', 'a', 'the', 'of', 'and', 'or', 'if', 'then', 'else', 'for', 'with', 
      'to', 'in', 'on', 'at', 'by', 'be', 'let', 'assume', 'suppose', 'since', 'because', 'therefore', 'thus', 'hence',
      'so', 'we', 'have', 'show', 'prove', 'find', 'calculate', 'compute', 'given', 'where', 'when', 'that', 'this', 'it',
      'continuous', 'differentiable', 'integrable', 'bounded', 'converges', 'diverges', 'function', 'set', 'sequence', 'series',
      'exist' // Explicitly treat singular 'exist' as text
  ]);

  lines.forEach((line, index) => {
    let processedLine = line.trim();
    
    // Skip comments/empty/defines
    if (!processedLine || processedLine.startsWith('//') || processedLine.startsWith('#define')) {
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
                latex: `\\phantom{.} \\\\[${spaceSize}]`,
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
            latex: '\\\\[0.5em]', // Standard vertical break
            originalLine: index + 1
        });
        return;
    }

    // --- MACRO & COMPLEX REPLACEMENT ---
    Object.keys(macros).forEach(k => { processedLine = processedLine.split(k).join(macros[k]); });
    Object.keys(mathPackage).forEach(k => { processedLine = processedLine.split(k).join(mathPackage[k]); });

    processedLine = processedLine.replace(/integral\s*\((.*?)\s*->\s*(.*?)\)/g, '\\int_{$1}^{$2}');
    processedLine = processedLine.replace(/sum\s*\((.*?)\s*->\s*(.*?)\)/g, '\\sum_{$1}^{$2}');
    processedLine = processedLine.replace(/lim\s*_\s*\((.*?)\s*->\s*(.*?)\)/g, '\\lim_{$1 \\to $2}');
    // Fix vector spacing: <1, 2, 3> -> \langle 1, \; 2, \; 3 \rangle
    processedLine = processedLine.replace(/<([^>]+)>/g, (m, c) => `\\langle ${c.replace(/,/g, ',\\;')} \\rangle`);

    // --- SMART SEGMENTATION & TEXT DETECTION ---
    
    // 1. Tokenize: preserve delimiters, punctuation, and spaces
    const rawTokens = processedLine.split(/([=<>!+\-*/()\[\]{}|.,;:]+|\s+)/).filter(Boolean);
    
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
        if (/^[=<>!+\-*/()\[\]{}|.,;:]+$/.test(cleanToken)) {
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

        // 2. Is it a long word? (>1 char) and NOT explicitly a math variable
        const isSingleChar = cleanToken.length === 1;
        const isExplicitText = cleanToken === 'a' || cleanToken === 'I' || cleanToken === 'A';
        
        if (!isSingleChar || isExplicitText) {
             segments.push({ type: 'TEXT', content: token });
        } else {
             segments.push({ type: 'MATH', content: token });
        }
    }

    // --- REGROUPING FOR \text{...} ---
    let finalLatex = '';
    let currentTextGroup = '';

    const flushTextGroup = () => {
        if (currentTextGroup) {
            finalLatex += `\\text{${currentTextGroup}}`;
            currentTextGroup = '';
        }
    };

    segments.forEach(seg => {
        if (seg.type === 'TEXT' || (seg.type === 'SPACE' && currentTextGroup.length > 0)) {
            currentTextGroup += seg.content;
        } else {
            flushTextGroup();
            
            if (seg.type === 'SPACE') {
                // IMPORTANT: Output an explicit space in math mode so variables don't merge
                finalLatex += ' ';
            } else {
                finalLatex += seg.content;
            }
        }
    });
    flushTextGroup();

    const indentStr = Array(indentLevel).fill('\\quad ').join('');
    
    outputLines.push({
      id: `line-${index}`,
      latex: indentStr + finalLatex,
      originalLine: index + 1
    });
  });

  return { latexLines: outputLines, logs, macros };
};
