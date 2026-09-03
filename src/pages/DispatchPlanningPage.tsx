import { useState } from 'react';
import { useWarehouseStore, activeTruckIds } from '../store/useWarehouseStore';
import { PrintSheet } from '../components/PrintSheet';
import { DispatchManifest } from '../components/DispatchManifest';
import { VehicleBarcodePage } from '../components/VehicleBarcodePage';
import { filterPickersByType, getPickerType } from '../rbac';
import { USERS } from '../data/seed';
import type { SalesOrder, SalesOrderLine } from '../types/domain';

type OrderTab = 'new' | 'pending' | 'inProgress' | 'completed';

function orderTotals(so: SalesOrder) {
  return so.lines.reduce(
    (acc, l) => ({
      qty: acc.qty + l.qty,
      releasedQty: acc.releasedQty + l.releasedQty,
      dispatchedQty: acc.dispatchedQty + l.dispatchedQty,
    }),
    { qty: 0, releasedQty: 0, dispatchedQty: 0 },
  );
}

function orderBucket(so: SalesOrder): OrderTab {
  const { qty, releasedQty, dispatchedQty } = orderTotals(so);
  if (dispatchedQty >= qty) return 'completed';
  if (releasedQty === 0) return 'new';
  if (releasedQty < qty) return 'pending';
  return 'inProgress';
}

function userName(userId: string): string {
  return USERS.find((u) => u.id === userId)?.name ?? userId;
}

export function DispatchPlanningPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const dispatchVerifications = useWarehouseStore((s) => s.dispatchVerifications);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const registerVehicleForSalesOrder = useWarehouseStore((s) => s.registerVehicleForSalesOrder);
  const generateManifestForPickingComplete = useWarehouseStore((s) => s.generateManifestForPickingComplete);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const availableInStorage = useWarehouseStore((s) => s.availableInStorage);
  const trucks = useWarehouseStore((s) => s.trucks);

  const [activeTab, setActiveTab] = useState<OrderTab>('new');
  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchLine, setDispatchLine] = useState('');
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  // Which of the order's (possibly several) active vehicles the Loader is
  // currently working with — release/assign/generate all target this one.
  // Explicit selection is only meaningful while it's still active; otherwise
  // fall back to the most-recently-registered active truck below, so a
  // single-vehicle order needs zero clicks and "maintain the vehicle I was
  // using" is the default for a second release on the same truck.
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;
  const activeTrucksForSelectedSO = selectedSO
    ? trucks.filter((t) => selectedSO.assignedTruckIds.includes(t.id))
    : [];
  const effectiveTruckId =
    selectedTruckId && activeTrucksForSelectedSO.some((t) => t.id === selectedTruckId)
      ? selectedTruckId
      : (activeTrucksForSelectedSO.at(-1)?.id ?? null);
  const soVerification = selectedSO
    ? dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id && v.truckId === effectiveTruckId)
    : undefined;

  const ordersByBucket: Record<OrderTab, SalesOrder[]> = {
    new: salesOrders.filter((s) => orderBucket(s) === 'new'),
    pending: salesOrders.filter((s) => orderBucket(s) === 'pending'),
    inProgress: salesOrders.filter((s) => orderBucket(s) === 'inProgress'),
    completed: salesOrders.filter((s) => orderBucket(s) === 'completed'),
  };

  const tabsConfig: { key: OrderTab; label: string; count: number }[] = [
    { key: 'new', label: 'New Orders', count: ordersByBucket.new.length },
    { key: 'pending', label: 'Pending Orders', count: ordersByBucket.pending.length },
    { key: 'inProgress', label: 'In Progress', count: ordersByBucket.inProgress.length },
    { key: 'completed', label: 'Completed Orders', count: ordersByBucket.completed.length },
  ];

  const currentOrders = ordersByBucket[activeTab];
  const soPickTasks = selectedSO ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id) : [];

  // Only Loading Bay Pickers can be assigned for dispatch picking
  const allDispatchPickers = USERS.filter((u) => u.role === 'Picker' && u.department === 'Oil & Refinery');
  const loadingBayPickers = filterPickersByType(allDispatchPickers, 'loading-bay');
  const availablePickers = loadingBayPickers.filter((u) => {
    const hasOngoingTask = pickTasks.some((t) => t.assignedPickerId === u.id && t.status === 'Accepted');
    return !hasOngoingTask;
  });

  // Only trucks some sales order currently lists as active occupy a line — a
  // departed truck (its id removed from every order's assignedTruckIds by
  // scanDispatchLine) frees its line for the next vehicle.
  const activeIds = activeTruckIds(salesOrders);
  const occupiedDispatchLines = new Set(
    trucks.filter((t) => activeIds.has(t.id)).map((t) => t.dispatchLine),
  );
  const unoccupiedDispatchLines = ['LINE 001', 'LINE 002', 'LINE 003'].filter(
    (line) => !occupiedDispatchLines.has(line)
  );
  const selectedTotals = selectedSO ? orderTotals(selectedSO) : { qty: 0, releasedQty: 0, dispatchedQty: 0 };
  const remainingToAllocate = selectedTotals.qty - selectedTotals.dispatchedQty;

  function handleRegisterVehicle() {
    if (!selectedSO || !currentUser) return;
    if (!plate.trim() || !driverName.trim()) {
      pushToast('Enter plate and driver name', 'error');
      return;
    }
    if (!dispatchLine) {
      pushToast('Allocate a dispatch line first', 'error');
      return;
    }
    const result = registerVehicleForSalesOrder({
      salesOrderId: selectedSO.id,
      plate,
      driverName,
      dispatchLine,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast('Vehicle registered', 'success');
    setPlate('');
    setDriverName('');
    // The vehicle the Loader just registered becomes the one they're
    // "currently working with" by default.
    setSelectedTruckId(result.data.truck.id);
  }

  function handleGenerateManifest(soId: string, truckId: string) {
    if (!currentUser) return;
    const result = generateManifestForPickingComplete({
      salesOrderId: soId,
      truckId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
    } else {
      pushToast('✓ Dispatch documents generated — ready to print', 'success');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dispatch Planning</h1>
        <p className="text-sm text-slate-400">
          Manage sales orders from release through vehicle dispatch
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-800">
        {tabsConfig.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSelectedSOId(null);
              setSelectedTruckId(null);
            }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && <span className="ml-2 text-xs bg-slate-800 px-2 py-1 rounded-full">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders List */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold text-slate-200 mb-3 uppercase tracking-wide">
              {tabsConfig.find((t) => t.key === activeTab)?.label}
            </h2>

            {currentOrders.length === 0 ? (
              <p className="text-xs text-slate-500">No orders in this section.</p>
            ) : (
              <div className="space-y-2">
                {currentOrders.map((so) => {
                  const totals = orderTotals(so);
                  return (
                    <button
                      key={so.id}
                      onClick={() => {
                        setSelectedSOId(so.id);
                        setSelectedTruckId(null);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        selectedSOId === so.id
                          ? 'border-indigo-500 bg-indigo-950/40'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-200 truncate">{so.id}</div>
                        <div className="text-xs text-slate-400 truncate">{so.customer}</div>
                        <div className="text-xs text-slate-600">{new Date(so.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-xs text-slate-400">
                          {totals.dispatchedQty}/{totals.qty}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dispatch Details Panel */}
        <div className="lg:col-span-2">
          {selectedSO ? (
            <DispatchOrderPanel
              order={selectedSO}
              verification={soVerification}
              currentUser={currentUser}
              soPickTasks={soPickTasks}
              availablePickers={availablePickers}
              unoccupiedDispatchLines={unoccupiedDispatchLines}
              remainingToAllocate={remainingToAllocate}
              dispatchLine={dispatchLine}
              setDispatchLine={setDispatchLine}
              directDispatchApprovals={directDispatchApprovals}
              plate={plate}
              setPlate={setPlate}
              driverName={driverName}
              setDriverName={setDriverName}
              plateConfirmed={plateConfirmed}
              setPlateConfirmed={setPlateConfirmed}
              handleRegisterVehicle={handleRegisterVehicle}
              availableOnBay={availableOnBay}
              availableInStorage={availableInStorage}
              handleGenerateManifest={handleGenerateManifest}
              activeTrucks={activeTrucksForSelectedSO}
              selectedTruckId={effectiveTruckId}
              setSelectedTruckId={setSelectedTruckId}
            />
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Select an order to plan and manage dispatch</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchOrderPanel({
  order,
  verification,
  currentUser,
  soPickTasks,
  availablePickers,
  unoccupiedDispatchLines,
  remainingToAllocate,
  dispatchLine,
  setDispatchLine,
  plate,
  setPlate,
  driverName,
  setDriverName,
  plateConfirmed,
  setPlateConfirmed,
  handleRegisterVehicle,
  availableOnBay,
  availableInStorage,
  handleGenerateManifest,
  directDispatchApprovals,
  activeTrucks,
  selectedTruckId,
  setSelectedTruckId,
}: any) {
  const pallets = useWarehouseStore((s) => s.pallets);
  const salesOrderReleases = useWarehouseStore((s) => s.salesOrderReleases);
  const selectedTruck = activeTrucks.find((t: any) => t.id === selectedTruckId);
  const totals = orderTotals(order);

  const productionApprovals = directDispatchApprovals.filter(
    (a: any) => a.salesOrderId === order.id && a.source === 'Production' && a.status === 'Approved',
  );

  const hasAnyPickingActivity = soPickTasks.length > 0 || productionApprovals.length > 0;
  const anyLineHasRemaining = order.lines.some((l: SalesOrderLine) => l.qty - l.releasedQty > 0);

  // Three-stage lifecycle for a direct-dispatch pick task: moving (In
  // Progress) → arrived at the loading bay (Staged) → dispatch line scanned
  // (Completed). A task's own 'Completed' status only means "left storage" —
  // it isn't staged until the pallet is physically confirmed at the bay.
  function pickTaskDisplayStatus(t: any) {
    const lineScanned = !!verification?.dispatchLineScannedAt;
    if (t.origin === 'Storage' && t.directDispatch) {
      if (t.status !== 'Completed') return t.status;
      const allArrived = t.items.every((i: any) => pallets.find((p: any) => p.id === i.palletId)?.directDispatchArrivedAt);
      if (!allArrived) return 'In Progress';
      return lineScanned ? 'Completed' : 'Staged';
    }
    if (t.status === 'Completed') return lineScanned ? 'Completed' : 'Staged';
    return t.status;
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Order Summary */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-100">{order.id} · {order.customer}</h3>
        <div className="text-sm text-slate-400">
          <p>
            Products:{' '}
            <span className="text-slate-200 font-medium">
              {order.lines.map((l: SalesOrderLine) => l.productName).join(', ')}
            </span>
          </p>
          <p>Total Order: <span className="text-slate-200 font-medium">{totals.qty.toLocaleString()} units</span></p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400">
          Released: {totals.releasedQty} / {totals.qty} | Dispatched: {totals.dispatchedQty} / {totals.qty}
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500"
            style={{ width: `${Math.min(100, (totals.dispatchedQty / totals.qty) * 100)}%` }}
          />
        </div>
      </div>

      {/* Active vehicles — more than one can be active on this order at
          once (each on its own dispatch line). The selector picks which one
          Steps 3-5 (release/assign/generate) currently target; it only
          needs to appear once there's an actual choice to make. */}
      {activeTrucks.length > 0 && (
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active Vehicle{activeTrucks.length > 1 ? 's' : ''}
          </p>
          {activeTrucks.length === 1 ? (
            <p className="text-sm text-slate-200">
              {activeTrucks[0].plate} — {activeTrucks[0].dispatchLine}
            </p>
          ) : (
            <select
              value={selectedTruckId ?? ''}
              onChange={(e) => setSelectedTruckId(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white"
            >
              {activeTrucks.map((t: any) => (
                <option key={t.id} value={t.id}>{t.plate} — {t.dispatchLine}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* STEP 1: Allocate Dispatch Line. Gated on remainingToAllocate alone,
          not on bucket or on whether a vehicle is already active — another
          truck being active shouldn't block registering one more (the order
          can have several at once), and once everything's been released but
          a second vehicle is still needed to actually dispatch the rest
          (releasedQty reaches qty before dispatchedQty does), the bucket
          becomes 'inProgress', not 'pending', so a bucket check here would
          permanently hide this step with no way to register the next
          vehicle for what's still undispatched. */}
      {remainingToAllocate > 0 && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 1: Allocate Dispatch Line</p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Select Dispatch Line</label>
            {dispatchLine ? (
              <div className="flex items-center justify-between gap-2 w-full rounded bg-emerald-900/30 border border-emerald-500/50 px-3 py-2 text-sm text-emerald-100 font-medium">
                <span>✓ {dispatchLine}</span>
                <button
                  onClick={() => setDispatchLine('')}
                  className="text-xs font-normal text-emerald-300 underline hover:text-emerald-200"
                >
                  Change
                </button>
              </div>
            ) : (
              <select
                value={dispatchLine}
                onChange={(e) => setDispatchLine(e.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white"
              >
                <option value="">Choose a line...</option>
                {unoccupiedDispatchLines.map((line: string) => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* STEP 1.5: Dispatch Line Required Message */}
      {!dispatchLine && soPickTasks.length === 0 && totals.releasedQty === 0 && (
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 mt-4">
          <p className="text-xs text-slate-300 font-medium">Dispatch Line Required</p>
          <p className="text-xs text-slate-400 mt-1">You must allocate a dispatch line in Step 1 before proceeding.</p>
        </div>
      )}

      {/* STEP 2: Register Vehicle (moved here - after dispatch line, before
          release). Not gated on "no other vehicle active" or "no release/
          pick history yet" — another vehicle can be registered at the same
          time as one already active (the order can have several at once),
          or after an earlier one has departed, with plenty of release/pick
          history already behind it either way. */}
      {dispatchLine && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 2: Register Vehicle</p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Vehicle Plate (e.g., KCB-123D)"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white placeholder-slate-400"
            />
            <input
              type="text"
              placeholder="Driver Name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white placeholder-slate-400"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={plateConfirmed}
                onChange={(e) => setPlateConfirmed(e.target.checked)}
              />
              I confirm that the vehicle registration matches the physical vehicle.
            </label>
            <button
              onClick={handleRegisterVehicle}
              disabled={!plate.trim() || !driverName.trim() || !plateConfirmed}
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
            >
              Register Vehicle
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 & 4: Release Quantity + Assign Pickers — per product line.
          Gated on there being *any* active truck, not a specific one — the
          truck a bay/storage picker assignment routes to is whichever one
          is selected above. */}
      {activeTrucks.length > 0 && anyLineHasRemaining && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
            Steps 3 &amp; 4: Release &amp; Assign Pickers — per product
          </p>
          {selectedTruck && (
            <p className="text-xs text-slate-500">
              Assigning for <span className="text-slate-300 font-medium">{selectedTruck.plate} ({selectedTruck.dispatchLine})</span>
            </p>
          )}
          <div className="space-y-3">
            {order.lines.map((line: SalesOrderLine) => (
              <LineReleasePanel
                key={line.id}
                order={order}
                line={line}
                soPickTasks={soPickTasks}
                availablePickers={availablePickers}
                availableOnBay={availableOnBay}
                availableInStorage={availableInStorage}
                directDispatchApprovals={directDispatchApprovals}
                truckId={selectedTruckId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Show dispatch picking progress after release — includes Production Direct */}
      {hasAnyPickingActivity && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1">
          <p className="text-xs font-semibold text-emerald-300 mb-2">Dispatch Picking Progress:</p>
          {soPickTasks.map((task: any) => (
            <p key={task.id} className="text-xs text-emerald-200">
              • {userName(task.assignedPickerId)} — {task.origin}
              {task.directDispatch ? ' (Direct)' : ''} ({pickTaskDisplayStatus(task)})
            </p>
          ))}
          {productionApprovals.map((approval: any) => {
            // Track by the approval id the pallet was tagged with at
            // confirmLoad time, not just SKU+status — regenerating the
            // manifest promotes an arrived pallet from InTransitToTruck to
            // StagedForDispatch, and a SKU+'InTransitToTruck' filter alone
            // loses track of it right at that point, making progress that
            // just advanced (to Staged) look like it reset to "In Progress".
            const productionDirectPallets = pallets.filter(
              (p: any) =>
                p.productionDirectDispatchApprovalId === approval.id &&
                (p.status === 'InTransitToTruck' || p.status === 'StagedForDispatch'),
            );
            const productionArrived = productionDirectPallets.filter(
              (p: any) => p.status === 'StagedForDispatch' || p.directDispatchArrivedAt,
            );
            return (
              <p key={approval.id} className="text-xs text-emerald-200">
                • Production Direct ({approval.sku}) — {productionArrived.length}/{productionDirectPallets.length} pallet(s) arrived at bay
                {' '}({productionDirectPallets.length > 0 && productionArrived.length >= productionDirectPallets.length
                  ? (verification?.dispatchLineScannedAt ? 'Completed' : 'Staged')
                  : 'In Progress'})
              </p>
            );
          })}
        </div>
      )}

      {/* Generate Manifest after release — printable any time, doesn't wait on
          picking, and always available to (re)generate as long as the
          document hasn't started vehicle verification yet — once it has,
          its contents are locked (see store comment). Not gated on "just
          released more" — more pallets can become ready (arrive at the bay,
          finish a pick) without a new release, and the Loader should be able
          to pull those into the manifest just as freely. */}
      {selectedTruck && totals.releasedQty > 0 && (!verification || verification.status === 'AwaitingVerification') && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 5: Generate Dispatch Documents</p>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
            <p className="text-sm text-emerald-300">
              {verification
                ? `✓ Regenerate to pull in anything released or readied for ${selectedTruck.plate} since these documents were generated.`
                : `✓ Products released! Generate dispatch documents for ${selectedTruck.plate} (${selectedTruck.dispatchLine}) to print barcode and manifest.`}
            </p>
          </div>
          <button
            onClick={() => handleGenerateManifest(order.id, selectedTruck.id)}
            className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {verification ? 'Regenerate Documents' : 'Generate Documents'}
          </button>
        </div>
      )}

      {/* Documents Section - Show after vehicle registration */}
      {verification && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">✓ Dispatch Documents</p>
          <PrintSheet title="Dispatch Manifest & Handover" triggerLabel="📋 Print Manifest">
            <DispatchManifest
              verification={{ ...verification, products: verification.latestReleaseProducts }}
              loaderName={currentUser?.name || 'Unknown'}
              vehiclePlate={selectedTruck?.plate || 'Unknown'}
              driverName={selectedTruck?.driverName ?? null}
              subtitle="This release"
            />
          </PrintSheet>
          {/* Optional: everything released for this order so far, not just the
              latest batch — for anyone who wants the full picture at a glance.
              Also breaks each product down by individual release batch, so
              it's clear the order was released in stages rather than all at
              once. */}
          <PrintSheet title="Full Dispatch Manifest" triggerLabel="📋 Print All-Inclusive Manifest">
            <DispatchManifest
              verification={verification}
              loaderName={currentUser?.name || 'Unknown'}
              vehiclePlate={selectedTruck?.plate || 'Unknown'}
              driverName={selectedTruck?.driverName ?? null}
              subtitle="Full order — all releases to date"
              releases={salesOrderReleases.filter((r: any) => r.salesOrderId === order.id)}
            />
          </PrintSheet>
          <PrintSheet title="Vehicle Barcode" triggerLabel="📦 Print Barcode">
            <VehicleBarcodePage
              vehicleBarcode={verification.vehicleBarcode}
              vehiclePlate={selectedTruck?.plate || 'Unknown'}
              salesOrderId={verification.salesOrderId}
              customerName={verification.customer}
              dispatchLine={verification.dispatchLine}
            />
          </PrintSheet>
        </div>
      )}
    </div>
  );
}

function LineReleasePanel({
  order,
  line,
  soPickTasks,
  availablePickers,
  availableOnBay,
  availableInStorage,
  directDispatchApprovals,
  truckId,
}: any) {
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const releaseSalesOrderQuantity = useWarehouseStore((s) => s.releaseSalesOrderQuantity);
  const assignDispatchPickingTasks = useWarehouseStore((s) => s.assignDispatchPickingTasks);
  const assignStorageDirectDispatchTasks = useWarehouseStore((s) => s.assignStorageDirectDispatchTasks);
  const requestDirectDispatchApproval = useWarehouseStore((s) => s.requestDirectDispatchApproval);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [releaseQty, setReleaseQty] = useState('');
  const [pickerRows, setPickerRows] = useState<{ pickerId: string; qty: string }[]>([{ pickerId: '', qty: '' }]);
  const [storagePickerRows, setStoragePickerRows] = useState<{ pickerId: string; qty: string }[]>([]);
  const [directDispatchRequests, setDirectDispatchRequests] = useState<Set<'Storage' | 'Production'>>(new Set());
  const [selectedDirectDispatchSource, setSelectedDirectDispatchSource] = useState<'Storage' | 'Production' | null>(null);
  const [productionPalletCount, setProductionPalletCount] = useState('1');

  const remainingToRelease = line.qty - line.releasedQty;

  if (remainingToRelease <= 0) {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 px-3 py-2 text-xs text-emerald-300">
        ✓ {line.productName} ({line.sku}) — fully released
      </div>
    );
  }

  // Where a given quantity would be picked from, in priority order: bay
  // stock first, then storage, then whatever's left is the Production
  // shortfall. Shared by the "sourcing" guidance, the direct-dispatch
  // checkboxes, and the picker-assignment gate below, so they can't drift
  // apart on the same numbers.
  function computeSourcing(qtyNeeded: number) {
    const bayAvail = availableOnBay(line.sku);
    const storageAvail = availableInStorage(line.sku);
    const fromBay = Math.min(bayAvail, qtyNeeded);
    const afterBay = qtyNeeded - fromBay;
    const fromStorage = Math.min(storageAvail, afterBay);
    const fromProd = afterBay - fromStorage;
    return { bayAvail, storageAvail, fromBay, fromStorage, fromProd };
  }

  function handleAddPickerRow() {
    setPickerRows((rows) => [...rows, { pickerId: '', qty: '' }]);
  }

  function handleRemovePickerRow(index: number) {
    setPickerRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleRemoveStoragePickerRow(index: number) {
    setStoragePickerRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleAssignPickers(): boolean {
    if (!currentUser) return false;

    // Every row that has a picker OR a qty must have both — no half-filled rows
    const incomplete = [...pickerRows, ...storagePickerRows].some(
      (r) => (r.pickerId && !r.qty) || (!r.pickerId && r.qty),
    );
    if (incomplete) {
      pushToast('Enter a quantity for every picker you selected (or remove the empty row)', 'error');
      return false;
    }

    const bayAssignments = pickerRows
      .filter((r) => r.pickerId && r.qty)
      .map((r) => ({ pickerId: r.pickerId, qty: Number(r.qty) }));
    const storageAssignments = storagePickerRows
      .filter((r) => r.pickerId && r.qty)
      .map((r) => ({ pickerId: r.pickerId, qty: Number(r.qty) }));

    const allAssignments = [...bayAssignments, ...storageAssignments];

    // Production Direct Dispatch needs no picker at all — the pallet is
    // pulled straight off the line and routed to dispatch when it's scanned
    // leaving production, with nobody assigned to "pick" it. Only require a
    // picker for whatever this release still needs from bay/storage once
    // that's accounted for.
    const needed = Number(releaseQty) || 0;
    const { fromProd } = computeSourcing(needed);
    const productionCoveredQty = directDispatchRequests.has('Production') ? fromProd : 0;
    const needsPickerAssignment = needed - productionCoveredQty > 0;

    if (allAssignments.length === 0 && needsPickerAssignment) {
      pushToast('Add at least one picker', 'error');
      return false;
    }

    if (allAssignments.length > 0 && !truckId) {
      pushToast('Select which vehicle this is for first', 'error');
      return false;
    }

    // Check for duplicate pickers
    const pickerIds = allAssignments.map((a) => a.pickerId);
    const duplicates = pickerIds.filter((id, idx) => pickerIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      pushToast(
        `Cannot assign the same picker twice. Duplicate: ${USERS.find((u) => u.id === duplicates[0])?.name || duplicates[0]}`,
        'error',
      );
      return false;
    }

    // Validate bay assignments
    if (bayAssignments.length > 0) {
      const totalAssigned = bayAssignments.reduce((sum, a) => sum + a.qty, 0);
      const bayAvailable = availableOnBay(line.sku);
      if (totalAssigned > bayAvailable) {
        pushToast(
          `Cannot assign ${totalAssigned} units — only ${bayAvailable.toLocaleString()} units available in Loading Bay`,
          'error',
        );
        return false;
      }
    }

    // Assign storage pickers (for Storage Direct dispatch)
    if (storageAssignments.length > 0) {
      const storageResult = assignStorageDirectDispatchTasks({
        salesOrderId: order.id,
        lineId: line.id,
        truckId,
        assignments: storageAssignments,
        operatorId: currentUser.id,
      });
      if (!storageResult.ok) {
        pushToast(storageResult.error, 'error');
        return false;
      }
    }

    // Assign bay pickers (for normal dispatch)
    if (bayAssignments.length > 0) {
      const bayResult = assignDispatchPickingTasks({
        salesOrderId: order.id,
        lineId: line.id,
        truckId,
        assignments: bayAssignments,
        operatorId: currentUser.id,
      });
      if (!bayResult.ok) {
        pushToast(bayResult.error, 'error');
        return false;
      }
    }

    pushToast(`Assigned ${allAssignments.length} picker(s)`, 'success');
    setPickerRows([{ pickerId: '', qty: '' }]);
    setStoragePickerRows([]);
    return true;
  }

  function handleRelease() {
    if (!currentUser) return;
    const parsedQty = Number(releaseQty);
    if (!parsedQty || parsedQty > remainingToRelease) {
      pushToast('Enter valid quantity', 'error');
      return;
    }

    const result = releaseSalesOrderQuantity({
      salesOrderId: order.id,
      lineId: line.id,
      qty: parsedQty,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    // Auto-trigger direct dispatch requests for selected sources
    if (directDispatchRequests.has('Storage')) {
      requestDirectDispatchApproval(order.id, line.id, currentUser.id, 'Storage');
    }
    if (directDispatchRequests.has('Production')) {
      const palletCount = Math.max(1, Number(productionPalletCount) || 1);
      requestDirectDispatchApproval(order.id, line.id, currentUser.id, 'Production', palletCount);
    }

    pushToast(`Released ${parsedQty} units of ${line.productName} for ${order.id}`, 'success');
    setReleaseQty('');
    setDirectDispatchRequests(new Set());
    setProductionPalletCount('1');
  }

  const lineApproval = directDispatchApprovals.find(
    (a: any) => a.salesOrderId === order.id && a.lineId === line.id && a.status === 'Approved',
  );

  return (
    <div className="rounded-lg border border-slate-700 p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-200">
        {line.productName} ({line.sku}) — {remainingToRelease.toLocaleString()} remaining to release
      </p>

      {/* Pickers will source from - guidance shown before AND after entering quantity */}
      {(() => {
        const needed = releaseQty ? Number(releaseQty) : remainingToRelease;
        const { bayAvail, storageAvail, fromBay, fromStorage, fromProd } = computeSourcing(needed);
        return (
          <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
            <p className="font-semibold mb-1">Pickers will source from:</p>
            <p>• Loading Bay: {bayAvail.toLocaleString()} units available</p>
            <p>• Storage: {storageAvail.toLocaleString()} units available</p>
            {releaseQty && (
              <p className="text-slate-200 font-medium mt-1">
                For {needed.toLocaleString()} units: {fromBay.toLocaleString()} from Bay
                {fromStorage > 0 && `, ${fromStorage.toLocaleString()} from Storage`}
                {fromProd > 0 && `, ${fromProd.toLocaleString()} from Production`}
              </p>
            )}
          </div>
        );
      })()}

      {/* Release Quantity Input */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-300">Quantity to Release (max: {remainingToRelease})</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={releaseQty}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            if (val === '' || Number(val) <= remainingToRelease) {
              setReleaseQty(val);
            }
          }}
          className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
          placeholder="Enter quantity"
        />
      </div>

      {/* Request Direct Dispatch - only when the release qty exceeds what's on the bay */}
      {releaseQty && (() => {
        const needed = Number(releaseQty);
        const { bayAvail, fromBay, fromStorage, fromProd } = computeSourcing(needed);
        const shortfall = needed - fromBay;
        if (shortfall <= 0) return null;

        return (
          <div className="rounded-lg border border-green-800/50 bg-green-900/20 p-3 space-y-3">
            <p className="text-xs font-semibold text-green-300">Direct Dispatch Requests</p>

            <div className="space-y-1.5">
              <p className="text-xs text-green-100">
                Bay has {bayAvail.toLocaleString()} units. Need {shortfall.toLocaleString()} more
                {fromStorage > 0 ? ' from Storage' : ''} — assign pickers below.
              </p>
              {fromStorage > 0 && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={directDispatchRequests.has('Storage')}
                    onChange={() => {
                      const newSet = new Set(directDispatchRequests);
                      if (newSet.has('Storage')) {
                        newSet.delete('Storage');
                        if (selectedDirectDispatchSource === 'Storage') {
                          setSelectedDirectDispatchSource(null);
                        }
                        setStoragePickerRows([]);
                      } else {
                        newSet.add('Storage');
                        setSelectedDirectDispatchSource('Storage');
                        if (storagePickerRows.length === 0) {
                          setStoragePickerRows([{ pickerId: '', qty: '' }]);
                        }
                      }
                      setDirectDispatchRequests(newSet);
                    }}
                    className="rounded"
                  />
                  Request {fromStorage.toLocaleString()} from Storage
                </label>
              )}
            </div>

            {fromProd > 0 && (
              <div className="space-y-1.5 border-t border-green-800/40 pt-2">
                <p className="text-xs text-green-100">
                  {fromStorage > 0
                    ? `Storage provides ${fromStorage.toLocaleString()}, need ${fromProd.toLocaleString()} from Production.`
                    : `Storage is empty — need ${fromProd.toLocaleString()} from Production.`}
                </p>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={directDispatchRequests.has('Production')}
                    onChange={() => {
                      const newSet = new Set(directDispatchRequests);
                      if (newSet.has('Production')) {
                        newSet.delete('Production');
                        if (selectedDirectDispatchSource === 'Production') {
                          setSelectedDirectDispatchSource(null);
                        }
                      } else {
                        newSet.add('Production');
                        setSelectedDirectDispatchSource('Production');
                      }
                      setDirectDispatchRequests(newSet);
                    }}
                    className="rounded"
                  />
                  Request {fromProd.toLocaleString()} from Production
                </label>
                {directDispatchRequests.has('Production') && (
                  <div className="flex items-center gap-2 pl-6">
                    <label className="text-xs text-slate-400" htmlFor={`production-pallet-count-${line.id}`}>
                      Pallets to divert
                    </label>
                    <input
                      id={`production-pallet-count-${line.id}`}
                      type="number"
                      min={1}
                      step={1}
                      value={productionPalletCount}
                      onChange={(e) => setProductionPalletCount(e.target.value)}
                      className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Direct Dispatch Status - After release */}
      {lineApproval && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
          <p className="text-xs font-semibold text-emerald-300 mb-2">✓ Direct Dispatch Approved</p>
          <p className="text-xs text-emerald-100">
            {lineApproval.source} direct dispatch: {lineApproval.shortfallQty} units
            {lineApproval.source === 'Production' && lineApproval.palletsRemaining != null
              ? ` (${lineApproval.palletsRemaining} pallet${lineApproval.palletsRemaining === 1 ? '' : 's'} remaining)`
              : ''}
          </p>
        </div>
      )}

      {/* Assign Pickers Based on Released Quantity */}
      {releaseQty && (
        <div className="space-y-2">
          {/* Storage Pickers Section - if Storage is checked */}
          {directDispatchRequests.has('Storage') && (
            <div className="rounded-lg bg-green-900/20 border border-green-800/50 p-3 space-y-2">
              <label className="block text-xs font-medium text-green-200">Storage Pickers for Direct Dispatch</label>
              {storagePickerRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={row.pickerId}
                    onChange={(e) => {
                      const newRows = [...storagePickerRows];
                      newRows[i].pickerId = e.target.value;
                      setStoragePickerRows(newRows);
                    }}
                    className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white"
                  >
                    <option value="">Select storage picker...</option>
                    {USERS.filter((u) => u.role === 'Picker' && getPickerType(u.id) === 'storage').filter((u) => {
                      const hasOngoingTask = soPickTasks.some((t: any) => t.assignedPickerId === u.id && t.status === 'Accepted');
                      return !hasOngoingTask;
                    }).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val === '' || Number(val) <= Number(releaseQty)) {
                        const newRows = [...storagePickerRows];
                        newRows[i].qty = val;
                        setStoragePickerRows(newRows);
                      }
                    }}
                    placeholder="Qty"
                    className="w-20 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                  />
                  {storagePickerRows.length > 1 && (
                    <button
                      onClick={() => handleRemoveStoragePickerRow(i)}
                      className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setStoragePickerRows([...storagePickerRows, { pickerId: '', qty: '' }])}
                className="w-full rounded border border-slate-600 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                + Add Storage Picker
              </button>
            </div>
          )}

          {/* Loading Bay Pickers Section — only shown when the bay actually
              has something to assign. With 0 units on the bay there's
              nothing for a bay picker to move, so presenting this section
              anyway just leads to a dead end: picking a name forces a
              quantity, and the only valid quantity (0) is rejected by the
              bay-availability check below. */}
          {availableOnBay(line.sku) > 0 && (
            <>
              <label className="block text-xs font-medium text-slate-300">
                Assign Pickers — {Math.min(availableOnBay(line.sku), Number(releaseQty)).toLocaleString()} units available on the bay
              </label>
              {pickerRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={row.pickerId}
                    onChange={(e) => {
                      const newRows = [...pickerRows];
                      newRows[i].pickerId = e.target.value;
                      setPickerRows(newRows);
                    }}
                    className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white"
                  >
                    <option value="">Select picker...</option>
                    {availablePickers.filter((p: any) => getPickerType(p.id) !== 'storage').map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val === '' || Number(val) <= Number(releaseQty)) {
                        const newRows = [...pickerRows];
                        newRows[i].qty = val;
                        setPickerRows(newRows);
                      }
                    }}
                    placeholder="Qty"
                    className="w-20 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                  />
                  {pickerRows.length > 1 && (
                    <button
                      onClick={() => handleRemovePickerRow(i)}
                      className="rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddPickerRow}
                className="w-full rounded border border-slate-600 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                + Add Picker
              </button>
            </>
          )}

          {/* Release Button - Assigns tasks & pickers get notified */}
          <button
            onClick={() => {
              if (handleAssignPickers()) {
                handleRelease();
              }
            }}
            className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Release {releaseQty} Units & Notify Pickers
          </button>
        </div>
      )}
    </div>
  );
}
