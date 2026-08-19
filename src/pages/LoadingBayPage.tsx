import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { can, canAccessDepartment, getPickerType } from '../rbac';
import { recommendBayLocation, formatBayLocation } from '../engine/storageRecommendation';
import { PRODUCTS } from '../data/products';
import { LOADING_BAY_ZONES, LOADING_BAY_SHELVES } from '../data/seed';

type WizardStep = 'bay-arriving' | 'bay-staging';
type DispatchStep = 'scan-pallet';

export function LoadingBayPage() {
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const pallets = useWarehouseStore((s) => s.pallets);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const customerReturns = useWarehouseStore((s) => s.customerReturns);
  const actionReturnDecision = useWarehouseStore((s) => s.actionReturnDecision);
  const requestStockFromStorageToLoadingBay = useWarehouseStore((s) => s.requestStockFromStorageToLoadingBay);
  const scanPalletLeavingStorage = useWarehouseStore((s) => s.scanPalletLeavingStorage);
  const placePalletInBay = useWarehouseStore((s) => s.placePalletInBay);
  const executeDispatchPicking = useWarehouseStore((s) => s.executeDispatchPicking);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null; palletIndex: number; bayRackId: string | null }>({
    step: 'bay-arriving',
    palletId: null,
    palletIndex: 0,
    bayRackId: null,
  });

  const [dispatchWizard, setDispatchWizard] = useState<{
    step: DispatchStep;
    taskId: string | null;
    palletId: string | null;
    dispatchDestination: string | null;
    bayRackId: string | null;
  }>({
    step: 'scan-pallet',
    taskId: null,
    palletId: null,
    dispatchDestination: null,
    bayRackId: null,
  });

  const [stagingRequest, setStagingRequest] = useState({ sku: '', qty: '' });

  const palletsInTransitToBay = useWarehouseStore((s) => s.pallets).filter((p) => p.status === 'InTransitToBay');
  const isLoadingBayPicker = currentUser ? getPickerType(currentUser.id) === 'loading-bay' : false;
  const myPutAwayTasks = pickTasks.filter(
    (t) => t.status === 'Accepted' && t.assignedPickerId === currentUser?.id && (t.origin === 'Storage' || t.origin === 'Production'),
  );
  const currentPutAwayTask = myPutAwayTasks[0] ?? null;

  const currentPutAwayItem = currentPutAwayTask?.items.find((item) => !item.picked) ?? null;
  const nextPalletToReceive = palletsInTransitToBay[0];

  const getStorageInventoryByProduct = () => {
    const inv: Record<string, { sku: string; name: string; count: number }> = {};
    for (const product of PRODUCTS) {
      const palletIds = racks
        .flatMap((r) => r.slots)
        .filter((s) => s.palletId)
        .map((s) => s.palletId!) as string[];
      const count = palletIds.filter((pId) => {
        const load = loads.find((l) => l.palletId === pId);
        return load?.sku === product.sku;
      }).length;
      inv[product.sku] = { sku: product.sku, name: product.name, count };
    }
    return Object.values(inv);
  };

  const getBayInventoryByProduct = () => {
    const inv: Record<string, { sku: string; name: string; count: number }> = {};
    for (const product of PRODUCTS) {
      const palletIds = bayRacks
        .flatMap((r) => r.slots)
        .filter((s) => s.palletId)
        .map((s) => s.palletId!) as string[];
      const count = palletIds.filter((pId) => {
        const load = loads.find((l) => l.palletId === pId);
        return load?.sku === product.sku;
      }).length;
      inv[product.sku] = { sku: product.sku, name: product.name, count };
    }
    return Object.values(inv);
  };

  const storageInv = getStorageInventoryByProduct();
  const bayInv = getBayInventoryByProduct();
  const isHod = can(currentUser?.role, 'approve:hold');

  function handleRequestStock(e: React.FormEvent) {
    e.preventDefault();
    if (!stagingRequest.sku || !stagingRequest.qty || !currentUser) {
      pushToast('Select a product and enter a quantity', 'error');
      return;
    }
    const qty = parseInt(stagingRequest.qty, 10);
    if (isNaN(qty) || qty <= 0) {
      pushToast('Quantity must be a positive number', 'error');
      return;
    }
    const result = requestStockFromStorageToLoadingBay({
      sku: stagingRequest.sku,
      qty,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    const task = result.data.task;
    if (task) {
      pushToast(
        `Stock request created — ${task.items.length} pallet(s) assigned to Picker ${task.assignedPickerId}`,
        'success',
      );
    } else {
      pushToast(`Stock request created but no Picker available yet — awaiting assignment`, 'info');
    }
    setStagingRequest({ sku: '', qty: '' });
  }

  function handleScanPalletArriving(palletId: string) {
    if (!currentUser) return;

    const expectedPalletId = currentPutAwayItem?.palletId || nextPalletToReceive?.id;
    if (!expectedPalletId) return;

    if (palletId !== expectedPalletId) {
      pushToast(`Wrong pallet — expected ${expectedPalletId}, scanned ${palletId}`, 'error');
      return;
    }

    // If there's a put-away task, scan through the task
    if (currentPutAwayTask && currentPutAwayItem) {
      const result = scanPalletLeavingStorage({
        pickTaskId: currentPutAwayTask.id,
        palletId,
        operatorId: currentUser.id,
      });
      if (!result.ok) {
        pushToast(result.error, 'error');
        return;
      }
    }

    pushToast(`✓ Pallet ${palletId} arrived at loading bay — scan staging location`, 'success');
    setWizard((w) => ({ ...w, step: 'bay-staging', palletId }));
  }

  function handleScanBayStaging(bayRackId: string) {
    if (!wizard.palletId || !currentUser) return;

    const pallet = pallets.find((p) => p.id === wizard.palletId);
    if (!pallet) return;

    // Get recommended bay location for this pallet
    const freshRecommendation = recommendBayLocation(bayRacks, wizard.palletId, pallets);
    if (!freshRecommendation) {
      pushToast(`❌ No available bay rack space`, 'error');
      return;
    }

    // Validate against recommendation - must go to correct rack
    if (bayRackId !== freshRecommendation.rackId) {
      pushToast(
        `❌ Wrong location! Pallet ${wizard.palletId} should go to ${formatBayLocation(freshRecommendation)}. Scanned ${bayRackId} instead. Scan the correct rack.`,
        'error',
      );
      return;
    }

    // Place pallet in bay rack
    const result = placePalletInBay({
      palletId: wizard.palletId,
      bayRackId: freshRecommendation.rackId,
      operatorId: currentUser.id,
    });

    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    // Pallet placed in bay - intake workflow complete
    pushToast(`✓ Pallet ${wizard.palletId} placed at ${formatBayLocation(freshRecommendation)}`, 'success');
    setWizard({ step: 'bay-arriving', palletId: null, palletIndex: 0, bayRackId: null });
  }

  function cancelDispatch() {
    setDispatchWizard({ step: 'scan-pallet', taskId: null, palletId: null, dispatchDestination: null, bayRackId: null });
  }

  function handleScanBayRackForDispatch(bayRackId: string) {
    if (!dispatchWizard.taskId || !currentUser) return;
    const task = pickTasks.find((t) => t.id === dispatchWizard.taskId);
    if (!task) return;

    const nextItem = task.items.find((i) => !i.picked);
    if (!nextItem) {
      pushToast(`❌ All pallets in this task already dispatched`, 'error');
      return;
    }

    // Check if sourceRackId is set
    if (!nextItem.sourceRackId) {
      pushToast(
        `❌ Pallet ${nextItem.palletId} has no assigned bay rack. Contact supervisor.`,
        'error',
      );
      return;
    }

    // Verify scanned rack matches the system-recommended FIFO rack
    if (bayRackId !== nextItem.sourceRackId) {
      pushToast(
        `❌ Wrong rack! System recommends ${nextItem.sourceRackId} for pallet ${nextItem.palletId}. Scan the correct rack.`,
        'error',
      );
      return;
    }

    pushToast(`✓ Correct rack ${bayRackId} scanned — now scan pallet ${nextItem.palletId}`, 'success');
    setDispatchWizard({ ...dispatchWizard, step: 'scan-pallet', bayRackId });
  }

  function handleScanPallet(palletId: string) {
    if (!dispatchWizard.taskId || !currentUser || !dispatchWizard.bayRackId) return;
    const task = pickTasks.find((t) => t.id === dispatchWizard.taskId);
    if (!task) return;

    // Verify this pallet is in this dispatch task and not already picked
    const item = task.items.find((i) => i.palletId === palletId && !i.picked);
    if (!item) {
      pushToast(`❌ Pallet ${palletId} not in this dispatch task or already dispatched`, 'error');
      return;
    }

    // Verify the pallet is actually in the scanned bay rack
    const palletSlot = bayRacks.find(r => r.id === dispatchWizard.bayRackId)?.slots.find(s => s.palletId === palletId);
    if (!palletSlot) {
      pushToast(`❌ Pallet ${palletId} not found in rack ${dispatchWizard.bayRackId}`, 'error');
      return;
    }

    // Mark pallet as dispatched
    const result = executeDispatchPicking({
      pickTaskId: dispatchWizard.taskId,
      bayRackId: dispatchWizard.bayRackId,
      palletIds: [palletId],
      operatorId: currentUser.id,
    });

    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Pallet ${palletId} ready for dispatch — continue to next pallet or finish`, 'success');
    setDispatchWizard({ step: 'scan-pallet', taskId: dispatchWizard.taskId, palletId: null, dispatchDestination: null, bayRackId: null });
  }


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 3 · Loading Bay</h1>
        <p className="text-sm text-slate-400">
          HOD requests stock, Pickers transport to bay, Loader dispatches to customers.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              ← Receiving Point
            </p>
            <p className="text-xs text-slate-500">
              Pallets arrive from Storage. Hand pickers receive and transfer to bay forklift.
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Dispatch Point →
            </p>
            <p className="text-xs text-slate-500">
              Pallets move to assigned Dispatch Line for vehicle loading.
            </p>
          </div>
        </div>
      </div>

      {isHod && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">HOD · Request stock staging</h2>
          <p className="mt-1 text-xs text-slate-500">
            Request stock from storage without a specific Sales Order — the system auto-assigns an available Picker.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Storage inventory
              </h3>
              {storageInv.length === 0 ? (
                <p className="text-xs text-slate-500">No stock in storage.</p>
              ) : (
                <div className="space-y-1 text-xs">
                  {storageInv.map((item) => (
                    <div key={item.sku} className="flex items-center justify-between rounded-lg border border-slate-800 px-2 py-1">
                      <span className="text-slate-300">{item.name}</span>
                      <span className="font-mono text-slate-400">{item.count} pallets</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bay inventory
              </h3>
              {bayInv.length === 0 ? (
                <p className="text-xs text-slate-500">No stock in bay.</p>
              ) : (
                <div className="space-y-1 text-xs">
                  {bayInv.map((item) => (
                    <div key={item.sku} className="flex items-center justify-between rounded-lg border border-slate-800 px-2 py-1">
                      <span className="text-slate-300">{item.name}</span>
                      <span className="font-mono text-slate-400">{item.count} pallets</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleRequestStock} className="space-y-3 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</label>
                <select
                  value={stagingRequest.sku}
                  onChange={(e) => setStagingRequest((s) => ({ ...s, sku: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600"
                >
                  <option value="">Select product...</option>
                  {PRODUCTS.filter((p) => canAccessDepartment(currentUser, p.department)).map((p) => {
                    const availablePallets = storageInv.find((inv) => inv.sku === p.sku)?.count || 0;
                    const availableUnits = availablePallets * p.unitsPerPallet;
                    return (
                      <option key={p.sku} value={p.sku}>
                        {p.name} ({p.sku}) — {availablePallets} pallets • {availableUnits} units
                      </option>
                    );
                  })}
                </select>
              </div>
              {stagingRequest.sku && (
                <div className="rounded-lg bg-slate-700/40 px-2 py-1.5">
                  <p className="text-xs text-slate-300">
                    <span className="font-semibold">Available in storage:</span>{' '}
                    {(() => {
                      const product = PRODUCTS.find((p) => p.sku === stagingRequest.sku);
                      const availablePallets = storageInv.find((inv) => inv.sku === stagingRequest.sku)?.count || 0;
                      const availableUnits = availablePallets * (product?.unitsPerPallet || 100);
                      return `${availablePallets} pallets • ${availableUnits} units`;
                    })()}
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity (units)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={stagingRequest.qty}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setStagingRequest((s) => ({ ...s, qty: val }));
                  }}
                  placeholder="e.g. 500"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600"
                />
              </div>
              {stagingRequest.sku && stagingRequest.qty && (
                <div className="rounded-lg bg-indigo-500/10 px-2 py-1.5">
                  <p className="text-xs text-indigo-300">
                    Will require <span className="font-semibold">{Math.ceil(parseInt(stagingRequest.qty) / (PRODUCTS.find(p => p.sku === stagingRequest.sku)?.unitsPerPallet || 100))} pallets</span> ({stagingRequest.qty} units)
                  </p>
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Request stock
              </button>
            </form>
          </div>
        </div>
      )}

      {isLoadingBayPicker && (currentPutAwayTask || nextPalletToReceive) && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-slate-200">Intake Workflow</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <StepDot active={wizard.step === 'bay-arriving'} label="1. Scan pallet arriving" />
            <StepDot active={wizard.step === 'bay-staging'} label="2. Scan destination rack" />
          </div>

          {wizard.step === 'bay-arriving' && (currentPutAwayItem || nextPalletToReceive) && (
            <>
              <p className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{currentPutAwayItem?.palletId || nextPalletToReceive?.id}</span> from storage — scan to confirm arrival
              </p>
              <ScanInput
                label="Scan pallet arriving at loading bay"
                placeholder="e.g. PLT-005"
                onScan={handleScanPalletArriving}
                suggestions={[currentPutAwayItem?.palletId || nextPalletToReceive?.id || '']}
              />
            </>
          )}

          {wizard.step === 'bay-staging' && wizard.palletId && (() => {
            const pallet = pallets.find((p) => p.id === wizard.palletId);
            const freshRecommendation = pallet ? recommendBayLocation(bayRacks, wizard.palletId, pallets) : null;
            return (
              <>
                <p className="text-sm text-slate-300">
                  Pallet <span className="font-mono font-semibold text-slate-100">{wizard.palletId}</span> — scan ONLY the recommended rack
                </p>
                {freshRecommendation ? (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-emerald-300">✓ Move to</p>
                    <p className="font-mono font-semibold text-base text-emerald-100">{formatBayLocation(freshRecommendation)}</p>
                  </div>
                ) : (
                  <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-300">
                    ❌ No available bay rack space
                  </p>
                )}
                <ScanInput
                  label="Scan bay rack barcode"
                  placeholder="e.g. BIN-A-BAY-S-01-R-01"
                  onScan={handleScanBayStaging}
                  suggestions={freshRecommendation ? [freshRecommendation.rackId] : []}
                />
                <button onClick={() => setWizard({ step: 'bay-arriving', palletId: null, palletIndex: 0, bayRackId: null })} className="text-xs text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </>
            );
          })()}

        </div>
      )}

      {/* Dispatch workflow - releasing pallets to vehicles */}
      {isLoadingBayPicker && (() => {
        const dispatchTasks = pickTasks.filter((t) => t.assignedPickerId === currentUser?.id && t.status === 'Accepted' && t.origin === 'Dispatch');
        const activeDispatch = dispatchWizard.taskId && dispatchTasks.find((t) => t.id === dispatchWizard.taskId);

        if (dispatchWizard.taskId && !activeDispatch) {
          setDispatchWizard({ step: 'scan-pallet', taskId: null, palletId: null, dispatchDestination: null, bayRackId: null });
        }

        if (dispatchTasks.length === 0 && !activeDispatch) return null;

        return (
          <div className="space-y-4 rounded-2xl border border-purple-800 bg-purple-900/20 p-6">
            <h2 className="text-lg font-semibold text-purple-200">📦 Dispatch Workflow</h2>
            <p className="text-xs text-purple-300">
              Loading Bay Picker: Scan racks and pallets leaving the loading bay to dispatch line
            </p>

            {activeDispatch ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <StepDot active={dispatchWizard.step === 'scan-pallet' && !dispatchWizard.bayRackId} label="1. Scan bay rack" />
                  <StepDot active={dispatchWizard.step === 'scan-pallet' && !!dispatchWizard.bayRackId} label="2. Scan pallet" />
                </div>

                {dispatchWizard.step === 'scan-pallet' && !dispatchWizard.bayRackId && (() => {
                  const nextItem = activeDispatch?.items.find((i) => !i.picked);
                  const expectedRackId = nextItem?.sourceRackId;
                  return (
                    <>
                      <p className="text-sm text-purple-200">
                        Pallet <span className="font-mono font-semibold text-purple-100">{nextItem?.palletId}</span> — scan the bay rack location
                      </p>
                      {expectedRackId ? (
                        <div className="rounded-lg bg-purple-800/30 p-3 mb-3">
                          <p className="text-xs font-semibold text-purple-300 mb-2">System recommends (FIFO):</p>
                          <p className="text-sm text-purple-100 font-mono">{expectedRackId}</p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 mb-3">
                          <p className="text-xs text-red-300">Pallet location not assigned</p>
                        </div>
                      )}
                      <ScanInput
                        label="Scan bay rack barcode"
                        placeholder="e.g. BIN-A-BAY-S-01-R-01"
                        onScan={handleScanBayRackForDispatch}
                        suggestions={expectedRackId ? [expectedRackId] : []}
                      />
                      <button onClick={cancelDispatch} className="text-xs text-purple-400 hover:text-purple-300">
                        Cancel
                      </button>
                    </>
                  );
                })()}

                {dispatchWizard.step === 'scan-pallet' && dispatchWizard.bayRackId && (() => {
                  const nextUnpicked = activeDispatch?.items.find((i) => !i.picked);
                  return (
                    <>
                      <p className="text-sm text-purple-200">
                        Bay Rack <span className="font-mono font-semibold text-purple-100">{dispatchWizard.bayRackId}</span> — scan pallet
                      </p>
                      <ScanInput
                        label="Scan pallet barcode"
                        placeholder="e.g. PLT-001"
                        onScan={handleScanPallet}
                        suggestions={nextUnpicked ? [nextUnpicked.palletId] : []}
                      />
                      <button
                        onClick={() => setDispatchWizard({ ...dispatchWizard, step: 'scan-pallet', bayRackId: null })}
                        className="text-xs text-purple-400 hover:text-purple-300"
                      >
                        Back to rack selection
                      </button>
                    </>
                  );
                })()}

              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-purple-300">Your dispatch picking tasks:</p>
                {dispatchTasks.length === 0 ? (
                  <p className="text-xs text-purple-400">No active dispatch picking tasks assigned to you.</p>
                ) : (
                  dispatchTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setDispatchWizard({ step: 'scan-pallet', taskId: task.id, palletId: null, dispatchDestination: null, bayRackId: null })}
                      className="block w-full rounded-lg bg-purple-800/30 px-3 py-2 text-left text-sm hover:bg-purple-800/50"
                    >
                      <p className="font-mono font-semibold text-purple-200">{task.id}</p>
                      <p className="text-xs text-purple-400">
                        {task.items.filter(i => !i.picked).length}/{task.items.length} pallet(s) remaining
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })()}



      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Loading Bay Zones
          {currentUser?.role === 'HOD' && (
            <span className="ml-2 text-xs font-normal text-slate-600">
              ({currentUser.department})
            </span>
          )}
        </h2>
        <div className="space-y-6">
          {LOADING_BAY_ZONES.filter((zone) => {
            // Returns zone always visible; only HODs are filtered by department
            if (zone.id === 'BIN-D-BAY') return true;
            if (currentUser?.role === 'HOD') {
              return canAccessDepartment(currentUser, zone.department as string);
            }
            return true;
          }).map((zone) => {
            const zoneShelves = LOADING_BAY_SHELVES.filter((s) => s.zoneId === zone.id);
            return (
              <div key={zone.id} className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-semibold text-slate-100">{zone.name}</h3>
                  <span className="text-xs font-mono text-slate-500">{zone.id}</span>
                  {zone.requiresRefrigeration && (
                    <span className="text-xs text-blue-300 font-medium">❄ Refrigerated</span>
                  )}
                </div>
                <div className="space-y-4">
                  {zoneShelves.map((shelf) => {
                    const shelfRacks = bayRacks.filter((r) => r.shelfId === shelf.id);
                    const shelfNum = shelf.index;
                    return (
                      <div key={shelf.id} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Shelf {shelfNum}
                        </p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {shelfRacks.map((b) => (
                            <RackGrid key={b.id} rack={b} highlightPalletId={wizard.palletId ?? undefined} loads={loads} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(() => {
        const returnsInZone = customerReturns.filter((r) => r.status === 'InReturnZone');
        const approvedReturns = customerReturns.filter((r) => r.status === 'Approved');
        return (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold text-slate-200">Returns Zone</h2>
            <p className="text-xs text-slate-500">Returned items waiting for manager decision or execution</p>

            {approvedReturns.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Approved — Waiting Execution</p>
                {approvedReturns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                    <div className="text-xs">
                      <p className="font-medium text-slate-200">{r.qty} × {r.productName}</p>
                      <p className="text-slate-400">Decision: {r.decision}</p>
                    </div>
                    {currentUser?.role === 'Picker' && (
                      <button
                        onClick={() => actionReturnDecision({ returnId: r.id, operatorId: currentUser.id })}
                        className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        Execute
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {returnsInZone.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">In Zone — Awaiting Review</p>
                {returnsInZone.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
                    <div className="text-xs">
                      <p className="font-medium text-slate-200">{r.qty} × {r.productName}</p>
                      <p className="text-slate-400">{r.remark}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {returnsInZone.length === 0 && approvedReturns.length === 0 && (
              <p className="text-xs text-slate-500">No returns in zone currently</p>
            )}
          </div>
        );
      })()}
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
