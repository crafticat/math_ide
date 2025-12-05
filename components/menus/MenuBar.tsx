import React, { useState, useCallback } from 'react';
import { DropdownMenu } from './DropdownMenu';
import { MenuItemDef, FileNode } from '../../types';
import { DARK_THEME, LIGHT_THEME } from '../../constants';
import { ChevronRight } from 'lucide-react';

type MenuType = 'file' | 'edit' | 'view' | null;

interface MenuBarProps {
  theme: 'dark' | 'light';
  // File menu handlers
  onNewFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDeleteFile: () => void;
  recentFiles: FileNode[];
  onOpenRecentFile: (id: string) => void;
  // Edit menu handlers
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFind: () => void;
  onReplace: () => void;
  onSelectAll: () => void;
  onFormat: () => void;
  // View menu handlers
  sidebarVisible: boolean;
  consoleVisible: boolean;
  previewVisible: boolean;
  onToggleSidebar: () => void;
  onToggleConsole: () => void;
  onTogglePreview: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleTheme: () => void;
  editorZoom: number;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  theme,
  onNewFile,
  onSave,
  onSaveAs,
  onDeleteFile,
  recentFiles,
  onOpenRecentFile,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onFind,
  onReplace,
  onSelectAll,
  onFormat,
  sidebarVisible,
  consoleVisible,
  previewVisible,
  onToggleSidebar,
  onToggleConsole,
  onTogglePreview,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleTheme,
  editorZoom,
}) => {
  const [activeMenu, setActiveMenu] = useState<MenuType>(null);
  const [showRecentSubmenu, setShowRecentSubmenu] = useState(false);
  const isDark = theme === 'dark';
  const colors = isDark ? DARK_THEME : LIGHT_THEME;

  const toggleMenu = useCallback((menu: MenuType) => {
    setActiveMenu(prev => prev === menu ? null : menu);
    setShowRecentSubmenu(false);
  }, []);

  const closeMenu = useCallback(() => {
    setActiveMenu(null);
    setShowRecentSubmenu(false);
  }, []);

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const fileMenuItems: MenuItemDef[] = [
    { label: 'New File', shortcut: `${cmdKey}+N`, action: onNewFile, dividerAfter: true },
    { label: 'Save', shortcut: `${cmdKey}+S`, action: onSave },
    { label: 'Save As...', shortcut: `${cmdKey}+Shift+S`, action: onSaveAs, dividerAfter: true },
    { label: 'Delete File', action: onDeleteFile, dividerAfter: recentFiles.length > 0 },
  ];

  const editMenuItems: MenuItemDef[] = [
    { label: 'Undo', shortcut: `${cmdKey}+Z`, action: onUndo },
    { label: 'Redo', shortcut: `${cmdKey}+Shift+Z`, action: onRedo, dividerAfter: true },
    { label: 'Cut', shortcut: `${cmdKey}+X`, action: onCut },
    { label: 'Copy', shortcut: `${cmdKey}+C`, action: onCopy },
    { label: 'Paste', shortcut: `${cmdKey}+V`, action: onPaste, dividerAfter: true },
    { label: 'Find', shortcut: `${cmdKey}+F`, action: onFind },
    { label: 'Replace', shortcut: `${cmdKey}+H`, action: onReplace, dividerAfter: true },
    { label: 'Select All', shortcut: `${cmdKey}+A`, action: onSelectAll },
    { label: 'Format Document', shortcut: `${cmdKey}+Shift+F`, action: onFormat },
  ];

  const viewMenuItems: MenuItemDef[] = [
    { label: `${sidebarVisible ? '✓ ' : '   '}Sidebar`, shortcut: `${cmdKey}+B`, action: onToggleSidebar },
    { label: `${consoleVisible ? '✓ ' : '   '}Console`, shortcut: `${cmdKey}+\``, action: onToggleConsole },
    { label: `${previewVisible ? '✓ ' : '   '}Preview`, shortcut: `${cmdKey}+Shift+P`, action: onTogglePreview, dividerAfter: true },
    { label: 'Zoom In', shortcut: `${cmdKey}++`, action: onZoomIn },
    { label: 'Zoom Out', shortcut: `${cmdKey}+-`, action: onZoomOut },
    { label: `Reset Zoom (${editorZoom}%)`, shortcut: `${cmdKey}+0`, action: onResetZoom, dividerAfter: true },
    { label: `Theme: ${theme === 'dark' ? 'Dark' : 'Light'}`, action: onToggleTheme },
  ];

  // Menu button styles using theme colors
  const getButtonStyle = (isActive: boolean) => ({
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '13px',
    color: isActive ? colors.text : colors.textDim,
    backgroundColor: isActive ? colors.activeItem : 'transparent',
    transition: 'all 0.15s ease',
  });

  const buttonHoverStyle = {
    backgroundColor: colors.activeItem,
    color: colors.text,
  };

  return (
    <div className="flex items-center gap-1">
      {/* File Menu */}
      <div className="relative">
        <button
          onClick={() => toggleMenu('file')}
          style={getButtonStyle(activeMenu === 'file')}
          onMouseEnter={(e) => {
            if (activeMenu !== 'file') {
              Object.assign(e.currentTarget.style, buttonHoverStyle);
            }
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'file') {
              Object.assign(e.currentTarget.style, getButtonStyle(false));
            }
          }}
        >
          File
        </button>
        {activeMenu === 'file' && (
          <div
            className="absolute top-full left-0 mt-1 min-w-[220px] py-1.5 rounded-md shadow-lg z-50"
            style={{
              backgroundColor: colors.popup,
              border: `1px solid ${colors.popupBorder}`,
            }}
          >
            {fileMenuItems.map((item, index) => (
              <div key={index}>
                <button
                  onClick={() => {
                    item.action();
                    closeMenu();
                  }}
                  disabled={item.disabled}
                  className="w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between transition-colors rounded-sm mx-1"
                  style={{
                    width: 'calc(100% - 8px)',
                    color: item.disabled ? colors.textMuted || colors.textDim : colors.text,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.backgroundColor = colors.popupActive;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="ml-6 text-[11px]" style={{ color: colors.textDim }}>
                      {item.shortcut}
                    </span>
                  )}
                </button>
                {item.dividerAfter && (
                  <div className="my-1.5 mx-2" style={{ borderTop: `1px solid ${colors.border}` }} />
                )}
              </div>
            ))}
            {/* Recent Files Submenu */}
            {recentFiles.length > 0 && (
              <div
                className="relative"
                onMouseEnter={() => setShowRecentSubmenu(true)}
                onMouseLeave={() => setShowRecentSubmenu(false)}
              >
                <button
                  className="w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between transition-colors rounded-sm mx-1"
                  style={{
                    width: 'calc(100% - 8px)',
                    color: colors.text,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.popupActive}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span>Recent Files</span>
                  <ChevronRight size={14} style={{ color: colors.accent }} />
                </button>
                {showRecentSubmenu && (
                  <div
                    className="absolute left-full top-0 ml-1 min-w-[180px] py-1.5 rounded-md shadow-lg z-50"
                    style={{
                      backgroundColor: colors.popup,
                      border: `1px solid ${colors.popupBorder}`,
                    }}
                  >
                    {recentFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => {
                          onOpenRecentFile(file.id);
                          closeMenu();
                        }}
                        className="w-full px-3 py-1.5 text-left text-[13px] truncate transition-colors rounded-sm mx-1"
                        style={{
                          width: 'calc(100% - 8px)',
                          color: colors.text,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.popupActive}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {file.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Menu */}
      <div className="relative">
        <button
          onClick={() => toggleMenu('edit')}
          style={getButtonStyle(activeMenu === 'edit')}
          onMouseEnter={(e) => {
            if (activeMenu !== 'edit') {
              Object.assign(e.currentTarget.style, buttonHoverStyle);
            }
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'edit') {
              Object.assign(e.currentTarget.style, getButtonStyle(false));
            }
          }}
        >
          Edit
        </button>
        <DropdownMenu
          items={editMenuItems}
          isOpen={activeMenu === 'edit'}
          onClose={closeMenu}
          theme={theme}
        />
      </div>

      {/* View Menu */}
      <div className="relative">
        <button
          onClick={() => toggleMenu('view')}
          style={getButtonStyle(activeMenu === 'view')}
          onMouseEnter={(e) => {
            if (activeMenu !== 'view') {
              Object.assign(e.currentTarget.style, buttonHoverStyle);
            }
          }}
          onMouseLeave={(e) => {
            if (activeMenu !== 'view') {
              Object.assign(e.currentTarget.style, getButtonStyle(false));
            }
          }}
        >
          View
        </button>
        <DropdownMenu
          items={viewMenuItems}
          isOpen={activeMenu === 'view'}
          onClose={closeMenu}
          theme={theme}
        />
      </div>

      {/* Help Menu (placeholder) */}
      <div className="relative">
        <button
          style={getButtonStyle(false)}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, getButtonStyle(false))}
        >
          Help
        </button>
      </div>
    </div>
  );
};
