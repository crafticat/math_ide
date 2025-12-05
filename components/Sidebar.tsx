
import React, { useState } from 'react';
import { FileNode } from '../types';
import { DARK_THEME, LIGHT_THEME } from '../constants';
import { Files, Search, GitBranch, Package, Settings, ChevronDown, ChevronRight, FileCode } from 'lucide-react';

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
      className="w-12 flex flex-col items-center py-3"
      style={{
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`
      }}
    >
      {/* Activity Bar Icons */}
      <div className="flex flex-col gap-1">
        {/* Files - Active */}
        <div className="relative p-2.5 cursor-pointer group">
          <Files size={20} style={{ color: colors.accent }} />
          <div
            className="absolute left-0 top-0 bottom-0 w-[2px]"
            style={{ backgroundColor: colors.accent }}
          />
        </div>
        {/* Search */}
        <div
          className="p-2.5 cursor-pointer rounded transition-all"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textDim;
          }}
        >
          <Search size={20} />
        </div>
        {/* Git */}
        <div
          className="p-2.5 cursor-pointer rounded transition-all"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textDim;
          }}
        >
          <GitBranch size={20} />
        </div>
        {/* Extensions */}
        <div
          className="p-2.5 cursor-pointer rounded transition-all"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textDim;
          }}
        >
          <Package size={20} />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1 mb-1">
        <div
          className="p-2.5 cursor-pointer rounded transition-all"
          style={{ color: colors.textDim }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.activeItem;
            e.currentTarget.style.color = colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textDim;
          }}
        >
          <Settings size={20} />
        </div>
      </div>
    </div>
  );
};

// Secondary sidebar for the actual file tree
export const Explorer: React.FC<ExplorerProps> = ({
  files,
  activeFileId,
  onFileSelect,
  unsavedFiles = [],
  theme = 'dark'
}) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
  const [filesExpanded, setFilesExpanded] = useState(true);

  return (
    <div
      className="w-56 flex flex-col h-full select-none"
      style={{
        backgroundColor: colors.sidebar,
        borderRight: `1px solid ${colors.border}`
      }}
    >
      {/* Explorer Title */}
      <div
        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: colors.textDim }}
      >
        Explorer
      </div>

      <div className="flex-1 overflow-auto px-2">
        {/* FILES Section */}
        <div className="mb-3">
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold cursor-pointer rounded transition-colors"
            style={{ color: colors.textDim }}
            onClick={() => setFilesExpanded(!filesExpanded)}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {filesExpanded ? (
              <ChevronDown size={12} style={{ color: colors.accent }} />
            ) : (
              <ChevronRight size={12} style={{ color: colors.accent }} />
            )}
            <span className="uppercase tracking-widest">Files</span>
          </div>

          {/* File List */}
          {filesExpanded && (
            <div className="flex flex-col mt-1">
              {files[0]?.children?.map(child => {
                const isActive = child.id === activeFileId;
                const isUnsaved = unsavedFiles.includes(child.id);

                return (
                  <div
                    key={child.id}
                    onClick={() => onFileSelect(child.id)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded transition-colors relative"
                    style={{
                      backgroundColor: isActive ? colors.activeItem : 'transparent',
                      color: isActive ? colors.text : colors.textDim,
                      marginLeft: '8px'
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
                    {/* Active indicator */}
                    {isActive && (
                      <div
                        className="absolute left-0 top-1 bottom-1 w-[2px] rounded"
                        style={{ backgroundColor: colors.accent }}
                      />
                    )}
                    <FileCode
                      size={14}
                      className="flex-shrink-0"
                      style={{ color: colors.accentSecondary || colors.accent }}
                    />
                    <span className="text-[12px] truncate flex-1">{child.name}</span>
                    {isUnsaved && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: colors.accent }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          className="mx-2 my-2"
          style={{ borderBottom: `1px solid ${colors.border}` }}
        />

        {/* INFO Section */}
        <div className="px-2 py-2">
          <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: colors.textDim }}>
            Info
          </div>
          <div className="text-[11px] space-y-1" style={{ color: colors.textDim }}>
            <div>MathScript v1.4</div>
            <div style={{ color: colors.accent }}>◈ Academic Theme</div>
          </div>
        </div>
      </div>
    </div>
  );
};
