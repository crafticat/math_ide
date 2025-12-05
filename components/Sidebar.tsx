
import React from 'react';
import { FileNode } from '../types';
import { DARK_THEME, LIGHT_THEME } from '../constants';
import { Files, Search, GitBranch, Package, Settings, ChevronDown, FileCode } from 'lucide-react';

interface SidebarProps {
  files: FileNode[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  theme?: 'dark' | 'light';
}

interface ExplorerProps extends SidebarProps {
  unsavedFiles?: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({ files, activeFileId, onFileSelect, theme = 'dark' }) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <div
      className="w-12 flex flex-col items-center py-2"
      style={{
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`
      }}
    >
      {/* Activity Bar Icons */}
      <div className="flex flex-col gap-1">
        <div className="relative p-2.5 cursor-pointer group">
          <Files size={22} style={{ color: colors.text }} />
          <div
            className="absolute left-0 top-0 bottom-0 w-[2px]"
            style={{ backgroundColor: colors.text }}
          />
        </div>
        <div
          className="p-2.5 cursor-pointer group rounded transition-colors"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.querySelector('svg')!.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.querySelector('svg')!.style.color = colors.textDim;
          }}
        >
          <Search size={22} className="transition-colors" />
        </div>
        <div
          className="p-2.5 cursor-pointer group rounded transition-colors"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.querySelector('svg')!.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.querySelector('svg')!.style.color = colors.textDim;
          }}
        >
          <GitBranch size={22} className="transition-colors" />
        </div>
        <div
          className="p-2.5 cursor-pointer group rounded transition-colors"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.querySelector('svg')!.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.querySelector('svg')!.style.color = colors.textDim;
          }}
        >
          <Package size={22} className="transition-colors" />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1 mb-1">
        <div
          className="p-2.5 cursor-pointer group rounded transition-colors"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.querySelector('svg')!.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.querySelector('svg')!.style.color = colors.textDim;
          }}
        >
          <Settings size={22} className="transition-colors" />
        </div>
      </div>
    </div>
  );
};

// Secondary sidebar for the actual file tree (VS Code explorer style)
export const Explorer: React.FC<ExplorerProps> = ({
  files,
  activeFileId,
  onFileSelect,
  unsavedFiles = [],
  theme = 'dark'
}) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <div
      className="w-56 flex flex-col h-full select-none"
      style={{
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`
      }}
    >
      <div
        className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: colors.textDim }}
      >
        Explorer
      </div>

      <div className="flex-1 overflow-auto">
        {/* Project Folder Header */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <ChevronDown size={12} style={{ color: colors.textDim }} />
          <span className="uppercase tracking-wide">math-project</span>
        </div>

        {/* Files */}
        <div className="flex flex-col">
          {files[0]?.children?.map(child => {
            const isActive = child.id === activeFileId;
            const isUnsaved = unsavedFiles.includes(child.id);

            return (
              <div
                key={child.id}
                onClick={() => onFileSelect(child.id)}
                className="flex items-center gap-2 px-4 pl-6 py-1 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isActive ? colors.activeItem : 'transparent',
                  color: isActive ? colors.text : colors.textDim
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = colors.activeItem;
                    e.currentTarget.style.color = colors.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = colors.textDim;
                  }
                }}
              >
                <FileCode size={14} className="text-[#4ec9b0] flex-shrink-0" />
                <span className="text-[13px] truncate">
                  {child.name}{isUnsaved ? ' •' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
