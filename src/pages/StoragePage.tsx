import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { countFreeRackSlots, countRackedPallets } from '../engine/rules';
import { recommendStorageLocation, formatStorageLocation } from '../engine/storageRecommendation';
import { STORAGE_ZONES } from '../data/seed';
import { canAccessDepartment, getPickerType } from '../rbac';

type WizardStep = 'pallet-arriving' | 'rack-placement';
type PickingStep = 'pallet-at-rack' | 'rack-scan' | 'pallet-leaving';

export function StoragePage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const scanPalletLeavingLine = useWarehouseStore((s) => s.scanPalletLeavingLine);
  const scanPalletToRack = useWarehouseStore((s) => s.scanPalletToRack);
  const scanRackForPick = useWarehouseStore((s) => s.scanRackForPick);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null }>({
    step: 'pallet-arriving',
    palletId: null,
  });

  const [pickingWizard, setPickingWizard] = useState<{
    step: PickingStep;
    taskId: string | null;
    palletId: string | null;
    rackId: string | null;
  }>({
    step: 'pallet-at-rack',
    taskId: null,
    palletId: null,
    rackId: null,
  });




  const loadedPallets = pallets.filter((p) => p.status === 'Loaded').map((p) => p.id);
  const inTransitPallets = pallets.filter((p) => p.status === 'InTransitToStorage').map((p) => p.id);

  function handleScanPalletArriving(palletId: string) {
    if (!currentUser) return;
    const pallet = pallets.find((p) => p.id === palletId);

    // Pallet already in transit — resume at rack placement step
    if (pallet?.status === 'InTransitToStorage') {
      setWizard({ step: 'rack-placement', palletId });
      return;
    }

    const result = scanPalletLeavingLine(palletId, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`✓ Pallet ${palletId} arrived at storage — now scan destination rack`, 'success');
    setWizard({ step: 'rack-placement', palletId });
  }

  function handleScanRack(rackId: string) {
    if (!wizard.palletId || !currentUser) return;

    const pallet = pallets.find((p) => p.id === wizard.palletId);
    if (!pallet) return;

    const load = loads.find((l) => l.palletId === wizard.palletId);
    if (!load) return;

    const freshRecommendation = recommendStorageLocation(racks, load.sku, wizard.palletId, pallets);
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

    // Place pallet in the rack
    const result = scanPalletToRack({ palletId: wizard.palletId, rackId: freshRecommendation.rackId, operatorId: currentUser.id });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Pallet ${wizard.palletId} successfully placed at ${formatStorageLocation(freshRecommendation)}`, 'success');
    setWizard({ step: 'pallet-arriving', palletId: null });
  }


  function cancel() {
    setWizard({ step: 'pallet-arriving', palletId: null });
  }

  function cancelPicking() {
    setPickingWizard({ step: 'pallet-at-rack', taskId: null, palletId: null, rackId: null });
  }

  function handleScanPalletAtRack(palletId: string) {
    if (!pickingWizard.taskId || !currentUser) return;
    const task = pickTasks.find((t) => t.id === pickingWizard.taskId);
    if (!task) return;

    const item = task.items.find((i) => i.palletId === palletId && !i.picked);
    if (!item) {
      pushToast(`❌ Pallet ${palletId} is not part of this picking task`, 'error');
      return;
    }

    setPickingWizard({ step: 'rack-scan', taskId: pickingWizard.taskId, palletId, rackId: null });
    pushToast(`✓ Pallet ${palletId} found — now scan its rack location`, 'success');
  }

  function handleScanPickingRack(rackId: string) {
    if (!pickingWizard.taskId || !pickingWizard.palletId || !currentUser) return;
    const task = pickTasks.find((t) => t.id === pickingWizard.taskId);
    if (!task) return;

    const item = task.items.find((i) => i.palletId === pickingWizard.palletId && !i.picked);
    if (!item || item.sourceRackId !== rackId) {
      pushToast(`❌ Wrong rack! This pallet is at ${item?.sourceRackId || 'unknown'}`, 'error');
      return;
    }

    setPickingWizard({ ...pickingWizard, rackId, step: 'pallet-leaving' });
    pushToast(`✓ Rack confirmed: ${rackId} — now scan pallet leaving storage`, 'success');
  }

  function handleScanPalletLeavingStorage(palletId: string) {
    if (!pickingWizard.taskId || !pickingWizard.palletId || !pickingWizard.rackId || !currentUser) return;

    if (palletId !== pickingWizard.palletId) {
      pushToast(`❌ Wrong pallet! Expected ${pickingWizard.palletId}, scanned ${palletId}`, 'error');
      return;
    }

    const result = scanRackForPick({
      pickTaskId: pickingWizard.taskId,
      palletId: pickingWizard.palletId,
      rackId: pickingWizard.rackId,
      operatorId: currentUser.id,
    });

    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Pallet ${palletId} released from storage — ready for loading bay`, 'success');
    setPickingWizard({ step: 'pallet-at-rack', taskId: null, palletId: null, rackId: null });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 2 · Storage</h1>
        <p className="text-sm text-slate-400">
          2-step scanning: Pallet arriving → Destination rack (pallet leaves when stock requested)
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <StepDot active={wizard.step === 'pallet-arriving'} label="1. Scan pallet arriving" />
          <StepDot active={wizard.step === 'rack-placement'} label="2. Scan destination rack" />
        </div>

        {wizard.step === 'pallet-arriving' && (
          <>
            <ScanInput
              label="Scan pallet arriving at storage"
              placeholder="e.g. PLT-002"
              onScan={handleScanPalletArriving}
              suggestions={loadedPallets}
            />
            {inTransitPallets.length > 0 && (
              <p className="text-xs text-amber-300">
                Already in transit: {inTransitPallets.join(', ')} — scan one to resume.
              </p>
            )}
          </>
        )}

        {wizard.step === 'rack-placement' &&
          (() => {
            const load = loads.find((l) => l.palletId === wizard.palletId);
            const freshRecommendation = load && wizard.palletId ? recommendStorageLocation(racks, load.sku, wizard.palletId, pallets) : null;
            return (
              <>
                <p className="text-sm text-slate-300">
                  Pallet <span className="font-mono font-semibold text-slate-100">{wizard.palletId}</span> — scan ONLY the recommended destination rack
                </p>
                {freshRecommendation ? (
                  <div
                    className={`rounded-lg px-4 py-3 text-sm border ${
                      freshRecommendation.isOverflow ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                        freshRecommendation.isOverflow ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {freshRecommendation.isOverflow ? '⚠️  Overflow' : '📍 Recommended Location'}
                    </p>
                    <p className={`font-mono font-semibold text-base ${freshRecommendation.isOverflow ? 'text-amber-100' : 'text-emerald-100'}`}>
                      {formatStorageLocation(freshRecommendation)}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-300">
                    ❌ No available space for {load?.productName}
                  </p>
                )}
                <ScanInput
                  label="Scan rack barcode"
                  placeholder="e.g. BIN-A-S-01-R-01"
                  onScan={handleScanRack}
                  suggestions={[freshRecommendation?.rackId || '']}
                />
                <button onClick={cancel} className="text-xs text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </>
            );
          })()}

      </div>

      {/* Picking workflow - when stock is requested (Storage Pickers only) */}
      {currentUser && getPickerType(currentUser.id) === 'storage' && (() => {
        const myTasks = pickTasks.filter((t) => t.assignedPickerId === currentUser.id && t.status === 'Accepted');
        const activePicking = pickingWizard.taskId && myTasks.find((t) => t.id === pickingWizard.taskId);

        // If picking wizard is active but task is no longer assigned to this user, clear it
        if (pickingWizard.taskId && !activePicking) {
          setPickingWizard({ step: 'pallet-at-rack', taskId: null, palletId: null, rackId: null });
        }

        if (myTasks.length === 0 && !activePicking) return null;

        return (
          <div className="space-y-4 rounded-2xl border border-blue-800 bg-blue-900/20 p-6">
            <h2 className="text-lg font-semibold text-blue-200">📦 Picking Workflow</h2>

            {activePicking ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <StepDot active={pickingWizard.step === 'pallet-at-rack'} label="1. Scan pallet at rack" />
                  <StepDot active={pickingWizard.step === 'rack-scan'} label="2. Scan rack location" />
                  <StepDot active={pickingWizard.step === 'pallet-leaving'} label="3. Scan pallet leaving" />
                </div>

                {pickingWizard.step === 'pallet-at-rack' && (
                  <>
                    <p className="text-sm text-blue-200">Pick pallets for task {activePicking.id}</p>
                    <ScanInput
                      label="Scan pallet at rack"
                      placeholder="e.g. PLT-001"
                      onScan={handleScanPalletAtRack}
                      suggestions={activePicking.items.filter((i) => !i.picked && i.palletId !== pickingWizard.palletId).map((i) => i.palletId)}
                    />
                    <button onClick={cancelPicking} className="text-xs text-blue-400 hover:text-blue-300">
                      Finish picking
                    </button>
                  </>
                )}

                {pickingWizard.step === 'rack-scan' && (
                  <>
                    <p className="text-sm text-blue-200">
                      Pallet <span className="font-mono font-semibold">{pickingWizard.palletId}</span> — scan its rack location
                    </p>
                    <ScanInput
                      label="Scan rack barcode"
                      placeholder="e.g. BIN-A-S-01-R-01"
                      onScan={handleScanPickingRack}
                      suggestions={[activePicking.items.find((i) => i.palletId === pickingWizard.palletId)?.sourceRackId || '']}
                    />
                    <button onClick={cancelPicking} className="text-xs text-blue-400 hover:text-blue-300">
                      Cancel
                    </button>
                  </>
                )}

                {pickingWizard.step === 'pallet-leaving' && (
                  <>
                    <p className="text-sm text-blue-200">
                      Pallet leaving storage — scan to confirm
                    </p>
                    <ScanInput
                      label="Scan pallet barcode"
                      placeholder="e.g. PLT-001"
                      onScan={handleScanPalletLeavingStorage}
                      suggestions={pickingWizard.palletId ? [pickingWizard.palletId] : []}
                    />
                    <button onClick={cancelPicking} className="text-xs text-blue-400 hover:text-blue-300">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-blue-300">Active picking tasks:</p>
                {myTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setPickingWizard({ step: 'pallet-at-rack', taskId: task.id, palletId: null, rackId: null })}
                    className="block w-full rounded-lg bg-blue-800/30 px-3 py-2 text-left text-sm hover:bg-blue-800/50"
                  >
                    <p className="font-mono font-semibold text-blue-200">{task.id}</p>
                    <p className="text-xs text-blue-400">{task.items.length} pallet(s) to pick</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
