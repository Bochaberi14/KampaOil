import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { StatusPill } from './StatusPill';

// Lets a presenter demo "if SAP is down, transactions queue and retry every 5
// seconds" live: flip the outage toggle, perform any scan, watch it sit at
// Failed, flip the toggle back off, and watch the next 5s tick clear it.
export function SapSyncPanel() {
  const simulateSapOutage = useWarehouseStore((s) => s.simulateSapOutage);
  const setSimulateSapOutage = useWarehouseStore((s) => s.setSimulateSapOutage);
  const syncQueue = useWarehouseStore((s) => s.syncQueue);
  const [open, setOpen] = useState(false);

  const pending = syncQueue.filter((t) => t.status === 'Pending' || t.status === 'Syncing').length;
  const failed = syncQueue.filter((t) => t.status === 'Failed').length;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
        >
          SAP sync
          {failed > 0 && <StatusPill status="Failed" />}
          {failed === 0 && pending > 0 && <StatusPill status="Syncing" />}
          {failed === 0 && pending === 0 && <StatusPill status="Synced" />}
        </button>
        <button
          onClick={() => setSimulateSapOutage(!simulateSapOutage)}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            simulateSapOutage
              ? 'border-rose-700 bg-rose-950/40 text-rose-300'
              : 'border-slate-700 text-slate-400 hover:bg-slate-800'
          }`}
        >
          {simulateSapOutage ? 'SAP outage: ON' : 'Simulate SAP outage'}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-lg shadow-black/40">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent SAP transactions
          </div>
          {syncQueue.length === 0 && <p className="text-xs text-slate-500">No transactions yet.</p>}
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {syncQueue
              .slice()
              .reverse()
              .slice(0, 15)
              .map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-300" title={t.description}>
                    {t.description}
                  </span>
                  <StatusPill status={t.status} />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
