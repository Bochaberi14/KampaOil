import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { can } from '../rbac';

type WizardStep = 'pallet' | 'bay';

export function LoadingBayPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const pallets = useWarehouseStore((s) => s.pallets);
  const loads = useWarehouseStore((s) => s.loads);
  const requestPick = useWarehouseStore((s) => s.requestPick);
  const scanBayRackForPick = useWarehouseStore((s) => s.scanBayRackForPick);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null }>({
    step: 'pallet',
    palletId: null,
  });

  const openTasks = pickTasks.filter((t) => t.status !== 'Completed');
  const activeTask = openTasks.find((t) => t.id === activeTaskId) ?? null;
  const arrivingPalletIds =
    activeTask?.items
      .filter((i) => !i.picked)
      .map((i) => i.palletId)
      .filter((id) => pallets.find((p) => p.id === id)?.status === 'InTransitToBay') ?? [];

  function handleRequestPick(soId: string) {
    const result = requestPick(soId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setActiveTaskId(result.data.task.id);
    pushToast(
      `Pick task created — ${result.data.task.items.length} pallet(s), FIFO order. Awaiting Picker acceptance in Storage.`,
      'success',
    );
  }

  function handleScanPallet(palletId: string) {
    if (!activeTask) return;
    if (!arrivingPalletIds.includes(palletId)) {
      pushToast(`Pallet ${palletId} is not currently in transit to this bay — scan rejected`, 'error');
      return;
    }
    setWizard({ step: 'bay', palletId });
  }

  function handleScanBay(bayRackId: string) {
    if (!activeTask || !wizard.palletId || !currentUser) return;
    const result = scanBayRackForPick({
      pickTaskId: activeTask.id,
      palletId: wizard.palletId,
      bayRackId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setWizard({ step: 'pallet', palletId: null });
    if (result.data.completed) {
      pushToast('Pick task completed', 'success');
      setActiveTaskId(null);
    }
  }

  const freeBayRackIds = bayRacks.filter((b) => b.slots.some((s) => s.palletId === null)).map((b) => b.id);
  const isPicker = can(currentUser?.role, 'execute:scan');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 3 · Loading Bay</h1>
        <p className="text-sm text-slate-400">
          FIFO picking from storage to the loading bay — whole pallets only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Sales orders</h2>
          {salesOrders.map((so) => (
            <div key={so.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-200">
                  {so.id} · {so.customer}
                </div>
                <div className="text-xs text-slate-500">
                  {so.productName} — {so.dispatchedQty.toLocaleString()} / {so.qty.toLocaleString()} units
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={so.status} />
                {so.status !== 'Fulfilled' && isPicker && (
                  <button
                    onClick={() => handleRequestPick(so.id)}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    {so.status === 'Pending' ? 'Request pick' : 'Request more'}
                  </button>
                )}
              </div>
            </div>
          ))}

          <h2 className="pt-3 font-semibold text-slate-200">Active pick tasks</h2>
          <p className="text-xs text-slate-500">
            A request only creates the task — Storage must accept and release each pallet before it
            arrives here.
          </p>
          {openTasks.length === 0 && <p className="text-xs text-slate-500">None right now.</p>}
          {openTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTaskId(t.id);
                setWizard({ step: 'pallet', palletId: null });
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                activeTaskId === t.id ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              <span className="text-slate-200">
                {t.id} <span className="text-slate-500">· {t.origin}</span> · for {t.salesOrderId}
              </span>
              <div className="flex items-center gap-2">
                <StatusPill status={t.status} />
                <span className="text-xs text-slate-500">
                  {t.items.filter((i) => i.picked).length}/{t.items.length} arrived
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Bay arrival wizard</h2>
          {!activeTask && (
            <p className="text-sm text-slate-500">Select an active pick task to confirm arrivals.</p>
          )}
          {activeTask && (
            <>
              <ul className="space-y-1 text-xs">
                {activeTask.items.map((item) => {
                  const palletStatus = pallets.find((p) => p.id === item.palletId)?.status;
                  const label = item.picked
                    ? 'On bay ✓'
                    : palletStatus === 'InTransitToBay'
                      ? 'In transit — arriving'
                      : `awaiting Storage release (at ${item.sourceRackId})`;
                  return (
                    <li key={item.palletId} className="flex items-center justify-between">
                      <span className="font-mono text-slate-300">{item.palletId}</span>
                      <span className={item.picked ? 'text-emerald-400' : 'text-slate-500'}>{label}</span>
                    </li>
                  );
                })}
              </ul>

              {activeTask.status === 'PendingAcceptance' && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Awaiting a Picker to accept this task on the Storage screen.
                </p>
              )}

              {activeTask.status === 'Accepted' && arrivingPalletIds.length === 0 && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Accepted by the assigned Picker — waiting for pallets to be released from Storage.
                </p>
              )}

              {isPicker && activeTask.status === 'Accepted' && arrivingPalletIds.length > 0 && wizard.step === 'pallet' && (
                <ScanInput
                  label="Scan arriving pallet"
                  placeholder="e.g. PLT-005"
                  onScan={handleScanPallet}
                  suggestions={arrivingPalletIds}
                />
              )}
              {isPicker && wizard.step === 'bay' && (
                <ScanInput
                  label={`Scan bay rack for pallet ${wizard.palletId}`}
                  placeholder="e.g. BAY-1"
                  onScan={handleScanBay}
                  suggestions={freeBayRackIds}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay racks
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bayRacks.map((b) => (
            <RackGrid key={b.id} rack={b} highlightPalletId={wizard.palletId ?? undefined} loads={loads} />
          ))}
        </div>
      </div>
    </div>
  );
}
