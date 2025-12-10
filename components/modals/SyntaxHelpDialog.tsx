import React, { useEffect, useState, useMemo } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { generateSyntaxReference } from '../../services/syntaxReference';

interface SyntaxHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

// Component to render LaTeX using KaTeX
const RenderedMath: React.FC<{ latex: string }> = ({ latex }) => {
  const html = useMemo(() => {
    if (!latex || latex === '-') return null;
    try {
      // @ts-ignore - katex is loaded globally
      return window.katex?.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return null;
    }
  }, [latex]);

  if (!html) return <span className="text-gray-500">-</span>;

  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="katex-inline"
    />
  );
};

export const SyntaxHelpDialog: React.FC<SyntaxHelpDialogProps> = ({
  isOpen,
  onClose,
  theme,
}) => {
  // Generate syntax data from compiler configuration
  const syntaxData = useMemo(() => generateSyntaxReference(), []);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(syntaxData.map(c => c.title))
  );
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
          relative w-[750px] max-h-[80vh] rounded-lg shadow-xl flex flex-col
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
                        <th className="text-left px-3 py-2 font-medium w-[35%]">Syntax</th>
                        <th className="text-left px-3 py-2 font-medium w-[30%]">Rendered</th>
                        <th className="text-left px-3 py-2 font-medium w-[35%]">Description</th>
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
                          <td className={`px-3 py-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                            <RenderedMath latex={item.output} />
                          </td>
                          <td className={`px-3 py-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
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
