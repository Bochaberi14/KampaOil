import type { ReactNode } from 'react';

interface PrintSheetProps {
  title: string;
  triggerLabel?: string;
  children: ReactNode;
}

// Renders a "Print" button plus a hidden sheet of content that only becomes
// visible — full-page, light-on-white — when the browser print dialog is
// triggered (see the @media print rules in index.css). The rest of the app's
// dark chrome is hidden for that print pass.
export function PrintSheet({ title, triggerLabel = 'Print', children }: PrintSheetProps) {
  return (
    <div className="inline-block">
      <button
        onClick={() => window.print()}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
      >
        {triggerLabel}
      </button>
      <div className="print-sheet-content p-8 text-sm">
        <h1 className="mb-4 text-lg font-bold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
