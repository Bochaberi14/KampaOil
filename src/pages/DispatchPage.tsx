import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { BayRackCard, TruckCard } from '../components/EntityCards';
import { can } from '../rbac';

type WizardStep = 'bay' | 'pallet' | 'label' | 'truck';

type DirectWizardStep = 'pallet' | 'label' | 'truck';

export function DispatchPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const trucks = useWarehouseStore((s) => s.trucks);
  const pallets = useWarehouseStore((s) => s.pallets);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const manifests = useWarehouseStore((s) => s.manifests);
  const driverConfirmations = useWarehouseStore((s) => s.driverConfirmations);
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const availableOnBay = useWarehouseStore((s) => s.availableOnBay);
  const requestDirectDispatchApproval = useWarehouseStore((s) => s.requestDirectDispatchApproval);
  const approveDirectDispatchRequest = useWarehouseStore((s) => s.approveDirectDispatchRequest);
  const rejectDirectDispatchRequest = useWarehouseStore((s) => s.rejectDirectDispatchRequest);
  const signDriverConfirmation = useWarehouseStore((s) => s.signDriverConfirmation);
  const printVehicleLabel = useWarehouseStore((s) => s.printVehicleLabel);
  const scanDispatch = useWarehouseStore((s) => s.scanDispatch);
  const scanDirectDispatch = useWarehouseStore((s) => s.scanDirectDispatch);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedSOId, setSelectedSOId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{
    step: WizardStep;
    bayRackId: string | null;
    palletId: string | null;
  }>({ step: 'bay', bayRackId: null, palletId: null });
  const [directWizard, setDirectWizard] = useState<{ step: DirectWizardStep; palletId: string | null }>({
    step: 'pallet',
    palletId: null,
  });
  const [confirmForms, setConfirmForms] = useState<
    Record<string, { driverName: string; driverSigned: boolean; supervisorSigned: boolean }>
  >({});

  const selectedSO = salesOrders.find((s) => s.id === selectedSOId) ?? null;
  const remaining = selectedSO ? selectedSO.qty - selectedSO.dispatchedQty : 0;
  const available = selectedSO ? availableOnBay(selectedSO.sku) : 0;
  const shortfall = selectedSO ? Math.max(0, remaining - available) : 0;

  // Pallets an approved direct-dispatch shortfall already released straight
  // to the dispatch area (bypassing the bay) — ready to load onto a truck.
  const readyForDirectDispatch = selectedSO
    ? pickTasks
        .filter((t) => t.origin === 'Bay-Topup' && t.salesOrderId === selectedSO.id)
        .flatMap((t) => t.items)
        .map((i) => i.palletId)
        .filter((palletId) => pallets.find((p) => p.id === palletId)?.status === 'InTransitToTruck')
    : [];

  // Once a label is printed for this sales order's truck, reuse the same
  // barcode for every remaining pallet instead of printing a new one each time.
  const labeledTruck = selectedSO
    ? trucks.find((t) => t.salesOrderId === selectedSO.id && t.tempDispatchBarcode)
    : undefined;
  const availableTrucks = selectedSO
    ? trucks.filter((t) => !t.salesOrderId || t.salesOrderId === selectedSO.id)
    : [];

  function handleScanBay(bayRackId: string) {
    const bayRack = bayRacks.find((b) => b.id === bayRackId);
    if (!bayRack || !bayRack.palletId) {
      pushToast(`Bay rack ${bayRackId} is empty — scan rejected`, 'error');
      return;
    }
    setWizard({ step: 'pallet', bayRackId, palletId: null });
  }

  function handleScanPallet(palletId: string) {
    if (!wizard.bayRackId) return;
    const bayRack = bayRacks.find((b) => b.id === wizard.bayRackId);
    if (bayRack?.palletId !== palletId) {
      pushToast(`Pallet ${palletId} does not match bay rack ${wizard.bayRackId} — scan rejected`, 'error');
      return;
    }
    setWizard({ ...wizard, step: labeledTruck ? 'truck' : 'label', palletId });
  }

  function handlePrintLabel(truckId: string, target: 'normal' | 'direct') {
    if (!selectedSO || !currentUser) return;
    const result = printVehicleLabel(truckId, selectedSO.id, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    if (target === 'normal') setWizard((w) => ({ ...w, step: 'truck' }));
    else setDirectWizard((w) => ({ ...w, step: 'truck' }));
  }

  function handleScanTruck(vehicleBarcode: string) {
    if (!wizard.bayRackId || !wizard.palletId || !currentUser || !selectedSO) return;
    const result = scanDispatch({
      salesOrderId: selectedSO.id,
      bayRackId: wizard.bayRackId,
      palletId: wizard.palletId,
      vehicleBarcode,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setWizard({ step: 'bay', bayRackId: null, palletId: null });
    if (result.data.fulfilled) {
      pushToast(`Sales order ${selectedSO.id} fully dispatched — manifest generated`, 'success');
    }
  }

  function handleDirectScanPallet(palletId: string) {
    if (!readyForDirectDispatch.includes(palletId)) {
      pushToast(`Pallet ${palletId} is not ready for direct dispatch — scan rejected`, 'error');
      return;
    }
    setDirectWizard({ step: labeledTruck ? 'truck' : 'label', palletId });
  }

  function handleDirectScanTruck(vehicleBarcode: string) {
    if (!directWizard.palletId || !currentUser || !selectedSO) return;
    const result = scanDirectDispatch({
      salesOrderId: selectedSO.id,
      palletId: directWizard.palletId,
      vehicleBarcode,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setDirectWizard({ step: 'pallet', palletId: null });
    if (result.data.fulfilled) {
      pushToast(`Sales order ${selectedSO.id} fully dispatched — manifest generated`, 'success');
    }
  }

  function handleRequestApproval() {
    if (!selectedSO || !currentUser) return;
    const result = requestDirectDispatchApproval(selectedSO.id, currentUser.id);
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleApprove(approvalId: string) {
    const result = approveDirectDispatchRequest(approvalId, currentUser?.id ?? '');
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(
      `Pick task ${result.data.task.id} created from Storage — a Picker must accept and release it on the Storage screen before it arrives on the Loading Bay`,
      'info',
    );
  }

  function handleReject(approvalId: string) {
    const result = rejectDirectDispatchRequest(approvalId, currentUser?.id ?? '');
    if (!result.ok) pushToast(result.error, 'error');
  }

  function handleSignConfirmation(manifestId: string) {
    const form = confirmForms[manifestId];
    if (!currentUser || !form) return;
    const result = signDriverConfirmation({
      manifestId,
      driverName: form.driverName,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
  }

  const occupiedBayRackIds = bayRacks.filter((b) => b.palletId).map((b) => b.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 4 · Dispatch</h1>
        <p className="text-sm text-slate-400">
          Match bay stock to the sales order, scan onto the truck, and sync to SAP.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Sales orders</h2>
          {salesOrders.map((so) => (
            <button
              key={so.id}
              onClick={() => {
                setSelectedSOId(so.id);
                setWizard({ step: 'bay', bayRackId: null, palletId: null });
              }}
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
                <span className="text-slate-400">Remaining to dispatch</span>
                <span className="font-medium text-slate-200">{remaining.toLocaleString()} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Available on bay ({selectedSO.sku})</span>
                <span className="font-medium text-slate-200">{available.toLocaleString()} units</span>
              </div>
              {shortfall > 0 &&
                (() => {
                  const pendingApproval = directDispatchApprovals.find(
                    (a) => a.salesOrderId === selectedSO.id && a.status === 'PendingApproval',
                  );
                  const isApprover = can(currentUser?.role, 'approve:directDispatch');

                  const canRequest = can(currentUser?.role, 'execute:scan');

                  if (!pendingApproval) {
                    return (
                      <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-amber-300">
                        <span>Bay is short by {shortfall.toLocaleString()} units</span>
                        {canRequest ? (
                          <button
                            onClick={handleRequestApproval}
                            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500"
                          >
                            Request direct-dispatch approval
                          </button>
                        ) : (
                          <span className="text-xs">{currentUser?.role ?? 'This role'} cannot request this — requires Picker</span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-300">
                      <div>
                        Direct dispatch requested — {pendingApproval.shortfallQty.toLocaleString()} extra units
                        from Storage. Once approved, a Picker must still accept, release (Storage), and confirm
                        arrival (Loading Bay) before these units are dispatchable.
                      </div>
                      {isApprover ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(pendingApproval.id)}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Approve ({currentUser?.role})
                          </button>
                          <button
                            onClick={() => handleReject(pendingApproval.id)}
                            className="rounded-md border border-amber-700 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-900/40"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs">Awaiting HOD/Manager/Director approval.</p>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Dispatch wizard</h2>
          {!selectedSO && <p className="text-sm text-slate-500">Select a sales order to begin.</p>}
          {selectedSO && !can(currentUser?.role, 'execute:scan') && selectedSO.status !== 'Fulfilled' && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker.
            </p>
          )}
          {selectedSO && can(currentUser?.role, 'execute:scan') && selectedSO.status !== 'Fulfilled' && (
            <>
              {wizard.step === 'bay' && (
                <ScanInput
                  label="Scan bay rack"
                  placeholder="e.g. BAY-1"
                  onScan={handleScanBay}
                  suggestions={occupiedBayRackIds}
                />
              )}
              {wizard.step === 'pallet' && (
                <ScanInput
                  label={`Scan pallet on ${wizard.bayRackId}`}
                  placeholder="e.g. PLT-005"
                  onScan={handleScanPallet}
                  suggestions={wizard.bayRackId ? [bayRacks.find((b) => b.id === wizard.bayRackId)?.palletId ?? ''] : []}
                />
              )}
              {wizard.step === 'label' && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">
                    Print a temporary dispatch barcode and attach it to a vehicle before scanning.
                  </p>
                  {availableTrucks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handlePrintLabel(t.id, 'normal')}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      <span>
                        {t.id} <span className="text-slate-500">({t.dispatchLine})</span>
                      </span>
                      <span className="text-xs font-medium text-indigo-400">Print label</span>
                    </button>
                  ))}
                </div>
              )}
              {wizard.step === 'truck' && (
                <ScanInput
                  label="Scan the temporary vehicle barcode"
                  placeholder="e.g. VEH-ab12cd"
                  onScan={handleScanTruck}
                  suggestions={labeledTruck?.tempDispatchBarcode ? [labeledTruck.tempDispatchBarcode] : []}
                />
              )}
            </>
          )}
          {selectedSO?.status === 'Fulfilled' && (
            <p className="text-sm text-emerald-400">This sales order has been fully dispatched.</p>
          )}
        </div>

        {selectedSO && readyForDirectDispatch.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-violet-800 bg-violet-950/20 p-6 lg:col-span-2">
            <div>
              <h2 className="font-semibold text-violet-200">
                Direct dispatch — bypassing the loading bay
              </h2>
              <p className="text-xs text-violet-300/80">
                These pallets came from an approved shortfall and were released straight to the
                dispatch area — scan pallet, then truck, without a bay rack.
              </p>
            </div>
            {!can(currentUser?.role, 'execute:scan') ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker.
              </p>
            ) : (
              <>
                {directWizard.step === 'pallet' && (
                  <ScanInput
                    label="Scan pallet ready for direct dispatch"
                    placeholder="e.g. PLT-005"
                    onScan={handleDirectScanPallet}
                    suggestions={readyForDirectDispatch}
                  />
                )}
                {directWizard.step === 'label' && (
                  <div className="space-y-2">
                    <p className="text-sm text-violet-100">
                      Print a temporary dispatch barcode and attach it to a vehicle before scanning.
                    </p>
                    {availableTrucks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handlePrintLabel(t.id, 'direct')}
                        className="flex w-full items-center justify-between rounded-lg border border-violet-700 px-3 py-2 text-sm text-violet-100 hover:bg-violet-900/40"
                      >
                        <span>
                          {t.id} <span className="text-violet-400">({t.dispatchLine})</span>
                        </span>
                        <span className="text-xs font-medium text-violet-300">Print label</span>
                      </button>
                    ))}
                  </div>
                )}
                {directWizard.step === 'truck' && (
                  <ScanInput
                    label={`Scan the temporary vehicle barcode for pallet ${directWizard.palletId}`}
                    placeholder="e.g. VEH-ab12cd"
                    onScan={handleDirectScanTruck}
                    suggestions={labeledTruck?.tempDispatchBarcode ? [labeledTruck.tempDispatchBarcode] : []}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {bayRacks.map((b) => (
            <BayRackCard key={b.id} bayRack={b} highlighted={b.id === wizard.bayRackId} />
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

      {manifests.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Dispatch manifests
          </h2>
          <div className="space-y-3">
            {manifests
              .slice()
              .reverse()
              .map((m) => {
                const truck = trucks.find((t) => t.id === m.truckId);
                const confirmation = driverConfirmations.find((c) => c.manifestId === m.id);
                const form = confirmForms[m.id] ?? {
                  driverName: '',
                  driverSigned: false,
                  supervisorSigned: false,
                };
                return (
                  <div key={m.id} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-slate-100">{m.id}</span> — {m.customer} ·{' '}
                        {m.productName} · {m.totalQty.toLocaleString()} units · truck {m.truckId}
                        {truck && <span className="text-slate-500"> ({truck.dispatchLine})</span>} ·{' '}
                        {m.palletIds.length} pallet(s)
                      </div>
                      <StatusPill status={m.sapStatus} />
                    </div>

                    {!confirmation && (
                      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-800/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Dispatch confirmation form
                        </p>
                        <input
                          value={form.driverName}
                          onChange={(e) =>
                            setConfirmForms((f) => ({ ...f, [m.id]: { ...form, driverName: e.target.value } }))
                          }
                          placeholder="Driver name"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={form.driverSigned}
                            onChange={(e) =>
                              setConfirmForms((f) => ({ ...f, [m.id]: { ...form, driverSigned: e.target.checked } }))
                            }
                          />
                          Driver signature confirmed
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={form.supervisorSigned}
                            onChange={(e) =>
                              setConfirmForms((f) => ({
                                ...f,
                                [m.id]: { ...form, supervisorSigned: e.target.checked },
                              }))
                            }
                          />
                          Loading supervisor signature confirmed
                        </label>
                        {can(currentUser?.role, 'sign:supervisor') ? (
                          <button
                            onClick={() => handleSignConfirmation(m.id)}
                            disabled={!form.driverName.trim() || !form.driverSigned || !form.supervisorSigned}
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                          >
                            Generate & confirm
                          </button>
                        ) : (
                          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            {currentUser?.role ?? 'This role'} cannot sign as loading supervisor — requires
                            Manager, HOD, or Director.
                          </p>
                        )}
                      </div>
                    )}

                    {confirmation && (
                      <div className="space-y-1 rounded-lg border border-emerald-800 bg-emerald-950/20 p-3 text-xs">
                        <p className="mb-1 font-semibold uppercase tracking-wide text-emerald-400">
                          Dispatch confirmation form — signed
                        </p>
                        <Row label="Sales order" value={confirmation.salesOrderId} />
                        <Row label="Product" value={confirmation.productName} />
                        <Row label="Quantity" value={`${confirmation.totalQty.toLocaleString()} units`} />
                        <Row label="Batch numbers" value={confirmation.batchNumbers.join(', ')} />
                        <Row label="Pallet numbers" value={confirmation.palletIds.join(', ')} />
                        <Row label="Driver name" value={confirmation.driverName} />
                        <Row label="Dispatch line" value={confirmation.dispatchLine} />
                        <Row label="Date & time" value={new Date(confirmation.createdAt).toLocaleString()} />
                        <Row label="Driver signature" value={`Confirmed ${new Date(confirmation.driverSignedAt).toLocaleTimeString()}`} />
                        <Row
                          label="Loading supervisor signature"
                          value={`Confirmed ${new Date(confirmation.supervisorSignedAt).toLocaleTimeString()}`}
                        />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-200">{value}</span>
    </div>
  );
}
