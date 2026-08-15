'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  icon,
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 200),
      });
    }
  };

  const handleToggle = () => {
    if (!disabled) {
      if (!isOpen) {
        updatePosition();
      }
      setIsOpen(!isOpen);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const dropdownMenu = isOpen && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: `${coords.width}px`,
          zIndex: 'var(--z-dropdown)',
        }}
        className="ops-popover surface-elevated max-h-60 overflow-y-auto py-1.5 font-sans"
      >
        {options.length === 0 ? (
          <div className="px-3.5 py-2 text-xs text-slate-400 italic">No options available</div>
        ) : (
          options.map(option => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-sm text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'is-selected text-[var(--violet)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {option.subLabel && <span className="ml-1 text-xs text-[var(--color-muted)]">({option.subLabel})</span>}
                </span>
                {isSelected && <Check className="ml-2 h-4 w-4 shrink-0 text-[var(--violet)]" />}
              </button>
            );
          })
        )}
      </div>,
      document.body
    )
  ) : null;

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className="ops-control flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--violet)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {icon || selectedOption?.icon}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform duration-300 ${isOpen ? 'rotate-180 text-[var(--violet)]' : ''}`} />
      </button>

      {dropdownMenu}
    </div>
  );
}
