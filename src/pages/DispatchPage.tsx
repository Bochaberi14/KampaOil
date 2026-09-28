import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { TruckCard } from '../components/EntityCards';
import { can } from '../rbac';
import { USERS } from '../data/seed';
import { findCurrentLoadForPallet } from '../types/domain';
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
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchLineScanned, setDispatchLineScanned] = useState(false);
  // Which active truck the dispatch-line scan matched — more than one can be
  // active on the order at once, so the scanned line itself is what picks
  // which vehicle's plate to expect next.
  const [scannedTruckId, setScannedTruckId] = useState<string | null>(null);

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;
  const remaining = selectedSO ? selectedSO.lines.reduce((sum, l) => sum + (l.qty - l.dispatchedQty), 0) : 0;
  const availableByLine = selectedSO
    ? selectedSO.lines.map((l) => ({ sku: l.sku, productName: l.productName, available: availableOnBay(l.sku) }))
    : [];
  // More than one vehicle can be active on the order at once, each on its
  // own dispatch line.
  const activeTrucks = selectedSO ? trucks.filter((t) => selectedSO.assignedTruckIds.includes(t.id)) : [];

  const soPickTasks = selectedSO ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id) : [];

  const productionApprovals = selectedSO
    ? directDispatchApprovals.filter(
        (a) => a.salesOrderId === selectedSO.id && a.source === 'Production' && a.status === 'Approved',
      )
    : [];

  // Scoped to one truck's own tasks — with more than one vehicle active on
  // the order, a picker whose task is for LINE 002 shouldn't have to wait on
  // a different picker's task for LINE 001 before they can stage/scan.
  // Also requires any production-direct approval for a sku this truck's own
  // manifest covers to be fully captured — without this, a picker could
  // scan (and close out the truck, freeing its dispatch line) the moment
  // the bay portion alone is done, before a still-in-transit or just-arrived
  // direct-dispatch pallet is folded into that same manifest, permanently
  // missing it once the truck departs.
  // Purely informational now — scanning is never blocked on this (see
  // scanDispatchLine in the store): a picker can always scan to bank
  // whatever's already arrived for this truck, even while other tasks
  // assigned to the same vehicle are still in progress. This just explains
  // why the picking-progress list might not show "Completed" everywhere yet.
  function pickingIncompleteReason(truckId: string): string | null {
    const tasksForTruck = soPickTasks.filter((t) => t.truckId === truckId);
    const unfinishedTasks = tasksForTruck.filter((t) => t.status !== 'Completed');
    if (unfinishedTasks.length > 0) {
      return `${unfinishedTasks.length} assigned picking task(s) still in progress — scan now to bank whatever's already arrived.`;
    }

    const verification = selectedSO
      ? dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id && v.truckId === truckId)
      : undefined;
    if (!verification) {
      return 'Nothing has reached the bay or dispatch area for this vehicle yet.';
    }

    // Checked by the pallet's own status, not membership in THIS truck's
    // palletIds — an old approval/task from an earlier, already-departed
    // truck's batch stays resolved forever, and its pallets were rightly
    // captured by that truck's manifest, not this one's. Requiring them in
    // *this* verification would permanently block every later truck on the
    // same sku. 'StagedForDispatch' means captured by some manifest
    // generation already, whichever truck that was for.
    const skus = new Set(verification.products.map((p) => p.sku));

    // Storage direct-dispatch tasks no longer carry a truckId (the
    // destination truck is only resolved at arrival-scan/manifest time,
    // same as Production Direct) — match by SKU membership in this truck's
    // own manifest instead. A task turns 'Completed' the moment its pallet
    // is released from the storage rack (scanRackForPick), well before it's
    // actually walked over and confirmed arrived — without this stronger
    // per-pallet check, the truck could look "ready to scan" and depart
    // while that pallet is still in transit, permanently stranding its units.
    const relevantStorageDirectTasks = soPickTasks.filter(
      (t) => t.origin === 'Storage' && t.directDispatch && t.items.some((i) => skus.has(i.sku)),
    );
    const storageDirectArrived = relevantStorageDirectTasks.every((t) =>
      t.items.every((i) => pallets.find((p) => p.id === i.palletId)?.status === 'StagedForDispatch'),
    );
    const relevantApprovals = productionApprovals.filter((a) => skus.has(a.sku));
    const productionDirectCaptured = relevantApprovals.every((a) => {
      if ((a.palletsRemaining ?? 0) > 0) return false;
      const taggedPallets = pallets.filter((p) => p.productionDirectDispatchApprovalId === a.id);
      return taggedPallets.every((p) => p.status === 'StagedForDispatch');
    });
    if (!storageDirectArrived || !productionDirectCaptured) {
      return "A direct-dispatch pallet for this vehicle hasn't arrived yet — scan now to bank what's already here, then scan again once it does.";
    }

    return null;
  }

  // Whether a specific truck's dispatch line has already been scanned — used
  // per pick task / per production-direct batch below, since each can be
  // routed to a different one of the order's active trucks.
  function isLineScannedForTruck(truckId: string | null) {
    if (!truckId || !selectedSO) return false;
    return !!dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id && v.truckId === truckId)
      ?.dispatchLineScannedAt;
  }

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
          selectedSO.lines.some((l) => l.sku === findCurrentLoadForPallet(loads, palletId)?.sku),
        )
    : [];

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

    // A picker whose own task is done can bank just that portion and move on
    // — the truck only actually closes out once every task/approval routed
    // to it has arrived (see scanDispatchLine's `closed` flag).
    pushToast(
      result.data.closed
        ? `✓ Dispatch verified! ${truck.dispatchLine} released.`
        : `✓ ${result.data.creditedQty.toLocaleString()} units confirmed at ${truck.dispatchLine} — more picking still pending for this vehicle.`,
      'success',
    );
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
                {activeTrucks.map((t) => {
                  const reason = pickingIncompleteReason(t.id);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3">
                      <span>{t.dispatchLine} ({t.plate})</span>
                      <span className={reason ? 'text-right text-amber-400' : 'text-emerald-400'}>
                        {reason ?? 'Ready to scan'}
                      </span>
                    </li>
                  );
                })}
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
