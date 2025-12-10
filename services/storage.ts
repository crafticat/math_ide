import { FileNode, AppSettings } from '../types';
import { INITIAL_CONTENT } from '../constants';

const STORAGE_KEYS = {
  FILES: 'mathbrain-files',
  RECENT: 'mathbrain-recent',
  SETTINGS: 'mathbrain-settings',
};

const DEFAULT_FILES: FileNode[] = [
  {
    id: 'root',
    name: 'project',
    type: 'folder',
    children: [
      { id: 'file-1', name: 'main.math', type: 'file', content: INITIAL_CONTENT },
    ]
  }
];

const DEFAULT_SETTINGS: AppSettings = {
  sidebarVisible: true,
  consoleVisible: true,
  previewVisible: true,
  editorZoom: 100,
  theme: 'dark',
  autosaveEnabled: true,
  autosaveInterval: 5000, // 5 seconds
};

export function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function loadFiles(): FileNode[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FILES);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load files from localStorage:', e);
  }
  return DEFAULT_FILES;
}

export function saveFiles(files: FileNode[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
  } catch (e) {
    console.error('Failed to save files to localStorage:', e);
  }
}

export function loadRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECENT);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load recent files:', e);
  }
  return [];
}

export function saveRecentFiles(ids: string[]): void {
  try {
    // Keep only the 10 most recent
    const recent = ids.slice(0, 10);
    localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recent));
  } catch (e) {
    console.error('Failed to save recent files:', e);
  }
}

export function addToRecentFiles(fileId: string, currentRecent: string[]): string[] {
  // Remove if already exists, then add to front
  const filtered = currentRecent.filter(id => id !== fileId);
  return [fileId, ...filtered].slice(0, 10);
}

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Helper to find a file by ID in the file tree
export function findFileById(files: FileNode[], id: string): FileNode | null {
  for (const node of files) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Helper to update a file's content in the tree
export function updateFileContent(files: FileNode[], id: string, content: string): FileNode[] {
  return files.map(node => {
    if (node.id === id) {
      return { ...node, content };
    }
    if (node.children) {
      return { ...node, children: updateFileContent(node.children, id, content) };
    }
    return node;
  });
}

// Helper to add a new file to the project root
export function addFile(files: FileNode[], newFile: FileNode): FileNode[] {
  return files.map(node => {
    if (node.id === 'root' && node.children) {
      return { ...node, children: [...node.children, newFile] };
    }
    return node;
  });
}

// Helper to remove a file from the tree
export function removeFile(files: FileNode[], id: string): FileNode[] {
  return files.map(node => {
    if (node.children) {
      return { ...node, children: node.children.filter(child => child.id !== id) };
    }
    return node;
  });
}

// Helper to get all files (flattened, excluding folders)
export function getAllFiles(files: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of files) {
    if (node.type === 'file') {
      result.push(node);
    }
    if (node.children) {
      result.push(...getAllFiles(node.children));
    }
  }
  return result;
}

// Helper to check if a filename already exists
export function fileNameExists(files: FileNode[], name: string, excludeId?: string): boolean {
  const allFiles = getAllFiles(files);
  return allFiles.some(f => f.name === name && f.id !== excludeId);
}

// Generate a unique filename
export function generateUniqueFileName(files: FileNode[], baseName: string = 'untitled.math'): string {
  if (!fileNameExists(files, baseName)) {
    return baseName;
  }

  const nameWithoutExt = baseName.replace('.math', '');
  let counter = 2;
  while (fileNameExists(files, `${nameWithoutExt} (${counter}).math`)) {
    counter++;
  }
  return `${nameWithoutExt} (${counter}).math`;
}
