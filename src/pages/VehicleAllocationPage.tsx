import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { StatusPill } from '../components/StatusPill';

export function VehicleAllocationPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const trucks = useWarehouseStore((s) => s.trucks);
  const allocateVehicleToSalesOrder = useWarehouseStore((s) => s.allocateVehicleToSalesOrder);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [allocationForm, setAllocationForm] = useState<{
    salesOrderId: string | null;
    dispatchLine: string;
  }>({
    salesOrderId: null,
    dispatchLine: '',
  });

  // Sales orders without assigned vehicles
  const unallocatedOrders = salesOrders.filter((so) => !so.assignedTruckId);
  // Sales orders with allocated vehicles
  const allocatedOrders = salesOrders.filter((so) => so.assignedTruckId);

  function handleAllocate() {
    if (!allocationForm.salesOrderId || !currentUser) return;
    const result = allocateVehicleToSalesOrder({
      salesOrderId: allocationForm.salesOrderId,
      plate: 'PENDING',
      dispatchLine: allocationForm.dispatchLine,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setAllocationForm({ salesOrderId: null, dispatchLine: '' });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Vehicle Allocation</h1>
        <p className="text-sm text-slate-400">
          Allocate incoming vehicles to dispatch lines before they arrive. Driver details are registered in Dispatch.
        </p>
      </div>

      {/* Allocation form */}
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="font-semibold text-slate-200">Allocate incoming vehicle</h2>

        {unallocatedOrders.length === 0 ? (
          <p className="text-xs text-slate-500">All sales orders have vehicles allocated.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-400">Sales Order</label>
              <select
                value={allocationForm.salesOrderId || ''}
                onChange={(e) => setAllocationForm({ ...allocationForm, salesOrderId: e.target.value })}
                className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select a sales order...</option>
                {unallocatedOrders.map((so) => (
                  <option key={so.id} value={so.id}>
                    {so.id} — {so.productName} ({so.qty.toLocaleString()} units) · {so.customer}
                  </option>
                ))}
              </select>
            </div>

            {allocationForm.salesOrderId && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-400">Dispatch Line</label>
                  <input
                    type="text"
                    placeholder="e.g., LINE 001"
                    value={allocationForm.dispatchLine}
                    onChange={(e) => setAllocationForm({ ...allocationForm, dispatchLine: e.target.value })}
                    className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Driver details will be registered when the vehicle arrives in Dispatch</p>
                </div>

                <button
                  onClick={handleAllocate}
                  disabled={!allocationForm.dispatchLine.trim()}
                  className="w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Allocate Dispatch Line
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Allocated vehicles */}
      {allocatedOrders.length > 0 && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Allocated vehicles ({allocatedOrders.length})</h2>
          <div className="space-y-3">
            {allocatedOrders.map((so) => {
              const truck = trucks.find((t) => t.id === so.assignedTruckId);
              return (
                <div key={so.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold text-indigo-300">{so.id}</p>
                      <p className="text-xs text-slate-400">
                        {so.productName} · {so.qty.toLocaleString()} units · {so.customer}
                      </p>
                    </div>
                    <StatusPill status={so.status} />
                  </div>
                  {truck && (
                    <div className="mt-3 rounded bg-slate-700/50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="font-medium text-slate-100">{truck.plate}</span>
                          <span className="ml-2 text-slate-500">→ {truck.dispatchLine}</span>
                        </span>
                        <span className={`rounded px-2 py-1 text-xs font-medium ${truck.status === 'Waiting' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {truck.status}
                        </span>
                      </div>
                      {!truck.driverName && (
                        <p className="mt-2 text-xs text-slate-500">Driver details: Pending registration in Dispatch</p>
                      )}
                      {truck.driverName && (
                        <p className="mt-1 text-xs text-slate-400">Driver: {truck.driverName}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
