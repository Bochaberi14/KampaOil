import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { TruckCard } from '../components/EntityCards';
import { can } from '../rbac';
import { USERS } from '../data/seed';
import {
  calculateSmartDispatchSuggestion,
  formatDispatchSuggestion,
  getPickersForDepartment,
  getProductDepartment,
} from '../utils/dispatchUtils';

function userName(userId: string): string {
  return USERS.find((u) => u.id === userId)?.name ?? userId;
}

export function DispatchPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const trucks = useWarehouseStore((s) => s.trucks);
  const pallets = useWarehouseStore((s) => s.pallets);
  const loads = useWarehouseStore((s) => s.loads);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const dispatchVerifications = useWarehouseStore((s) => s.dispatchVerifications);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const availableInStorage = useWarehouseStore((s) => s.availableInStorage);
  const availableInProduction = useWarehouseStore((s) => s.availableInProduction);
  const scanDispatchLine = useWarehouseStore((s) => s.scanDispatchLine);
  const executeDispatchPicking = useWarehouseStore((s) => s.executeDispatchPicking);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchPickingState, setDispatchPickingState] = useState<{
    taskId: string | null;
    step: 'task-select' | 'bay-rack' | 'pallet' | 'scan-line' | 'scan-vehicle';
    currentPalletIndex: number;
    bayRackId: string | null;
  }>({
    taskId: null,
    step: 'task-select',
    currentPalletIndex: 0,
    bayRackId: null,
  });

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;
  const selectedSOVerification = selectedSO
    ? dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id)
    : undefined;
  const remaining = selectedSO ? selectedSO.qty - selectedSO.dispatchedQty : 0;
  const available = selectedSO ? availableOnBay(selectedSO.sku) : 0;
  const assignedTruck = selectedSO ? trucks.find((t) => t.id === selectedSO.assignedTruckId) : undefined;

  // Smart dispatch: calculate available inventory from bay, storage, and production
  const dispatchSuggestion = selectedSO
    ? calculateSmartDispatchSuggestion(
        selectedSO.sku,
        remaining,
        availableOnBay(selectedSO.sku),
        availableInStorage(selectedSO.sku),
        availableInProduction(selectedSO.sku),
      )
    : null;

  const formattedSuggestion = dispatchSuggestion ? formatDispatchSuggestion(dispatchSuggestion) : null;

  // Picker department filtering: get eligible pickers for this product
  const productDept = selectedSO ? getProductDepartment(selectedSO.sku) : undefined;
  const eligiblePickers = productDept ? getPickersForDepartment(productDept) : [];

  const soPickTasks = selectedSO ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id) : [];
  const pickingComplete = soPickTasks.length > 0 && soPickTasks.every((t) => t.status === 'Completed');

  const myDispatchPickingTasks = currentUser
    ? pickTasks.filter(
        (t) => t.origin === 'Dispatch' && t.assignedPickerId === currentUser.id && t.status === 'Accepted',
      )
    : [];
  const currentDispatchTask = dispatchPickingState.taskId
    ? myDispatchPickingTasks.find((t) => t.id === dispatchPickingState.taskId)
    : null;
  const currentPalletItem = currentDispatchTask?.items[dispatchPickingState.currentPalletIndex] ?? null;

  // Pallets ready to load straight onto a truck, bypassing the bay — either
  // an approved Storage shortfall released via a Bay-Topup pick task, or a
  // Loaded pallet diverted straight from Production. Both land on the same
  // InTransitToTruck status, so filtering on that (+ matching SKU) covers
  // either path without needing to know which one a pallet came from.
  const readyForDirectDispatch = selectedSO
    ? pallets
        .filter((p) => p.status === 'InTransitToTruck')
        .map((p) => p.id)
        .filter((palletId) => loads.find((l) => l.palletId === palletId)?.sku === selectedSO.sku)
    : [];

  function handleStartDispatchPicking(taskId: string) {
    setDispatchPickingState({
      taskId,
      step: 'bay-rack',
      currentPalletIndex: 0,
      bayRackId: null,
    });
  }

  function handleScanBayRack(bayRackId: string) {
    if (!currentDispatchTask) return;
    const bayRack = bayRacks.find((b) => b.id === bayRackId);
    if (!bayRack) {
      pushToast(`Bay rack ${bayRackId} not found`, 'error');
      return;
    }
    setDispatchPickingState((s) => ({ ...s, bayRackId, step: 'pallet' }));
  }

  function handleScanPalletAtBay(palletId: string) {
    if (!currentDispatchTask) return;
    const currentItem = currentDispatchTask.items[dispatchPickingState.currentPalletIndex];
    if (palletId !== currentItem.palletId) {
      pushToast(`Wrong pallet — expected ${currentItem.palletId}, scanned ${palletId}`, 'error');
      return;
    }

    if (!currentUser) return;
    const result = executeDispatchPicking({
      pickTaskId: currentDispatchTask.id,
      bayRackId: dispatchPickingState.bayRackId!,
      palletIds: [currentItem.palletId],
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    const dispatchLine = assignedTruck?.dispatchLine || 'Dispatch Line';
    pushToast(`${currentItem.palletId} ✓ staged at ${dispatchLine}`, 'success');

    const nextIndex = dispatchPickingState.currentPalletIndex + 1;
    if (nextIndex < currentDispatchTask.items.length) {
      setDispatchPickingState((s) => ({ ...s, currentPalletIndex: nextIndex, step: 'bay-rack', bayRackId: null }));
      pushToast(`Next: ${currentDispatchTask.items[nextIndex].palletId}`, 'info');
    } else {
      pushToast(`All ${currentDispatchTask.items.length} pallets staged ✓`, 'success');
      setDispatchPickingState((s) => ({ ...s, step: 'scan-line' }));
    }
  }

  function handleCancelDispatchPicking() {
    setDispatchPickingState({
      taskId: null,
      step: 'task-select',
      currentPalletIndex: 0,
      bayRackId: null,
    });
  }

  function handleScanDispatchLineForTask(lineCode: string) {
    if (!currentDispatchTask || !assignedTruck) return;

    // Verify it's the correct dispatch line
    if (lineCode !== assignedTruck.dispatchLine) {
      pushToast(`Wrong line — expected ${assignedTruck.dispatchLine}, scanned ${lineCode}`, 'error');
      return;
    }

    pushToast(`✓ Dispatch line confirmed — now scan vehicle`, 'success');
    setDispatchPickingState((s) => ({ ...s, step: 'scan-vehicle' }));
  }

  function handleScanVehicleForTask(vehicleId: string) {
    if (!currentDispatchTask || !assignedTruck) return;

    // Verify it's the correct vehicle
    if (vehicleId !== assignedTruck.plate && vehicleId !== assignedTruck.id) {
      pushToast(`Wrong vehicle — expected ${assignedTruck.plate}, scanned ${vehicleId}`, 'error');
      return;
    }

    pushToast(`✓ Task completed: all pallets staged at ${assignedTruck.dispatchLine} for ${assignedTruck.plate}`, 'success');
    setDispatchPickingState({
      taskId: null,
      step: 'task-select',
      currentPalletIndex: 0,
      bayRackId: null,
    });
  }

  function handleScanLine(lineCode: string) {
    if (!selectedSO || !currentUser) return;
    const result = scanDispatchLine({
      salesOrderId: selectedSO.id,
      dispatchLineCode: lineCode,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 4 · Dispatch</h1>
        <p className="text-sm text-slate-400">
          Once picking is complete, scan the dispatch line then the vehicle to stage the goods and
          generate the handover printout — the pallet stays behind, only the product moves on.
        </p>
      </div>

      {myDispatchPickingTasks.length > 0 && can(currentUser?.role, 'execute:pickTask') && (
        <div className="space-y-4 rounded-2xl border border-violet-800 bg-violet-950/20 p-6">
          <h2 className="font-semibold text-violet-200">My Dispatch Tasks</h2>
          <p className="text-xs text-violet-300">Scan to move pallets from bay to dispatch line, then verify with vehicle</p>

          {dispatchPickingState.taskId === null ? (
            <div className="space-y-2">
              {myDispatchPickingTasks.map((task) => {
                const palletCount = task.items.length;
                const progress = task.items.filter((i) => i.picked).length;
                return (
                  <button
                    key={task.id}
                    onClick={() => handleStartDispatchPicking(task.id)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-800/60 px-4 py-3 text-left text-sm hover:bg-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-200">{task.id}</div>
                        <div className="text-xs text-slate-500">{palletCount} pallets to move</div>
                      </div>
                      <div className={`text-sm font-semibold ${progress === palletCount ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {progress}/{palletCount}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-indigo-800 bg-indigo-950/40 px-3 py-2">
                <p className="text-sm font-semibold text-indigo-300">{currentDispatchTask?.id}</p>
                <p className="text-xs text-indigo-200">
                  {dispatchPickingState.currentPalletIndex + 1} of {currentDispatchTask?.items.length}: {currentPalletItem?.palletId}
                </p>
              </div>

              {dispatchPickingState.step === 'bay-rack' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-indigo-300">1. Scan bay rack</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-500">2. Scan pallet</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-500">3. Scan dispatch line</span>
                  </div>
                  <p className="text-sm text-slate-300">Scan the bay rack holding {currentPalletItem?.palletId}</p>
                  <ScanInput
                    label="Scan source bay rack"
                    placeholder="e.g. BAY-A"
                    onScan={handleScanBayRack}
                    suggestions={bayRacks.map((b) => b.id)}
                  />
                </div>
              )}

              {dispatchPickingState.step === 'pallet' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">1. Scan bay rack ✓</span>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-indigo-300">2. Scan pallet</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-500">3. Scan dispatch line</span>
                  </div>
                  <p className="text-sm text-slate-300">Scan pallet {currentPalletItem?.palletId} to confirm it's the right one</p>
                  <ScanInput
                    label="Scan pallet barcode"
                    placeholder="e.g. PLT-001"
                    onScan={handleScanPalletAtBay}
                    suggestions={[currentPalletItem?.palletId || '']}
                  />
                </div>
              )}

              {dispatchPickingState.step === 'scan-line' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">1. Move pallets ✓</span>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-indigo-300">2. Scan dispatch line</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-500">3. Scan vehicle</span>
                  </div>
                  <p className="text-sm text-violet-200">Scan dispatch line {assignedTruck?.dispatchLine}</p>
                  <ScanInput
                    label="Scan dispatch line barcode"
                    placeholder={`e.g. ${assignedTruck?.dispatchLine}`}
                    onScan={handleScanDispatchLineForTask}
                    suggestions={assignedTruck?.dispatchLine ? [assignedTruck.dispatchLine] : []}
                  />
                </div>
              )}

              {dispatchPickingState.step === 'scan-vehicle' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">1. Move pallets ✓</span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">2. Scan dispatch line ✓</span>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-indigo-300">3. Scan vehicle</span>
                  </div>
                  <p className="text-sm text-violet-200">Scan vehicle {assignedTruck?.plate} to confirm</p>
                  <ScanInput
                    label="Scan vehicle barcode or plate"
                    placeholder={`e.g. ${assignedTruck?.plate}`}
                    onScan={handleScanVehicleForTask}
                    suggestions={assignedTruck ? [assignedTruck.plate, assignedTruck.id] : []}
                  />
                </div>
              )}

              <button
                onClick={handleCancelDispatchPicking}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Sales orders</h2>
          {salesOrders.map((so) => (
            <button
              key={so.id}
              onClick={() => setSelectedSOId(so.id)}
              disabled={so.status === 'Fulfilled'}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${
                selectedSOId === so.id ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              <div>
                <div className="font-medium text-slate-200">
                  {so.id} · {so.customer}
                </div>
                <div className="text-xs text-slate-500">
                  {so.productName} — {so.dispatchedQty.toLocaleString()} / {so.qty.toLocaleString()} units
                </div>
              </div>
              <StatusPill status={so.status} />
            </button>
          ))}

          {selectedSO && selectedSO.status !== 'Fulfilled' && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned vehicle</span>
                <span className="font-medium text-slate-200">
                  {assignedTruck ? `${assignedTruck.plate} (${assignedTruck.dispatchLine})` : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Remaining to dispatch</span>
                <span className="font-medium text-slate-200">{remaining.toLocaleString()} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Available on bay ({selectedSO.sku})</span>
                <span className="font-medium text-slate-200">{available.toLocaleString()} units</span>
              </div>

              <div className="border-t border-slate-700 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Picking progress</p>
                {soPickTasks.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">No picking requested yet.</p>
                )}
                <ul className="mt-1 space-y-1">
                  {soPickTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {t.assignedPickerId ? userName(t.assignedPickerId) : 'Unassigned'}
                        <span className="ml-2 text-slate-500">
                          {t.items.filter((i) => i.picked).length}/{t.items.length} picked
                        </span>
                      </span>
                      <StatusPill status={t.status} />
                    </li>
                  ))}
                </ul>
              </div>

              {dispatchSuggestion && formattedSuggestion && (
                <div className="border-t border-slate-700 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Smart dispatch availability</p>
                  <div className={`mt-2 space-y-1 text-xs ${formattedSuggestion.isShortfall ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {formattedSuggestion.lines.map((line, idx) => (
                      <p key={idx} className="font-mono">
                        {line}
                      </p>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Priority: Bay ({dispatchSuggestion.fromBay.toLocaleString()}) → Storage ({dispatchSuggestion.fromStorage.toLocaleString()}) → Production ({dispatchSuggestion.fromProduction.toLocaleString()})
                  </p>
                </div>
              )}

              {productDept && (
                <div className="border-t border-slate-700 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department & picker assignment</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Product: <span className="font-medium text-indigo-300">{productDept}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Eligible pickers: {eligiblePickers.length > 0 ? eligiblePickers.map((p) => p.name).join(', ') : 'None available'}
                  </p>
                </div>
              )}

              {selectedSOVerification && (
                <div className="flex items-center justify-between border-t border-slate-700 pt-2 text-xs">
                  <span className="text-slate-400">
                    Handover status — vehicle verification and signing happen on the Loader's Dispatch
                    Planning page.
                  </span>
                  <StatusPill status={selectedSOVerification.status} />
                </div>
              )}

            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Stage &amp; verify</h2>
          {!selectedSO && <p className="text-sm text-slate-500">Select a sales order to begin.</p>}
          {selectedSO && !can(currentUser?.role, 'execute:scan') && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker.
            </p>
          )}
          {selectedSO && can(currentUser?.role, 'execute:scan') && !assignedTruck && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No vehicle assigned to this sales order yet.
            </p>
          )}
          {selectedSO && can(currentUser?.role, 'execute:scan') && assignedTruck && !pickingComplete && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Picking is not complete yet — every assigned task must reach Completed before you can
              stage at {assignedTruck.dispatchLine}.
            </p>
          )}
          {selectedSO && can(currentUser?.role, 'execute:scan') && assignedTruck && pickingComplete && (
            <>
              <p className="text-xs text-slate-400">
                All picking is complete — move the goods to {assignedTruck.dispatchLine} and scan it to
                finish. The pallet itself stays behind; only the product moves on. The Loader takes
                over from here (vehicle verification and signing).
              </p>
              <ScanInput
                label="Scan the dispatch line"
                placeholder="e.g. LINE 001"
                onScan={handleScanLine}
                suggestions={[assignedTruck.dispatchLine]}
              />
            </>
          )}
          {selectedSO?.status === 'Fulfilled' && (
            <p className="text-sm text-emerald-400">This sales order has been fully staged for dispatch.</p>
          )}
        </div>


        {selectedSO && readyForDirectDispatch.length > 0 && (
          <div className="rounded-2xl border border-violet-800 bg-violet-950/20 p-6 text-xs text-violet-300/80 lg:col-span-2">
            {readyForDirectDispatch.length} pallet(s) released straight to the dispatch area (bypassing
            the bay) are ready — they're included automatically once you scan the dispatch line above.
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bayRacks.map((b) => (
            <RackGrid key={b.id} rack={b} loads={loads} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Trucks</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {trucks.map((t) => (
            <TruckCard key={t.id} truck={t} />
          ))}
        </div>
      </div>

    </div>
  );
}
