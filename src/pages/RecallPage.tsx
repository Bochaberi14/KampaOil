import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';

const STAGE_LABELS: Record<string, string> = {
  Inspection: 'Inspection',
  Repacking: 'Repacking (if required)',
  Relabelling: 'Relabelling (if required)',
  QA: 'Quality Assurance approval',
  ReturnedToStorage: 'Returned to storage',
};

export function RecallPage() {
  const recallCases = useWarehouseStore((s) => s.recallCases);
  const racks = useWarehouseStore((s) => s.racks);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const advanceRecallStage = useWarehouseStore((s) => s.advanceRecallStage);
  const returnRecallPalletToRack = useWarehouseStore((s) => s.returnRecallPalletToRack);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [notes, setNotes] = useState<Record<string, string>>({});

  const inProgress = recallCases.filter((r) => r.status === 'InProgress');
  const completed = recallCases.filter((r) => r.status === 'Completed');

  function handleAdvance(recallCaseId: string) {
    if (!currentUser) return;
    const result = advanceRecallStage({
      recallCaseId,
      notes: notes[recallCaseId]?.trim() || null,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setNotes((n) => ({ ...n, [recallCaseId]: '' }));
  }

  function handleReturnToRack(recallCaseId: string, rackId: string) {
    if (!currentUser) return;
    const result = returnRecallPalletToRack({ recallCaseId, rackId, operatorId: currentUser.id });
    if (!result.ok) pushToast(result.error, 'error');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 6 · Recall Processing (Line 50)</h1>
        <p className="text-sm text-slate-400">
          Held pallets cleared for recovery move through Inspection → Repacking → Relabelling → QA, then
          scan back into storage to rejoin the FIFO queue.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          In progress on Line 50
        </h2>
        {inProgress.length === 0 && (
          <p className="text-sm text-slate-500">
            No pallets currently in recall processing. Send a held pallet to recall from the Hold page.
          </p>
        )}
        <div className="space-y-4">
          {inProgress.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200">{r.id}</span>
                  <span className="ml-2 font-mono text-xs text-slate-500">{r.palletId}</span>
                </div>
                <StatusPill status={r.currentStage} />
              </div>

              {r.history.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {r.history.map((h, i) => (
                    <li key={i}>
                      {STAGE_LABELS[h.stage] ?? h.stage} completed {new Date(h.completedAt).toLocaleString()}
                      {h.notes ? ` — ${h.notes}` : ''}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
                <p className="mb-2 text-sm text-slate-300">
                  Current stage: <span className="font-semibold text-slate-100">{STAGE_LABELS[r.currentStage]}</span>
                </p>

                {r.currentStage !== 'QA' ? (
                  <div className="space-y-2">
                    <input
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Notes (optional)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleAdvance(r.id)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Mark {STAGE_LABELS[r.currentStage]} complete →
                    </button>
                  </div>
                ) : (
                  <ScanInput
                    label="QA approved — scan destination rack to return to storage"
                    placeholder="e.g. R-B"
                    onScan={(rackId) => handleReturnToRack(r.id, rackId)}
                    suggestions={racks.map((rk) => rk.id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {completed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Completed</h2>
          <div className="space-y-2">
            {completed.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300"
              >
                <span>
                  {r.id} — {r.palletId} returned to storage
                </span>
                <StatusPill status="ReturnedToStorage" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
