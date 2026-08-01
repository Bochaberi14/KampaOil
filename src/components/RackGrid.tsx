import type { Rack } from '../types/domain';

export function RackGrid({
  rack,
  highlightPalletId,
  heldPalletIds,
}: {
  rack: Rack;
  highlightPalletId?: string;
  heldPalletIds?: string[];
}) {
  const free = rack.slots.filter((s) => !s.palletId).length;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-200">{rack.name}</span>
        <span className="text-xs text-slate-500">
          {free} free / {rack.slots.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rack.slots.map((slot) => {
          const held = !!slot.palletId && heldPalletIds?.includes(slot.palletId);
          return (
            <div
              key={slot.index}
              className={`flex h-14 items-center justify-center rounded-md border text-[11px] font-mono ${
                slot.palletId
                  ? held
                    ? 'border-rose-600 bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/40'
                    : slot.palletId === highlightPalletId
                      ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300 ring-2 ring-indigo-500/40'
                      : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                  : 'border-dashed border-slate-700 text-slate-600'
              }`}
              title={held ? 'On hold' : undefined}
            >
              {slot.palletId ?? '—'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
