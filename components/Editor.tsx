

import React, { useRef, useState, useEffect } from 'react';
import { THEME, AUTOCOMPLETE_DATA } from '../constants';

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Autocomplete State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState(AUTOCOMPLETE_DATA);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [currentWord, setCurrentWord] = useState('');

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    // Hide suggestions on scroll
    setShowSuggestions(false);
  };

  const updateSuggestions = (text: string, caretIndex: number) => {
      // Find word before cursor
      let start = caretIndex - 1;
      while (start >= 0 && /[\w.#]/.test(text[start])) {
          start--;
      }
      const word = text.slice(start + 1, caretIndex);
      setCurrentWord(word);

      if (word.length > 0) {
          const matches = AUTOCOMPLETE_DATA.filter(item => 
              item.label.toLowerCase().includes(word.toLowerCase())
          );
          if (matches.length > 0) {
              setSuggestions(matches);
              setSelectedIndex(0);
              setShowSuggestions(true);
              updateCursorPos(text, caretIndex);
          } else {
              setShowSuggestions(false);
          }
      } else {
          setShowSuggestions(false);
      }
  };

  const updateCursorPos = (text: string, caretIndex: number) => {
      if (!textareaRef.current || !mirrorRef.current) return;
      
      const subText = text.substring(0, caretIndex);
      mirrorRef.current.textContent = subText;
      const span = document.createElement('span');
      span.textContent = '.'; // Dummy char to get position
      mirrorRef.current.appendChild(span);
      
      // Calculate relative position within the scrollable area
      const top = span.offsetTop - textareaRef.current.scrollTop; 
      const left = span.offsetLeft - textareaRef.current.scrollLeft;

      setCursorPos({ top: top + 24, left: left }); // +24 for line height clearance
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (showSuggestions) {
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex(prev => (prev + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertSuggestion(suggestions[selectedIndex]);
          } else if (e.key === 'Escape') {
              setShowSuggestions(false);
          }
      }
  };

  const insertSuggestion = (suggestion: typeof AUTOCOMPLETE_DATA[0]) => {
      if (!textareaRef.current) return;
      
      const text = content;
      const caret = textareaRef.current.selectionEnd;
      // Remove current word
      const start = caret - currentWord.length;
      
      const newText = text.slice(0, start) + suggestion.insert + text.slice(caret);
      onChange(newText);
      setShowSuggestions(false);
      
      // Restore focus and move caret
      setTimeout(() => {
          if (textareaRef.current) {
              textareaRef.current.focus();
              const newCaret = start + suggestion.insert.length;
              textareaRef.current.setSelectionRange(newCaret, newCaret);
          }
      }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);
      updateSuggestions(val, e.target.selectionEnd);
  };

  const highlightCode = (code: string) => {
    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    return code.split('\n').map((line) => {
        // 1. Comments
        if (line.trim().startsWith('//')) {
            return `<span style="color: #6a9955;">${escapeHtml(line)}</span>`;
        }
        
        // 2. Preprocessor #define
        if (line.trim().startsWith('#define')) {
            const parts = line.split(/(\s+)/);
            return parts.map(part => {
                if (part.trim() === '#define') return `<span style="color: #c586c0;">${escapeHtml(part)}</span>`;
                return escapeHtml(part);
            }).join('');
        }

        let processed = escapeHtml(line);

        // 3. Math.Package
        processed = processed.replace(/(Math)(\.)([a-zA-Z0-9_]+)/g, 
            '<span style="color: #4ec9b0;">$1</span><span style="color: #d4d4d4;">$2</span><span style="color: #9cdcfe;">$3</span>'
        );

        // 4. Keywords
        // Added Problem, Subproblem, Part, Section
        const keywords = ['integral', 'sum', 'in', '=>', '->', 'Problem', 'Subproblem', 'Part', 'Section'];
        keywords.forEach(kw => {
             const escKw = kw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
             const regex = new RegExp(`\\b${escKw}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: #569cd6;">${kw}</span>`);
        });

        // 5. Numbers
        processed = processed.replace(/(\b\d+\.?\d*\b)/g, '<span style="color: #b5cea8;">$1</span>');

        if (processed === '') return ' '; 
        return processed;
    }).join('\n');
  };

  const lineCount = content.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 30) }, (_, i) => i + 1);

  // CONSTANT STYLE METRICS
  const codeStyle: React.CSSProperties = {
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: '14px',
      lineHeight: '22px',
      letterSpacing: '0px',
      whiteSpace: 'pre', 
      padding: '0px',
      margin: '0px',
      border: 'none',
      fontVariantLigatures: 'none', // Critical for cursor alignment
  };

  const containerPadding = '20px';

  return (
    <div className={`flex h-full w-full relative ${THEME.bg} overflow-hidden`}>
      {/* Line Numbers */}
      <div 
        className={`flex-none w-12 ${THEME.bg} border-r ${THEME.border} text-right pr-3 pt-[20px] select-none overflow-hidden z-10`}
      >
        <div 
            className="font-mono text-xs text-[#858585] opacity-50" 
            style={{ 
                transform: `translateY(-${textareaRef.current?.scrollTop || 0}px)`,
                lineHeight: '22px'
            }}
        >
            {lineNumbers.map(num => (
                <div key={num}>{num}</div>
            ))}
        </div>
      </div>

      {/* Editor Surface */}
      <div className="flex-1 relative overflow-hidden group">
         
         {/* Mirror Div for Cursor Position Calculation */}
         <div
            ref={mirrorRef}
            aria-hidden="true"
            style={{
                ...codeStyle,
                padding: containerPadding,
                position: 'absolute',
                top: 0,
                left: 0,
                visibility: 'hidden',
                whiteSpace: 'pre', // IMPORTANT: Must match textarea exactly
                width: '100%',
                overflow: 'hidden'
            }}
         />

         {/* Syntax Highlighting */}
         <pre
            ref={preRef}
            className={`absolute top-0 left-0 w-full h-full m-0 overflow-hidden pointer-events-none ${THEME.text}`}
            style={{ 
                padding: containerPadding,
                ...codeStyle 
            }}
            dangerouslySetInnerHTML={{ __html: highlightCode(content) }}
         />

         {/* Input Textarea */}
         <textarea
            ref={textareaRef}
            className="absolute top-0 left-0 w-full h-full bg-transparent text-transparent caret-white outline-none resize-none"
            style={{ 
                padding: containerPadding,
                ...codeStyle 
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            value={content}
            onChange={handleChange}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
         />

         {/* Autocomplete Popup */}
         {showSuggestions && (
             <div 
                className={`absolute z-50 w-64 ${THEME.popup} border ${THEME.popupBorder} shadow-xl rounded-md flex flex-col overflow-hidden`}
                style={{
                    top: `min(${cursorPos.top}px, 80%)`, // Clamp to viewport
                    left: `min(${cursorPos.left + 50}px, 80%)`
                }}
             >
                 {suggestions.map((item, index) => (
                     <div 
                        key={index}
                        onClick={() => insertSuggestion(item)}
                        className={`
                            px-2 py-1 flex items-center justify-between text-xs cursor-pointer
                            ${index === selectedIndex ? `${THEME.popupActive} text-white` : 'text-gray-300 hover:bg-[#2a2d2e]'}
                        `}
                     >
                         <span className="font-mono">{item.label}</span>
                         <span className="opacity-50 text-[10px] uppercase">{item.type}</span>
                     </div>
                 ))}
             </div>
         )}
      </div>
    </div>
  );
};