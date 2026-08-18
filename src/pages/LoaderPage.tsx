import { useState, useEffect } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { StatusPill } from '../components/StatusPill';
import { PrintSheet } from '../components/PrintSheet';
import { Barcode } from '../components/Barcode';
import { ScanInput } from '../components/ScanInput';
import { DispatchManifest } from '../components/DispatchManifest';
import { VehicleBarcodePage } from '../components/VehicleBarcodePage';
import { USERS } from '../data/seed';
import type { SalesOrder } from '../types/domain';

type Bucket = 'New' | 'Pending' | 'InProgress' | 'Completed';

const BUCKETS: { key: Bucket; title: string; hint: string }[] = [
  { key: 'New', title: 'New orders', hint: 'Not yet released — nothing can be picked until you release some quantity.' },
  { key: 'Pending', title: 'Pending orders', hint: 'Partially released — the rest stays here until you release more, even across days.' },
  { key: 'InProgress', title: 'In progress', hint: 'Fully released, still moving through picking, the bay, and dispatch.' },
  { key: 'Completed', title: 'Completed', hint: 'Fully dispatched.' },
];

function bucketOf(so: SalesOrder): Bucket {
  if (so.dispatchedQty >= so.qty) return 'Completed';
  if (so.releasedQty === 0) return 'New';
  if (so.releasedQty < so.qty) return 'Pending';
  return 'InProgress';
}

function userName(userId: string): string {
  return USERS.find((u) => u.id === userId)?.name ?? userId;
}

export function LoaderPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const salesOrderReleases = useWarehouseStore((s) => s.salesOrderReleases);
  const trucks = useWarehouseStore((s) => s.trucks);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const pallets = useWarehouseStore((s) => s.pallets);
  const loads = useWarehouseStore((s) => s.loads);
  const dispatchAllocations = useWarehouseStore((s) => s.dispatchAllocations);
  const dispatchVerifications = useWarehouseStore((s) => s.dispatchVerifications);
  const releaseSalesOrderQuantity = useWarehouseStore((s) => s.releaseSalesOrderQuantity);
  const assignPickTaskToPickers = useWarehouseStore((s) => s.assignPickTaskToPickers);
  const planDispatchAllocation = useWarehouseStore((s) => s.planDispatchAllocation);
  const generateManifestForPickingComplete = useWarehouseStore((s) => s.generateManifestForPickingComplete);
  const registerVehicleForSalesOrder = useWarehouseStore((s) => s.registerVehicleForSalesOrder);
  const verifyDispatchVehicle = useWarehouseStore((s) => s.verifyDispatchVehicle);
  const signDispatchVerification = useWarehouseStore((s) => s.signDispatchVerification);
  const requestDirectDispatchApproval = useWarehouseStore((s) => s.requestDirectDispatchApproval);
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [releaseQty, setReleaseQty] = useState('');
  const [truckId, setTruckId] = useState('');
  const [allocQty, setAllocQty] = useState('');
  const [dispatchLine, setDispatchLine] = useState('');
  const [pickerRows, setPickerRows] = useState<{ pickerId: string; qty: string }[]>([{ pickerId: '', qty: '' }]);
  const [receiptRef, setReceiptRef] = useState('');
  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  const [signForm, setSignForm] = useState({ driverName: '', loaderConfirmed: false, driverConfirmed: false });
  const [shouldAutoPrint, setShouldAutoPrint] = useState(false);

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;

  const releases = selectedSO
    ? salesOrderReleases
        .filter((r) => r.salesOrderId === selectedSO.id)
        .slice()
        .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
    : [];

  const remainingToRelease = selectedSO ? selectedSO.qty - selectedSO.releasedQty : 0;

  // Order-level progress — the only numbers that are honestly derivable from
  // today's data. Per-vehicle "picked" isn't, since a pallet isn't earmarked
  // to a specific truck until the final dispatch scan — see the plan notes.
  const items = selectedSO
    ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id).flatMap((t) => t.items)
    : [];
  const inTransitQty = items.reduce((sum, i) => {
    const p = pallets.find((p) => p.id === i.palletId);
    return p?.status === 'InTransitToBay' || p?.status === 'InTransitToTruck' ? sum + i.quantity : sum;
  }, 0);
  const onBayQty = items.reduce((sum, i) => {
    const p = pallets.find((p) => p.id === i.palletId);
    return p?.status === 'OnBay' ? sum + i.quantity : sum;
  }, 0);

  const allocations = selectedSO
    ? dispatchAllocations.filter((a) => a.salesOrderId === selectedSO.id)
    : [];
  const plannedSoFar = allocations.reduce((sum, a) => sum + a.plannedQty, 0);
  const remainingToPlan = selectedSO ? selectedSO.releasedQty - selectedSO.dispatchedQty - plannedSoFar : 0;

  const availableTrucks = trucks.filter(
    (t) => !t.salesOrderId || (selectedSO && t.salesOrderId === selectedSO.id),
  );

  const assignedTruck = selectedSO ? trucks.find((t) => t.id === selectedSO.assignedTruckId) : undefined;

  // Get only unoccupied dispatch lines (not already assigned to a truck)
  const occupiedDispatchLines = new Set(trucks.map((t) => t.dispatchLine));
  const unoccupiedDispatchLines = ['LINE 001', 'LINE 002', 'LINE 003'].filter(
    (line) => !occupiedDispatchLines.has(line)
  );

  const soVerification = selectedSO
    ? dispatchVerifications.find((v) => v.salesOrderId === selectedSO.id)
    : undefined;

  // Auto-print manifest and barcode after vehicle verification
  useEffect(() => {
    if (soVerification && soVerification.status === 'VehicleVerified' && shouldAutoPrint) {
      // Trigger print dialogs
      setTimeout(() => {
        window.print();
      }, 500);
      setShouldAutoPrint(false);
    }
  }, [soVerification, shouldAutoPrint]);

  const soPickTasks = selectedSO ? pickTasks.filter((t) => t.salesOrderId === selectedSO.id) : [];
  // Mirrors the same "already committed" ceiling assignPickTaskToPickers
  // itself enforces — released-but-not-yet-assigned-and-in-storage.
  const committedQty = soPickTasks
    .filter((t) => t.origin === 'Storage')
    .flatMap((t) => t.items)
    .reduce((sum, i) => {
      const load = loads.find((l) => l.palletId === i.palletId);
      return load && load.status === 'InStorage' ? sum + i.quantity : sum;
    }, 0);
  const remainingToAssign = selectedSO ? selectedSO.releasedQty - selectedSO.dispatchedQty - committedQty : 0;
  // Only Oil & Refinery pickers
  const pickerUsers = USERS.filter((u) => u.role === 'Picker' && u.department === 'Oil & Refinery');

  // Only show pickers with no ongoing Accepted tasks
  const availablePickers = pickerUsers.filter((picker) => {
    const hasOngoingTask = pickTasks.some((t) => t.assignedPickerId === picker.id && t.status === 'Accepted');
    return !hasOngoingTask;
  });

  function handlePickerRowChange(index: number, field: 'pickerId' | 'qty', value: string) {
    setPickerRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
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
    const result = assignPickTaskToPickers({
      salesOrderId: selectedSO.id,
      assignments,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setPickerRows([{ pickerId: '', qty: '' }]);
  }

  function handleRelease() {
    if (!selectedSO || !currentUser) return;
    const parsedQty = Number(releaseQty);
    const result = releaseSalesOrderQuantity({
      salesOrderId: selectedSO.id,
      qty: parsedQty,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setReleaseQty('');
  }

  function handlePlan() {
    if (!selectedSO || !currentUser || !truckId || !dispatchLine) return;
    const parsedQty = Number(allocQty);
    const result = planDispatchAllocation({
      salesOrderId: selectedSO.id,
      truckId,
      qty: parsedQty,
      dispatchLine,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setTruckId('');
    setAllocQty('');
    setDispatchLine('');
  }

  function handleRegisterVehicle() {
    if (!selectedSO || !currentUser) return;
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
    setPlate('');
    setDriverName('');
    setPlateConfirmed(false);
    setReceiptRef('');
  }

  function handleVerifyVehicle(vehicleBarcode: string) {
    if (!soVerification || !currentUser) return;
    const result = verifyDispatchVehicle({
      verificationId: soVerification.id,
      vehicleBarcode,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
    } else {
      setShouldAutoPrint(true);
      pushToast('Vehicle verified. Manifest and barcode will print automatically.', 'success');
    }
  }

  function handleSign() {
    if (!soVerification || !currentUser) return;
    const result = signDispatchVerification({
      verificationId: soVerification.id,
      driverName: signForm.driverName,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSignForm({ driverName: '', loaderConfirmed: false, driverConfirmed: false });
  }

  function handleRequestDirectDispatch(source: 'Storage' | 'Production') {
    if (!selectedSO || !currentUser) return;
    const result = requestDirectDispatchApproval(selectedSO.id, currentUser.id, source);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Direct dispatch from ${source} requested for ${selectedSO.id}`, 'success');
  }

  function handleGenerateManifest() {
    if (!selectedSO || !currentUser) return;
    const result = generateManifestForPickingComplete({
      salesOrderId: selectedSO.id,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <div>
          <h1 className="text-xl font-bold text-white">Dispatch planning</h1>
          <p className="text-sm text-slate-400">
            Every sales order starts here — release what's ready for the warehouse to work on, split
            it across trucks, and print each truck's pick plan before picking begins.
          </p>
        </div>

        <div className="mt-4 space-y-5">
          {BUCKETS.map((b) => {
            const orders = salesOrders.filter((so) => bucketOf(so) === b.key);
            return (
              <div key={b.key}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {b.title} <span className="text-slate-600">({orders.length})</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">{b.hint}</p>
                <div className="mt-2 space-y-2">
                  {orders.length === 0 && <p className="text-xs text-slate-600">None right now.</p>}
                  {orders.map((so) => (
                    <button
                      key={so.id}
                      onClick={() => setSelectedSOId(so.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                        selectedSOId === so.id
                          ? 'border-indigo-500 bg-indigo-950/40'
                          : 'border-slate-800 hover:bg-slate-800/60'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-slate-200">
                          {so.id} · {so.customer}
                        </div>
                        <div className="text-xs text-slate-500">
                          {so.productName} — Ordered {so.qty.toLocaleString()} · Released{' '}
                          {so.releasedQty.toLocaleString()} · Remaining{' '}
                          {(so.qty - so.releasedQty).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-600">
                          {new Date(so.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <StatusPill status={so.status} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {!selectedSO && (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
            Select a sales order to release, plan, and monitor its dispatch.
          </p>
        )}

        {selectedSO && (
          <>
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="font-semibold text-slate-200">Vehicle</h2>
              {(!assignedTruck || assignedTruck.plate === 'PENDING') && (
                <>
                  {assignedTruck && assignedTruck.plate === 'PENDING' && (
                    <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 p-3 mb-3">
                      <p className="text-xs text-indigo-300 font-medium">Vehicle has arrived</p>
                      <p className="text-xs text-indigo-200 mt-1">Dispatch line: <span className="font-semibold">{assignedTruck.dispatchLine}</span></p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    {assignedTruck ? 'Enter the vehicle details to complete registration.' : 'SAP doesn\'t provide the vehicle — it\'s only known once the customer/driver physically arrives to collect. Register it here.'}
                  </p>
                  {!assignedTruck && (
                    <input
                      value={receiptRef}
                      onChange={(e) => setReceiptRef(e.target.value)}
                      placeholder="Receipt / order reference (optional)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  )}
                  <input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="Vehicle registration, e.g. KDA 123A"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Driver name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  {!assignedTruck && (
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={plateConfirmed}
                        onChange={(e) => setPlateConfirmed(e.target.checked)}
                      />
                      I confirm that the vehicle registration matches the physical vehicle.
                    </label>
                  )}
                  <button
                    onClick={handleRegisterVehicle}
                    disabled={!plate.trim() || !driverName.trim() || (assignedTruck && assignedTruck.plate === 'PENDING' ? false : !plateConfirmed)}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 w-full"
                  >
                    Register vehicle
                  </button>
                </>
              )}
              {assignedTruck && (
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium text-slate-200">
                      {assignedTruck.plate} <span className="text-slate-500">— {assignedTruck.driverName}</span>
                    </div>
                    <div className="text-xs text-slate-500">Dispatch line {assignedTruck.dispatchLine}</div>
                  </div>
                  {assignedTruck.dispatchBarcode && (
                    <PrintSheet title="Vehicle barcode" triggerLabel="Print vehicle barcode">
                      <div className="space-y-2">
                        <p><strong>Sales order:</strong> {selectedSO.id}</p>
                        <p><strong>Customer:</strong> {selectedSO.customer}</p>
                        <p><strong>Vehicle:</strong> {assignedTruck.plate}</p>
                        <p><strong>Driver:</strong> {assignedTruck.driverName}</p>
                        <div className="bg-white p-2">
                          <Barcode value={assignedTruck.dispatchBarcode} height={40} fontSize={12} />
                        </div>
                      </div>
                    </PrintSheet>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="font-semibold text-slate-200">
                {selectedSO.id} · {selectedSO.customer} — {selectedSO.productName}
              </h2>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-lg font-bold text-white">{selectedSO.qty.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Ordered</div>
                </div>
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-lg font-bold text-white">{selectedSO.releasedQty.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Released</div>
                </div>
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-lg font-bold text-white">{remainingToRelease.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Remaining</div>
                </div>
              </div>

              {remainingToRelease > 0 && !assignedTruck && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Register the collecting vehicle above before releasing this order for picking —
                  nothing gets pulled until the customer/driver has actually arrived.
                </p>
              )}
              {remainingToRelease > 0 && assignedTruck && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={releaseQty}
                    onChange={(e) => setReleaseQty(e.target.value)}
                    placeholder={`up to ${remainingToRelease}`}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={handleRelease}
                    disabled={!releaseQty}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Release
                  </button>
                </div>
              )}
              {remainingToRelease === 0 && (
                <p className="text-xs text-emerald-400">Fully released — nothing left to hold back.</p>
              )}

              {releases.length > 0 && (
                <div className="border-t border-slate-800 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Release history
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-400">
                    {releases.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span>
                          {r.qty.toLocaleString()} units by {userName(r.releasedByUserId)}
                        </span>
                        <span className="text-slate-600">{new Date(r.releasedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="font-semibold text-slate-200">Assign pickers</h2>
              <p className="text-xs text-slate-500">
                {remainingToAssign.toLocaleString()} released unit(s) still unassigned. A picker with
                no manual assignment can still self-serve from the shared queue on Loading Bay.
              </p>

              {soPickTasks.length > 0 && (
                <ul className="space-y-1">
                  {soPickTasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/60 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-300">
                        {t.assignedPickerId ? userName(t.assignedPickerId) : 'Unassigned (shared queue)'}
                        <span className="ml-2 text-xs text-slate-500">
                          {t.items.filter((i) => i.picked).length}/{t.items.length} picked
                        </span>
                      </span>
                      <StatusPill status={t.status} />
                    </li>
                  ))}
                </ul>
              )}

              {remainingToAssign > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  {pickerRows.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        value={row.pickerId}
                        onChange={(e) => handlePickerRowChange(i, 'pickerId', e.target.value)}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Select a picker…</option>
                        {availablePickers.length > 0 ? (
                          availablePickers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))
                        ) : (
                          <option value="">No available pickers</option>
                        )}
                      </select>
                      <input
                        type="number"
                        value={row.qty}
                        onChange={(e) => handlePickerRowChange(i, 'qty', e.target.value)}
                        placeholder="qty"
                        className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      />
                      {pickerRows.length > 1 && (
                        <button
                          onClick={() => handleRemovePickerRow(i)}
                          className="rounded-lg border border-slate-700 px-2 text-xs text-slate-400 hover:bg-slate-800"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPickerRow}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      + Add another picker
                    </button>
                    <button
                      onClick={handleAssignPickers}
                      className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedSO && selectedSO.releasedQty > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="font-semibold text-slate-200">Request Direct Dispatch</h2>
                <p className="text-xs text-slate-500">
                  If the loading bay doesn't have enough stock, request a direct dispatch from Storage or Production.
                </p>
                <div className="space-y-2">
                  <button
                    onClick={() => handleRequestDirectDispatch('Storage')}
                    disabled={onBayQty >= selectedSO.qty - selectedSO.dispatchedQty}
                    className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {onBayQty >= selectedSO.qty - selectedSO.dispatchedQty
                      ? 'Bay has enough stock'
                      : `Request from Storage (${Math.max(0, (selectedSO.qty - selectedSO.dispatchedQty) - onBayQty)} units short)`}
                  </button>
                  <button
                    onClick={() => handleRequestDirectDispatch('Production')}
                    className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
                  >
                    Request from Production
                  </button>
                </div>
                {directDispatchApprovals.some(
                  (a) => a.salesOrderId === selectedSO.id && a.status === 'PendingApproval'
                ) && (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    A direct dispatch request is pending approval.
                  </p>
                )}
              </div>
            )}

            {soPickTasks.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="font-semibold text-slate-200">Manifest</h2>
                {(() => {
                  const allCompleted = soPickTasks.every((t) => t.status === 'Completed');
                  const hasManifest = soVerification;
                  return (
                    <div className="space-y-2">
                      {!hasManifest && allCompleted && (
                        <button
                          onClick={handleGenerateManifest}
                          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                        >
                          Generate Manifest
                        </button>
                      )}
                      {hasManifest && (
                        <>
                          <p className="text-xs text-slate-400">
                            Manifest ready for {soVerification.customer} · {soVerification.products[0]?.productName}
                          </p>
                          <PrintSheet title="Handover Manifest" triggerLabel="Print Manifest">
                            <div className="space-y-3 text-xs">
                              <div>
                                <p><strong>Sales Order:</strong> {selectedSO?.id}</p>
                                <p><strong>Customer:</strong> {soVerification.customer}</p>
                                <p><strong>Vehicle:</strong> {assignedTruck?.plate} — {assignedTruck?.driverName}</p>
                                <p><strong>Dispatch Line:</strong> {soVerification.dispatchLine}</p>
                              </div>
                              <div className="border-t border-slate-300 pt-2">
                                <p className="font-semibold">Products</p>
                                {soVerification.products.map((p) => (
                                  <div key={p.sku} className="flex justify-between">
                                    <span>{p.productName} ({p.sku})</span>
                                    <span>Ordered: {p.orderedQty} · Released: {p.releasedQty} · Picked: {p.pickedQty}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="border-t border-slate-300 pt-2">
                                <p className="font-semibold">Pallets</p>
                                <p>{soVerification.palletIds.join(', ')}</p>
                              </div>
                              <div className="border-t border-slate-300 pt-2">
                                <p className="font-semibold">Pickers</p>
                                <p>{soVerification.pickerUserIds.map(userName).join(', ') || '—'}</p>
                              </div>
                            </div>
                          </PrintSheet>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {soPickTasks.filter((t) => t.origin === 'Dispatch').length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="font-semibold text-slate-200">Dispatch Picking Progress</h2>
                <div className="space-y-2">
                  {soPickTasks
                    .filter((t) => t.origin === 'Dispatch')
                    .map((task) => {
                      const pickerName = task.assignedPickerId ? userName(task.assignedPickerId) : 'Unknown';
                      const totalPallets = task.items.length;
                      const pickedPallets = task.items.filter((i) => i.picked).length;
                      const progressPercent = totalPallets > 0 ? Math.round((pickedPallets / totalPallets) * 100) : 0;
                      return (
                        <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-sm">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="font-medium text-slate-200">{pickerName}</div>
                            <div className={`text-xs ${pickedPallets === totalPallets ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {pickedPallets}/{totalPallets} pallets staged
                            </div>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                            <div
                              className={`h-full ${pickedPallets === totalPallets ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{progressPercent}% complete</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="font-semibold text-slate-200">Order progress</h2>
              <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-base font-bold text-white">{inTransitQty.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">In transit</div>
                </div>
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-base font-bold text-white">{onBayQty.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">On bay</div>
                </div>
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-base font-bold text-white">{selectedSO.dispatchedQty.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Loaded</div>
                </div>
                <div className="rounded-lg bg-slate-800/60 p-2">
                  <div className="text-base font-bold text-white">{remainingToRelease.toLocaleString()}</div>
                  <div className="text-xs text-slate-500">Unreleased</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="font-semibold text-slate-200">Vehicle allocation</h2>
              <p className="text-xs text-slate-500">
                {remainingToPlan.toLocaleString()} released unit(s) still unplanned across a truck.
              </p>

              {allocations.length === 0 && (
                <p className="text-sm text-slate-500">No trucks planned yet.</p>
              )}
              {allocations.map((a) => {
                const truck = trucks.find((t) => t.id === a.truckId);
                return (
                  <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-800/60 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200">
                        {a.truckId} {truck && <span className="text-slate-500">({truck.plate})</span>}
                      </span>
                      <StatusPill status={a.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Planned {a.plannedQty.toLocaleString()} · Loaded {a.dispatchedQty.toLocaleString()}
                    </div>
                    <div className="mt-2">
                      <PrintSheet title="Pick plan" triggerLabel="Print pick plan">
                        <div className="space-y-1">
                          <p><strong>Sales order:</strong> {selectedSO.id}</p>
                          <p><strong>Customer:</strong> {selectedSO.customer}</p>
                          <p><strong>Product:</strong> {selectedSO.productName}</p>
                          <p><strong>Truck:</strong> {a.truckId} {truck ? `(${truck.plate})` : ''}</p>
                          <p><strong>Planned quantity:</strong> {a.plannedQty.toLocaleString()} units</p>
                          <p><strong>Planned by:</strong> {userName(a.createdByUserId)}</p>
                          <p><strong>Planned at:</strong> {new Date(a.createdAt).toLocaleString()}</p>
                        </div>
                      </PrintSheet>
                    </div>
                  </div>
                );
              })}

              {remainingToPlan > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <select
                    value={truckId}
                    onChange={(e) => setTruckId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select a truck…</option>
                    {availableTrucks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} ({t.plate})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={allocQty}
                    onChange={(e) => setAllocQty(e.target.value)}
                    placeholder={`up to ${remainingToPlan}`}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <select
                    value={dispatchLine}
                    onChange={(e) => setDispatchLine(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select unoccupied dispatch line…</option>
                    {unoccupiedDispatchLines.map((line) => (
                      <option key={line} value={line}>
                        {line}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handlePlan}
                    disabled={!truckId || !allocQty || !dispatchLine}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Plan allocation
                  </button>
                </div>
              )}
            </div>

            {soVerification && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-200">Dispatch verification &amp; handover</h2>
                  <StatusPill status={soVerification.status} />
                </div>

                <div className="space-y-1 text-xs text-slate-400">
                  {soVerification.products.map((p) => (
                    <div key={p.sku} className="flex justify-between">
                      <span>{p.productName}</span>
                      <span>
                        ordered {p.orderedQty.toLocaleString()} · released {p.releasedQty.toLocaleString()} · picked{' '}
                        {p.pickedQty.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span>Pallets</span>
                    <span>{soVerification.palletIds.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Picker(s)</span>
                    <span>{soVerification.pickerUserIds.map(userName).join(', ') || '—'}</span>
                  </div>
                </div>

                {soVerification.status === 'AwaitingVerification' && (
                  <div className="border-t border-slate-800 pt-3">
                    <p className="mb-2 text-xs text-slate-400">
                      Goods are staged at {soVerification.dispatchLine}. Scan the vehicle's barcode to
                      verify it's the vehicle associated with this order before signing anything.
                    </p>
                    <ScanInput
                      label="Scan the vehicle barcode"
                      placeholder="e.g. VEH-ab12cd"
                      onScan={handleVerifyVehicle}
                      suggestions={assignedTruck?.dispatchBarcode ? [assignedTruck.dispatchBarcode] : []}
                    />
                  </div>
                )}

                {soVerification.status === 'VehicleVerified' && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                      Vehicle verified — {assignedTruck?.plate}
                    </p>
                    <input
                      value={signForm.driverName}
                      onChange={(e) => setSignForm((f) => ({ ...f, driverName: e.target.value }))}
                      placeholder="Driver name"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={signForm.loaderConfirmed}
                        onChange={(e) => setSignForm((f) => ({ ...f, loaderConfirmed: e.target.checked }))}
                      />
                      Loader confirms the goods match the printout
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={signForm.driverConfirmed}
                        onChange={(e) => setSignForm((f) => ({ ...f, driverConfirmed: e.target.checked }))}
                      />
                      Driver confirms the goods match the printout
                    </label>
                    <button
                      onClick={handleSign}
                      disabled={!signForm.driverName.trim() || !signForm.loaderConfirmed || !signForm.driverConfirmed}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                    >
                      Sign &amp; complete handover
                    </button>
                  </div>
                )}

                {soVerification.status === 'VehicleVerified' && (
                  <div className="border-t border-slate-800 pt-3">
                    <div className="mb-4 rounded-lg bg-amber-900/30 p-3">
                      <p className="text-xs text-amber-200">
                        ℹ Manifest and vehicle barcode will print automatically. Check your print queue.
                      </p>
                    </div>
                    {/* Hidden print sheets for automatic printing */}
                    <div className="hidden print-only">
                      <DispatchManifest
                        verification={soVerification}
                        loaderName={currentUser?.name || 'Unknown Loader'}
                      />
                      <div style={{ pageBreakAfter: 'always' }} />
                      <VehicleBarcodePage
                        vehicleBarcode={soVerification.vehicleBarcode}
                        vehiclePlate={assignedTruck?.plate || 'Unknown'}
                        salesOrderId={soVerification.salesOrderId}
                        customerName={soVerification.customer}
                        dispatchLine={soVerification.dispatchLine}
                      />
                    </div>
                  </div>
                )}

                {soVerification.status === 'Verified' && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                      Handover complete
                    </p>
                    <div className="text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>Loader</span>
                        <span>
                          {soVerification.loaderSignedByUserId ? userName(soVerification.loaderSignedByUserId) : ''} —{' '}
                          {soVerification.loaderSignedAt ? new Date(soVerification.loaderSignedAt).toLocaleString() : ''}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Driver</span>
                        <span>
                          {soVerification.driverName} —{' '}
                          {soVerification.driverSignedAt ? new Date(soVerification.driverSignedAt).toLocaleString() : ''}
                        </span>
                      </div>
                    </div>
                    <PrintSheet title="Dispatch verification / handover" triggerLabel="Print handover document">
                      <div className="space-y-1">
                        <p><strong>Sales order:</strong> {soVerification.salesOrderId}</p>
                        <p><strong>Customer:</strong> {soVerification.customer}</p>
                        <p><strong>Date:</strong> {new Date(soVerification.stagedAt).toLocaleDateString()}</p>
                        <p><strong>Vehicle registration:</strong> {assignedTruck?.plate}</p>
                        <p><strong>Driver name:</strong> {assignedTruck?.driverName}</p>
                        <p><strong>Vehicle barcode:</strong> {soVerification.vehicleBarcode}</p>
                        {soVerification.products.map((p) => (
                          <p key={p.sku}>
                            <strong>{p.productName}:</strong> ordered {p.orderedQty.toLocaleString()} · released{' '}
                            {p.releasedQty.toLocaleString()} · picked {p.pickedQty.toLocaleString()}
                          </p>
                        ))}
                        <p><strong>Pallet IDs:</strong> {soVerification.palletIds.join(', ')}</p>
                        <p><strong>Dispatch line:</strong> {soVerification.dispatchLine}</p>
                        <p><strong>Loader:</strong> {soVerification.loaderUserId ? userName(soVerification.loaderUserId) : '—'}</p>
                        <p><strong>Picker(s):</strong> {soVerification.pickerUserIds.map(userName).join(', ') || '—'}</p>
                        <div className="mt-4 space-y-3 border-t pt-3">
                          <p className="font-semibold">LOADER CONFIRMATION</p>
                          <p>
                            I confirm that the goods listed above have been verified and are ready for
                            handover to the identified vehicle.
                          </p>
                          <p>
                            <strong>Loader name:</strong>{' '}
                            {soVerification.loaderSignedByUserId ? userName(soVerification.loaderSignedByUserId) : ''}
                          </p>
                          <p>
                            <strong>Loader signature:</strong> Confirmed{' '}
                            {soVerification.loaderSignedAt ? new Date(soVerification.loaderSignedAt).toLocaleString() : ''}
                          </p>
                          <p className="mt-3 font-semibold">DRIVER CONFIRMATION</p>
                          <p>
                            I confirm that the goods and quantities listed above have been physically
                            checked and correspond to the goods I am collecting.
                          </p>
                          <p><strong>Driver name:</strong> {soVerification.driverName}</p>
                          <p>
                            <strong>Driver signature:</strong> Confirmed{' '}
                            {soVerification.driverSignedAt ? new Date(soVerification.driverSignedAt).toLocaleString() : ''}
                          </p>
                        </div>
                      </div>
                    </PrintSheet>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
