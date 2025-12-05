
export interface CompilationResult {
  latexLines: { id: string; latex: string; originalLine: number }[];
  logs: LogEntry[];
  macros: Record<string, string>;
}

export interface LogEntry {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: string;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  active?: boolean;
}

export interface AppSettings {
  sidebarVisible: boolean;
  consoleVisible: boolean;
  previewVisible: boolean;
  editorZoom: number;
  theme: 'dark' | 'light';
}

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  dividerAfter?: boolean;
}
