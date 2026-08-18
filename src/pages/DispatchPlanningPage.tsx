import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { PrintSheet } from '../components/PrintSheet';
import { DispatchManifest } from '../components/DispatchManifest';
import { VehicleBarcodePage } from '../components/VehicleBarcodePage';
import { HandoverVerificationDocument } from '../components/HandoverVerificationDocument';
import { USERS } from '../data/seed';
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
  const assignPickTaskToPickers = useWarehouseStore((s) => s.assignPickTaskToPickers);
  const registerVehicleForSalesOrder = useWarehouseStore((s) => s.registerVehicleForSalesOrder);
  const verifyDispatchVehicle = useWarehouseStore((s) => s.verifyDispatchVehicle);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<OrderTab>('new');
  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [dispatchLine, setDispatchLine] = useState('');
  const [releaseQty, setReleaseQty] = useState('');
  const [pickerRows, setPickerRows] = useState<{ pickerId: string; qty: string }[]>([{ pickerId: '', qty: '' }]);
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleBarcode, setVehicleBarcode] = useState('');

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
  const availablePickers = USERS.filter((u) => {
    if (u.role !== 'Picker') return false;
    if (u.department !== 'Oil & Refinery') return false;
    const hasOngoingTask = pickTasks.some((t) => t.assignedPickerId === u.id && t.status === 'Accepted');
    return !hasOngoingTask;
  });

  const trucks = useWarehouseStore((s) => s.trucks);
  const occupiedDispatchLines = new Set(trucks.map((t) => t.dispatchLine));
  const unoccupiedDispatchLines = ['LINE 001', 'LINE 002', 'LINE 003'].filter(
    (line) => !occupiedDispatchLines.has(line)
  );
  const remainingToAllocate = selectedSO ? selectedSO.qty - selectedSO.dispatchedQty : 0;

  function handleAllocate() {
    if (!selectedSO || !dispatchLine) {
      pushToast('Select a dispatch line', 'error');
      return;
    }
    pushToast(`Dispatch line ${dispatchLine} allocated for ${selectedSO.id}`, 'success');
  }

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

    const result = assignPickTaskToPickers({
      salesOrderId: selectedSO.id,
      assignments,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Assigned ${assignments.length} picker(s) to ${selectedSO.id}`, 'success');
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

  function handleVerifyVehicle() {
    if (!soVerification || !currentUser || !vehicleBarcode.trim()) {
      pushToast('Scan vehicle barcode', 'error');
      return;
    }
    const result = verifyDispatchVehicle({
      verificationId: soVerification.id,
      vehicleBarcode,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast('Vehicle verified successfully', 'success');
    setVehicleBarcode('');
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
              handleAllocate={handleAllocate}
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
              handleRegisterVehicle={handleRegisterVehicle}
              vehicleBarcode={vehicleBarcode}
              setVehicleBarcode={setVehicleBarcode}
              handleVerifyVehicle={handleVerifyVehicle}
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
  handleAllocate,
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
  handleRegisterVehicle,
  vehicleBarcode,
  setVehicleBarcode,
  handleVerifyVehicle,
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

      {/* STEP 1: Allocate Dispatch Line */}
      {bucket === 'new' && remainingToAllocate > 0 && unoccupiedDispatchLines.length > 0 && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Step 1: Allocate Dispatch Line</p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Select Dispatch Line</label>
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
            <button
              onClick={handleAllocate}
              disabled={!dispatchLine}
              className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700"
            >
              Allocate {dispatchLine || 'Selected Line'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 & 3: Release Quantity + Assign Pickers (BUNDLED) */}
      {dispatchLine && soPickTasks.length === 0 && order.releasedQty === 0 && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Steps 2 & 3: Release Quantity + Assign Pickers</p>

          {/* Release Quantity Input */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Quantity to Release (max: {remainingToRelease})</label>
            <input
              type="number"
              min="1"
              max={remainingToRelease}
              value={releaseQty}
              onChange={(e) => setReleaseQty(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white"
            />
          </div>

          {/* Assign Pickers Based on Released Quantity */}
          {releaseQty && (
            <div className="space-y-2">
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
                    type="number"
                    min="1"
                    max={Number(releaseQty)}
                    value={row.qty}
                    onChange={(e) => {
                      const newRows = [...pickerRows];
                      newRows[i].qty = e.target.value;
                      setPickerRows(newRows);
                    }}
                    placeholder="Qty"
                    className="w-20 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white"
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

      {/* STEP 4: Register Vehicle */}
      {order.releasedQty > 0 && !assignedTruck && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Step 4: Register Vehicle</p>
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
            <button
              onClick={handleRegisterVehicle}
              disabled={!plate.trim() || !driverName.trim()}
              className="w-full rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-orange-700"
            >
              Register Vehicle
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Verify Vehicle */}
      {assignedTruck && !verification && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Step 5: Verify Vehicle</p>
          <div className="bg-slate-800 rounded p-2 text-xs text-slate-300">
            <p>Vehicle: <span className="text-slate-100 font-medium">{assignedTruck.plate}</span></p>
            <p>Driver: <span className="text-slate-100 font-medium">{assignedTruck.driverName}</span></p>
          </div>
          <input
            type="text"
            placeholder="Scan vehicle barcode..."
            value={vehicleBarcode}
            onChange={(e) => setVehicleBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleVerifyVehicle()}
            className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white placeholder-slate-400"
            autoFocus
          />
          <button
            onClick={handleVerifyVehicle}
            disabled={!vehicleBarcode.trim()}
            className="w-full rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-orange-700"
          >
            Verify & Generate Documents
          </button>
        </div>
      )}

      {/* Documents Section */}
      {verification?.status === 'Verified' && (
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">✓ Dispatch Documents</p>
          <PrintSheet title="Dispatch Manifest" triggerLabel="📋 Print Manifest">
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
          <PrintSheet title="Handover Verification" triggerLabel="✍️ Print Handover">
            <HandoverVerificationDocument
              verification={verification}
              loaderName={currentUser?.name || 'Unknown'}
            />
          </PrintSheet>
        </div>
      )}
    </div>
  );
}
