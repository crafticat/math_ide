

import React, { useEffect, useRef, useState } from 'react';
import { THEME } from '../constants';

// Declare KaTeX globally
declare global {
  interface Window {
    katex: any;
  }
}

interface PreviewProps {
  latexLines: { id: string; latex: string; originalLine: number }[];
}

const EquationBlock: React.FC<{ latex: string }> = ({ latex }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!ref.current || !window.katex) return;
        
        // Handle lines that are purely whitespace or empty
        if (!latex || !latex.trim()) {
            ref.current.innerHTML = '<div style="height: 0.5em;"></div>'; 
            return;
        }
        
        try {
            // Using renderToString is safer for restricted environments
            const html = window.katex.renderToString(latex, {
                throwOnError: false, 
                errorColor: '#cc0000',
                displayMode: true,
                output: 'html', 
                strict: false,
                trust: true,
                fleqn: true // Hint for left alignment
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
            <div className="my-2 p-2 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs font-mono break-all">
                <div className="font-bold mb-1">Rendering Error:</div>
                {error}
                <div className="mt-2 text-gray-500">Source: {latex}</div>
            </div>
        );
    }

    return (
        <div 
            ref={ref} 
            className="my-0.5 px-2 hover:bg-[#2d2d2d] rounded transition-colors text-lg" 
            title={latex} 
        />
    );
};

export const Preview: React.FC<PreviewProps> = ({ latexLines }) => {
  return (
    <div className={`h-full w-full flex flex-col ${THEME.bg} border-l ${THEME.border}`}>
      <style>{`
        /* Force KaTeX display equations to align left */
        .katex-display {
            text-align: left !important;
            margin-left: 0 !important;
            margin-top: 0.2em !important;
            margin-bottom: 0.2em !important;
            width: 100%;
        }
        /* Ensure the math track itself starts from left */
        .katex-display > .katex {
            text-align: left !important;
        }
        /* Fix spacing inside the block */
        .katex-display > .katex > .katex-html {
            width: 100%;
        }
        /* Add some padding to the whole container via CSS for consistency */
        .katex-display {
             padding-left: 10px; 
        }
      `}</style>
      <div className={`p-2 border-b ${THEME.border} flex items-center justify-between bg-[#252526]`}>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-2">Preview</span>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
         {latexLines.length === 0 ? (
             <div className="text-gray-500 text-center mt-20 text-sm select-none">
                 Type in the editor to see results...
             </div>
         ) : (
             latexLines.map((line) => (
                 <EquationBlock key={line.id} latex={line.latex} />
             ))
         )}
      </div>
    </div>
  );
};
