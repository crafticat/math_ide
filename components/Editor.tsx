

import React, { useRef, useState, useEffect, useMemo, RefObject } from 'react';
import { THEME, AUTOCOMPLETE_DATA, DARK_THEME, LIGHT_THEME } from '../constants';
import { FUNCTIONS, GREEK, SCOPES, SYMBOL_MAP } from '../services/engine/language';
import type { Diagnostic } from '../services/engine/types';
import { useDelayedUnmount } from '../hooks/useDelayedUnmount';

// ---- Highlighting vocabulary ----
//
// The engine's language tables are the base, so what the editor colours and
// what the compiler understands cannot drift apart. On top of them the editor
// adds DISPLAY-ONLY extras: spellings a user plausibly types that the engine
// does not define as vocabulary (LaTeX-style aliases, differentials, decoration
// names). Those are listed explicitly below rather than hidden inside the
// pipeline, so the gap between "the editor paints it" and "the engine knows
// it" stays visible.
//
// The lists are DISJOINT by construction. highlightCode runs them as ordered
// passes over one string, and each pass wraps its matches in a <span>; a word
// in two lists would be wrapped twice and end up wearing the LATER pass's
// colour. Subtracting earlier passes gives "first pass wins", which is what
// keeps `partial`/`inf`/`angle`/`triangle` - function-coloured in this editor
// since long before language.ts also listed them as symbols/greek - looking
// the way they always have.

/** Proof-prose openers. Editor-only: the parser reads these as ordinary
 *  prose, they are not engine vocabulary. */
const PROOF_KEYWORDS = [
  'Let', 'Assume', 'Then', 'Therefore', 'Since', 'Consider', 'Given', 'Suppose',
  'Hence', 'Thus', 'And', 'If', 'Show', 'Clearly', 'Note', 'Recall', 'Define',
];

/** Function-ish spellings FUNCTIONS does not define. */
const EXTRA_FUNCTION_WORDS = [
  // Calculus / differentials
  'prod', 'diff', 'partial', 'dx', 'dy', 'dz', 'dt', 'du', 'dv', 'dr', 'dtheta',
  // Alternative names
  'cbrt', 'round', 'binom', 'perm', 'mod', 'frac', 'tfrac', 'dfrac', 'pmatrix',
  // Trig variants without an engine spelling
  'arccot', 'arcsec', 'arccsc', 'coth', 'sech', 'csch',
  // Statistics & bounds
  'sup', 'inf', 'avg', 'mean', 'median',
  // Linear algebra
  'rank', 'dim', 'ker',
  // Accents / decorations
  'dot', 'ddot', 'underline', 'widehat', 'widetilde',
  // Geometry
  'angle', 'triangle',
];

/** Symbol spellings SYMBOL_MAP does not carry. `if` is the `cases` branch
 *  separator, worth marking even though it is a stop word to the parser. */
const EXTRA_SYMBOL_WORDS = ['if'];

/** SYMBOL_MAP is keyed by operator spellings (`->`, `+-`, `|`) as well as
 *  words; only the word keys can go into a \b...\b regex. */
const isWordKey = (key: string) => /^[A-Za-z][A-Za-z0-9]*$/.test(key);

const SCOPE_WORDS = [...Object.keys(SCOPES), ...PROOF_KEYWORDS];
const FUNCTION_WORDS = [...Object.keys(FUNCTIONS), ...EXTRA_FUNCTION_WORDS];
const CLAIMED_EARLIER = new Set([...SCOPE_WORDS, ...FUNCTION_WORDS]);
// Greek is claimed by its own (later) pass, so it is subtracted here rather
// than left to be painted blue by the symbol pass.
const SYMBOL_WORDS = [...Object.keys(SYMBOL_MAP).filter(isWordKey), ...EXTRA_SYMBOL_WORDS]
  .filter(word => !CLAIMED_EARLIER.has(word) && !(word in GREEK));
const GREEK_WORDS = Object.keys(GREEK).filter(word => !CLAIMED_EARLIER.has(word));

// How long the caret must hold still before the app is told where it is.
//
// The debounce lives HERE, not in App, because this is where the firehose is:
// 'selectionchange' fires on every keystroke, every arrow key and every pixel
// of a mouse drag. Damping it at the source means App sees at most one caret
// update per interval and re-renders (and re-runs the structure lookup) at
// most that often, instead of once per event. 50ms is below the ~100ms that
// reads as "instant" while still collapsing a held-down arrow key (~30ms
// repeat) into a single update.
const CARET_DEBOUNCE_MS = 50;

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  zoom?: number;
  theme?: 'dark' | 'light';
  editorRef?: RefObject<HTMLTextAreaElement>;
  onCursorLineChange?: (line: number) => void;
  /** Where the caret is, as 1-based line / 0-based column into the RAW text
   *  the user typed - the coordinates the engine's nodeAt() expects. Fires
   *  debounced (CARET_DEBOUNCE_MS) on every cursor move, unlike
   *  onCursorLineChange which only fires when the LINE changes: the structure
   *  highlight depends on the column too. */
  onCaretChange?: (line: number, col: number) => void;
  /** Compile diagnostics for the content currently shown. Marked in the
   *  line-number gutter, one dot per line that has any. */
  diagnostics?: Diagnostic[];
}

const EditorImpl: React.FC<EditorProps> = ({ content, onChange, zoom = 100, theme = 'dark', editorRef, onCursorLineChange, onCaretChange, diagnostics }) => {
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
  // Pending onCaretChange timer (see CARET_DEBOUNCE_MS). A ref, not state:
  // restarting it must not re-render.
  const caretTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (caretTimerRef.current !== null) clearTimeout(caretTimerRef.current);
  }, []);

  // Autocomplete animation
  const { shouldRender: showAutoComplete, isAnimatingOut: autoCompleteClosing } =
    useDelayedUnmount(showSuggestions, 120);
  const autoCompleteAnimation = autoCompleteClosing
    ? 'dropdownOut 120ms cubic-bezier(0.4, 0, 0.2, 1) forwards'
    : 'dropdownIn 120ms cubic-bezier(0.4, 0, 0.2, 1)';

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

    // The caret, in the engine's coordinates: 1-based line, 0-based column
    // measured from the character after the previous newline. Debounced (see
    // CARET_DEBOUNCE_MS) - one timer, restarted on every move, so a burst of
    // events reports only where the caret came to rest.
    if (onCaretChange) {
      const col = pos - (content.lastIndexOf('\n', pos - 1) + 1);
      if (caretTimerRef.current !== null) clearTimeout(caretTimerRef.current);
      caretTimerRef.current = window.setTimeout(() => {
        caretTimerRef.current = null;
        onCaretChange(line, col);
      }, CARET_DEBOUNCE_MS);
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

  // Bracket pairs for wrapping selection and auto-closing
  // Note: Single quote ' is excluded to avoid issues with contractions (don't, it's, etc.)
  const bracketPairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
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
      const closingBrackets: Record<string, string> = { ')': '(', ']': '[', '}': '{', '"': '"', '`': '`' };
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

      // Symmetric quotes (", `) need special handling
      // Note: Single quote excluded to avoid issues with contractions
      const symmetricQuotes = new Set(['"', '`']);

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
        variable: '#c4b8d4',
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
        variable: syntaxColors.variable, // Light lavender - single-letter vars
    };

    return code.split('\n').map((line) => {
        // 1. Comments
        if (line.trim().startsWith('//')) {
            return `<span style="color: ${colors.comment};">${escapeHtml(line)}</span>`;
        }

        // 1b. Dash subtasks: -, --, ---, ---- at line start
        const dashSubtaskMatch = line.match(/^(\s*)(-{1,4})(\s+)(.*)(\{)\s*$/);
        if (dashSubtaskMatch) {
            const [, indent, dashes, space, title, brace] = dashSubtaskMatch;
            return `${escapeHtml(indent)}<span style="color: ${colors.keyword};">${escapeHtml(dashes)}</span>${escapeHtml(space)}${escapeHtml(title)}<span style="color: ${colors.bracket};">${escapeHtml(brace)}</span>`;
        }

        // 1c. Show/prove pattern: ?: at line start
        const showMatch = line.match(/^(\s*)(\?:)(\s+)(.*)(\{)\s*$/);
        if (showMatch) {
            const [, indent, qmark, space, statement, brace] = showMatch;
            return `${escapeHtml(indent)}<span style="color: ${colors.keyword};">${escapeHtml(qmark)}</span>${escapeHtml(space)}${escapeHtml(statement)}<span style="color: ${colors.bracket};">${escapeHtml(brace)}</span>`;
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

        // 2b. Mark single-letter variables with placeholders BEFORE any HTML is added
        // This ensures we capture standalone letters like x, y, A, B correctly
        const varPlaceholders: { placeholder: string; letter: string }[] = [];
        let varCounter = 0;
        processed = processed.replace(/(?<![a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g, (match, letter) => {
            const placeholder = `@VAR${varCounter}@`;
            varPlaceholders.push({ placeholder, letter });
            varCounter++;
            return placeholder;
        });

        // 2c. Operators (Gold/Yellow) - ->, =>, <=>, !=, <=, >=, +-, -+
        // Runs HERE, not further down, because escapeHtml spells half of these
        // with entities (`-&gt;`, `&lt;=`) and the next step hides every entity
        // behind a placeholder - after that there is no `&gt;` left to match.
        // Still after the variable pass, which has to see plain text.
        processed = processed.replace(/(-&gt;|=&gt;|&lt;=&gt;|!=|&lt;=|&gt;=|\+-|-\+)/g,
            `<span style="color: ${colors.operator};">$1</span>`
        );

        // 2d. Hide HTML entities from every pass below, same trick as the
        // variables above. escapeHtml turns `'` into `&#039;`, and the number
        // pass's \b\d+\b matches the `039` INSIDE it - splitting the entity so
        // the browser prints a literal `&#039;` instead of an apostrophe. The
        // word passes can do the same to `&amp;`/`&lt;`/`&quot;` the day a
        // language table gains a word like `amp`. `@ENTn@` is immune: its
        // digits sit against letters, so no \b falls inside it.
        const entPlaceholders: { placeholder: string; entity: string }[] = [];
        let entCounter = 0;
        processed = processed.replace(/&[#a-zA-Z0-9]+;/g, (entity) => {
            const placeholder = `@ENT${entCounter}@`;
            entPlaceholders.push({ placeholder, entity });
            entCounter++;
            return placeholder;
        });

        // 3. Math.Package
        processed = processed.replace(/(Math)(\.)([a-zA-Z0-9_]+)/g,
            `<span style="color: ${colors.mathPackage};">$1</span><span style="color: ${themeColors.textDim};">$2</span><span style="color: ${colors.function};">$3</span>`
        );

        // 4. Scope Keywords (Purple) - Problem, Theorem, Proof, Case, etc.
        //    (language.ts SCOPES + the editor's own proof-prose openers)
        SCOPE_WORDS.forEach(kw => {
             const regex = new RegExp(`\\b${kw}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.keyword};">${kw}</span>`);
        });

        // 5. Math Functions (Yellow) - language.ts FUNCTIONS + display-only extras
        // NOTE: Avoid words that appear in HTML like 'span', 'style', 'color'
        FUNCTION_WORDS.forEach(fn => {
             const regex = new RegExp(`\\b${fn}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.function};">${fn}</span>`);
        });

        // 6. Math Symbols (Cyan) - the word-spelled keys of language.ts SYMBOL_MAP
        // Note: lowercase 'in', 'and', 'or', 'not' are highlighted here for visibility,
        // but the compiler uses context detection for actual LaTeX output
        SYMBOL_WORDS.forEach(sym => {
             const regex = new RegExp(`\\b${sym}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.mathSymbol};">${sym}</span>`);
        });

        // 7. Greek Letters (Orange) - language.ts GREEK
        GREEK_WORDS.forEach(letter => {
             const regex = new RegExp(`\\b${letter}\\b`, 'g');
             processed = processed.replace(regex, `<span style="color: ${colors.greek};">${letter}</span>`);
        });

        // 8. Numbers (Light Green)
        processed = processed.replace(/(\b\d+\.?\d*\b)/g, `<span style="color: ${colors.number};">$1</span>`);

        // 9. Subscripts and superscripts (highlight _ and ^ specially)
        // a_i highlights the _ and subscript, x^2 highlights the ^ and superscript
        // Note: Do NOT change font-size here as it breaks cursor alignment
        processed = processed.replace(/(_)([a-zA-Z0-9]+)/g,
            `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
        );
        processed = processed.replace(/(\^)([a-zA-Z0-9]+)/g,
            `<span style="color: ${colors.operator};">$1</span><span style="color: ${colors.mathSymbol};">$2</span>`
        );

        // 10. Parentheses and square brackets only (skip {} to avoid conflicts with HTML spans)
        processed = processed.replace(/([()\[\]])/g, `<span style="color: ${colors.bracket};">$1</span>`);

        // 11. Restore the HTML entities hidden in 2d, now that every regex
        // pass that could have reached inside one has run.
        entPlaceholders.forEach(({ placeholder, entity }) => {
            processed = processed.replace(placeholder, entity);
        });

        // 12. Restore single-letter variable placeholders with the variable color (lavender)
        // This provides contrast with blue math symbols
        varPlaceholders.forEach(({ placeholder, letter }) => {
            processed = processed.replace(placeholder, `<span style="color: ${colors.variable};">${letter}</span>`);
        });

        if (processed === '') return ' ';
        return processed;
    }).join('\n');
  };

  const lineCount = content.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 30) }, (_, i) => i + 1);

  // Theme colors
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Diagnostics grouped by the line their span starts on - one gutter dot per
  // line however many diagnostics it collected, warn winning over info.
  const gutterMarks = useMemo(() => {
    const marks = new Map<number, { severity: 'info' | 'warn'; messages: string[] }>();
    for (const d of diagnostics ?? []) {
      const existing = marks.get(d.span.startLine);
      const text = d.hint ? `${d.message} - ${d.hint}` : d.message;
      if (existing) {
        existing.messages.push(text);
        if (d.severity === 'warn') existing.severity = 'warn';
      } else {
        marks.set(d.span.startLine, { severity: d.severity, messages: [text] });
      }
    }
    return marks;
  }, [diagnostics]);

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
            {lineNumbers.map(num => {
                const mark = gutterMarks.get(num);
                return (
                    <div key={num} className="transition-colors relative" style={{ lineHeight: `${lineHeight}px` }}>
                        {mark && (
                            <span
                                title={mark.messages.join('\n')}
                                className="absolute rounded-full"
                                style={{
                                    left: '4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: '6px',
                                    height: '6px',
                                    backgroundColor: mark.severity === 'warn' ? colors.warning : colors.info,
                                }}
                            />
                        )}
                        {num}
                    </div>
                );
            })}
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
         {showAutoComplete && (
             <div
                className="absolute z-50 w-64 shadow-xl rounded-md flex flex-col overflow-hidden"
                style={{
                    top: Math.min(cursorPos.top + containerPadding, 300),
                    left: Math.min(Math.max(cursorPos.left + containerPadding, 0), 400),
                    maxHeight: '200px',
                    overflowY: 'auto',
                    backgroundColor: colors.popup,
                    border: `1px solid ${colors.popupBorder}`,
                    animation: autoCompleteAnimation
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

/** MEMOIZED for the caret. Task 11 gave App a `caret` state that updates on
 *  every cursor move (debounced to 50ms), and an App re-render used to drag
 *  the editor's whole syntax-highlight pass - every token of the document,
 *  re-tokenized and re-elemented - along with it, even though not one of
 *  these props had changed. All of them are stable across a caret move by
 *  construction (App holds `content` in state, `onChange`/`onCaretChange` in
 *  useCallback, `diagnostics` in a useMemo), so the default shallow compare
 *  skips the re-render outright; the editor still re-renders on its OWN state
 *  (cursor line, bracket match, autocomplete), which is what actually needs
 *  to move with the caret. Measured on a 259-line document, production build,
 *  sweeping the caret inside one line: 25.4ms of scripting per caret move
 *  became 0.95ms. (Inside a bracket-heavy line the editor re-renders anyway,
 *  because matchingBracket is a fresh object every move - 38.8ms to 21.6ms
 *  there; that one is its own, older story.) */
export const Editor = React.memo(EditorImpl);
