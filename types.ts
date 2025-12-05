
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
