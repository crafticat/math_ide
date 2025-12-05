
import React from 'react';
import { LogEntry } from '../types';
import { THEME } from '../constants';
import { X } from 'lucide-react';

interface ConsoleProps {
  logs: LogEntry[];
}

export const Console: React.FC<ConsoleProps> = ({ logs }) => {
  return (
    <div className={`h-40 ${THEME.bg} border-t ${THEME.border} flex flex-col font-mono text-sm`}>
      <div className={`flex items-center gap-6 px-4 py-1.5 border-b ${THEME.border} bg-[#1e1e1e]`}>
        <span className="text-white text-xs border-b border-white pb-0.5 cursor-pointer uppercase">Output</span>
        <span className="text-gray-500 text-xs hover:text-gray-300 cursor-pointer uppercase">Problems</span>
        <span className="text-gray-500 text-xs hover:text-gray-300 cursor-pointer uppercase">Terminal</span>
        <div className="flex-1" />
        <X size={14} className="text-gray-400 cursor-pointer hover:text-white" />
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
        {logs.map((log, i) => (
            <div key={i} className="flex gap-2">
                <span className="text-gray-500 select-none">[{log.timestamp}]</span>
                <span className={`
                     ${log.type === 'error' ? 'text-red-400' : ''}
                     ${log.type === 'success' ? 'text-[#89d185]' : 'text-gray-300'}
                     ${log.type === 'warning' ? 'text-yellow-400' : ''}
                `}>
                    {log.type === 'error' ? 'Error: ' : ''}
                    {log.message}
                </span>
            </div>
        ))}
      </div>
    </div>
  );
};
