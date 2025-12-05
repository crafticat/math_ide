
import React from 'react';
import { LogEntry } from '../types';
import { DARK_THEME, LIGHT_THEME } from '../constants';
import { X, ChevronUp, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface ConsoleProps {
  logs: LogEntry[];
  theme?: 'dark' | 'light';
}

const LogIcon: React.FC<{ type: string }> = ({ type }) => {
    switch (type) {
        case 'error':
            return <AlertCircle size={12} className="text-red-400 flex-shrink-0" />;
        case 'warning':
            return <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0" />;
        case 'success':
            return <CheckCircle size={12} className="text-green-400 flex-shrink-0" />;
        default:
            return <Info size={12} className="text-blue-400 flex-shrink-0" />;
    }
};

export const Console: React.FC<ConsoleProps> = ({ logs, theme = 'dark' }) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <div
      className="h-32 flex flex-col"
      style={{
        backgroundColor: colors.bg,
        borderTop: `1px solid ${colors.border}`
      }}
    >
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{
          backgroundColor: colors.sidebar,
          borderBottom: `1px solid ${colors.border}`
        }}
      >
        <div className="flex items-center gap-4 px-2">
            <span className="text-[11px] font-medium cursor-pointer relative py-1" style={{ color: colors.text }}>
                Output
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0e639c]" />
            </span>
            <span
              className="text-[11px] cursor-pointer py-1 transition-colors"
              style={{ color: colors.textDim }}
            >
              Problems
            </span>
            <span
              className="text-[11px] cursor-pointer py-1 transition-colors"
              style={{ color: colors.textDim }}
            >
              Terminal
            </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
            <button
              className="p-1 rounded transition-colors"
              style={{ color: colors.textDim }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <ChevronUp size={14} />
            </button>
            <button
              className="p-1 rounded transition-colors"
              style={{ color: colors.textDim }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <X size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
        {logs.length === 0 ? (
            <div className="text-center py-4" style={{ color: colors.textDim }}>No output</div>
        ) : (
            <div className="space-y-1">
                {logs.map((log, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 py-0.5 px-1 rounded transition-colors"
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.activeItem}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <LogIcon type={log.type} />
                        <span className="select-none text-[10px] pt-px" style={{ color: colors.textDim }}>{log.timestamp}</span>
                        <span className={`
                             ${log.type === 'error' ? 'text-red-400' : ''}
                             ${log.type === 'success' ? 'text-[#89d185]' : ''}
                             ${log.type === 'warning' ? 'text-yellow-400' : ''}
                             ${log.type === 'info' ? '' : ''}
                        `} style={{ color: log.type === 'info' ? colors.text : undefined }}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
