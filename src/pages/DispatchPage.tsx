import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { TruckCard } from '../components/EntityCards';
import { can } from '../rbac';
import { USERS } from '../data/seed';
// Removed unused dispatch utility imports

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
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const dispatchVerifications = useWarehouseStore((s) => s.dispatchVerifications);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const scanDispatchLine = useWarehouseStore((s) => s.scanDispatchLine);
  const executeDispatchPicking = useWarehouseStore((s) => s.executeDispatchPicking);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchLineScanned, setDispatchLineScanned] = useState(false);
  // Which active truck the dispatch-line scan matched — more than one can be
  // active on the order at once, so the scanned line itself is what picks
  // which vehicle's plate to expect next.
  const [scannedTruckId, setScannedTruckId] = useState<string | null>(null);
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
  const remaining = selectedSO ? selectedSO.lines.reduce((sum, l) => sum + (l.qty - l.dispatchedQty), 0) : 0;
  const availableByLine = selectedSO
    ? selectedSO.lines.map((l) => ({ sku: l.sku, productName: l.productName, available: availableOnBay(l.sku) }))
    : [];
  // More than one vehicle can be active on the order at once, each on its
  // own dispatch line.
  const activeTrucks = selectedSO ? trucks.filter((t) => selectedSO.assignedTruckIds.includes(t.id)) : [];

  const soPickTasks = selectedSO ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id) : [];
  // Scoped to one truck's own tasks — with more than one vehicle active on
  // the order, a picker whose task is for LINE 002 shouldn't have to wait on
  // a different picker's task for LINE 001 before they can stage/scan.
  function pickingCompleteForTruck(truckId: string) {
    const tasksForTruck = soPickTasks.filter((t) => t.truckId === truckId);
    return tasksForTruck.length > 0 && tasksForTruck.every((t) => t.status === 'Completed');
  }
  // Whether a specific truck's dispatch line has already been scanned — used
  // per pick task / per production-direct batch below, since each can be
  // routed to a different one of the order's active trucks.
  function isLineScannedForTruck(truckId: string | null) {
    if (!truckId || !selectedSO) return false;
    return !!dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id && v.truckId === truckId)
      ?.dispatchLineScannedAt;
  }

  const productionApprovals = selectedSO
    ? directDispatchApprovals.filter(
        (a) => a.salesOrderId === selectedSO.id && a.source === 'Production' && a.status === 'Approved',
      )
    : [];

  // Three-stage lifecycle for a direct-dispatch pick task: moving (In
  // Progress) → arrived at the loading bay (Staged) → dispatch line scanned
  // (Completed). A task's own 'Completed' status only means "left storage" —
  // it isn't staged until the pallet is physically confirmed at the bay.
  function pickTaskDisplayStatus(t: (typeof pickTasks)[number]) {
    const lineScanned = isLineScannedForTruck(t.truckId);
    if (t.origin === 'Storage' && t.directDispatch) {
      if (t.status !== 'Completed') return t.status;
      const allArrived = t.items.every((i) => pallets.find((p) => p.id === i.palletId)?.directDispatchArrivedAt);
      if (!allArrived) return 'In Progress';
      return lineScanned ? 'Completed' : 'Staged';
    }
    if (t.status === 'Completed') return lineScanned ? 'Completed' : 'Staged';
    return t.status;
  }

  const myDispatchPickingTasks = currentUser
    ? pickTasks.filter(
        (t) => t.origin === 'Dispatch' && t.assignedPickerId === currentUser.id && t.status === 'Accepted',
      )
    : [];
  const currentDispatchTask = dispatchPickingState.taskId
    ? myDispatchPickingTasks.find((t) => t.id === dispatchPickingState.taskId)
    : null;
  const currentPalletItem = currentDispatchTask?.items[dispatchPickingState.currentPalletIndex] ?? null;
  // The task itself was tagged with its target vehicle at assignment time
  // (see assignDispatchPickingTasks) — not re-derived from the order, since
  // more than one vehicle can be active on it at once.
  const currentTaskTruck = currentDispatchTask?.truckId
    ? trucks.find((t) => t.id === currentDispatchTask.truckId)
    : undefined;

  // Pallets ready to load straight onto a truck, bypassing the bay — either
  // an approved Storage shortfall released via a Bay-Topup pick task, or a
  // Loaded pallet diverted straight from Production. Both land on the same
  // InTransitToTruck status, so filtering on that (+ matching SKU) covers
  // either path without needing to know which one a pallet came from.
  const readyForDirectDispatch = selectedSO
    ? pallets
        .filter((p) => p.status === 'InTransitToTruck')
        .map((p) => p.id)
        .filter((palletId) =>
          selectedSO.lines.some((l) => l.sku === loads.find((ld) => ld.palletId === palletId)?.sku),
        )
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

    const dispatchLine = currentTaskTruck?.dispatchLine || 'Dispatch Line';
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
    if (!currentDispatchTask || !currentTaskTruck) return;

    // Verify it's the correct dispatch line
    if (lineCode !== currentTaskTruck.dispatchLine) {
      pushToast(`Wrong line — expected ${currentTaskTruck.dispatchLine}, scanned ${lineCode}`, 'error');
      return;
    }

    pushToast(`✓ Dispatch line confirmed — now scan vehicle`, 'success');
    setDispatchPickingState((s) => ({ ...s, step: 'scan-vehicle' }));
  }

  function handleScanVehicleForTask(vehicleId: string) {
    if (!currentDispatchTask || !currentTaskTruck) return;

    // Verify it's the correct vehicle
    if (vehicleId !== currentTaskTruck.plate && vehicleId !== currentTaskTruck.id) {
      pushToast(`Wrong vehicle — expected ${currentTaskTruck.plate}, scanned ${vehicleId}`, 'error');
      return;
    }

    pushToast(`✓ Task completed: all pallets staged at ${currentTaskTruck.dispatchLine} for ${currentTaskTruck.plate}`, 'success');
    setDispatchPickingState({
      taskId: null,
      step: 'task-select',
      currentPalletIndex: 0,
      bayRackId: null,
    });
  }

  function handleScanLine(lineCode: string) {
    if (!selectedSO || !currentUser) return;

    // More than one vehicle can be active on this order at once — the
    // scanned line itself is what says which one this is for.
    const truck = activeTrucks.find((t) => t.dispatchLine === lineCode);
    if (!truck) {
      pushToast(
        `❌ Wrong line! Expected one of: ${activeTrucks.map((t) => t.dispatchLine).join(', ') || 'none active'}, scanned ${lineCode}`,
        'error',
      );
      return;
    }
    if (!pickingCompleteForTruck(truck.id)) {
      pushToast(`Picking for ${truck.dispatchLine} is not complete yet — every assigned task must reach Completed first.`, 'error');
      return;
    }

    setScannedTruckId(truck.id);
    pushToast(`✓ Dispatch line confirmed — now scan vehicle barcode`, 'success');
    setDispatchLineScanned(true);
  }

  function handleScanVehicle(vehicleCode: string) {
    if (!selectedSO || !currentUser) return;
    const truck = activeTrucks.find((t) => t.id === scannedTruckId);
    if (!truck) return;

    // Verify correct vehicle
    if (vehicleCode !== truck.plate && vehicleCode !== truck.id) {
      pushToast(`❌ Wrong vehicle! Expected ${truck.plate}, scanned ${vehicleCode}`, 'error');
      return;
    }

    // The plate/id match above confirms it's the right vehicle; scanDispatchLine
    // is what actually advances dispatchedQty/Fulfilled now that both the line
    // and vehicle are confirmed (see its comment in the store).
    const result = scanDispatchLine({
      salesOrderId: selectedSO.id,
      dispatchLineCode: truck.dispatchLine,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Dispatch verified! Order complete.`, 'success');
    setDispatchLineScanned(false);
    setScannedTruckId(null);
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
                  <p className="text-sm text-violet-200">Scan dispatch line {currentTaskTruck?.dispatchLine}</p>
                  <ScanInput
                    label="Scan dispatch line barcode"
                    placeholder={`e.g. ${currentTaskTruck?.dispatchLine}`}
                    onScan={handleScanDispatchLineForTask}
                    suggestions={currentTaskTruck?.dispatchLine ? [currentTaskTruck.dispatchLine] : []}
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
                  <p className="text-sm text-violet-200">Scan vehicle {currentTaskTruck?.plate} to confirm</p>
                  <ScanInput
                    label="Scan vehicle barcode or plate"
                    placeholder={`e.g. ${currentTaskTruck?.plate}`}
                    onScan={handleScanVehicleForTask}
                    suggestions={currentTaskTruck ? [currentTaskTruck.plate, currentTaskTruck.id] : []}
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
                  {so.lines
                    .map((line) => `${line.productName} ${line.dispatchedQty.toLocaleString()}/${line.qty.toLocaleString()}`)
                    .join(', ')}
                </div>
              </div>
              <StatusPill status={so.status} />
            </button>
          ))}

          {selectedSO && selectedSO.status !== 'Fulfilled' && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">
                  Assigned vehicle{activeTrucks.length > 1 ? 's' : ''}
                </span>
                <span className="font-medium text-slate-200">
                  {activeTrucks.length > 0
                    ? activeTrucks.map((t) => `${t.plate} (${t.dispatchLine})`).join(', ')
                    : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Remaining to dispatch</span>
                <span className="font-medium text-slate-200">{remaining.toLocaleString()} units</span>
              </div>
              {availableByLine.map((line) => (
                <div key={line.sku} className="flex justify-between">
                  <span className="text-slate-400">Available on bay ({line.sku})</span>
                  <span className="font-medium text-slate-200">{line.available.toLocaleString()} units</span>
                </div>
              ))}

              <div className="border-t border-slate-700 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Picking progress</p>
                {soPickTasks.length === 0 && productionApprovals.length === 0 && (
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
                      <StatusPill status={pickTaskDisplayStatus(t)} />
                    </li>
                  ))}
                  {productionApprovals.map((approval) => {
                    // Track by the approval id the pallet was tagged with at
                    // confirmLoad time, not just SKU+status — regenerating
                    // the manifest promotes an arrived pallet from
                    // InTransitToTruck to StagedForDispatch, and a
                    // SKU+'InTransitToTruck' filter alone loses track of it
                    // right at that point, making progress that just
                    // advanced (to Staged) look like it reset to "In Progress".
                    const productionDirectPallets = pallets.filter(
                      (p) =>
                        p.productionDirectDispatchApprovalId === approval.id &&
                        (p.status === 'InTransitToTruck' || p.status === 'StagedForDispatch'),
                    );
                    const productionArrived = productionDirectPallets.filter(
                      (p) => p.status === 'StagedForDispatch' || p.directDispatchArrivedAt,
                    );
                    // Truck attribution for these pallets only exists once
                    // they're staged (see generateManifestForPickingComplete)
                    // — read it straight off the pallet rather than guessing
                    // from the order, since more than one truck can be active.
                    const stagedPallet = productionDirectPallets.find(
                      (p) => p.status === 'StagedForDispatch' && p.location.type === 'DispatchLine',
                    );
                    const productionTruckId = stagedPallet ? (stagedPallet.location as any).truckId : null;
                    return (
                      <li key={approval.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">
                          Production Direct ({approval.sku})
                          <span className="ml-2 text-slate-500">
                            {productionArrived.length}/{productionDirectPallets.length} arrived
                          </span>
                        </span>
                        <StatusPill
                          status={
                            productionDirectPallets.length > 0 && productionArrived.length >= productionDirectPallets.length
                              ? (isLineScannedForTruck(productionTruckId) ? 'Completed' : 'Staged')
                              : 'In Progress'
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>

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
          {selectedSO && can(currentUser?.role, 'execute:scan') && activeTrucks.length === 0 && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No vehicle assigned to this sales order yet.
            </p>
          )}
          {/* Readiness is per truck, not per order — a picker whose own task
              is done can scan and stage immediately even while a different
              picker's task for another active vehicle is still in progress. */}
          {selectedSO && can(currentUser?.role, 'execute:scan') && activeTrucks.length > 0 && (
            <div className="space-y-3">
              <ul className="space-y-1 text-xs text-slate-400">
                {activeTrucks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span>{t.dispatchLine} ({t.plate})</span>
                    <span className={pickingCompleteForTruck(t.id) ? 'text-emerald-400' : 'text-amber-400'}>
                      {pickingCompleteForTruck(t.id) ? 'Ready to scan' : 'Picking in progress'}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className={`rounded-full px-2 py-1 ${dispatchLineScanned ? 'bg-emerald-500/15 text-emerald-300' : 'bg-indigo-500/15 text-indigo-300'}`}>
                  1. Scan dispatch line
                </span>
                <span className={`rounded-full px-2 py-1 ${dispatchLineScanned ? 'bg-indigo-500/15 text-indigo-300' : 'bg-slate-800 text-slate-500'}`}>
                  2. Scan vehicle
                </span>
              </div>
              {!dispatchLineScanned ? (
                <ScanInput
                  label="Step 1: Scan the dispatch line"
                  placeholder={`e.g. ${activeTrucks[0].dispatchLine}`}
                  onScan={handleScanLine}
                  suggestions={activeTrucks.map((t) => t.dispatchLine)}
                />
              ) : (() => {
                const scannedTruck = activeTrucks.find((t) => t.id === scannedTruckId);
                return (
                  <ScanInput
                    label="Step 2: Scan vehicle barcode"
                    placeholder={`e.g. ${scannedTruck?.plate}`}
                    onScan={handleScanVehicle}
                    suggestions={scannedTruck ? [scannedTruck.plate, scannedTruck.id] : []}
                  />
                );
              })()}
            </div>
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
