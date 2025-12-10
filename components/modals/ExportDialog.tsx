import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  theme: 'dark' | 'light';
}

export interface ExportOptions {
  title: string;
  author: string;
  date: string;
  showLineNumbers: boolean;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  theme,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onExport({ title, author, date, showLineNumbers });
  };

  const inputClass = `
    w-full px-3 py-2 rounded text-[13px] outline-none
    ${isDark
      ? 'bg-[#3c3c3c] border border-[#454545] text-white focus:border-[#007acc]'
      : 'bg-white border border-gray-300 text-gray-800 focus:border-[#007acc]'
    }
  `;

  const labelClass = `block text-[13px] mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`;

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
          relative w-[450px] rounded-lg shadow-xl
          ${isDark ? 'bg-[#252526] text-gray-200' : 'bg-white text-gray-800'}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-4 py-3 border-b
          ${isDark ? 'border-[#454545]' : 'border-gray-200'}
        `}>
          <h2 className="text-sm font-semibold">Export to PDF</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-opacity-20 ${isDark ? 'hover:bg-white' : 'hover:bg-black'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className={labelClass}>Document Title (optional)</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Problem Set 1"
              className={inputClass}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Author (optional)</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g., John Doe"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Date</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lineNumbers"
              checked={showLineNumbers}
              onChange={(e) => setShowLineNumbers(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="lineNumbers" className={`text-[13px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Show equation numbers
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`
                px-3 py-1.5 rounded text-[13px] transition-colors
                ${isDark
                  ? 'bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-[13px] transition-colors bg-[#007acc] hover:bg-[#0062a3] text-white"
            >
              Export PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
