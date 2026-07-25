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
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const dropdownMenu = isOpen && mounted && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: `${coords.width}px`,
          zIndex: 99999,
        }}
        className="bg-[#0B0F17] border border-white/20 rounded-xl shadow-2xl py-1.5 backdrop-blur-2xl max-h-60 overflow-y-auto font-sans animate-in fade-in zoom-in-95 duration-100"
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
                    ? 'bg-blue-600/25 text-blue-400 font-semibold'
                    : 'text-slate-200 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {option.subLabel && <span className="text-xs text-slate-400 ml-1">({option.subLabel})</span>}
                </span>
                {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0 ml-2" />}
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
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 bg-[#0B0F17] hover:bg-[#121824] border border-white/15 rounded-xl text-sm font-medium text-slate-100 transition-all outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {icon || selectedOption?.icon}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
      </button>

      {dropdownMenu}
    </div>
  );
}
