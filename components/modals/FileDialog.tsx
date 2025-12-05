import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface FileDialogProps {
  type: 'new' | 'saveAs' | 'delete';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  defaultValue?: string;
  fileName?: string; // For delete confirmation
  theme: 'dark' | 'light';
}

export const FileDialog: React.FC<FileDialogProps> = ({
  type,
  isOpen,
  onClose,
  onSubmit,
  defaultValue = '',
  fileName = '',
  theme,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

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

    if (type === 'delete') {
      onSubmit('confirm');
      return;
    }

    // Validate filename
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Filename is required');
      return;
    }

    // Ensure .math extension
    let finalName = trimmed;
    if (!finalName.endsWith('.math')) {
      finalName += '.math';
    }

    // Basic filename validation
    if (!/^[a-zA-Z0-9_\-\s()]+\.math$/.test(finalName)) {
      setError('Invalid filename. Use letters, numbers, spaces, and basic punctuation.');
      return;
    }

    onSubmit(finalName);
  };

  const titles = {
    new: 'New File',
    saveAs: 'Save As',
    delete: 'Delete File',
  };

  const descriptions = {
    new: 'Enter a name for the new file:',
    saveAs: 'Enter a new name for the file:',
    delete: `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
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
          relative w-[400px] rounded-lg shadow-xl
          ${isDark ? 'bg-[#252526] text-gray-200' : 'bg-white text-gray-800'}
        `}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between px-4 py-3 border-b
          ${isDark ? 'border-[#454545]' : 'border-gray-200'}
        `}>
          <h2 className="text-sm font-semibold">{titles[type]}</h2>
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-opacity-20 ${isDark ? 'hover:bg-white' : 'hover:bg-black'}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          <p className={`text-[13px] mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {descriptions[type]}
          </p>

          {type !== 'delete' && (
            <>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError('');
                }}
                placeholder="filename.math"
                className={`
                  w-full px-3 py-2 rounded text-[13px] outline-none
                  ${isDark
                    ? 'bg-[#3c3c3c] border border-[#454545] text-white focus:border-[#007acc]'
                    : 'bg-white border border-gray-300 text-gray-800 focus:border-[#007acc]'
                  }
                `}
              />
              {error && (
                <p className="mt-1.5 text-[12px] text-red-400">{error}</p>
              )}
            </>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 mt-4">
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
              className={`
                px-3 py-1.5 rounded text-[13px] transition-colors
                ${type === 'delete'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-[#007acc] hover:bg-[#0062a3] text-white'
                }
              `}
            >
              {type === 'delete' ? 'Delete' : type === 'new' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
