import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { countFreeRackSlots, countRackedPallets, findFreeRackSlot } from '../engine/rules';
import { STORAGE_ZONES } from '../data/seed';

type WizardStep = 'pallet' | 'rack';

export function StoragePage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const scanPalletLeavingLine = useWarehouseStore((s) => s.scanPalletLeavingLine);
  const scanPalletToRack = useWarehouseStore((s) => s.scanPalletToRack);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null }>({
    step: 'pallet',
    palletId: null,
  });




  const loadedPallets = pallets.filter((p) => p.status === 'Loaded').map((p) => p.id);
  const inTransitPallets = pallets.filter((p) => p.status === 'InTransitToStorage').map((p) => p.id);

  function handleScanPallet(palletId: string) {
    if (!currentUser) return;
    const pallet = pallets.find((p) => p.id === palletId);

    // Pallet already departed the line in an earlier session (e.g. the page was
    // left mid-move) — resume at the rack step instead of re-departing it.
    if (pallet?.status === 'InTransitToStorage') {
      setWizard({ step: 'rack', palletId });
      return;
    }

    const result = scanPalletLeavingLine(palletId, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Pallet ${palletId} left the line — now scan its destination rack`, 'success');
    setWizard({ step: 'rack', palletId });
  }

  function handleScanRack(rackId: string) {
    if (!wizard.palletId || !currentUser) return;
    const result = scanPalletToRack({ palletId: wizard.palletId, rackId, operatorId: currentUser.id });
    if (!result.ok) {
      const nextFree = findFreeRackSlot(racks);
      pushToast(
        nextFree ? `${result.error} — try ${nextFree.rackId} instead` : result.error,
        'error',
      );
      return;
    }
    setWizard({ step: 'pallet', palletId: null });
  }

  function cancel() {
    setWizard({ step: 'pallet', palletId: null });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 2 · Storage</h1>
        <p className="text-sm text-slate-400">
          Receive pallets from production — scan the pallet leaving the line, then scan the rack it lands on.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <StepDot active={wizard.step === 'pallet'} label="1. Scan pallet leaving line" />
          <StepDot active={wizard.step === 'rack'} label="2. Scan destination rack" />
        </div>

        {wizard.step === 'pallet' && (
          <>
            <ScanInput
              label="Scan pallet leaving production"
              placeholder="e.g. PLT-002"
              onScan={handleScanPallet}
              suggestions={loadedPallets}
            />
            {inTransitPallets.length > 0 && (
              <p className="text-xs text-amber-300">
                Already in transit, awaiting a rack scan: {inTransitPallets.join(', ')} — scan one of
                these to resume.
              </p>
            )}
          </>
        )}

        {wizard.step === 'rack' &&
          (() => {
            const recommended = findFreeRackSlot(racks);
            const orderedRackIds = recommended
              ? [recommended.rackId, ...racks.map((r) => r.id).filter((id) => id !== recommended.rackId)]
              : racks.map((r) => r.id);
            return (
              <>
                <p className="text-sm text-slate-300">
                  Pallet <span className="font-mono font-semibold text-slate-100">{wizard.palletId}</span>{' '}
                  is in transit to storage — now scan the destination rack.
                </p>
                {recommended ? (
                  <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">
                    Recommended: Rack {recommended.rackId} — slot {recommended.slotIndex + 1} is free.
                  </p>
                ) : (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    All racks are full — no free slot available.
                  </p>
                )}
                <ScanInput
                  label="Scan rack barcode"
                  placeholder="e.g. R-A"
                  onScan={handleScanRack}
                  suggestions={orderedRackIds}
                />
                <button onClick={cancel} className="text-xs text-slate-500 hover:text-slate-300">
                  Cancel / start over
                </button>
              </>
            );
          })()}
      </div>


      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Live inventory by zone
          </h2>
          <span className="text-xs text-slate-500">
            {countFreeRackSlots(racks)} free slots · {countRackedPallets(racks)} pallets stored
          </span>
        </div>
        <div className="space-y-6">
          {STORAGE_ZONES.map((zone) => {
            const zoneRacks = racks.filter((r) => r.zoneId === zone.id);
            return (
              <div key={zone.id} className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-semibold text-slate-100">{zone.name}</h3>
                  <span className="text-xs font-mono text-slate-500">{zone.id}</span>
                  {zone.requiresRefrigeration && (
                    <span className="text-xs text-blue-300 font-medium">❄ Refrigerated</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {zoneRacks.map((rack) => (
                    <RackGrid key={rack.id} rack={rack} highlightPalletId={wizard.palletId ?? undefined} loads={loads} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 ${active ? 'bg-indigo-500/15 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}
    >
      {label}
    </span>
  );
}
