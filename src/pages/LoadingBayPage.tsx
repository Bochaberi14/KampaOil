import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { can, canAccessDepartment } from '../rbac';
import { PRODUCTS } from '../data/products';
import { LOADING_BAY_ZONES } from '../data/seed';

type WizardStep = 'storage-pallet' | 'bay-rack';

export function LoadingBayPage() {
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const customerReturns = useWarehouseStore((s) => s.customerReturns);
  const actionReturnDecision = useWarehouseStore((s) => s.actionReturnDecision);
  const requestStockFromStorageToLoadingBay = useWarehouseStore((s) => s.requestStockFromStorageToLoadingBay);
  const scanPalletLeavingStorage = useWarehouseStore((s) => s.scanPalletLeavingStorage);
  const scanBayRackForPick = useWarehouseStore((s) => s.scanBayRackForPick);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null; palletIndex: number }>({
    step: 'storage-pallet',
    palletId: null,
    palletIndex: 0,
  });
  const [stagingRequest, setStagingRequest] = useState({ sku: '', qty: '' });

  const myPutAwayTasks = pickTasks.filter(
    (t) => t.status === 'Accepted' && t.assignedPickerId === currentUser?.id && (t.origin === 'Storage' || t.origin === 'Production'),
  );
  const currentPutAwayTask = myPutAwayTasks[0] ?? null;

  const currentPutAwayItem = currentPutAwayTask?.items.find((item) => !item.picked) ?? null;

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

  function handleScanStoragePallet(palletId: string) {
    if (!currentPutAwayItem || !currentPutAwayTask || !currentUser) return;
    if (palletId !== currentPutAwayItem.palletId) {
      pushToast(`Wrong pallet — expected ${currentPutAwayItem.palletId}, scanned ${palletId}`, 'error');
      return;
    }
    const result = scanPalletLeavingStorage({
      pickTaskId: currentPutAwayTask.id,
      palletId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setWizard((w) => ({ ...w, step: 'bay-rack', palletId }));
  }

  function handleScanBayRack(bayRackId: string) {
    if (!currentPutAwayTask || !wizard.palletId || !currentUser) return;
    const result = scanBayRackForPick({
      pickTaskId: currentPutAwayTask.id,
      palletId: wizard.palletId,
      bayRackId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    setWizard({ step: 'storage-pallet', palletId: null, palletIndex: 0 });
    pushToast(`${wizard.palletId} to bay ✓`, 'success');

    if (result.data.completed) {
      pushToast(`Put-away complete — all pallet(s) in bay ✓`, 'success');
    }
  }

  const freeBayRackIds = bayRacks.filter((b) => b.slots.some((s) => s.palletId === null)).map((b) => b.id);
  const isPicker = can(currentUser?.role, 'execute:scan');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 3 · Loading Bay</h1>
        <p className="text-sm text-slate-400">
          HOD requests stock, Pickers transport to bay, Loader dispatches to customers.
        </p>
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
                  type="number"
                  value={stagingRequest.qty}
                  onChange={(e) => setStagingRequest((s) => ({ ...s, qty: e.target.value }))}
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

      {isPicker && currentPutAwayTask && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <StepDot active={wizard.step === 'storage-pallet'} label="1. Scan pallet leaving storage" />
            <StepDot active={wizard.step === 'bay-rack'} label="2. Scan destination bay rack" />
          </div>

          {wizard.step === 'storage-pallet' && currentPutAwayItem && (
            <>
              <p className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{currentPutAwayItem.palletId}</span> is in storage at <span className="font-mono text-slate-200">{currentPutAwayItem.sourceRackId}</span> — scan to confirm.
              </p>
              <ScanInput
                label="Scan pallet leaving storage"
                placeholder="e.g. PLT-005"
                onScan={handleScanStoragePallet}
                suggestions={[currentPutAwayItem.palletId]}
              />
            </>
          )}

          {wizard.step === 'bay-rack' && currentPutAwayItem && (
            <>
              <p className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{currentPutAwayItem.palletId}</span> is in transit to loading bay — now scan the destination bay rack.
              </p>
              {freeBayRackIds.length > 0 ? (
                <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-300">
                  Available bay racks: {freeBayRackIds.slice(0, 3).join(', ')}{freeBayRackIds.length > 3 ? '...' : ''}
                </p>
              ) : (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  No free bay racks available.
                </p>
              )}
              <ScanInput
                label="Scan bay rack barcode"
                placeholder="e.g. BAY-A"
                onScan={handleScanBayRack}
                suggestions={freeBayRackIds}
              />
              <button onClick={() => setWizard((w) => ({ ...w, step: 'storage-pallet', palletId: null }))} className="text-xs text-slate-500 hover:text-slate-300">
                Back / scan different pallet
              </button>
            </>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay zones
          {currentUser?.role === 'HOD' && (
            <span className="ml-2 text-xs font-normal text-slate-600">
              ({currentUser.department})
            </span>
          )}
        </h2>
        <div className="space-y-6">
          {LOADING_BAY_ZONES.filter((zone) => {
            // Returns zone always visible; only HODs are filtered by department
            if (zone.id === 'BIN-E-BAY') return true;
            if (currentUser?.role === 'HOD') {
              return canAccessDepartment(currentUser, zone.department as string);
            }
            return true; // Pickers and others see everything
          }).map((zone) => {
            const zoneRacks = bayRacks.filter((r) => r.zoneId === zone.id);
            return (
              <div key={zone.id} className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-semibold text-slate-100">{zone.name}</h3>
                  <span className="text-xs font-mono text-slate-500">{zone.id}</span>
                  {zone.requiresRefrigeration && (
                    <span className="text-xs text-blue-300 font-medium">❄ Refrigerated</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {zoneRacks.map((b) => (
                    <RackGrid key={b.id} rack={b} highlightPalletId={wizard.palletId ?? undefined} loads={loads} />
                  ))}
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
