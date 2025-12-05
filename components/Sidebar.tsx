
import React from 'react';
import { FileNode } from '../types';
import { Files, Search, GitGraph, Box, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react';
import { THEME } from '../constants';

interface SidebarProps {
  files: FileNode[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ files, activeFileId, onFileSelect }) => {
  return (
    <div className={`w-12 flex flex-col items-center py-2 ${THEME.border} border-r bg-[#333333]`}>
        {/* Activity Bar Icons */}
        <div className="flex flex-col gap-6">
            <Files size={24} className="text-white opacity-100 cursor-pointer border-l-2 border-white pl-2 -ml-2.5" />
            <Search size={24} className="text-gray-400 hover:text-white cursor-pointer opacity-70" />
            <GitGraph size={24} className="text-gray-400 hover:text-white cursor-pointer opacity-70" />
            <Box size={24} className="text-gray-400 hover:text-white cursor-pointer opacity-70" />
        </div>
        <div className="mt-auto flex flex-col gap-6 mb-2">
             <MoreHorizontal size={24} className="text-gray-400 hover:text-white cursor-pointer opacity-70" />
        </div>
    </div>
  );
};

// We'll create a secondary sidebar for the actual file tree to act like the VS Code explorer
export const Explorer: React.FC<SidebarProps> = ({ files, activeFileId, onFileSelect }) => {
    return (
        <div className={`w-60 flex flex-col ${THEME.sidebar} h-full select-none border-r ${THEME.border}`}>
            <div className="p-3 text-[11px] font-bold text-gray-400 uppercase tracking-wide flex justify-between">
                <span>Explorer</span>
                <MoreHorizontal size={14} />
            </div>

            <div className="mt-1">
                 {/* Project Folder Header */}
                 <div className="flex items-center gap-1 px-1 py-1 text-xs font-bold text-gray-300 cursor-pointer hover:bg-[#37373d]">
                    <ChevronDown size={14} />
                    <span>MATH-PROJECT</span>
                 </div>

                 {/* Files */}
                 <div className="flex flex-col">
                    {files[0].children?.map(child => (
                        <div 
                            key={child.id}
                            onClick={() => onFileSelect(child.id)}
                            className={`
                                flex items-center gap-2 px-6 py-1 cursor-pointer
                                ${child.id === activeFileId ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:bg-[#2a2d2e]'}
                            `}
                        >
                            <span className="text-blue-400 font-bold text-[10px]">{'{ }'}</span>
                            <span className="text-[13px]">{child.name}</span>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
    );
};
