import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { RackGrid } from '../components/RackGrid';
import { can } from '../rbac';

const HOLD_REASONS = [
  'Quality defects',
  'Wrong storage location',
  'Packaging damage',
  'Inventory discrepancy',
  'Customer complaint',
  'SAP mismatch',
];

export function HoldPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const holds = useWarehouseStore((s) => s.holds);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const placeHold = useWarehouseStore((s) => s.placeHold);
  const releaseHold = useWarehouseStore((s) => s.releaseHold);
  const sendToRecall = useWarehouseStore((s) => s.sendToRecall);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [palletId, setPalletId] = useState<string | null>(null);
  const [reason, setReason] = useState(HOLD_REASONS[0]);

  const isApprover = can(currentUser?.role, 'approve:hold');

  function handleScanPallet(id: string) {
    const pallet = pallets.find((p) => p.id === id);
    if (!pallet) {
      pushToast(`Pallet ${id} not found`, 'error');
      return;
    }
    setPalletId(id);
  }

  function handlePlaceHold() {
    if (!palletId || !currentUser) return;
    const result = placeHold({ targetType: 'Pallet', targetId: palletId, reason, operatorId: currentUser.id });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setPalletId(null);
  }

  function handleRelease(holdId: string) {
    if (!currentUser) return;
    const result = releaseHold(holdId, currentUser.id);
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
  const activeHolds = holds.filter((h) => h.status === 'Active');
  const otherHolds = holds.filter((h) => h.status !== 'Active');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 5 · Hold & Investigation</h1>
        <p className="text-sm text-slate-400">
          A held pallet cannot be picked, sold, or dispatched, and is removed from FIFO allocation.
          Placing or releasing a hold requires Manager, HOD, or Director.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Place a hold</h2>
          <ScanInput
            label="Scan pallet barcode"
            placeholder="e.g. PLT-003"
            onScan={handleScanPallet}
            suggestions={pallets.filter((p) => p.status === 'Racked' && !p.holdId).map((p) => p.id)}
          />
          {palletId && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
              <div className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{palletId}</span> selected
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
              {isApprover ? (
                <button
                  onClick={handlePlaceHold}
                  className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
                >
                  Place hold
                </button>
              ) : (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {currentUser?.role ?? 'This role'} cannot place a hold — log in as Manager, HOD, or
                  Director to continue.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Active holds</h2>
          {activeHolds.length === 0 && <p className="text-sm text-slate-500">No active holds.</p>}
          {activeHolds.map((h) => (
            <div key={h.id} className="space-y-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-slate-200">{h.targetId}</span>
                <StatusPill status={h.status} />
              </div>
              <div className="text-xs text-slate-500">
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
          ))}

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

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Storage racks — held pallets ringed red
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((rack) => (
            <RackGrid key={rack.id} rack={rack} heldPalletIds={heldPalletIds} />
          ))}
        </div>
      </div>
    </div>
  );
}
