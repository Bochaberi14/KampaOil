import { useRef, useState } from 'react';

interface ScanInputProps {
  label: string;
  placeholder?: string;
  onScan: (value: string) => void;
  suggestions?: string[];
  disabled?: boolean;
}

// Simulates a handheld barcode scanner: type/paste a code and press Enter
// (or tap a suggestion chip) — same as a real scanner firing a keyboard event.
export function ScanInput({ label, placeholder, onScan, suggestions, disabled }: ScanInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || disabled) return;
    onScan(trimmed);
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          disabled={disabled}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? 'Scan or type barcode…'}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-900 disabled:text-slate-600"
        />
        <button
          type="submit"
          disabled={disabled}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Scan
        </button>
      </form>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => submit(s)}
              className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-400 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
