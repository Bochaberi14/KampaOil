import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { PrintSheet } from '../components/PrintSheet';
import { DispatchManifest } from '../components/DispatchManifest';
import { VehicleBarcodePage } from '../components/VehicleBarcodePage';
import { filterPickersByType } from '../rbac';
import { USERS } from '../data/seed';
import { calculateSmartDispatchSuggestion, formatDispatchSuggestion } from '../utils/dispatchUtils';
import type { SalesOrder } from '../types/domain';

type OrderTab = 'new' | 'pending' | 'inProgress' | 'completed';

function orderBucket(so: SalesOrder): OrderTab {
  if (so.dispatchedQty >= so.qty) return 'completed';
  if (so.releasedQty === 0) return 'new';
  if (so.releasedQty < so.qty) return 'pending';
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
  const releaseSalesOrderQuantity = useWarehouseStore((s) => s.releaseSalesOrderQuantity);
  const assignDispatchPickingTasks = useWarehouseStore((s) => s.assignDispatchPickingTasks);
  const registerVehicleForSalesOrder = useWarehouseStore((s) => s.registerVehicleForSalesOrder);
  const generateManifestForPickingComplete = useWarehouseStore((s) => s.generateManifestForPickingComplete);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const availableInStorage = useWarehouseStore((s) => s.availableInStorage);
  const availableInProduction = useWarehouseStore((s) => s.availableInProduction);

  const [activeTab, setActiveTab] = useState<OrderTab>('new');
  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchLine, setDispatchLine] = useState('');
  const [releaseQty, setReleaseQty] = useState('');
  const [pickerRows, setPickerRows] = useState<{ pickerId: string; qty: string }[]>([{ pickerId: '', qty: '' }]);
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  const [lastRelease, setLastRelease] = useState<{ soId: string; qty: number } | null>(null);
  const [showGenerateButton, setShowGenerateButton] = useState<string | null>(null);

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;
  const soVerification = selectedSO ? dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id) : undefined;

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
  const remainingToRelease = selectedSO ? selectedSO.qty - selectedSO.releasedQty : 0;

  // Only Loading Bay Pickers can be assigned for dispatch picking
  const allDispatchPickers = USERS.filter((u) => u.role === 'Picker' && u.department === 'Oil & Refinery');
  const loadingBayPickers = filterPickersByType(allDispatchPickers, 'loading-bay');
  const availablePickers = loadingBayPickers.filter((u) => {
    const hasOngoingTask = pickTasks.some((t) => t.assignedPickerId === u.id && t.status === 'Accepted');
    return !hasOngoingTask;
  });

  const trucks = useWarehouseStore((s) => s.trucks);
  const occupiedDispatchLines = new Set(trucks.map((t) => t.dispatchLine));
  const unoccupiedDispatchLines = ['LINE 001', 'LINE 002', 'LINE 003'].filter(
    (line) => !occupiedDispatchLines.has(line)
  );
  const remainingToAllocate = selectedSO ? selectedSO.qty - selectedSO.dispatchedQty : 0;



  function handleRelease() {
    if (!selectedSO || !currentUser) return;
    const parsedQty = Number(releaseQty);
    if (!parsedQty || parsedQty > remainingToRelease) {
      pushToast('Enter valid quantity', 'error');
      return;
    }
    const result = releaseSalesOrderQuantity({
      salesOrderId: selectedSO.id,
      qty: parsedQty,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Released ${parsedQty} units for ${selectedSO.id}`, 'success');
    setLastRelease({ soId: selectedSO.id, qty: parsedQty });
    setShowGenerateButton(selectedSO.id);
    setReleaseQty('');
  }

  function handleAddPickerRow() {
    setPickerRows((rows) => [...rows, { pickerId: '', qty: '' }]);
  }

  function handleRemovePickerRow(index: number) {
    setPickerRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleAssignPickers() {
    if (!selectedSO || !currentUser) return;
    const assignments = pickerRows
      .filter((r) => r.pickerId && r.qty)
      .map((r) => ({ pickerId: r.pickerId, qty: Number(r.qty) }));
    if (assignments.length === 0) {
      pushToast('Add at least one picker and quantity', 'error');
      return;
    }

    // Check for duplicate pickers
    const pickerIds = assignments.map((a) => a.pickerId);
    const duplicates = pickerIds.filter((id, idx) => pickerIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      pushToast(
        `Cannot assign the same picker twice. Duplicate: ${USERS.find((u) => u.id === duplicates[0])?.name || duplicates[0]}`,
        'error',
      );
      return;
    }

    // Validate total assigned quantity doesn't exceed what's actually available in the Bay
    const totalAssigned = assignments.reduce((sum, a) => sum + a.qty, 0);
    const bayAvailable = availableOnBay(selectedSO.sku);
    if (totalAssigned > bayAvailable) {
      pushToast(
        `Cannot assign ${totalAssigned} units — only ${bayAvailable.toLocaleString()} units available in Loading Bay`,
        'error',
      );
      return;
    }

    const result = assignDispatchPickingTasks({
      salesOrderId: selectedSO.id,
      assignments,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Assigned ${assignments.length} picker(s) for dispatch picking`, 'success');
    setPickerRows([{ pickerId: '', qty: '' }]);
  }

  function handleRegisterVehicle() {
    if (!selectedSO || !currentUser) return;
    if (!plate.trim() || !driverName.trim()) {
      pushToast('Enter plate and driver name', 'error');
      return;
    }
    const result = registerVehicleForSalesOrder({
      salesOrderId: selectedSO.id,
      plate,
      driverName,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast('Vehicle registered', 'success');
    setPlate('');
    setDriverName('');
  }


  function handleGenerateManifest(soId: string) {
    if (!currentUser) return;
    const result = generateManifestForPickingComplete({
      salesOrderId: soId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
    } else {
      pushToast('✓ Dispatch documents generated — ready to print', 'success');
      setShowGenerateButton(null);
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
                {currentOrders.map((so) => (
                  <button
                    key={so.id}
                    onClick={() => setSelectedSOId(so.id)}
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
                        {so.dispatchedQty}/{so.qty}
                      </div>
                    </div>
                  </button>
                ))}
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
              remainingToRelease={remainingToRelease}
              releaseQty={releaseQty}
              setReleaseQty={setReleaseQty}
              handleRelease={handleRelease}
              pickerRows={pickerRows}
              setPickerRows={setPickerRows}
              handleAddPickerRow={handleAddPickerRow}
              handleRemovePickerRow={handleRemovePickerRow}
              handleAssignPickers={handleAssignPickers}
              plate={plate}
              setPlate={setPlate}
              driverName={driverName}
              setDriverName={setDriverName}
              plateConfirmed={plateConfirmed}
              setPlateConfirmed={setPlateConfirmed}
              handleRegisterVehicle={handleRegisterVehicle}
              availableOnBay={availableOnBay}
              availableInStorage={availableInStorage}
              availableInProduction={availableInProduction}
              lastRelease={lastRelease}
              handleGenerateManifest={handleGenerateManifest}
              showGenerateButton={showGenerateButton}
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
  remainingToRelease,
  releaseQty,
  setReleaseQty,
  handleRelease,
  pickerRows,
  setPickerRows,
  handleAddPickerRow,
  handleRemovePickerRow,
  handleAssignPickers,
  plate,
  setPlate,
  driverName,
  setDriverName,
  plateConfirmed,
  setPlateConfirmed,
  handleRegisterVehicle,
  availableOnBay,
  availableInStorage,
  availableInProduction,
  handleGenerateManifest,
  showGenerateButton,
}: any) {
  const trucks = useWarehouseStore((s) => s.trucks);
  const assignedTruck = order.assignedTruckId ? trucks.find((t) => t.id === order.assignedTruckId) : undefined;
  const bucket = orderBucket(order);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Order Summary */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-100">{order.id} · {order.customer}</h3>
        <div className="text-sm text-slate-400">
          <p>Product: <span className="text-slate-200 font-medium">{order.productName}</span></p>
          <p>Total Order: <span className="text-slate-200 font-medium">{order.qty.toLocaleString()} units</span></p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400">
          Released: {order.releasedQty} / {order.qty} | Dispatched: {order.dispatchedQty} / {order.qty}
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500"
            style={{ width: `${Math.min(100, (order.dispatchedQty / order.qty) * 100)}%` }}
          />
        </div>
      </div>

      {/* STEP 1: Allocate Dispatch Line (for new & pending orders) */}
      {(bucket === 'new' || bucket === 'pending') && remainingToAllocate > 0 && !assignedTruck && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 1: Allocate Dispatch Line</p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Select Dispatch Line</label>
            {dispatchLine ? (
              <div className="w-full rounded bg-emerald-900/30 border border-emerald-500/50 px-3 py-2 text-sm text-emerald-100 font-medium">
                ✓ {dispatchLine}
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
      {!dispatchLine && soPickTasks.length === 0 && order.releasedQty === 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 mt-4">
          <p className="text-xs text-amber-300 font-medium">⚠ Dispatch Line Required</p>
          <p className="text-xs text-amber-200 mt-1">You must allocate a dispatch line in Step 1 before proceeding.</p>
        </div>
      )}

      {/* STEP 2: Register Vehicle (moved here - after dispatch line, before release) */}
      {dispatchLine && !assignedTruck && soPickTasks.length === 0 && order.releasedQty === 0 && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Step 2: Register Vehicle</p>
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
              className="w-full rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-orange-700"
            >
              Register Vehicle
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 & 4: Release Quantity + Assign Pickers (BUNDLED) */}
      {(dispatchLine || assignedTruck?.dispatchLine) && assignedTruck && remainingToRelease > 0 && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Steps 3 & 4: Release Quantity + Assign Pickers</p>

          {/* Stock Availability Display */}
          {order.sku && (
            (() => {
              const bayAvail = availableOnBay(order.sku);
              const storageAvail = availableInStorage(order.sku);
              const prodAvail = availableInProduction(order.sku);
              const suggestion = calculateSmartDispatchSuggestion(
                order.sku,
                remainingToRelease,
                bayAvail,
                storageAvail,
                prodAvail
              );
              const formatted = formatDispatchSuggestion(suggestion);
              return (
                <div className={`rounded-lg p-3 ${formatted.isShortfall ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                  <p className={`text-xs font-semibold mb-2 ${formatted.isShortfall ? 'text-amber-300' : 'text-emerald-300'}`}>
                    Stock Availability
                  </p>
                  {formatted.lines.map((line, idx) => (
                    <p key={idx} className={`text-xs font-mono ${formatted.isShortfall ? 'text-amber-200' : 'text-emerald-200'}`}>
                      {line}
                    </p>
                  ))}
                </div>
              );
            })()
          )}


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

          {/* Assign Pickers Based on Released Quantity */}
          {releaseQty && (
            <div className="space-y-2">
              {/* Storage Source Context */}
              {order.sku && (
                (() => {
                  const bayAvail = availableOnBay(order.sku);
                  const storageAvail = availableInStorage(order.sku);
                  const needed = Number(releaseQty);
                  let fromBay = Math.min(bayAvail, needed);
                  let remaining = needed - fromBay;
                  let fromStorage = Math.min(storageAvail, remaining);
                  remaining -= fromStorage;
                  const fromProd = remaining;

                  return (
                    <div className="rounded-lg bg-slate-800/60 p-2 text-xs text-slate-300">
                      <p className="font-semibold mb-1">Pickers will source from:</p>
                      {fromBay > 0 && <p>• Loading Bay: {fromBay.toLocaleString()} units</p>}
                      {fromStorage > 0 && <p>• Storage: {fromStorage.toLocaleString()} units</p>}
                      {fromProd > 0 && <p>• Production: {fromProd.toLocaleString()} units</p>}
                    </div>
                  );
                })()
              )}

              <label className="block text-xs font-medium text-slate-300">Assign Pickers for {releaseQty} units</label>
              {pickerRows.map((row: any, i: number) => (
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
                    {availablePickers.map((p: any) => (
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

              {/* Release Button - Assigns tasks & pickers get notified */}
              <button
                onClick={() => {
                  handleAssignPickers();
                  setTimeout(() => handleRelease(), 300);
                }}
                className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Release {releaseQty} Units & Notify Pickers
              </button>
            </div>
          )}
        </div>
      )}

      {/* Show assigned pickers after release */}
      {soPickTasks.length > 0 && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
          <p className="text-xs font-semibold text-emerald-300 mb-2">✓ Pickers Assigned & Notified:</p>
          {soPickTasks.map((task: any) => (
            <p key={task.id} className="text-xs text-emerald-200">
              • {userName(task.assignedPickerId)} ({task.status})
            </p>
          ))}
        </div>
      )}

      {/* Generate Manifest after release */}
      {assignedTruck && showGenerateButton === order.id && !verification && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 5: Generate Dispatch Documents</p>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
            <p className="text-sm text-emerald-300">✓ Products released and pickers assigned! Generate dispatch documents to print barcode and manifest.</p>
          </div>
          <button
            onClick={() => handleGenerateManifest(order.id)}
            className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate Documents
          </button>
        </div>
      )}



      {/* Documents Section - Show after vehicle registration */}
      {verification && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">✓ Dispatch Documents</p>
          <PrintSheet title="Dispatch Manifest & Handover" triggerLabel="📋 Print Manifest">
            <DispatchManifest
              verification={verification}
              loaderName={currentUser?.name || 'Unknown'}
            />
          </PrintSheet>
          <PrintSheet title="Vehicle Barcode" triggerLabel="📦 Print Barcode">
            <VehicleBarcodePage
              vehicleBarcode={verification.vehicleBarcode}
              vehiclePlate={assignedTruck?.plate || 'Unknown'}
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
