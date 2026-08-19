import type { ReactNode } from 'react';
import { useRef, useState } from 'react';

interface PrintSheetProps {
  title: string;
  triggerLabel?: string;
  children: ReactNode;
}

export function PrintSheet({ title, triggerLabel = 'Print', children }: PrintSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = () => {
    if (!contentRef.current) return;

    setIsPrinting(true);
    // Hide all other print sheets
    const allSheets = document.querySelectorAll('.print-sheet-content');
    const origDisplay: Map<Element, string> = new Map();

    allSheets.forEach((sheet) => {
      origDisplay.set(sheet, sheet.getAttribute('style') || '');
      if (sheet !== contentRef.current) {
        (sheet as HTMLElement).style.display = 'none';
      }
    });

    // Print after a brief delay to ensure display changes are applied
    setTimeout(() => {
      window.print();

      // Restore visibility
      allSheets.forEach((sheet) => {
        (sheet as HTMLElement).style.cssText = origDisplay.get(sheet) || '';
      });
      setIsPrinting(false);
    }, 100);
  };

  return (
    <div className="inline-block">
      <button
        onClick={handlePrint}
        disabled={isPrinting}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        {triggerLabel}
      </button>
      <div ref={contentRef} className="print-sheet-content">
        {children}
      </div>
    </div>
  );
}
