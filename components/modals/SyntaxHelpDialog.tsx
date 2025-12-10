import React, { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';

interface SyntaxHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

interface SyntaxCategory {
  title: string;
  items: { syntax: string; output: string; description?: string }[];
}

const syntaxData: SyntaxCategory[] = [
  {
    title: 'Basic Math',
    items: [
      { syntax: 'a/b', output: '\\frac{a}{b}', description: 'Fraction' },
      { syntax: '(a+b)/(c+d)', output: '\\frac{a+b}{c+d}', description: 'Complex fraction' },
      { syntax: 'sqrt(x)', output: '\\sqrt{x}', description: 'Square root' },
      { syntax: 'x^2', output: 'x^2', description: 'Superscript/power' },
      { syntax: 'x_i', output: 'x_i', description: 'Subscript' },
      { syntax: 'x_ij', output: 'x_{ij}', description: 'Multi-char subscript' },
      { syntax: '|x|', output: '|x|', description: 'Absolute value' },
      { syntax: '+-', output: '\\pm', description: 'Plus-minus' },
      { syntax: '-+', output: '\\mp', description: 'Minus-plus' },
    ],
  },
  {
    title: 'Functions',
    items: [
      { syntax: 'sin(x)', output: '\\sin(x)', description: 'Sine' },
      { syntax: 'cos(x)', output: '\\cos(x)', description: 'Cosine' },
      { syntax: 'tan(x)', output: '\\tan(x)', description: 'Tangent' },
      { syntax: 'log(x)', output: '\\log(x)', description: 'Logarithm' },
      { syntax: 'ln(x)', output: '\\ln(x)', description: 'Natural log' },
      { syntax: 'exp(x)', output: '\\exp(x)', description: 'Exponential' },
      { syntax: 'factorial(n)', output: 'n!', description: 'Factorial' },
      { syntax: 'factorial(n-1)', output: '(n-1)!', description: 'Factorial with expression' },
    ],
  },
  {
    title: 'Calculus',
    items: [
      { syntax: 'integral(a -> b) f(x) dx', output: '\\int_a^b f(x)\\,dx', description: 'Definite integral' },
      { syntax: 'integral f(x) dx', output: '\\int f(x)\\,dx', description: 'Indefinite integral' },
      { syntax: 'sum(i=1 -> n) a_i', output: '\\sum_{i=1}^{n} a_i', description: 'Summation' },
      { syntax: 'prod(i=1 -> n) a_i', output: '\\prod_{i=1}^{n} a_i', description: 'Product' },
      { syntax: 'lim(x -> 0) f(x)', output: '\\lim_{x \\to 0} f(x)', description: 'Limit' },
      { syntax: 'lim(x -> inf) f(x)', output: '\\lim_{x \\to \\infty} f(x)', description: 'Limit to infinity' },
    ],
  },
  {
    title: 'Combinatorics',
    items: [
      { syntax: 'choose(n, k)', output: '\\binom{n}{k}', description: 'Binomial coefficient' },
      { syntax: 'factorial(n)', output: 'n!', description: 'Factorial' },
    ],
  },
  {
    title: 'Greek Letters',
    items: [
      { syntax: 'alpha, beta, gamma', output: '\\alpha, \\beta, \\gamma' },
      { syntax: 'delta, epsilon, theta', output: '\\delta, \\epsilon, \\theta' },
      { syntax: 'lambda, sigma, omega', output: '\\lambda, \\sigma, \\omega' },
      { syntax: 'pi, phi, psi', output: '\\pi, \\phi, \\psi' },
      { syntax: 'mu, nu, rho, tau', output: '\\mu, \\nu, \\rho, \\tau' },
      { syntax: 'eta, zeta, xi', output: '\\eta, \\zeta, \\xi' },
    ],
  },
  {
    title: 'Math Constants',
    items: [
      { syntax: 'Math.pi', output: '\\pi', description: 'Pi' },
      { syntax: 'Math.e', output: 'e', description: "Euler's number" },
      { syntax: 'Math.inf or inf', output: '\\infty', description: 'Infinity' },
      { syntax: 'Math.reals', output: '\\mathbb{R}', description: 'Real numbers' },
      { syntax: 'Math.naturals', output: '\\mathbb{N}', description: 'Natural numbers' },
      { syntax: 'Math.integers', output: '\\mathbb{Z}', description: 'Integers' },
      { syntax: 'Math.rationals', output: '\\mathbb{Q}', description: 'Rationals' },
      { syntax: 'Math.complex', output: '\\mathbb{C}', description: 'Complex numbers' },
    ],
  },
  {
    title: 'Logic & Quantifiers',
    items: [
      { syntax: 'forall', output: '\\forall', description: 'For all' },
      { syntax: 'exists', output: '\\exists', description: 'There exists' },
      { syntax: 'AND', output: '\\land', description: 'Logical and' },
      { syntax: 'OR', output: '\\lor', description: 'Logical or' },
      { syntax: 'NOT', output: '\\neg', description: 'Logical not' },
      { syntax: '=>', output: '\\implies', description: 'Implies' },
      { syntax: '<=>', output: '\\iff', description: 'If and only if' },
      { syntax: 'suchthat', output: '\\mid', description: 'Such that' },
    ],
  },
  {
    title: 'Sets',
    items: [
      { syntax: 'in', output: '\\in', description: 'Element of' },
      { syntax: 'notin', output: '\\notin', description: 'Not element of' },
      { syntax: 'subset', output: '\\subset', description: 'Subset' },
      { syntax: 'superset', output: '\\supset', description: 'Superset' },
      { syntax: 'union', output: '\\cup', description: 'Union' },
      { syntax: 'intersect', output: '\\cap', description: 'Intersection' },
      { syntax: 'emptyset', output: '\\emptyset', description: 'Empty set' },
      { syntax: '{x in R suchthat x > 0}', output: '\\{x \\in \\mathbb{R} \\mid x > 0\\}', description: 'Set builder' },
    ],
  },
  {
    title: 'Comparisons',
    items: [
      { syntax: '<=', output: '\\leq', description: 'Less than or equal' },
      { syntax: '>=', output: '\\geq', description: 'Greater than or equal' },
      { syntax: '!=', output: '\\neq', description: 'Not equal' },
      { syntax: '~=', output: '\\approx', description: 'Approximately' },
      { syntax: '===', output: '\\equiv', description: 'Equivalent' },
    ],
  },
  {
    title: 'Document Structure',
    items: [
      { syntax: 'Problem Name { ... }', output: '', description: 'Problem block' },
      { syntax: 'Theorem Name { ... }', output: '', description: 'Theorem block' },
      { syntax: 'Proof { ... }', output: '', description: 'Proof block' },
      { syntax: 'Lemma Name { ... }', output: '', description: 'Lemma block' },
      { syntax: 'Case Name { ... }', output: '', description: 'Case block' },
      { syntax: '// comment', output: '', description: 'Single-line comment' },
      { syntax: '#define short long', output: '', description: 'Macro definition' },
    ],
  },
  {
    title: 'Vectors & Matrices',
    items: [
      { syntax: 'vec(v)', output: '\\vec{v}', description: 'Vector arrow' },
      { syntax: 'hat(x)', output: '\\hat{x}', description: 'Hat notation' },
      { syntax: 'bar(x)', output: '\\bar{x}', description: 'Bar notation' },
      { syntax: 'dot(x)', output: '\\dot{x}', description: 'Dot (derivative)' },
      { syntax: 'ddot(x)', output: '\\ddot{x}', description: 'Double dot' },
    ],
  },
];

export const SyntaxHelpDialog: React.FC<SyntaxHelpDialogProps> = ({
  isOpen,
  onClose,
  theme,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(syntaxData.map(c => c.title)));
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleCategory = (title: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={`
          relative w-[700px] max-h-[80vh] rounded-lg shadow-xl flex flex-col
          ${isDark ? 'bg-[#1e1e1e] text-gray-200' : 'bg-white text-gray-800'}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-5 py-4 border-b shrink-0
          ${isDark ? 'border-[#333]' : 'border-gray-200'}
        `}>
          <h2 className="text-lg font-semibold">MathScript Syntax Reference</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded hover:bg-opacity-20 ${isDark ? 'hover:bg-white' : 'hover:bg-black'}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 flex-1">
          {syntaxData.map((category) => (
            <div key={category.title} className="mb-4">
              <button
                onClick={() => toggleCategory(category.title)}
                className={`
                  flex items-center gap-2 w-full text-left py-2 px-2 rounded
                  ${isDark ? 'hover:bg-[#2a2a2a]' : 'hover:bg-gray-100'}
                `}
              >
                {expandedCategories.has(category.title) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <span className="font-medium">{category.title}</span>
              </button>

              {expandedCategories.has(category.title) && (
                <div className={`
                  mt-2 ml-6 rounded overflow-hidden border
                  ${isDark ? 'border-[#333]' : 'border-gray-200'}
                `}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={isDark ? 'bg-[#252526]' : 'bg-gray-50'}>
                        <th className="text-left px-3 py-2 font-medium">Syntax</th>
                        <th className="text-left px-3 py-2 font-medium">Output</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {category.items.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`
                            border-t
                            ${isDark ? 'border-[#333]' : 'border-gray-100'}
                            ${isDark ? 'hover:bg-[#2a2a2a]' : 'hover:bg-gray-50'}
                          `}
                        >
                          <td className={`px-3 py-2 font-mono text-xs ${isDark ? 'text-[#ce9178]' : 'text-orange-700'}`}>
                            {item.syntax}
                          </td>
                          <td className={`px-3 py-2 font-mono text-xs ${isDark ? 'text-[#9cdcfe]' : 'text-blue-700'}`}>
                            {item.output || '-'}
                          </td>
                          <td className={`px-3 py-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {item.description || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`
          px-5 py-3 border-t text-xs shrink-0
          ${isDark ? 'border-[#333] text-gray-500' : 'border-gray-200 text-gray-500'}
        `}>
          Tip: Use <code className="px-1 py-0.5 rounded bg-black/10">#define short long</code> to create custom shortcuts
        </div>
      </div>
    </div>
  );
};
