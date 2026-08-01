import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { BayRackCard } from '../components/EntityCards';
import { StatusPill } from '../components/StatusPill';

type WizardStep = 'pallet' | 'rack' | 'bay';

export function LoadingBayPage() {
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const racks = useWarehouseStore((s) => s.racks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const requestPick = useWarehouseStore((s) => s.requestPick);
  const scanRackForPick = useWarehouseStore((s) => s.scanRackForPick);
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

  function handleRequestPick(soId: string) {
    const result = requestPick(soId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setActiveTaskId(result.data.task.id);
    pushToast(`Pick task created — ${result.data.task.items.length} pallet(s), FIFO order`, 'success');
  }

  function handleScanPallet(palletId: string) {
    if (!activeTask) return;
    const item = activeTask.items.find((i) => i.palletId === palletId);
    if (!item) {
      pushToast(`Pallet ${palletId} is not part of this pick task — scan rejected`, 'error');
      return;
    }
    if (item.picked) {
      pushToast(`Pallet ${palletId} has already been picked`, 'error');
      return;
    }
    setWizard({ step: 'rack', palletId });
  }

  function handleScanRack(rackId: string) {
    if (!activeTask || !wizard.palletId || !currentUser) return;
    const result = scanRackForPick({
      pickTaskId: activeTask.id,
      palletId: wizard.palletId,
      rackId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Pallet ${wizard.palletId} picked — now scan a bay rack`, 'success');
    setWizard({ step: 'bay', palletId: wizard.palletId });
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

  const unpickedPalletIds = activeTask?.items.filter((i) => !i.picked).map((i) => i.palletId) ?? [];
  const freeBayRackIds = bayRacks.filter((b) => !b.palletId).map((b) => b.id);

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
                {so.status === 'Pending' && (
                  <button
                    onClick={() => handleRequestPick(so.id)}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Request pick
                  </button>
                )}
              </div>
            </div>
          ))}

          <h2 className="pt-3 font-semibold text-slate-200">Active pick tasks</h2>
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
              <span className="text-xs text-slate-500">
                {t.items.filter((i) => i.picked).length}/{t.items.length} picked
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">Picking wizard</h2>
          {!activeTask && (
            <p className="text-sm text-slate-500">Select an active pick task to start scanning.</p>
          )}
          {activeTask && (
            <>
              <ul className="space-y-1 text-xs">
                {activeTask.items.map((item) => (
                  <li key={item.palletId} className="flex items-center justify-between">
                    <span className="font-mono text-slate-300">{item.palletId}</span>
                    <span className={item.picked ? 'text-emerald-400' : 'text-slate-500'}>
                      {item.picked ? 'On bay ✓' : `at ${item.sourceRackId}`}
                    </span>
                  </li>
                ))}
              </ul>

              {wizard.step === 'pallet' && (
                <ScanInput
                  label="Scan pallet"
                  placeholder="e.g. PLT-005"
                  onScan={handleScanPallet}
                  suggestions={unpickedPalletIds}
                />
              )}
              {wizard.step === 'rack' && (
                <ScanInput
                  label={`Scan rack for pallet ${wizard.palletId}`}
                  placeholder="e.g. R-A"
                  onScan={handleScanRack}
                  suggestions={racks.map((r) => r.id)}
                />
              )}
              {wizard.step === 'bay' && (
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
          Storage racks
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((rack) => (
            <RackGrid key={rack.id} rack={rack} highlightPalletId={wizard.palletId ?? undefined} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading bay racks
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {bayRacks.map((b) => (
            <BayRackCard key={b.id} bayRack={b} highlighted={b.palletId === wizard.palletId} />
          ))}
        </div>
      </div>
    </div>
  );
}
