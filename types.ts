
import type { Diagnostic } from './services/engine/types';

export interface CompilationResult {
  latexLines: { id: string; latex: string; originalLine: number }[];
  logs: LogEntry[];
  macros: Record<string, string>;
  /** Engine v2's diagnostics, unmapped. `logs` is the same information in the
   *  Console's shape; this is the source form, kept because the editor gutter
   *  needs the spans. Optional so the legacy compiler, which produces no
   *  diagnostics at all, still satisfies this type. */
  diagnostics?: Diagnostic[];
}

export interface LogEntry {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: string;
  /** 1-based source line this entry points at, when it came from a diagnostic
   *  with a span. */
  line?: number;
  /** The diagnostic's suggested fix, if it carried one. */
  hint?: string;
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
  autosaveEnabled: boolean;
  autosaveInterval: number; // in milliseconds
}

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  dividerAfter?: boolean;
}
