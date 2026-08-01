import { useState, type ReactNode } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { ageInHours, getRackedLoads, groupLoadsBy } from '../engine/audit';

const APPROVER_ROLES = ['Manager', 'HOD', 'Director'];

export function AuditPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const batches = useWarehouseStore((s) => s.batches);
  const holds = useWarehouseStore((s) => s.holds);
  const recallCases = useWarehouseStore((s) => s.recallCases);
  const syncQueue = useWarehouseStore((s) => s.syncQueue);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const placeHold = useWarehouseStore((s) => s.placeHold);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [flagPalletId, setFlagPalletId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const isApprover = currentUser ? APPROVER_ROLES.includes(currentUser.role) : false;
  const rackedLoads = getRackedLoads(loads, pallets);
  const byProduct = groupLoadsBy(rackedLoads, (l) => l.sku, (l) => l.productName);

  const rackedBatchIds = new Set(rackedLoads.map((l) => l.batchId));
  const activeBatches = batches.filter((b) => rackedBatchIds.has(b.id));

  const ageSorted = rackedLoads.slice().sort((a, b) => a.producedAt.localeCompare(b.producedAt));

  const heldPallets = pallets
    .filter((p) => p.holdId)
    .map((p) => ({ pallet: p, hold: holds.find((h) => h.id === p.holdId) }));

  const syncCounts = {
    Pending: syncQueue.filter((t) => t.status === 'Pending' || t.status === 'Syncing').length,
    Failed: syncQueue.filter((t) => t.status === 'Failed').length,
    Synced: syncQueue.filter((t) => t.status === 'Synced').length,
  };

  function handleFlag() {
    if (!flagPalletId || !currentUser) return;
    if (!note.trim()) {
      pushToast('Enter a note describing the discrepancy', 'error');
      return;
    }
    const result = placeHold({
      targetType: 'Pallet',
      targetId: flagPalletId,
      reason: `Inventory discrepancy — ${note.trim()}`,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`${flagPalletId} flagged — hold ${result.data.hold.id} raised`, 'success');
    setFlagPalletId(null);
    setNote('');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 7 · Inventory Audits</h1>
        <p className="text-sm text-slate-400">
          Live reports computed from current warehouse state. Flagging a discrepancy raises a Hold
          directly (requires Manager, HOD, or Director).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Report title="Inventory by product">
          {byProduct.map((r) => (
            <ReportRow key={r.key} label={r.label} value={`${r.totalQty.toLocaleString()} units · ${r.palletCount} pallet(s)`} />
          ))}
          {byProduct.length === 0 && <Empty />}
        </Report>

        <Report title="Inventory by batch">
          {activeBatches.map((b) => (
            <ReportRow key={b.id} label={`${b.id} · ${b.productName}`} value={`${b.totalQty.toLocaleString()} units`} />
          ))}
          {activeBatches.length === 0 && <Empty />}
        </Report>

        <Report title="Inventory by rack">
          {racks.map((r) => {
            const occupied = r.slots.filter((s) => s.palletId).length;
            return (
              <ReportRow key={r.id} label={r.name} value={`${occupied} / ${r.slots.length} slots occupied`} />
            );
          })}
        </Report>

        <Report title="FIFO ageing (oldest first)">
          {ageSorted.map((l) => (
            <ReportRow key={l.id} label={`${l.palletId} · ${l.productName}`} value={`${ageInHours(l.producedAt)}h old`} />
          ))}
          {ageSorted.length === 0 && <Empty />}
        </Report>

        <Report title="Held inventory">
          {heldPallets.map(({ pallet, hold }) => (
            <ReportRow
              key={pallet.id}
              label={pallet.id}
              value={hold ? `${hold.reason} (${hold.placedByRole})` : 'Held'}
            />
          ))}
          {heldPallets.length === 0 && <Empty />}
        </Report>

        <Report title="Recall inventory">
          {recallCases.map((rc) => (
            <div key={rc.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">
                {rc.id} · {rc.palletId}
              </span>
              <StatusPill status={rc.status === 'Completed' ? 'ReturnedToStorage' : rc.currentStage} />
            </div>
          ))}
          {recallCases.length === 0 && <Empty />}
        </Report>

        <Report title="SAP reconciliation">
          <ReportRow label="Synced" value={String(syncCounts.Synced)} />
          <ReportRow label="Pending / syncing" value={String(syncCounts.Pending)} />
          <ReportRow label="Failed / retrying" value={String(syncCounts.Failed)} />
        </Report>

        <Report title="Flag a discrepancy">
          <ScanInput
            label="Scan racked pallet"
            placeholder="e.g. PLT-003"
            onScan={(id) => {
              const pallet = pallets.find((p) => p.id === id);
              if (!pallet || pallet.status !== 'Racked') {
                pushToast(`${id} is not currently racked`, 'error');
                return;
              }
              setFlagPalletId(id);
            }}
            suggestions={pallets.filter((p) => p.status === 'Racked' && !p.holdId).map((p) => p.id)}
          />
          {flagPalletId && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-800/60 p-3">
              <div className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{flagPalletId}</span>
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Found in wrong rack during physical count"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              {isApprover ? (
                <button
                  onClick={handleFlag}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
                >
                  Flag discrepancy → raise hold
                </button>
              ) : (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  {currentUser?.role ?? 'This role'} cannot raise a hold — log in as Manager, HOD, or
                  Director to continue.
                </p>
              )}
            </div>
          )}
        </Report>
      </div>
    </div>
  );
}

function Report({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="font-semibold text-slate-200">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="font-medium text-slate-400">{value}</span>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-500">Nothing to show yet.</p>;
}
