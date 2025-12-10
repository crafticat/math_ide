

import React, { useRef, useState, useEffect, RefObject } from 'react';
import { THEME, AUTOCOMPLETE_DATA, DARK_THEME, LIGHT_THEME } from '../constants';

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  zoom?: number;
  theme?: 'dark' | 'light';
  editorRef?: RefObject<HTMLTextAreaElement>;
  onCursorLineChange?: (line: number) => void;
}

export const Editor: React.FC<EditorProps> = ({ content, onChange, zoom = 100, theme = 'dark', editorRef, onCursorLineChange }) => {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = editorRef || internalRef;
  const preRef = useRef<HTMLPreElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Autocomplete State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState(AUTOCOMPLETE_DATA);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [currentWord, setCurrentWord] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Bracket matching state
  const [matchingBracket, setMatchingBracket] = useState<{ open: number; close: number } | null>(null);
  const [cursorLine, setCursorLine] = useState(1);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    const newScrollLeft = e.currentTarget.scrollLeft;
    setScrollTop(newScrollTop);
    setScrollLeft(newScrollLeft);
    // Hide suggestions on scroll
    setShowSuggestions(false);
  };

  // Bracket matching pairs
  const bracketMatchPairs: Record<string, string> = {
    '(': ')', ')': '(',
    '[': ']', ']': '[',
    '{': '}', '}': '{',
  };
  const openBrackets = new Set(['(', '[', '{']);
  const closeBrackets = new Set([')', ']', '}']);

  // Find matching bracket
  const findMatchingBracket = (text: string, pos: number): { open: number; close: number } | null => {
    const char = text[pos];
    if (!char || !bracketMatchPairs[char]) return null;

    const isOpen = openBrackets.has(char);
    const targetBracket = bracketMatchPairs[char];
    let depth = 1;

    if (isOpen) {
      // Search forward for closing bracket
      for (let i = pos + 1; i < text.length; i++) {
        if (text[i] === char) depth++;
        else if (text[i] === targetBracket) {
          depth--;
          if (depth === 0) return { open: pos, close: i };
        }
      }
    } else {
      // Search backward for opening bracket
      for (let i = pos - 1; i >= 0; i--) {
        if (text[i] === char) depth++;
        else if (text[i] === targetBracket) {
          depth--;
          if (depth === 0) return { open: i, close: pos };
        }
      }
    }
    return null;
  };

  // Update cursor position tracking
  const handleCursorChange = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;

    // Calculate current line number
    const textBeforeCursor = content.substring(0, pos);
    const line = textBeforeCursor.split('\n').length;

    if (line !== cursorLine) {
      setCursorLine(line);
      onCursorLineChange?.(line);
    }

    // Check for bracket matching
    // Check character at cursor and character before cursor
    let match = findMatchingBracket(content, pos);
    if (!match && pos > 0) {
      match = findMatchingBracket(content, pos - 1);
    }
    setMatchingBracket(match);
  };

  // Track cursor changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleSelectionChange = () => {
      if (document.activeElement === textarea) {
        handleCursorChange();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [content, cursorLine]);

  // Helper to insert text while preserving undo history
  const insertTextWithUndo = (textarea: HTMLTextAreaElement, text: string, selectStart?: number, selectEnd?: number) => {
      textarea.focus();

      // Set selection range if provided (to replace text)
      if (selectStart !== undefined && selectEnd !== undefined) {
          textarea.setSelectionRange(selectStart, selectEnd);
      }

      // Use execCommand for undo support (still widely supported)
      const success = document.execCommand('insertText', false, text);

      if (!success) {
          // Fallback for browsers that don't support execCommand
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue = textarea.value.substring(0, start) + text + textarea.value.substring(end);
          textarea.value = newValue;

          // Trigger change event
          const event = new Event('input', { bubbles: true });
          textarea.dispatchEvent(event);
      }
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

      // Calculate lineHeight dynamically based on zoom
      const baseFontSize = 14;
      const currentFontSize = Math.round(baseFontSize * (zoom / 100));
      const currentLineHeight = Math.round(currentFontSize * 1.57);

      const subText = text.substring(0, caretIndex);
      mirrorRef.current.textContent = subText;
      const span = document.createElement('span');
      span.textContent = '.'; // Dummy char to get position
      mirrorRef.current.appendChild(span);

      // Calculate relative position within the scrollable area
      const top = span.offsetTop - textareaRef.current.scrollTop;
      const left = span.offsetLeft - textareaRef.current.scrollLeft;

      setCursorPos({ top: top + currentLineHeight, left: left });
  };

  // Bracket pairs for wrapping selection
  const bracketPairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '`': '`',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSuggestions) {
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex(prev => (prev + 1) % suggestions.length);
              return;
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
              return;
          } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertSuggestion(suggestions[selectedIndex]);
              return;
          } else if (e.key === 'Escape') {
              setShowSuggestions(false);
              return;
          }
          // For other keys (including brackets), close suggestions and continue processing
          setShowSuggestions(false);
      }

      // Bracket handling (wrap selection or auto-close)
      const { selectionStart, selectionEnd } = e.currentTarget;
      const hasSelection = selectionStart !== selectionEnd;

      // Smart Backspace: Delete matching bracket pairs
      if (e.key === 'Backspace' && !hasSelection && selectionStart > 0) {
          const charBefore = content[selectionStart - 1];
          const charAfter = content[selectionStart];

          // Check if we're between matching brackets: () [] {} "" '' ``
          if (bracketPairs[charBefore] && charAfter === bracketPairs[charBefore]) {
              e.preventDefault();
              const newContent = content.substring(0, selectionStart - 1) + content.substring(selectionStart + 1);
              onChange(newContent);

              setTimeout(() => {
                  if (textareaRef.current) {
                      textareaRef.current.focus();
                      textareaRef.current.setSelectionRange(selectionStart - 1, selectionStart - 1);
                  }
              }, 0);
              return;
          }
      }

      // Smart Delete: Delete matching bracket pairs (forward delete)
      if (e.key === 'Delete' && !hasSelection && selectionStart < content.length) {
          const charAt = content[selectionStart];
          const charAfter = content[selectionStart + 1];

          // Check if we're deleting an opening bracket followed by its closing bracket
          if (bracketPairs[charAt] && charAfter === bracketPairs[charAt]) {
              e.preventDefault();
              const newContent = content.substring(0, selectionStart) + content.substring(selectionStart + 2);
              onChange(newContent);

              setTimeout(() => {
                  if (textareaRef.current) {
                      textareaRef.current.focus();
                      textareaRef.current.setSelectionRange(selectionStart, selectionStart);
                  }
              }, 0);
              return;
          }
      }

      // Skip over closing brackets if typing them when already present
      const closingBrackets: Record<string, string> = { ')': '(', ']': '[', '}': '{', '"': '"', "'": "'", '`': '`' };
      if (closingBrackets[e.key] && !hasSelection) {
          const charAfter = content[selectionStart];
          if (charAfter === e.key) {
              e.preventDefault();
              const textarea = e.currentTarget;
              // Just move cursor forward, don't insert
              requestAnimationFrame(() => {
                  textarea.setSelectionRange(selectionStart + 1, selectionStart + 1);
              });
              return;
          }
      }

      // Symmetric quotes (', ", `) need special handling
      const symmetricQuotes = new Set(["'", '"', '`']);

      if (bracketPairs[e.key]) {
          const textarea = e.currentTarget;
          const openBracket = e.key;
          const closeBracket = bracketPairs[e.key];

          // For symmetric quotes, check if we should auto-close
          if (symmetricQuotes.has(e.key) && !hasSelection) {
              const charBefore = selectionStart > 0 ? content[selectionStart - 1] : '';
              const charAfter = content[selectionStart] || '';

              // Don't auto-close if:
              // 1. Previous char is alphanumeric (like in contractions: don't, it's)
              // 2. Next char is already the same quote (would create triple)
              // 3. We're inside a word
              if (/[a-zA-Z0-9]/.test(charBefore) || charAfter === e.key) {
                  // Let the default behavior happen (just insert the quote)
                  return;
              }
          }

          e.preventDefault();

          if (hasSelection) {
              // Wrap selection with brackets
              const selectedText = content.substring(selectionStart, selectionEnd);
              const wrappedText = openBracket + selectedText + closeBracket;
              insertTextWithUndo(textarea, wrappedText, selectionStart, selectionEnd);

              // Keep the inner text selected
              requestAnimationFrame(() => {
                  textarea.setSelectionRange(selectionStart + 1, selectionEnd + 1);
              });
          } else {
              // Auto-close: insert pair and place cursor in middle
              const pair = openBracket + closeBracket;
              insertTextWithUndo(textarea, pair, selectionStart, selectionEnd);

              // Place cursor between the brackets
              requestAnimationFrame(() => {
                  textarea.setSelectionRange(selectionStart + 1, selectionStart + 1);
              });
          }
          return;
      }

      // Auto-indentation on Enter
      if (e.key === 'Enter') {
          e.preventDefault();
          const textarea = e.currentTarget;
          const { selectionStart } = textarea;
          const textBefore = content.substring(0, selectionStart);
          const textAfter = content.substring(selectionStart);

          // Get current line
          const currentLineStart = textBefore.lastIndexOf('\n') + 1;
          const currentLine = textBefore.substring(currentLineStart);

          // Get current indentation (spaces/tabs at start of line)
          const indentMatch = currentLine.match(/^(\s*)/);
          let currentIndent = indentMatch ? indentMatch[1] : '';

          // Check if line ends with { -> add more indent
          const trimmedLine = currentLine.trimEnd();
          let newIndent = currentIndent;
          if (trimmedLine.endsWith('{')) {
              newIndent = currentIndent + '  '; // Add 2 spaces
          }

          // Check if next char is } -> we need to handle closing brace
          const nextCharIsCloseBrace = textAfter.trimStart().startsWith('}');

          let newContent: string;
          let newCursorPos: number;

          if (nextCharIsCloseBrace && trimmedLine.endsWith('{')) {
              // Auto-format: cursor between braces with proper indentation
              // { | } -> {\n  |\n}
              newContent = textBefore + '\n' + newIndent + '\n' + currentIndent + textAfter.trimStart();
              newCursorPos = selectionStart + 1 + newIndent.length;
          } else {
              newContent = textBefore + '\n' + newIndent + textAfter;
              newCursorPos = selectionStart + 1 + newIndent.length;
          }

          onChange(newContent);

          // Restore cursor position
          setTimeout(() => {
              if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
              }
          }, 0);
      }

      // Auto-dedent on }
      if (e.key === '}') {
          const textarea = e.currentTarget;
          const { selectionStart } = textarea;
          const textBefore = content.substring(0, selectionStart);

          // Get current line
          const currentLineStart = textBefore.lastIndexOf('\n') + 1;
          const currentLine = textBefore.substring(currentLineStart);

          // If line is only whitespace, dedent before adding }
          if (/^\s*$/.test(currentLine) && currentLine.length >= 2) {
              e.preventDefault();
              const dedentedLine = currentLine.substring(2); // Remove 2 spaces
              const newContent = textBefore.substring(0, currentLineStart) + dedentedLine + '}' + content.substring(selectionStart);
              const newCursorPos = currentLineStart + dedentedLine.length + 1;

              onChange(newContent);

              setTimeout(() => {
                  if (textareaRef.current) {
                      textareaRef.current.focus();
                      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                  }
              }, 0);
          }
      }

      // Command/Ctrl + D: Select next occurrence of selected word
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
          e.preventDefault();
          const textarea = e.currentTarget;
          const { selectionStart, selectionEnd } = textarea;

          // Get currently selected text or word at cursor
          let selectedText = content.substring(selectionStart, selectionEnd);

          if (!selectedText) {
              // No selection - select word at cursor
              let start = selectionStart;
              let end = selectionEnd;

              // Find word boundaries
              while (start > 0 && /\w/.test(content[start - 1])) {
                  start--;
              }
              while (end < content.length && /\w/.test(content[end])) {
                  end++;
              }

              if (start !== end) {
                  selectedText = content.substring(start, end);
                  textarea.setSelectionRange(start, end);
              }
          } else {
              // Find next occurrence
              const searchStart = selectionEnd;
              let nextIndex = content.indexOf(selectedText, searchStart);

              // If not found after cursor, wrap to beginning
              if (nextIndex === -1) {
                  nextIndex = content.indexOf(selectedText, 0);
              }

              // If found and not the same selection
              if (nextIndex !== -1 && nextIndex !== selectionStart) {
                  textarea.setSelectionRange(nextIndex, nextIndex + selectedText.length);
              }
          }
          return;
      }

      // Tab key for manual indentation
      if (e.key === 'Tab') {
          e.preventDefault();
          const textarea = e.currentTarget;
          const { selectionStart, selectionEnd } = textarea;

          if (e.shiftKey) {
              // Shift+Tab: dedent
              const textBefore = content.substring(0, selectionStart);
              const currentLineStart = textBefore.lastIndexOf('\n') + 1;
              const linePrefix = content.substring(currentLineStart, selectionStart);

              if (linePrefix.startsWith('  ')) {
                  const newContent = content.substring(0, currentLineStart) + content.substring(currentLineStart + 2);
                  onChange(newContent);

                  setTimeout(() => {
                      if (textareaRef.current) {
                          textareaRef.current.focus();
                          textareaRef.current.setSelectionRange(selectionStart - 2, selectionEnd - 2);
                      }
                  }, 0);
              }
          } else {
              // Tab: indent
              const newContent = content.substring(0, selectionStart) + '  ' + content.substring(selectionEnd);
              onChange(newContent);

              setTimeout(() => {
                  if (textareaRef.current) {
                      textareaRef.current.focus();
                      textareaRef.current.setSelectionRange(selectionStart + 2, selectionStart + 2);
                  }
              }, 0);
          }
      }
  };

  const insertSuggestion = (suggestion: typeof AUTOCOMPLETE_DATA[0]) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      const caret = textarea.selectionEnd;
      // Remove current word
      const start = caret - currentWord.length;

      // Get current line's indentation
      const textBefore = content.slice(0, start);
      const currentLineStart = textBefore.lastIndexOf('\n') + 1;
      const currentLine = textBefore.slice(currentLineStart);
      const indentMatch = currentLine.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : '';

      // Process insert text - handle $0 cursor marker and apply indentation
      let insertText = suggestion.insert;

      // Apply indentation to each line after the first
      if (insertText.includes('\n')) {
          const lines = insertText.split('\n');
          insertText = lines.map((line, i) => {
              if (i === 0) return line;
              // For lines inside a block, add base indent
              return baseIndent + line;
          }).join('\n');
      }

      // Find and handle $0 cursor position marker
      const cursorMarkerIndex = insertText.indexOf('$0');
      let finalInsertText = insertText;
      let cursorOffset = 0;

      if (cursorMarkerIndex !== -1) {
          // Remove the $0 marker and calculate cursor offset
          finalInsertText = insertText.replace('$0', '');
          cursorOffset = cursorMarkerIndex;
      } else {
          // No marker, put cursor at end
          cursorOffset = finalInsertText.length;
      }

      setShowSuggestions(false);

      // Use undo-friendly insertion
      insertTextWithUndo(textarea, finalInsertText, start, caret);

      // Move cursor to correct position
      setTimeout(() => {
          const newCursorPos = start + cursorOffset;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);
      updateSuggestions(val, e.target.selectionEnd);
      handleCursorChange();
  };

  // Calculate position (line, column) from character index
  const getPositionFromIndex = (index: number): { line: number; col: number } => {
    const textBefore = content.substring(0, index);
    const lines = textBefore.split('\n');
    return {
      line: lines.length - 1,
      col: lines[lines.length - 1].length,
    };
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

    // Get syntax colors from theme
    const themeColors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    const syntaxColors = themeColors.syntax || {
        keyword: '#d4a373',
        function: '#a8c686',
        symbol: '#87aecd',
        greek: '#d4a5a5',
        number: '#b8c4a0',
        comment: '#6b6358',
        string: '#c9a227',
        operator: '#d4a373',
        bracket: '#c9a227',
    };

    // Color categories using theme
    const colors = {
        comment: syntaxColors.comment,
        keyword: syntaxColors.keyword,       // Warm amber - scope keywords
        mathSymbol: syntaxColors.symbol,     // Soft blue - math symbols
        greek: syntaxColors.greek,           // Dusty rose - greek letters
        operator: syntaxColors.operator,     // Warm amber - operators
        number: syntaxColors.number,         // Muted green - numbers
        mathPackage: themeColors.accentSecondary || themeColors.accent, // Sage green - Math.xxx
        function: syntaxColors.function,     // Sage green - functions
        string: syntaxColors.string,         // Gold - strings
        bracket: syntaxColors.bracket,       // Gold - brackets
    };

    return code.split('\n').map((line) => {
        // 1. Comments
        if (line.trim().startsWith('//')) {
            return `<span style="color: ${colors.comment};">${escapeHtml(line)}</span>`;
        }

        // 2. Preprocessor #define
        if (line.trim().startsWith('#define')) {
            const parts = line.split(/(\s+)/);
            return parts.map(part => {
                if (part.trim() === '#define') return `<span style="color: ${colors.keyword};">${escapeHtml(part)}</span>`;
                return escapeHtml(part);
            }).join('');
        }

        let processed = escapeHtml(line);

        // 3. Math.Package
        processed = processed.replace(/(Math)(\.)([a-zA-Z0-9_]+)/g,
            `<span style="color: ${colors.mathPackage};">$1</span><span style="color: ${themeColors.textDim};">$2</span><span style="color: ${colors.function};">$3</span>`
        );

        // 4. Scope Keywords (Purple) - Problem, Theorem, Proof, Case, etc.
        const scopeKeywords = ['Problem', 'Subproblem', 'Part', 'Section', 'Theorem', 'Proof', 'Case', 'Lemma', 'Let', 'Assume', 'Then', 'Therefore'];
        scopeKeywords.forEach(kw => {
             const regex = new RegExp(`\\b${kw}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.keyword};">${kw}</span>`);
        });

        // 5. Math Functions (Yellow) - integral, sum, lim, sup, inf, sqrt
        const mathFunctions = ['integral', 'sum', 'lim', 'sup', 'inf', 'log', 'ln', 'sin', 'cos', 'tan', 'max', 'min', 'det', 'sqrt', 'frac'];
        mathFunctions.forEach(fn => {
             const regex = new RegExp(`\\b${fn}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.function};">${fn}</span>`);
        });

        // 6. Math Symbols (Cyan) - symbols that get replaced: exists, forall, in, suchthat, etc.
        const mathSymbols = ['exists', 'forall', 'in', 'notin', 'subset', 'union', 'intersect', 'implies', 'iff', 'suchthat', 'QED', 'AND', 'OR', 'NOT', 'and', 'or', 'not'];
        mathSymbols.forEach(sym => {
             const regex = new RegExp(`\\b${sym}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.mathSymbol};">${sym}</span>`);
        });

        // 7. Greek Letters (Orange)
        const greekLetters = [
            'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'sigma', 'omega', 'pi',
            'mu', 'phi', 'rho', 'tau', 'zeta', 'eta', 'chi', 'psi', 'nu', 'kappa', 'xi',
            'Delta', 'Gamma', 'Theta', 'Lambda', 'Sigma', 'Omega', 'Pi', 'Phi', 'Psi', 'Xi'
        ];
        greekLetters.forEach(letter => {
             const regex = new RegExp(`\\b${letter}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.greek};">${letter}</span>`);
        });

        // 8. Operators (Gold/Yellow) - ->, =>, <=>, !=, <=, >=
        processed = processed.replace(/(-&gt;|=&gt;|&lt;=&gt;|!=|&lt;=|&gt;=)/g,
            `<span style="color: ${colors.operator};">$1</span>`
        );

        // 9. Numbers (Light Green)
        processed = processed.replace(/(\b\d+\.?\d*\b)/g, `<span style="color: ${colors.number};">$1</span>`);

        // 10. Subscripts and superscripts (highlight _ and ^ specially)
        // a_i highlights the _ and subscript, x^2 highlights the ^ and superscript
        // Note: Do NOT change font-size here as it breaks cursor alignment
        processed = processed.replace(/(_)([a-zA-Z0-9]+)/g,
            `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
        );
        processed = processed.replace(/(\^)([a-zA-Z0-9]+)/g,
            `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
        );

        // 11. Braces and brackets
        processed = processed.replace(/([{}()\[\]])/g, `<span style="color: ${colors.bracket};">$1</span>`);

        if (processed === '') return ' ';
        return processed;
    }).join('\n');
  };

  const lineCount = content.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 30) }, (_, i) => i + 1);

  // Theme colors
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Calculate font size based on zoom
  const baseFontSize = 14;
  const fontSize = Math.round(baseFontSize * (zoom / 100));
  const lineHeight = Math.round(fontSize * 1.57); // Maintain ratio

  // CONSTANT STYLE METRICS
  const codeStyle: React.CSSProperties = {
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: `${fontSize}px`,
      lineHeight: `${lineHeight}px`,
      letterSpacing: '0px',
      whiteSpace: 'pre',
      padding: '0px',
      margin: '0px',
      border: 'none',
      fontVariantLigatures: 'none', // Critical for cursor alignment
      boxSizing: 'border-box',
      WebkitTextSizeAdjust: 'none',
      WebkitAppearance: 'none',
      MozAppearance: 'none',
      textRendering: 'geometricPrecision',
  };

  const containerPadding = 16;

  return (
    <div className="flex h-full w-full relative overflow-hidden" style={{ backgroundColor: colors.bg }}>
      {/* Line Numbers */}
      <div
        className="flex-none w-14 text-right pr-4 select-none overflow-hidden z-10"
        style={{
            paddingTop: `${containerPadding}px`,
            background: theme === 'dark'
              ? 'linear-gradient(to right, #1e1e1e 95%, #252526 100%)'
              : 'linear-gradient(to right, #ffffff 95%, #f3f3f3 100%)'
        }}
      >
        <div
            className="font-mono"
            style={{
                transform: `translateY(-${scrollTop}px)`,
                lineHeight: `${lineHeight}px`,
                fontSize: `${Math.max(10, fontSize - 2)}px`,
                color: colors.lineNumbers
            }}
        >
            {lineNumbers.map(num => (
                <div key={num} className="transition-colors" style={{ lineHeight: `${lineHeight}px` }}>{num}</div>
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
                padding: `${containerPadding}px`,
                position: 'absolute',
                top: 0,
                left: 0,
                visibility: 'hidden',
                whiteSpace: 'pre',
                width: '100%',
                overflow: 'hidden'
            }}
         />

         {/* Syntax Highlighting - positioned via transform to match textarea scroll */}
         <div
            className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none"
            style={{ padding: `${containerPadding}px` }}
         >
            <div
               style={{
                   transform: `translate(-${scrollLeft}px, -${scrollTop}px)`,
               }}
            >
               <pre
                  ref={preRef}
                  className="m-0"
                  style={{
                      ...codeStyle,
                      color: colors.text,
                      minWidth: 'max-content',
                      minHeight: 'max-content',
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightCode(content) }}
               />
            </div>
         </div>

         {/* Bracket Matching Highlights */}
         {matchingBracket && (
           <div
             className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none"
             style={{ padding: `${containerPadding}px` }}
           >
             <div style={{ transform: `translate(-${scrollLeft}px, -${scrollTop}px)` }}>
               {[matchingBracket.open, matchingBracket.close].map((idx) => {
                 const pos = getPositionFromIndex(idx);
                 // Calculate character width (approximately)
                 const charWidth = fontSize * 0.6; // Monospace approximate
                 return (
                   <div
                     key={idx}
                     className="absolute rounded-sm"
                     style={{
                       top: pos.line * lineHeight,
                       left: pos.col * charWidth,
                       width: charWidth,
                       height: lineHeight,
                       backgroundColor: theme === 'dark' ? 'rgba(255, 215, 0, 0.25)' : 'rgba(255, 200, 0, 0.35)',
                       border: `1px solid ${theme === 'dark' ? 'rgba(255, 215, 0, 0.5)' : 'rgba(200, 150, 0, 0.6)'}`,
                       boxSizing: 'border-box',
                     }}
                   />
                 );
               })}
             </div>
           </div>
         )}

         {/* Input Textarea - transparent text, visible caret */}
         <textarea
            ref={textareaRef}
            className="absolute top-0 left-0 w-full h-full bg-transparent outline-none resize-none"
            style={{
                ...codeStyle,
                padding: `${containerPadding}px`,
                overflow: 'auto',
                color: 'transparent',
                caretColor: theme === 'dark' ? 'white' : 'black',
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
                className="absolute z-50 w-64 shadow-xl rounded-md flex flex-col overflow-hidden"
                style={{
                    top: Math.min(cursorPos.top + containerPadding, 300),
                    left: Math.min(Math.max(cursorPos.left + containerPadding, 0), 400),
                    maxHeight: '200px',
                    overflowY: 'auto',
                    backgroundColor: colors.popup,
                    border: `1px solid ${colors.popupBorder}`
                }}
             >
                 {suggestions.map((item, index) => (
                     <div
                        key={index}
                        onClick={() => insertSuggestion(item)}
                        className="px-2 py-1 flex items-center justify-between text-xs cursor-pointer"
                        style={{
                            backgroundColor: index === selectedIndex ? colors.popupActive : 'transparent',
                            color: index === selectedIndex ? (theme === 'dark' ? 'white' : colors.text) : colors.text
                        }}
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