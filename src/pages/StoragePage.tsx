import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { countFreeRackSlots, countRackedPallets } from '../engine/rules';
import { recommendStorageLocation, formatStorageLocation } from '../engine/storageRecommendation';
import { STORAGE_ZONES } from '../data/seed';
import { canAccessDepartment } from '../rbac';

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

    const pallet = pallets.find((p) => p.id === wizard.palletId);
    if (!pallet) return;

    // Find the load to get the SKU
    const load = loads.find((l) => l.palletId === wizard.palletId);
    if (!load) return;

    // DYNAMICALLY calculate the recommended location based on CURRENT rack state
    // This ensures we always know which racks are full and which have slots
    const freshRecommendation = recommendStorageLocation(racks, load.sku, wizard.palletId);
    if (!freshRecommendation) {
      pushToast(`❌ No available rack space in the designated bin for ${load.productName}`, 'error');
      return;
    }

    // Strict validation: pallet MUST scan to the CURRENT recommended rack
    if (rackId !== freshRecommendation.rackId) {
      pushToast(
        `❌ Wrong location! ${pallet.id} must go to ${formatStorageLocation(freshRecommendation)}. Scanned ${rackId} instead. Scan the correct rack.`,
        'error',
      );
      return;
    }

    const result = scanPalletToRack({ palletId: wizard.palletId, rackId, operatorId: currentUser.id });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Correct location! Pallet ${wizard.palletId} racked to ${formatStorageLocation(freshRecommendation)}`, 'success');
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
            const load = loads.find((l) => l.palletId === wizard.palletId);

            // DYNAMICALLY calculate recommendation based on CURRENT rack state
            const freshRecommendation = load && wizard.palletId ? recommendStorageLocation(racks, load.sku, wizard.palletId) : null;
            const orderedRackIds = freshRecommendation
              ? [freshRecommendation.rackId, ...racks.map((r) => r.id).filter((id) => id !== freshRecommendation.rackId)]
              : racks.map((r) => r.id);
            return (
              <>
                <p className="text-sm text-slate-300">
                  Pallet <span className="font-mono font-semibold text-slate-100">{wizard.palletId}</span>{' '}
                  is in transit to storage — now scan the destination rack.
                </p>
                {freshRecommendation ? (
                  <div
                    className={`rounded-lg px-4 py-3 text-sm border ${
                      freshRecommendation.isOverflow
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                        freshRecommendation.isOverflow ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {freshRecommendation.isOverflow ? '⚠️  Overflow Alert' : '📍 Recommended Storage Location'}
                    </p>
                    <p className={`font-mono font-semibold text-base ${freshRecommendation.isOverflow ? 'text-amber-100' : 'text-emerald-100'}`}>
                      {formatStorageLocation(freshRecommendation)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {freshRecommendation.isOverflow
                        ? `Designated bin for ${load?.productName} is FULL. Pallet will be stored in OVERFLOW — move to proper bin when space opens.`
                        : `Scan this rack — it's the first available slot in the designated bin`}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-300">
                    ❌ No available rack space — both designated bin and OVERFLOW are full for {load?.productName}
                  </p>
                )}
                <ScanInput
                  label="Scan rack barcode"
                  placeholder="e.g. BIN-A-S-01-R-01"
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
            {currentUser?.role === 'HOD' && (
              <span className="ml-2 text-xs font-normal text-slate-600">
                ({currentUser.department})
              </span>
            )}
          </h2>
          <span className="text-xs text-slate-500">
            {countFreeRackSlots(racks)} free slots · {countRackedPallets(racks)} pallets stored
          </span>
        </div>
        <div className="space-y-6">
          {STORAGE_ZONES.filter((zone) => {
            // Only HODs are filtered by department; Pickers and others see everything
            if (currentUser?.role === 'HOD') {
              return canAccessDepartment(currentUser, zone.department as string);
            }
            return true;
          }).map((zone) => {
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
