import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface FindReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'find' | 'replace';
  content: string;
  onReplaceContent: (newContent: string) => void;
  theme: 'dark' | 'light';
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
  isOpen,
  onClose,
  mode,
  content,
  onReplaceContent,
  theme,
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [matches, setMatches] = useState<{ start: number; end: number }[]>([]);
  const findInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  // Find all matches when findText changes
  useEffect(() => {
    if (!findText) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    const searchText = matchCase ? content : content.toLowerCase();
    const needle = matchCase ? findText : findText.toLowerCase();
    const foundMatches: { start: number; end: number }[] = [];

    let index = 0;
    while (true) {
      const foundIndex = searchText.indexOf(needle, index);
      if (foundIndex === -1) break;
      foundMatches.push({ start: foundIndex, end: foundIndex + findText.length });
      index = foundIndex + 1;
    }

    setMatches(foundMatches);
    if (foundMatches.length > 0 && currentMatch >= foundMatches.length) {
      setCurrentMatch(0);
    }
  }, [findText, content, matchCase]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => findInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        findNext();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        findPrevious();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matches, currentMatch]);

  const findNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatch((prev) => (prev + 1) % matches.length);
  }, [matches]);

  const findPrevious = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatch((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches]);

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0 || !matches[currentMatch]) return;

    const match = matches[currentMatch];
    const before = content.slice(0, match.start);
    const after = content.slice(match.end);
    onReplaceContent(before + replaceText + after);
  }, [content, matches, currentMatch, replaceText, onReplaceContent]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0 || !findText) return;

    let newContent = content;
    if (matchCase) {
      newContent = newContent.split(findText).join(replaceText);
    } else {
      const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      newContent = newContent.replace(regex, replaceText);
    }
    onReplaceContent(newContent);
  }, [content, findText, replaceText, matchCase, matches, onReplaceContent]);

  if (!isOpen) return null;

  return (
    <div
      className={`
        absolute top-12 right-4 z-50 rounded-lg shadow-xl
        ${isDark ? 'bg-[#252526] border border-[#454545]' : 'bg-white border border-gray-300'}
      `}
      style={{ width: mode === 'replace' ? '340px' : '300px' }}
    >
      <div className="p-3">
        {/* Find Row */}
        <div className="flex items-center gap-2 mb-2">
          <input
            ref={findInputRef}
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find"
            className={`
              flex-1 px-2 py-1.5 rounded text-[13px] outline-none
              ${isDark
                ? 'bg-[#3c3c3c] border border-[#454545] text-white focus:border-[#007acc]'
                : 'bg-white border border-gray-300 text-gray-800 focus:border-[#007acc]'
              }
            `}
          />
          <span className={`text-[11px] min-w-[60px] text-center ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
            {matches.length > 0 ? `${currentMatch + 1} of ${matches.length}` : 'No results'}
          </span>
          <button
            onClick={findPrevious}
            disabled={matches.length === 0}
            className={`
              p-1 rounded transition-colors
              ${matches.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-gray-100'
              }
            `}
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp size={16} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
          </button>
          <button
            onClick={findNext}
            disabled={matches.length === 0}
            className={`
              p-1 rounded transition-colors
              ${matches.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-gray-100'
              }
            `}
            title="Next match (Enter)"
          >
            <ChevronDown size={16} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
          </button>
          <button
            onClick={onClose}
            className={`
              p-1 rounded transition-colors
              ${isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-gray-100'}
            `}
          >
            <X size={16} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
          </button>
        </div>

        {/* Replace Row (only in replace mode) */}
        {mode === 'replace' && (
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace"
              className={`
                flex-1 px-2 py-1.5 rounded text-[13px] outline-none
                ${isDark
                  ? 'bg-[#3c3c3c] border border-[#454545] text-white focus:border-[#007acc]'
                  : 'bg-white border border-gray-300 text-gray-800 focus:border-[#007acc]'
                }
              `}
            />
            <button
              onClick={replaceCurrent}
              disabled={matches.length === 0}
              className={`
                px-2 py-1 rounded text-[11px] transition-colors
                ${matches.length === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : isDark
                    ? 'bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }
              `}
            >
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={matches.length === 0}
              className={`
                px-2 py-1 rounded text-[11px] transition-colors
                ${matches.length === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : isDark
                    ? 'bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }
              `}
            >
              All
            </button>
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-3">
          <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="w-3 h-3"
            />
            Match Case
          </label>
        </div>
      </div>
    </div>
  );
};
