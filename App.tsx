
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, Explorer } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Console } from './components/Console';
import { compileMathScript } from './services/compiler';
import { INITIAL_CONTENT, THEME } from './constants';
import { FileNode, CompilationResult } from './types';
import { Play, FileDown } from 'lucide-react';

const MOCK_FILES: FileNode[] = [
  {
    id: 'root',
    name: 'project',
    type: 'folder',
    children: [
      { id: '1', name: 'main.math', type: 'file' },
    ]
  }
];

export default function App() {
  const [content, setContent] = useState<string>(INITIAL_CONTENT);
  const [activeFile, setActiveFile] = useState<string>('1');
  const [compilationResult, setCompilationResult] = useState<CompilationResult>({ latexLines: [], logs: [], macros: {} });
  
  const runCompilation = useCallback(() => {
    const result = compileMathScript(content);
    setCompilationResult(result);
  }, [content]);

  const handleExportPdf = () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const htmlContent = compilationResult.latexLines.map(line => {
          // We render a static HTML version of the equations
          try {
             return window.katex.renderToString(line.latex, {
                 displayMode: true,
                 throwOnError: false,
                 fleqn: true // Enforce left equation alignment in generation
             });
          } catch(e) { return ''; }
      }).join('<div style="margin-bottom: 5px;"></div>');

      printWindow.document.write(`
        <html>
            <head>
                <title>MathBrain Export</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
                <style>
                    body { 
                        font-family: 'Latin Modern', 'Times New Roman', serif; 
                        padding: 50px; 
                        color: black; 
                        max-width: 900px; 
                        margin: 0 auto; 
                    }
                    .katex { font-size: 1.1em; }
                    /* Force Left Alignment to match IDE Preview */
                    .katex-display {
                        text-align: left !important;
                        margin-left: 0 !important;
                        margin-right: 0 !important;
                    }
                    .katex-display > .katex {
                        text-align: left !important;
                    }
                    .katex-display > .katex > .katex-html {
                        width: 100%;
                    }
                    h1 { border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <h1>Document Output</h1>
                ${htmlContent}
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
        </html>
      `);
      printWindow.document.close();
  };

  // Initial Run
  useEffect(() => {
    runCompilation();
  }, []); // Run once on mount

  // Live Update: Debounced compilation when content changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
        runCompilation();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [content, runCompilation]);

  return (
    <div className={`flex flex-col h-screen w-screen bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans`}>
      
      {/* Top Bar */}
      <div className="h-9 flex-none flex items-center justify-between px-4 bg-[#3c3c3c] text-xs select-none border-b border-black/20">
         <div className="flex gap-4">
             <span className="text-gray-300 hover:text-white cursor-pointer">File</span>
             <span className="text-gray-300 hover:text-white cursor-pointer">Edit</span>
             <span className="text-gray-300 hover:text-white cursor-pointer">View</span>
         </div>
         <span className="font-medium opacity-70">main.math</span>
         <div className="flex items-center gap-3">
            <button 
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 hover:bg-[#505050] text-gray-200 px-3 py-1 rounded-sm transition-colors"
                title="Export as PDF"
            >
                <FileDown size={14} />
            </button>
            <button 
                onClick={runCompilation}
                className="flex items-center gap-1.5 bg-[#007acc] hover:bg-[#0062a3] text-white px-3 py-1 rounded-sm transition-colors shadow-sm"
            >
                <Play size={10} fill="currentColor" />
                <span className="font-semibold">Run</span>
            </button>
         </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 min-h-0">
        <Sidebar 
            files={MOCK_FILES} 
            activeFileId={activeFile} 
            onFileSelect={setActiveFile} 
        />
        
        <Explorer 
            files={MOCK_FILES} 
            activeFileId={activeFile} 
            onFileSelect={setActiveFile} 
        />

        {/* Editor & Preview Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
            {/* Tabs */}
            <div className="flex-none bg-[#252526] overflow-x-auto flex">
                <div className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e] border-t border-[#007acc] text-white text-xs cursor-pointer min-w-[120px]">
                    <span className="text-[#4ec9b0] font-bold text-lg leading-none">M</span>
                    <span>main.math</span>
                    <span className="ml-auto hover:bg-gray-700 rounded-md p-0.5 w-4 h-4 flex items-center justify-center">×</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] text-gray-400 text-xs cursor-pointer min-w-[120px] border-r border-[#252526]">
                    <span>Preview Output</span>
                </div>
            </div>

            {/* Split View Container */}
            <div className="flex-1 flex min-h-0 relative">
                {/* Editor Pane */}
                <div className="flex-1 flex flex-col h-full border-r border-[#333333]">
                    <Editor content={content} onChange={setContent} />
                </div>
                
                {/* Preview Pane */}
                <div className="w-[45%] flex flex-col h-full bg-[#1e1e1e]">
                    <Preview latexLines={compilationResult.latexLines} />
                </div>
            </div>

            {/* Bottom Panel */}
            <div className="flex-none">
                 <Console logs={compilationResult.logs} />
                 <div className={`${THEME.accent} h-6 flex items-center justify-between px-3 text-white text-[11px] select-none`}>
                    <div className="flex gap-4">
                       <div className="flex items-center gap-1">
                            <span>main.math</span>
                       </div>
                    </div>
                    <div className="flex gap-4">
                        <span>Ln {content.split('\n').length}</span>
                        <span>MathScript</span>
                        <span>Live</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
