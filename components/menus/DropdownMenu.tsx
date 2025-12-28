import React, { useEffect, useRef } from 'react';
import { MenuItem } from './MenuItem';
import { MenuItemDef } from '../../types';
import { DARK_THEME, LIGHT_THEME } from '../../constants';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

interface DropdownMenuProps {
  items: MenuItemDef[];
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  items,
  isOpen,
  onClose,
  theme,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';
  const colors = isDark ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay adding listeners to avoid immediate close
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const { shouldRender, isAnimatingOut } = useDelayedUnmount(isOpen, 120);

  if (!shouldRender) return null;

  const dropdownAnimation = isAnimatingOut
    ? 'dropdownOut 120ms cubic-bezier(0.4, 0, 0.2, 1) forwards'
    : 'dropdownIn 120ms cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <div
      ref={menuRef}
      className="absolute top-full left-0 mt-1 min-w-[220px] py-1.5 rounded-md shadow-lg z-50"
      style={{
        backgroundColor: colors.popup,
        border: `1px solid ${colors.popupBorder}`,
        animation: dropdownAnimation,
      }}
    >
      {items.map((item, index) => (
        <MenuItem
          key={index}
          label={item.label}
          shortcut={item.shortcut}
          onClick={() => {
            item.action();
            onClose();
          }}
          disabled={item.disabled}
          dividerAfter={item.dividerAfter}
          theme={theme}
        />
      ))}
    </div>
  );
};
