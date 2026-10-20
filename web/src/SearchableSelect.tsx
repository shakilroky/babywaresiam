import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDownIcon, CloseIcon, SearchIcon } from './icons';

interface SearchableSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  bilingualMap?: Record<string, string>; // e.g. { Dhaka: 'ঢাকা' }
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'নির্বাচন বা সার্চ করুন...',
  disabled = false,
  required = false,
  bilingualMap = {},
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered options based on query
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter((opt) => {
      const bn = (bilingualMap[opt] || '').toLowerCase();
      const en = opt.toLowerCase();
      return en.includes(q) || bn.includes(q);
    });
  }, [options, query, bilingualMap]);

  const handleSelect = (opt: string) => {
    onChange(opt);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  const displayLabel = value ? (bilingualMap[value] ? `${value} (${bilingualMap[value]})` : value) : '';

  return (
    <div className="bw-searchable-select" ref={containerRef} style={{ position: 'relative', marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
      </label>

      {/* Main Trigger / Search Input */}
      <div
        className={`bw-select-trigger ${isOpen ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen && inputRef.current) {
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: disabled ? '#F1F5F9' : '#FFFFFF',
          border: isOpen ? '2px solid #EC4899' : '1.5px solid #CBD5E1',
          borderRadius: 12,
          padding: '10px 14px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? '0 0 0 3px rgba(236, 72, 153, 0.15)' : 'none',
        }}
      >
        <SearchIcon size={16} color="#94A3B8" />

        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            className="bw-select-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: '#0F172A',
              padding: 0,
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 14,
              color: value ? '#0F172A' : '#94A3B8',
              fontWeight: value ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value ? displayLabel : placeholder}
          </span>
        )}

        {/* Clear Button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
              padding: 0,
            }}
            title="Clear"
          >
            <CloseIcon size={12} color="#64748B" />
          </button>
        )}

        <ChevronDownIcon
          size={16}
          color="#64748B"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

      {/* Dropdown Options List */}
      {isOpen && !disabled && (
        <div
          className="bw-select-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.15)',
            maxHeight: 220,
            overflowY: 'auto',
            zIndex: 9999,
            padding: '6px 0',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>
              কোনো মিল পাওয়া যায়নি "{query}"
            </div>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt === value;
              const bnText = bilingualMap[opt];
              return (
                <div
                  key={opt}
                  className={`bw-select-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                  style={{
                    padding: '9px 16px',
                    fontSize: 13.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? '#FDF2F8' : 'transparent',
                    color: isSelected ? '#BE185D' : '#1E293B',
                    fontWeight: isSelected ? 600 : 400,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <span>
                    {opt} {bnText && <span style={{ color: '#64748B', fontSize: 12 }}>({bnText})</span>}
                  </span>
                  {isSelected && <span style={{ color: '#BE185D', fontSize: 13 }}>✓</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
