import React from 'react';
import { DARK_THEME, LIGHT_THEME } from '../../constants';

interface MenuItemProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  dividerAfter?: boolean;
  theme: 'dark' | 'light';
}

export const MenuItem: React.FC<MenuItemProps> = ({
  label,
  shortcut,
  onClick,
  disabled = false,
  dividerAfter = false,
  theme,
}) => {
  const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        disabled={disabled}
        className="w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between transition-colors rounded-sm mx-1"
        style={{
          width: 'calc(100% - 8px)',
          color: disabled ? (colors.textMuted || colors.textDim) : colors.text,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = colors.popupActive;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span>{label}</span>
        {shortcut && (
          <span className="ml-6 text-[11px]" style={{ color: colors.textDim }}>
            {shortcut}
          </span>
        )}
      </button>
      {dividerAfter && (
        <div className="my-1.5 mx-2" style={{ borderTop: `1px solid ${colors.border}` }} />
      )}
    </>
  );
};
