import { useState } from 'react';
import { useWarehouseStore, type Result, type ToastKind } from '../store/useWarehouseStore';
import { getPickerType } from '../rbac';
import { USERS } from '../data/seed';
import { unitsPerPallet } from '../data/products';
import type { DirectDispatchApproval, PickTask, SalesOrder, SalesOrderLine } from '../types/domain';

export function SalesHodPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const availableInStorage = useWarehouseStore((s) => s.availableInStorage);
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const requestDirectDispatchApproval = useWarehouseStore((s) => s.requestDirectDispatchApproval);
  const assignStorageDirectDispatchTasks = useWarehouseStore((s) => s.assignStorageDirectDispatchTasks);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);

  const openOrders = salesOrders.filter((so) => so.status !== 'Fulfilled');
  const selectedSO = openOrders.find((so) => so.id === selectedSOId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-white">Sales HOD</h1>
          <p className="text-sm text-slate-400">
            Check Loading Bay, Storage, and Incoming Production availability for each order, and request
            stock from Storage and/or Production ahead of the Loader's release.
          </p>
        </div>
        <div className="space-y-2">
          {openOrders.length === 0 && <p className="text-sm text-slate-500">No open sales orders.</p>}
          {openOrders.map((so: SalesOrder) => (
            <button
              key={so.id}
              onClick={() => setSelectedSOId(so.id)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                selectedSOId === so.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <p className="font-mono font-semibold text-slate-100">
                {so.id} <span className="font-sans font-normal text-slate-400">— {so.customer}</span>
              </p>
              <div className="mt-1 space-y-0.5">
                {so.lines.map((line) => {
                  const bayAvail = availableOnBay(line.sku);
                  const needed = Math.max(0, line.qty - line.dispatchedQty - bayAvail);
                  return (
                    <p key={line.id} className="text-xs text-slate-400">
                      {line.productName}: {line.qty.toLocaleString()} ordered, {bayAvail.toLocaleString()} on bay,{' '}
                      <span className={needed > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                        {needed.toLocaleString()} needed
                      </span>
                    </p>
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 lg:col-span-2">
        {selectedSO ? (
          selectedSO.lines.map((line: SalesOrderLine) => (
            <SalesHodLinePanel
              key={line.id}
              order={selectedSO}
              line={line}
              allPickTasks={pickTasks}
              availableOnBay={availableOnBay}
              availableInStorage={availableInStorage}
              directDispatchApprovals={directDispatchApprovals}
              requestDirectDispatchApproval={requestDirectDispatchApproval}
              assignStorageDirectDispatchTasks={assignStorageDirectDispatchTasks}
              pushToast={pushToast}
              currentUserId={currentUser?.id}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Select an order to check availability and request stock</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SalesHodLinePanel({
  order,
  line,
  allPickTasks,
  availableOnBay,
  availableInStorage,
  directDispatchApprovals,
  requestDirectDispatchApproval,
  assignStorageDirectDispatchTasks,
  pushToast,
  currentUserId,
}: {
  order: SalesOrder;
  line: SalesOrderLine;
  allPickTasks: PickTask[];
  availableOnBay: (sku: string) => number;
  availableInStorage: (sku: string) => number;
  directDispatchApprovals: DirectDispatchApproval[];
  requestDirectDispatchApproval: (
    salesOrderId: string,
    lineId: string,
    operatorId: string,
    source?: 'Storage' | 'Production',
    palletCount?: number,
  ) => Result<{ approval: DirectDispatchApproval }>;
  assignStorageDirectDispatchTasks: (args: {
    salesOrderId: string;
    lineId: string;
    assignments: { pickerId: string | null; qty: number }[];
    operatorId: string;
  }) => Result<{ tasks: PickTask[] }>;
  pushToast: (message: string, kind?: ToastKind) => void;
  currentUserId: string | undefined;
}) {
  const [productionPalletCount, setProductionPalletCount] = useState('1');
  const [requestingStorage, setRequestingStorage] = useState(false);
  const [requestingProduction, setRequestingProduction] = useState(false);
  const [storagePickerRows, setStoragePickerRows] = useState<{ pickerId: string; qty: string }[]>([
    { pickerId: '', qty: '' },
  ]);

  // The Sales HOD acts before the Loader releases anything, so "needed" is
  // the line's full outstanding quantity (ordered minus already dispatched),
  // not releasedQty — same shortfall math the Loader used to run, just
  // carried over to whoever does the requesting now. Priority order: Bay
  // first, then Storage, then whatever's left is the Production shortfall.
  const remaining = line.qty - line.dispatchedQty;
  const bayAvail = availableOnBay(line.sku);
  const storageAvail = availableInStorage(line.sku);
  const needed = Math.max(0, remaining);
  const fromBay = Math.min(bayAvail, needed);
  const afterBay = needed - fromBay;

  const lineApprovals = directDispatchApprovals.filter(
    (a) => a.salesOrderId === order.id && a.lineId === line.id && a.status === 'Approved',
  );
  // Neither source ever shows up in availableOnBay/availableInStorage until
  // it's actually dispatched (Production/Storage Direct pallets both skip
  // straight to the truck) — so without subtracting what's already been
  // approved, the suggestion below never goes down once you request one
  // source, and keeps inviting a second, redundant request for the same
  // shortfall from the other.
  const alreadyApprovedStorageUnits = lineApprovals
    .filter((a) => a.source === 'Storage')
    .reduce((sum, a) => sum + a.shortfallQty, 0);
  const alreadyApprovedProductionUnits = lineApprovals
    .filter((a) => a.source === 'Production')
    .reduce((sum, a) => sum + (a.palletsRemaining ?? 0) * unitsPerPallet(line.sku), 0);
  const afterExistingRequests = Math.max(
    0,
    afterBay - alreadyApprovedStorageUnits - alreadyApprovedProductionUnits,
  );
  const fromStorage = Math.min(storageAvail, afterExistingRequests);
  const fromProd = afterExistingRequests - fromStorage;

  function handleRemoveStoragePickerRow(index: number) {
    setStoragePickerRows((rows) => rows.filter((_, i) => i !== index));
  }

  // Single combined submit for whichever checkbox(es) are ticked — mirrors
  // the original Loader design, where checking Storage and/or Production
  // both fed into one action instead of two separate ones. Everything is
  // validated first; if any checked section is invalid, nothing is
  // submitted (same as the original all-or-nothing release/assign gate).
  function handleSubmit() {
    if (!currentUserId) return;
    if (!requestingStorage && !requestingProduction) {
      pushToast('Check at least one source to request from', 'error');
      return;
    }

    let storageAssignments: { pickerId: string | null; qty: number }[] = [];
    if (requestingStorage) {
      // A row with a quantity but no picker chosen is valid now — it means
      // "auto-assign whoever's free, or queue it" (see
      // assignStorageDirectDispatchTasks). Only a picker with no quantity is
      // actually incomplete.
      const incomplete = storagePickerRows.some((r) => r.pickerId && !r.qty);
      if (incomplete) {
        pushToast('Enter a quantity for every picker you selected (or remove the empty row)', 'error');
        return;
      }
      storageAssignments = storagePickerRows
        .filter((r) => r.qty)
        .map((r) => ({ pickerId: r.pickerId || null, qty: Number(r.qty) }));
      if (storageAssignments.length === 0) {
        pushToast('Enter a quantity for at least one row', 'error');
        return;
      }
      const pickerIds = storageAssignments.map((a) => a.pickerId).filter((id): id is string => !!id);
      const duplicates = pickerIds.filter((id, idx) => pickerIds.indexOf(id) !== idx);
      if (duplicates.length > 0) {
        pushToast(
          `Cannot assign the same picker twice. Duplicate: ${USERS.find((u) => u.id === duplicates[0])?.name || duplicates[0]}`,
          'error',
        );
        return;
      }
    }

    if (requestingStorage) {
      const approvalResult = requestDirectDispatchApproval(order.id, line.id, currentUserId, 'Storage');
      if (!approvalResult.ok) {
        pushToast(approvalResult.error, 'error');
        return;
      }
      const assignResult = assignStorageDirectDispatchTasks({
        salesOrderId: order.id,
        lineId: line.id,
        assignments: storageAssignments,
        operatorId: currentUserId,
      });
      if (!assignResult.ok) {
        pushToast(assignResult.error, 'error');
        return;
      }
    }

    if (requestingProduction) {
      const palletCount = Math.max(1, Number(productionPalletCount) || 1);
      const result = requestDirectDispatchApproval(order.id, line.id, currentUserId, 'Production', palletCount);
      if (!result.ok) {
        pushToast(result.error, 'error');
        return;
      }
    }

    pushToast('Direct dispatch request(s) submitted', 'success');
    setRequestingStorage(false);
    setRequestingProduction(false);
    setStoragePickerRows([{ pickerId: '', qty: '' }]);
    setProductionPalletCount('1');
  }

  return (
    <div className="rounded-lg border border-slate-700 p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-200">{line.productName} ({line.sku})</p>

      {/* Ordered / On Bay / Needed — the headline numbers, not just a status word */}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-800/60 p-3 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Ordered</p>
          <p className="text-sm font-semibold text-slate-100">{line.qty.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">On Bay</p>
          <p className="text-sm font-semibold text-slate-100">{bayAvail.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Needed</p>
          <p className={`text-sm font-semibold ${afterBay > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
            {afterBay.toLocaleString()}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {line.releasedQty.toLocaleString()} released, {line.dispatchedQty.toLocaleString()} dispatched
      </p>

      {/* Pickers will source from - same waterfall the Loader used to see */}
      <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
        <p className="font-semibold mb-1">Pickers will source from:</p>
        <p>• Loading Bay: {bayAvail.toLocaleString()} units available</p>
        <p>• Storage: {storageAvail.toLocaleString()} units available</p>
        {remaining > 0 && (
          <p className="text-slate-200 font-medium mt-1">
            For {needed.toLocaleString()} units: {fromBay.toLocaleString()} from Bay
            {fromStorage > 0 && `, ${fromStorage.toLocaleString()} from Storage`}
            {fromProd > 0 && `, ${fromProd.toLocaleString()} from Production`}
            {(alreadyApprovedStorageUnits > 0 || alreadyApprovedProductionUnits > 0) &&
              afterExistingRequests <= 0 &&
              ' — already fully covered by active requests below'}
          </p>
        )}
      </div>

      {lineApprovals.length > 0 && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1">
          <p className="text-xs font-semibold text-emerald-300 mb-1">✓ Direct Dispatch Approved</p>
          {lineApprovals.map((a) => {
            // Production's real commitment is the bounded pallet count, not
            // shortfallQty — that field is each source's own independent gap
            // analysis at request time, so requesting Storage AND Production
            // for the same gap makes both show the full amount instead of
            // splitting it. palletsRemaining is what actually gets diverted.
            const displayUnits =
              a.source === 'Production' && a.palletsRemaining != null
                ? a.palletsRemaining * unitsPerPallet(line.sku)
                : a.shortfallQty;
            return (
              <p key={a.id} className="text-xs text-emerald-100">
                {a.source} direct dispatch: {displayUnits.toLocaleString()} units
                {a.source === 'Production' && a.palletsRemaining != null
                  ? ` (${a.palletsRemaining} pallet${a.palletsRemaining === 1 ? '' : 's'} remaining)`
                  : ''}
              </p>
            );
          })}
        </div>
      )}

      {remaining <= 0 ? (
        <p className="text-xs text-slate-500">This line is already fully dispatched.</p>
      ) : afterBay <= 0 ? (
        <p className="text-xs text-slate-500">Bay already holds enough stock — no direct dispatch needed.</p>
      ) : fromStorage <= 0 && fromProd <= 0 ? (
        <p className="text-xs text-slate-500">
          Already fully covered by the active request{lineApprovals.length === 1 ? '' : 's'} above — nothing more to request.
        </p>
      ) : (
        <div className="rounded-lg border border-green-800/50 bg-green-900/20 p-3 space-y-3">
          <p className="text-xs font-semibold text-green-300">Direct Dispatch Requests</p>

          {fromStorage > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-green-100">
                Bay has {bayAvail.toLocaleString()} units. Need {afterBay.toLocaleString()} more
                {fromProd > 0 ? ' from Storage' : ''} — assign pickers below.
              </p>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requestingStorage}
                  onChange={() => {
                    if (requestingStorage) {
                      setRequestingStorage(false);
                      setStoragePickerRows([{ pickerId: '', qty: '' }]);
                    } else {
                      setRequestingStorage(true);
                    }
                  }}
                  className="rounded"
                />
                Request {fromStorage.toLocaleString()} from Storage
              </label>

              {requestingStorage && (
                <div className="rounded-lg bg-green-950/30 border border-green-800/40 p-3 space-y-2">
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
                        <option value="">Auto-assign / queue for next available picker</option>
                        {USERS.filter((u) => u.role === 'Picker' && getPickerType(u.id) === 'storage')
                          .filter((u) => {
                            // Checked against ALL pick tasks, not just this
                            // sales order's — a picker already Accepted on a
                            // different order's task is still busy and must
                            // not be offered here too.
                            const hasOngoingTask = allPickTasks.some(
                              (t) => t.assignedPickerId === u.id && t.status === 'Accepted',
                            );
                            return !hasOngoingTask;
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={row.qty}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const newRows = [...storagePickerRows];
                          newRows[i].qty = val;
                          setStoragePickerRows(newRows);
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
            </div>
          )}

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
                  checked={requestingProduction}
                  onChange={() => setRequestingProduction(!requestingProduction)}
                  className="rounded"
                />
                Request {fromProd.toLocaleString()} from Production
              </label>
              {requestingProduction && (
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

          {(requestingStorage || requestingProduction) && (
            <button
              onClick={handleSubmit}
              className="w-full rounded bg-green-700 px-3 py-2 text-xs font-medium text-white hover:bg-green-800"
            >
              Submit Direct Dispatch Request{requestingStorage && requestingProduction ? 's' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
