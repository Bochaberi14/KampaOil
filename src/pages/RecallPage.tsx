import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { can } from '../rbac';

const STAGE_LABELS: Record<string, string> = {
  Inspection: 'Inspection',
  Repacking: 'Repacking (if required)',
  Relabelling: 'Relabelling (if required)',
  QA: 'Quality Assurance approval',
};

type DestinationChoice = 'Storage' | 'ReworkLine' | 'Scrap';

export function RecallPage() {
  const recallCases = useWarehouseStore((s) => s.recallCases);
  const racks = useWarehouseStore((s) => s.racks);
  const lines = useWarehouseStore((s) => s.lines);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const advanceRecallStage = useWarehouseStore((s) => s.advanceRecallStage);
  const decideRecallDestination = useWarehouseStore((s) => s.decideRecallDestination);
  const executeRecallDestination = useWarehouseStore((s) => s.executeRecallDestination);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [destinationChoice, setDestinationChoice] = useState<Record<string, DestinationChoice>>({});
  const [destinationTarget, setDestinationTarget] = useState<Record<string, string>>({});

  const isApprover = can(currentUser?.role, 'approve:recall');
  const isPicker = can(currentUser?.role, 'execute:scan');

  const inProgress = recallCases.filter((r) => r.status !== 'Completed');
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

  function handleDecide(recallCaseId: string) {
    if (!currentUser) return;
    const choice = destinationChoice[recallCaseId] ?? 'Storage';
    const target = destinationTarget[recallCaseId];

    let decision: Parameters<typeof decideRecallDestination>[0]['decision'];
    if (choice === 'Storage') {
      if (!target) {
        pushToast('Select a rack first', 'error');
        return;
      }
      decision = { type: 'Storage', rackId: target };
    } else if (choice === 'ReworkLine') {
      decision = { type: 'ReworkLine' };
    } else {
      decision = { type: 'Scrap' };
    }

    const result = decideRecallDestination({ recallCaseId, decision, operatorId: currentUser.id });
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleReturnToOriginal(recallCaseId: string, rackId: string) {
    if (!currentUser) return;
    const result = decideRecallDestination({
      recallCaseId,
      decision: { type: 'Storage', rackId },
      operatorId: currentUser.id,
    });
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleExecute(recallCaseId: string, scannedId: string) {
    if (!currentUser) return;
    const result = executeRecallDestination({ recallCaseId, scannedId, operatorId: currentUser.id });
    if (!result.ok) pushToast(result.error, 'error');
  }

  function lineName(lineId: string | null) {
    if (!lineId) return lineId;
    return lines.find((l) => l.id === lineId)?.name ?? lineId;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 6 · Recall Processing (Line 50)</h1>
        <p className="text-sm text-slate-400">
          Held pallets cleared for recovery move through Inspection → Repacking → Relabelling → QA.
          Manager, HOD, or Director then decide the destination — back to its original rack, a different
          rack, the Exception Line for rework, or Scrap — and a Picker scans the pallet there to complete
          the move.
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
                <StatusPill status={r.status === 'InProgress' ? r.currentStage : r.status} />
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
                {r.status === 'InProgress' && (
                  <>
                    <p className="mb-2 text-sm text-slate-300">
                      Current stage: <span className="font-semibold text-slate-100">{STAGE_LABELS[r.currentStage]}</span>
                    </p>
                    {isApprover ? (
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
                      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                        {currentUser?.role ?? 'This role'} cannot advance this stage — requires Manager, HOD, or
                        Director.
                      </p>
                    )}
                  </>
                )}

                {r.status === 'AwaitingDestinationDecision' &&
                  (isApprover ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300">QA passed. Decide where this pallet goes next.</p>
                      {r.originalRackId && (
                        <button
                          onClick={() => handleReturnToOriginal(r.id, r.originalRackId!)}
                          className="w-full rounded-md border border-emerald-700 bg-emerald-950/30 px-3 py-1.5 text-left text-xs font-medium text-emerald-300 hover:bg-emerald-900/40"
                        >
                          ↩ Return to its original position — {racks.find((rk) => rk.id === r.originalRackId)?.name ?? r.originalRackId}
                        </button>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {(['Storage', 'ReworkLine', 'Scrap'] as DestinationChoice[]).map((choice) => (
                          <button
                            key={choice}
                            onClick={() => setDestinationChoice((d) => ({ ...d, [r.id]: choice }))}
                            className={`rounded-md border px-3 py-1.5 font-medium ${
                              (destinationChoice[r.id] ?? 'Storage') === choice
                                ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {choice === 'Storage'
                              ? 'Return to Storage (choose a rack)'
                              : choice === 'ReworkLine'
                                ? 'Rework (Exception Line)'
                                : 'Scrap / Dispose'}
                          </button>
                        ))}
                      </div>
                      {(destinationChoice[r.id] ?? 'Storage') === 'Storage' && (
                        <select
                          value={destinationTarget[r.id] ?? ''}
                          onChange={(e) => setDestinationTarget((t) => ({ ...t, [r.id]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">Select a rack…</option>
                          {racks.map((rk) => (
                            <option key={rk.id} value={rk.id}>
                              {rk.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleDecide(r.id)}
                        className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                      >
                        Confirm destination
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      QA passed — awaiting Manager, HOD, or Director to decide this pallet's destination.
                    </p>
                  ))}

                {r.status === 'AwaitingPickerAction' && r.destinationDecision && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-300">
                      Destination decided:{' '}
                      <span className="font-semibold text-slate-100">
                        {r.destinationDecision.type === 'Storage'
                          ? `Storage — ${r.destinationDecision.targetRackId}`
                          : r.destinationDecision.type === 'ReworkLine'
                            ? `Rework on ${lineName(r.destinationDecision.targetLineId)}`
                            : 'Scrap / Dispose'}
                      </span>{' '}
                      by {r.destinationDecision.decidedByRole}
                    </p>
                    {isPicker ? (
                      <ScanInput
                        label={
                          r.destinationDecision.type === 'Storage'
                            ? 'Scan destination rack to return to storage'
                            : r.destinationDecision.type === 'ReworkLine'
                              ? 'Scan the Exception Line to hand off for rework'
                              : `Scan pallet ${r.palletId} to confirm disposal`
                        }
                        placeholder={
                          r.destinationDecision.type === 'Storage'
                            ? 'e.g. R-B'
                            : r.destinationDecision.type === 'ReworkLine'
                              ? r.destinationDecision.targetLineId ?? ''
                              : r.palletId
                        }
                        onScan={(scannedId) => handleExecute(r.id, scannedId)}
                        suggestions={
                          r.destinationDecision.type === 'Storage'
                            ? [r.destinationDecision.targetRackId ?? '']
                            : r.destinationDecision.type === 'ReworkLine'
                              ? [r.destinationDecision.targetLineId ?? '']
                              : [r.palletId]
                        }
                      />
                    ) : (
                      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                        Awaiting a Picker to scan the pallet to its decided destination.
                      </p>
                    )}
                  </div>
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
                  {r.id} — {r.palletId}{' '}
                  {r.destinationDecision?.type === 'Storage'
                    ? `returned to storage at ${r.destinationDecision.targetRackId}`
                    : r.destinationDecision?.type === 'ReworkLine'
                      ? `sent to ${lineName(r.destinationDecision.targetLineId)} for rework`
                      : 'scrapped'}
                </span>
                <StatusPill status="Completed" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
