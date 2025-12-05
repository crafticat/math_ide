
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, Explorer } from './components/Sidebar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Console } from './components/Console';
import { MenuBar } from './components/menus/MenuBar';
import { FileDialog } from './components/modals/FileDialog';
import { FindReplaceDialog } from './components/modals/FindReplaceDialog';
import { compileMathScript } from './services/compiler';
import { INITIAL_CONTENT, DEFAULT_FILE_CONTENT, DARK_THEME, LIGHT_THEME } from './constants';
import { FileNode, CompilationResult, AppSettings } from './types';
import {
  loadFiles, saveFiles, loadRecentFiles, saveRecentFiles, addToRecentFiles,
  loadSettings, saveSettings, generateFileId, findFileById, updateFileContent,
  addFile, removeFile, getAllFiles, generateUniqueFileName
} from './services/storage';
import { Play, FileDown, Code, Eye, X, Circle } from 'lucide-react';

export default function App() {
  // File state
  const [files, setFiles] = useState<FileNode[]>(() => loadFiles());
  const [activeFile, setActiveFile] = useState<string>('file-1');
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles());
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Editor content
  const [content, setContent] = useState<string>('');
  const [compilationResult, setCompilationResult] = useState<CompilationResult>({ latexLines: [], logs: [], macros: {} });

  // UI State
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const { sidebarVisible, consoleVisible, previewVisible, editorZoom, theme } = settings;

  // Dialogs
  const [dialogType, setDialogType] = useState<'new' | 'saveAs' | 'delete' | null>(null);
  const [findDialogMode, setFindDialogMode] = useState<'find' | 'replace' | null>(null);

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Theme colors
  const themeColors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Load initial content from active file
  useEffect(() => {
    const file = findFileById(files, activeFile);
    if (file && file.content !== undefined) {
      setContent(file.content);
    } else if (file) {
      setContent(INITIAL_CONTENT);
    }
    setUnsavedChanges(false);
  }, [activeFile]);

  // Save files to localStorage when they change
  useEffect(() => {
    saveFiles(files);
  }, [files]);

  // Save settings to localStorage when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Save recent files when they change
  useEffect(() => {
    saveRecentFiles(recentFiles);
  }, [recentFiles]);

  // Compilation
  const runCompilation = useCallback(() => {
    const result = compileMathScript(content);
    setCompilationResult(result);
  }, [content]);

  // Initial Run
  useEffect(() => {
    runCompilation();
  }, []);

  // Live Update: Debounced compilation when content changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      runCompilation();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [content, runCompilation]);

  // Track unsaved changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setUnsavedChanges(true);
  }, []);

  // Update settings helper
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // File operations
  const saveCurrentFile = useCallback(() => {
    setFiles(prev => updateFileContent(prev, activeFile, content));
    setUnsavedChanges(false);
  }, [activeFile, content]);

  const handleFileSelect = useCallback((fileId: string) => {
    if (unsavedChanges) {
      saveCurrentFile();
    }
    setActiveFile(fileId);
    setRecentFiles(prev => addToRecentFiles(fileId, prev));
  }, [unsavedChanges, saveCurrentFile]);

  const handleNewFile = useCallback(() => {
    setDialogType('new');
  }, []);

  const handleSaveAs = useCallback(() => {
    setDialogType('saveAs');
  }, []);

  const handleDeleteFile = useCallback(() => {
    setDialogType('delete');
  }, []);

  const handleDialogSubmit = useCallback((value: string) => {
    if (dialogType === 'new') {
      const newId = generateFileId();
      const fileName = generateUniqueFileName(files, value);
      const newFile: FileNode = {
        id: newId,
        name: fileName,
        type: 'file',
        content: DEFAULT_FILE_CONTENT,
      };
      setFiles(prev => addFile(prev, newFile));
      setActiveFile(newId);
      setRecentFiles(prev => addToRecentFiles(newId, prev));
    } else if (dialogType === 'saveAs') {
      const newId = generateFileId();
      const fileName = generateUniqueFileName(files, value);
      const newFile: FileNode = {
        id: newId,
        name: fileName,
        type: 'file',
        content: content,
      };
      setFiles(prev => addFile(prev, newFile));
      setActiveFile(newId);
      setRecentFiles(prev => addToRecentFiles(newId, prev));
      setUnsavedChanges(false);
    } else if (dialogType === 'delete') {
      const allFiles = getAllFiles(files);
      if (allFiles.length <= 1) {
        // Don't delete the last file
        setDialogType(null);
        return;
      }
      // Find another file to switch to
      const otherFile = allFiles.find(f => f.id !== activeFile);
      if (otherFile) {
        setActiveFile(otherFile.id);
      }
      setFiles(prev => removeFile(prev, activeFile));
      setRecentFiles(prev => prev.filter(id => id !== activeFile));
    }
    setDialogType(null);
  }, [dialogType, files, content, activeFile]);

  // Edit operations
  const handleUndo = useCallback(() => {
    document.execCommand('undo');
  }, []);

  const handleRedo = useCallback(() => {
    document.execCommand('redo');
  }, []);

  const handleCut = useCallback(async () => {
    try {
      const selection = window.getSelection()?.toString();
      if (selection) {
        await navigator.clipboard.writeText(selection);
        document.execCommand('delete');
      }
    } catch (e) {
      document.execCommand('cut');
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const selection = window.getSelection()?.toString();
      if (selection) {
        await navigator.clipboard.writeText(selection);
      }
    } catch (e) {
      document.execCommand('copy');
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand('insertText', false, text);
    } catch (e) {
      document.execCommand('paste');
    }
  }, []);

  const handleFind = useCallback(() => {
    setFindDialogMode('find');
  }, []);

  const handleReplace = useCallback(() => {
    setFindDialogMode('replace');
  }, []);

  const handleSelectAll = useCallback(() => {
    editorRef.current?.select();
  }, []);

  const handleFormat = useCallback(() => {
    // Simple auto-indent formatting for MathScript
    const lines = content.split('\n');
    let indentLevel = 0;
    const formatted = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.endsWith('}') && !trimmed.startsWith('{')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      const indented = '  '.repeat(indentLevel) + trimmed;
      if (trimmed.endsWith('{')) {
        indentLevel++;
      }
      return indented;
    }).join('\n');
    setContent(formatted);
    setUnsavedChanges(true);
  }, [content]);

  // View operations
  const handleToggleSidebar = useCallback(() => {
    updateSettings({ sidebarVisible: !sidebarVisible });
  }, [sidebarVisible, updateSettings]);

  const handleToggleConsole = useCallback(() => {
    updateSettings({ consoleVisible: !consoleVisible });
  }, [consoleVisible, updateSettings]);

  const handleTogglePreview = useCallback(() => {
    updateSettings({ previewVisible: !previewVisible });
  }, [previewVisible, updateSettings]);

  const handleZoomIn = useCallback(() => {
    updateSettings({ editorZoom: Math.min(200, editorZoom + 10) });
  }, [editorZoom, updateSettings]);

  const handleZoomOut = useCallback(() => {
    updateSettings({ editorZoom: Math.max(50, editorZoom - 10) });
  }, [editorZoom, updateSettings]);

  const handleResetZoom = useCallback(() => {
    updateSettings({ editorZoom: 100 });
  }, [updateSettings]);

  const handleToggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (cmdKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              handleSaveAs();
            } else {
              saveCurrentFile();
            }
            break;
          case 'n':
            e.preventDefault();
            handleNewFile();
            break;
          case 'f':
            e.preventDefault();
            handleFind();
            break;
          case 'h':
            e.preventDefault();
            handleReplace();
            break;
          case 'b':
            e.preventDefault();
            handleToggleSidebar();
            break;
          case '`':
            e.preventDefault();
            handleToggleConsole();
            break;
          case 'p':
            if (e.shiftKey) {
              e.preventDefault();
              handleTogglePreview();
            }
            break;
          case '=':
          case '+':
            e.preventDefault();
            handleZoomIn();
            break;
          case '-':
            e.preventDefault();
            handleZoomOut();
            break;
          case '0':
            e.preventDefault();
            handleResetZoom();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentFile, handleNewFile, handleSaveAs, handleFind, handleReplace,
      handleToggleSidebar, handleToggleConsole, handleTogglePreview,
      handleZoomIn, handleZoomOut, handleResetZoom]);

  const handleExportPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = compilationResult.latexLines.map(line => {
      try {
        return window.katex.renderToString(line.latex, {
          displayMode: true,
          throwOnError: false,
          fleqn: true
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

  const hasErrors = compilationResult.logs.some(log => log.type === 'error');
  const hasWarnings = compilationResult.logs.some(log => log.type === 'warning');

  const activeFileName = findFileById(files, activeFile)?.name || 'untitled.math';
  const recentFileNodes = recentFiles
    .map(id => findFileById(files, id))
    .filter((f): f is FileNode => f !== null && f.id !== activeFile)
    .slice(0, 5);

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{
        backgroundColor: themeColors.bg,
        color: themeColors.text,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      {/* Header Bar - Elegant title */}
      <div
        className="h-12 flex-none flex items-center justify-between px-5 select-none"
        style={{
          backgroundColor: themeColors.topBar,
          borderBottom: `1px solid ${themeColors.border}`
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xl tracking-tight"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: themeColors.accent,
              fontWeight: 600
            }}
          >
            ◈ MathBrain
          </span>
        </div>
        <div className="flex items-center gap-2" style={{ color: themeColors.textDim }}>
          <span className="text-sm">{activeFileName}</span>
          {unsavedChanges && (
            <span style={{ color: themeColors.accent }}>●</span>
          )}
        </div>
        <div className="w-32" /> {/* Spacer for balance */}
      </div>

      {/* Menu Bar */}
      <div
        className="h-9 flex-none flex items-center justify-between px-4 text-xs select-none"
        style={{
          backgroundColor: themeColors.sidebar,
          borderBottom: `1px solid ${themeColors.border}`
        }}
      >
        <MenuBar
          theme={theme}
          onNewFile={handleNewFile}
          onSave={saveCurrentFile}
          onSaveAs={handleSaveAs}
          onDeleteFile={handleDeleteFile}
          recentFiles={recentFileNodes}
          onOpenRecentFile={handleFileSelect}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onFind={handleFind}
          onReplace={handleReplace}
          onSelectAll={handleSelectAll}
          onFormat={handleFormat}
          sidebarVisible={sidebarVisible}
          consoleVisible={consoleVisible}
          previewVisible={previewVisible}
          onToggleSidebar={handleToggleSidebar}
          onToggleConsole={handleToggleConsole}
          onTogglePreview={handleTogglePreview}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onToggleTheme={handleToggleTheme}
          editorZoom={editorZoom}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all"
            style={{
              color: themeColors.textDim,
              border: `1px solid ${themeColors.border}`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeColors.menuHover;
              e.currentTarget.style.borderColor = themeColors.borderStrong || themeColors.border;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = themeColors.border;
            }}
            title="Export as PDF"
          >
            <FileDown size={14} />
            <span>Export</span>
          </button>
          <button
            onClick={runCompilation}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded transition-all"
            style={{
              backgroundColor: themeColors.accent,
              color: theme === 'dark' ? '#1a1816' : '#fff',
              fontWeight: 500
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColors.accentHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColors.accent}
          >
            <Play size={12} fill="currentColor" />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 min-h-0">
        {sidebarVisible && (
          <>
            <Sidebar
              files={files}
              activeFileId={activeFile}
              onFileSelect={handleFileSelect}
              theme={theme}
            />
            <Explorer
              files={files}
              activeFileId={activeFile}
              onFileSelect={handleFileSelect}
              unsavedFiles={unsavedChanges ? [activeFile] : []}
              theme={theme}
            />
          </>
        )}

        {/* Editor & Preview Area */}
        <div className="flex-1 flex flex-col min-w-0 relative" style={{ backgroundColor: themeColors.bg }}>
          {/* Tabs */}
          <div
            className="flex-none flex"
            style={{
              backgroundColor: themeColors.sidebar,
              borderBottom: `1px solid ${themeColors.border}`
            }}
          >
            {/* Editor Tab */}
            <div
              className="flex items-center gap-2 pl-3 pr-2 py-2 text-xs cursor-pointer group relative"
              style={{ backgroundColor: themeColors.bg, color: themeColors.text }}
            >
              <Code size={14} style={{ color: themeColors.accentSecondary || themeColors.accent }} />
              <span>{activeFileName}</span>
              {unsavedChanges && (
                <span style={{ color: themeColors.accent }}>●</span>
              )}
              <button
                className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = themeColors.menuHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={14} />
              </button>
              {/* Gold accent underline */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: themeColors.accent }}
              />
            </div>
            {previewVisible && (
              <div
                className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
                style={{
                  backgroundColor: themeColors.panel || themeColors.sidebar,
                  color: themeColors.textDim,
                  borderRight: `1px solid ${themeColors.border}`
                }}
              >
                <Eye size={14} />
                <span>Preview</span>
              </div>
            )}
            <div className="flex-1" />
          </div>

          {/* Split View Container */}
          <div className="flex-1 flex min-h-0 relative">
            {/* Editor Pane */}
            <div className={`flex flex-col h-full ${previewVisible ? 'flex-1' : 'w-full'}`}>
              <Editor
                content={content}
                onChange={handleContentChange}
                zoom={editorZoom}
                theme={theme}
                editorRef={editorRef}
              />
            </div>

            {previewVisible && (
              <>
                {/* Divider */}
                <div className="w-[1px] flex-shrink-0" style={{ backgroundColor: themeColors.border }} />

                {/* Preview Pane */}
                <div className="w-[45%] flex flex-col h-full" style={{ backgroundColor: themeColors.bg }}>
                  {/* Preview Header */}
                  <div
                    className="flex-none h-8 flex items-center justify-between px-3"
                    style={{
                      backgroundColor: themeColors.sidebar,
                      borderBottom: `1px solid ${themeColors.border}`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Eye size={12} style={{ color: themeColors.textDim }} />
                      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: themeColors.textDim }}>
                        Preview
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {hasErrors ? (
                        <span className="flex items-center gap-1 text-red-400">
                          <Circle size={6} fill="currentColor" />
                          Error
                        </span>
                      ) : hasWarnings ? (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Circle size={6} fill="currentColor" />
                          Warning
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-400">
                          <Circle size={6} fill="currentColor" />
                          Ready
                        </span>
                      )}
                    </div>
                  </div>
                  <Preview latexLines={compilationResult.latexLines} theme={theme} />
                </div>
              </>
            )}

            {/* Find/Replace Dialog */}
            <FindReplaceDialog
              isOpen={findDialogMode !== null}
              onClose={() => setFindDialogMode(null)}
              mode={findDialogMode || 'find'}
              content={content}
              onReplaceContent={(newContent) => {
                setContent(newContent);
                setUnsavedChanges(true);
              }}
              theme={theme}
            />
          </div>

          {/* Bottom Panel */}
          {consoleVisible && (
            <div className="flex-none">
              <Console logs={compilationResult.logs} theme={theme} />
            </div>
          )}

          {/* Status Bar */}
          <div
            className="h-7 flex items-center justify-between px-4 text-[11px] select-none"
            style={{
              backgroundColor: themeColors.sidebar,
              borderTop: `1px solid ${themeColors.border}`,
              color: themeColors.textDim
            }}
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                {hasErrors ? (
                  <span className="flex items-center gap-1.5" style={{ color: themeColors.error }}>
                    <Circle size={8} fill="currentColor" />
                    <span>{compilationResult.logs.filter(l => l.type === 'error').length} error(s)</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5" style={{ color: themeColors.success }}>
                    <Circle size={8} fill="currentColor" />
                    <span>Ready</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-5">
              <span>Ln {content.split('\n').length}, Col 1</span>
              <span>{editorZoom}%</span>
              <span>UTF-8</span>
              <span style={{ color: themeColors.accent, fontWeight: 500 }}>MathScript</span>
            </div>
          </div>
        </div>
      </div>

      {/* File Dialog */}
      <FileDialog
        type={dialogType || 'new'}
        isOpen={dialogType !== null}
        onClose={() => setDialogType(null)}
        onSubmit={handleDialogSubmit}
        defaultValue={dialogType === 'saveAs' ? activeFileName : 'untitled.math'}
        fileName={activeFileName}
        theme={theme}
      />
    </div>
  );
}
