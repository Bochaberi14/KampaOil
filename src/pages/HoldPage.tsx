import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { RackGrid } from '../components/RackGrid';
import { stageLabel } from '../engine/rules';
import { can } from '../rbac';

const HOLD_REASONS = [
  'Quality defects',
  'Non-conformance',
  'Wrong storage location',
  'Packaging damage',
  'Inventory discrepancy',
  'Customer complaint',
  'SAP mismatch',
];

// Mirrors the store's HOLDABLE_PALLET_STATUSES — a pallet can be held at any
// live stage (production/line, in transit, storage, bay, dispatch), just not
// while Empty or already in Recall/Scrapped.
const HOLDABLE_STATUSES = [
  'Loaded',
  'InTransitToStorage',
  'Racked',
  'InTransitToBay',
  'OnBay',
  'InTransitToTruck',
];

export function HoldPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const loads = useWarehouseStore((s) => s.loads);
  const holds = useWarehouseStore((s) => s.holds);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const placeHold = useWarehouseStore((s) => s.placeHold);
  const releaseHold = useWarehouseStore((s) => s.releaseHold);
  const flagHoldRequest = useWarehouseStore((s) => s.flagHoldRequest);
  const approveHoldRequest = useWarehouseStore((s) => s.approveHoldRequest);
  const rejectHoldRequest = useWarehouseStore((s) => s.rejectHoldRequest);
  const sendToRecall = useWarehouseStore((s) => s.sendToRecall);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [palletId, setPalletId] = useState<string | null>(null);
  const [reason, setReason] = useState(HOLD_REASONS[0]);
  const [note, setNote] = useState('');

  const isApprover = can(currentUser?.role, 'approve:hold');
  const canFlag = can(currentUser?.role, 'flag:hold');

  function handleScanPallet(id: string) {
    const pallet = pallets.find((p) => p.id === id);
    if (!pallet) {
      pushToast(`Pallet ${id} not found`, 'error');
      return;
    }
    if (pallet.holdId) {
      pushToast(`Pallet ${id} already has an active hold`, 'error');
      return;
    }
    if (!HOLDABLE_STATUSES.includes(pallet.status)) {
      pushToast(`Pallet ${id} cannot be held (status: ${pallet.status})`, 'error');
      return;
    }
    setPalletId(id);
  }

  function handlePlaceHold() {
    if (!palletId || !currentUser) return;
    if (!note.trim()) {
      pushToast('Describe why this is being held before placing the hold', 'error');
      return;
    }
    const result = placeHold({
      targetType: 'Pallet',
      targetId: palletId,
      reason,
      note: note.trim(),
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setPalletId(null);
    setNote('');
  }

  function handleFlag() {
    if (!palletId || !currentUser) return;
    if (!note.trim()) {
      pushToast('Describe the issue before flagging — the approver needs to know why', 'error');
      return;
    }
    const result = flagHoldRequest({
      palletId,
      reason,
      note: note.trim(),
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`${palletId} locked and flagged for review — awaiting Manager/HOD/Director approval`, 'success');
    setPalletId(null);
    setNote('');
  }

  function handleRelease(holdId: string) {
    if (!currentUser) return;
    const result = releaseHold(holdId, currentUser.id);
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleApprove(holdId: string) {
    if (!currentUser) return;
    const result = approveHoldRequest(holdId, currentUser.id);
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleReject(holdId: string) {
    if (!currentUser) return;
    const result = rejectHoldRequest({ holdId, note: null, operatorId: currentUser.id });
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleSendToRecall(holdId: string) {
    if (!currentUser) return;
    const result = sendToRecall(holdId, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`${result.data.recallCase.id} created — continue on the Recall page`, 'success');
  }

  const heldPalletIds = pallets.filter((p) => p.holdId).map((p) => p.id);
  const pendingHolds = holds.filter((h) => h.status === 'PendingApproval');
  const activeHolds = holds.filter((h) => h.status === 'Active');
  const otherHolds = holds.filter((h) => h.status !== 'Active' && h.status !== 'PendingApproval');
  const selectedPallet = palletId ? pallets.find((p) => p.id === palletId) : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 5 · Hold & Investigation</h1>
        <p className="text-sm text-slate-400">
          A held pallet cannot be picked, sold, or dispatched, and is removed from FIFO allocation — at
          any stage: production/line, in transit, storage, loading bay, or dispatch. Manager, HOD, or
          Director can place a hold directly, or approve/reject a hold a Clerk has flagged.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">{isApprover ? 'Place a hold' : 'Flag a product'}</h2>
          {canFlag && !isApprover && (
            <p className="text-xs text-slate-500">
              Flagging locks the pallet immediately, but a Manager, HOD, or Director still has to approve
              it before it counts as a real hold (or reject it to release the pallet).
            </p>
          )}
          <ScanInput
            label="Scan pallet barcode"
            placeholder="e.g. PLT-003"
            onScan={handleScanPallet}
            suggestions={pallets
              .filter((p) => HOLDABLE_STATUSES.includes(p.status) && !p.holdId)
              .map((p) => p.id)}
          />
          {palletId && selectedPallet && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
              <div className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{palletId}</span> selected —
                currently at <span className="text-slate-100">{stageLabel(selectedPallet)}</span>
              </div>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {HOLD_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {(isApprover || canFlag) && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-400">
                    {isApprover ? 'Describe why this is being held' : 'Describe the issue'}{' '}
                    <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Visible dent on outer carton, product exposed on the left side"
                    rows={3}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
              {isApprover ? (
                <button
                  onClick={handlePlaceHold}
                  disabled={!note.trim()}
                  className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Place hold
                </button>
              ) : canFlag ? (
                <button
                  onClick={handleFlag}
                  disabled={!note.trim()}
                  className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Flag for approval
                </button>
              ) : (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {currentUser?.role ?? 'This role'} cannot place or flag a hold.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Pending approval</h2>
          {pendingHolds.length === 0 && <p className="text-sm text-slate-500">Nothing flagged right now.</p>}
          {pendingHolds.map((h) => {
            const heldPallet = pallets.find((p) => p.id === h.targetId);
            return (
              <div key={h.id} className="space-y-2 rounded-lg border border-amber-800 bg-amber-950/10 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-200">{h.targetId}</span>
                  <StatusPill status={h.status} />
                </div>
                <div className="text-xs text-slate-500">
                  {heldPallet ? `Currently at ${stageLabel(heldPallet)} · ` : ''}
                  {h.reason} — flagged by {h.placedByRole} · {new Date(h.placedAt).toLocaleString()}
                </div>
                {isApprover ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(h.id)}
                      className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(h.id)}
                      className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-300">Awaiting Manager, HOD, or Director review.</p>
                )}
              </div>
            );
          })}

          <h2 className="pt-2 font-semibold text-slate-200">Active holds</h2>
          {activeHolds.length === 0 && <p className="text-sm text-slate-500">No active holds.</p>}
          {activeHolds.map((h) => {
            const heldPallet = pallets.find((p) => p.id === h.targetId);
            return (
              <div key={h.id} className="space-y-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-200">{h.targetId}</span>
                  <StatusPill status={h.status} />
                </div>
                <div className="text-xs text-slate-500">
                  {heldPallet ? `Currently at ${stageLabel(heldPallet)} · ` : ''}
                  {h.reason} — placed by {h.placedByRole} · {new Date(h.placedAt).toLocaleString()}
                </div>
                {isApprover && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRelease(h.id)}
                      className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Release hold
                    </button>
                    <button
                      onClick={() => handleSendToRecall(h.id)}
                      className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500"
                    >
                      Send to Recall (Line 50)
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {otherHolds.length > 0 && (
            <>
              <h2 className="pt-2 font-semibold text-slate-200">History</h2>
              {otherHolds.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-xs">
                  <span className="font-mono text-slate-400">{h.targetId}</span>
                  <span className="text-slate-500">{h.reason}</span>
                  <StatusPill status={h.status} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {(() => {
        const heldElsewhere = pallets.filter((p) => p.holdId && p.status !== 'Racked' && p.status !== 'OnBay');
        return heldElsewhere.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Held pallets outside storage and the loading bay
            </h2>
            <div className="space-y-2">
              {heldElsewhere.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-rose-800 bg-rose-950/20 px-3 py-2 text-sm">
                  <span className="font-mono text-rose-200">{p.id}</span>
                  <span className="text-xs text-rose-300">{stageLabel(p)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Storage racks — held pallets ringed red
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((rack) => (
            <RackGrid key={rack.id} rack={rack} heldPalletIds={heldPalletIds} loads={loads} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay racks — held pallets ringed red
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bayRacks.map((rack) => (
            <RackGrid key={rack.id} rack={rack} heldPalletIds={heldPalletIds} loads={loads} />
          ))}
        </div>
      </div>
    </div>
  );
}
