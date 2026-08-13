import { useState, type ReactNode } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { ageInHours, buildPalletJourney, getRackedLoads, groupLoadsBy } from '../engine/audit';
import { USERS } from '../data/seed';
import { can } from '../rbac';

export function AuditPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const batches = useWarehouseStore((s) => s.batches);
  const holds = useWarehouseStore((s) => s.holds);
  const recallCases = useWarehouseStore((s) => s.recallCases);
  const manifests = useWarehouseStore((s) => s.manifests);
  const movements = useWarehouseStore((s) => s.movements);
  const syncQueue = useWarehouseStore((s) => s.syncQueue);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const reportDiscrepancy = useWarehouseStore((s) => s.reportDiscrepancy);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [journeyPalletId, setJourneyPalletId] = useState<string | null>(null);
  const journey = journeyPalletId
    ? buildPalletJourney(journeyPalletId, { pallets, loads, batches, holds, recallCases, manifests, movements })
    : null;

  function operatorName(userId: string) {
    return USERS.find((u) => u.id === userId)?.name ?? userId;
  }

  const [verifyPalletId, setVerifyPalletId] = useState<string | null>(null);
  const [verifyStep, setVerifyStep] = useState<'pallet' | 'rack'>('pallet');

  const isClerk = can(currentUser?.role, 'report:discrepancy');
  const verifyPallet = verifyPalletId ? (pallets.find((p) => p.id === verifyPalletId) ?? null) : null;
  const expectedRackId =
    verifyPallet && verifyPallet.location.type === 'Rack' ? verifyPallet.location.rackId : null;
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

  function handleVerifyScanPallet(id: string) {
    const pallet = pallets.find((p) => p.id === id);
    if (!pallet || pallet.status !== 'Racked') {
      pushToast(`${id} is not currently racked`, 'error');
      return;
    }
    setVerifyPalletId(id);
    setVerifyStep('rack');
  }

  function handleVerifyScanRack(foundRackId: string) {
    if (!verifyPalletId || !currentUser || !expectedRackId) return;
    if (foundRackId === expectedRackId) {
      pushToast(`${verifyPalletId} verified at ${expectedRackId} — matches system record`, 'success');
      setVerifyPalletId(null);
      setVerifyStep('pallet');
      return;
    }
    const result = reportDiscrepancy({
      palletId: verifyPalletId,
      note: `Expected at ${expectedRackId}, found at ${foundRackId} during physical count`,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(
      `${verifyPalletId} mismatch — expected ${expectedRackId}, found ${foundRackId}. Pallet locked under investigation.`,
      'error',
    );
    setVerifyPalletId(null);
    setVerifyStep('pallet');
  }

  function cancelVerify() {
    setVerifyPalletId(null);
    setVerifyStep('pallet');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 7 · Inventory Audits</h1>
        <p className="text-sm text-slate-400">
          Live reports computed from current warehouse state. Flagging a discrepancy immediately
          locks the pallet under investigation (Clerk only).
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
              <StatusPill status={rc.status === 'InProgress' ? rc.currentStage : rc.status} />
            </div>
          ))}
          {recallCases.length === 0 && <Empty />}
        </Report>

        <Report title="SAP reconciliation">
          <ReportRow label="Synced" value={String(syncCounts.Synced)} />
          <ReportRow label="Pending / syncing" value={String(syncCounts.Pending)} />
          <ReportRow label="Failed / retrying" value={String(syncCounts.Failed)} />
        </Report>

        <Report title="Pallet journey — full traceability">
          <ScanInput
            label="Scan any pallet ID"
            placeholder="e.g. PLT-001"
            onScan={(id) => {
              const found = pallets.find((p) => p.id === id);
              if (!found) {
                pushToast(`Pallet ${id} not found`, 'error');
                return;
              }
              setJourneyPalletId(id);
            }}
            suggestions={pallets.slice(0, 8).map((p) => p.id)}
          />
          {journey && (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-800/60 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Current status</span>
                  <StatusPill status={journey.pallet.status} />
                </div>
                {journey.load && (
                  <ReportRow label="Product" value={`${journey.load.productName} (${journey.load.sku})`} />
                )}
                {journey.batch && <ReportRow label="Batch" value={journey.batch.id} />}
                {journey.holds.length > 0 && (
                  <ReportRow
                    label="Hold history"
                    value={journey.holds.map((h) => `${h.reason} — ${h.status}`).join('; ')}
                  />
                )}
                {journey.recallCase && (
                  <ReportRow
                    label="Recall"
                    value={`${journey.recallCase.id} — ${
                      journey.recallCase.status === 'Completed'
                        ? journey.recallCase.destinationDecision?.type === 'Storage'
                          ? `Returned to storage — ${journey.recallCase.destinationDecision.targetRackId}`
                          : journey.recallCase.destinationDecision?.type === 'ReworkLine'
                            ? `Reworked on ${journey.recallCase.destinationDecision.targetLineId}`
                            : 'Scrapped'
                        : journey.recallCase.status === 'InProgress'
                          ? journey.recallCase.currentStage
                          : journey.recallCase.status
                    }`}
                  />
                )}
                {journey.manifest && (
                  <ReportRow
                    label="Dispatch"
                    value={`${journey.manifest.id} — ${journey.manifest.customer}, truck ${journey.manifest.truckId} (${journey.manifest.sapStatus})`}
                  />
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Movement timeline
                </p>
                {journey.steps.length === 0 && (
                  <p className="text-xs text-slate-500">No movements recorded yet.</p>
                )}
                <ol className="space-y-1">
                  {journey.steps.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {s.from} → {s.to}
                      </span>
                      <span className="text-slate-500">
                        {new Date(s.timestamp).toLocaleString()} · {operatorName(s.operatorId)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </Report>

        <Report title="Inventory verification">
          <p className="text-xs text-slate-500">
            Physically walk the warehouse: scan the pallet you found, then scan the rack it was
            actually sitting in. A mismatch immediately raises a discrepancy and locks the pallet.
          </p>
          {!isClerk && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {currentUser?.role ?? 'This role'} cannot perform inventory verification — log in as
              Clerk to continue.
            </p>
          )}
          {isClerk && verifyStep === 'pallet' && (
            <ScanInput
              label="Scan the pallet you found"
              placeholder="e.g. PLT-003"
              onScan={handleVerifyScanPallet}
              suggestions={pallets.filter((p) => p.status === 'Racked' && !p.holdId).map((p) => p.id)}
            />
          )}
          {isClerk && verifyStep === 'rack' && verifyPalletId && (
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3 text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{verifyPalletId}</span>{' '}
                — system expects it at{' '}
                <span className="font-mono font-semibold text-slate-100">{expectedRackId}</span>. Now
                scan the rack you actually found it in.
              </div>
              <ScanInput
                label="Scan the rack it was actually found in"
                placeholder="e.g. R-A"
                onScan={handleVerifyScanRack}
                suggestions={racks.map((r) => r.id)}
              />
              <button onClick={cancelVerify} className="text-xs text-slate-500 hover:text-slate-300">
                Cancel / start over
              </button>
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
