
import React, { useEffect, useRef, useState } from 'react';
import { DARK_THEME, LIGHT_THEME } from '../constants';
import { Eye } from 'lucide-react';

// Declare KaTeX globally
declare global {
  interface Window {
    katex: any;
  }
}

interface PreviewProps {
  latexLines: { id: string; latex: string; originalLine: number }[];
  theme?: 'dark' | 'light';
}

interface EquationBlockProps {
  latex: string;
  lineNumber: number;
  theme: 'dark' | 'light';
}

const EquationBlock: React.FC<EquationBlockProps> = ({ latex, lineNumber, theme }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

    useEffect(() => {
        if (!ref.current || !window.katex) return;

        // Handle lines that are purely whitespace or empty
        if (!latex || !latex.trim()) {
            ref.current.innerHTML = '<div style="height: 0.75em;"></div>';
            return;
        }

        try {
            const html = window.katex.renderToString(latex, {
                throwOnError: false,
                errorColor: '#ff6b6b',
                displayMode: true,
                output: 'html',
                strict: false,
                trust: true,
                fleqn: true
            });

            ref.current.innerHTML = html;
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Invalid LaTeX");
        }
    }, [latex]);

    if (error) {
        return (
            <div className="my-1.5 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-xs font-mono">
                <div className="font-semibold mb-1 text-red-300">Rendering Error</div>
                <div className="opacity-80">{error}</div>
                <div className="mt-2 text-gray-500 text-[10px] truncate">LaTeX: {latex}</div>
            </div>
        );
    }

    return (
        <div
            className="group flex items-start rounded transition-colors duration-150"
            style={{ backgroundColor: 'transparent' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
            <div
                className="flex-shrink-0 w-8 pt-2 text-[10px] font-mono text-right pr-2 select-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: colors.textDim }}
            >
                {lineNumber}
            </div>
            <div
                ref={ref}
                className="flex-1 py-1 pr-2"
                title={latex}
                style={{ color: colors.text }}
            />
        </div>
    );
};

export const Preview: React.FC<PreviewProps> = ({ latexLines, theme = 'dark' }) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: colors.bg }}>
      <style>{`
        /* Force KaTeX display equations to align left */
        .katex-display {
            text-align: left !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
        }
        .katex-display > .katex {
            text-align: left !important;
        }
        .katex-display > .katex > .katex-html {
            width: 100%;
        }
        .katex {
            font-size: 1.05em;
            color: ${colors.text};
        }
      `}</style>

      <div className="flex-1 overflow-auto px-2 py-3">
         {latexLines.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full select-none" style={{ color: colors.textDim }}>
                 <Eye size={32} className="mb-3 opacity-30" />
                 <span className="text-sm">Live preview</span>
                 <span className="text-xs opacity-60 mt-1">Results appear as you type</span>
             </div>
         ) : (
             <div className="space-y-0.5">
                 {latexLines.map((line) => (
                     <EquationBlock key={line.id} latex={line.latex} lineNumber={line.originalLine} theme={theme} />
                 ))}
             </div>
         )}
      </div>
    </div>
  );
};
