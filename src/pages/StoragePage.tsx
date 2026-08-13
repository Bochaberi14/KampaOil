import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ScanInput } from '../components/ScanInput';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { countFreeRackSlots, countRackedPallets } from '../engine/rules';
import { can } from '../rbac';

type WizardStep = 'pallet' | 'rack';
type ReleaseWizardStep = 'rack' | 'pallet';

export function StoragePage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const loads = useWarehouseStore((s) => s.loads);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const scanPalletLeavingLine = useWarehouseStore((s) => s.scanPalletLeavingLine);
  const scanPalletToRack = useWarehouseStore((s) => s.scanPalletToRack);
  const acceptPickTask = useWarehouseStore((s) => s.acceptPickTask);
  const declinePickTask = useWarehouseStore((s) => s.declinePickTask);
  const findPickItemByRack = useWarehouseStore((s) => s.findPickItemByRack);
  const scanRackForPick = useWarehouseStore((s) => s.scanRackForPick);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [wizard, setWizard] = useState<{ step: WizardStep; palletId: string | null }>({
    step: 'pallet',
    palletId: null,
  });

  const [releaseTaskId, setReleaseTaskId] = useState<string | null>(null);
  const [releaseWizard, setReleaseWizard] = useState<{
    step: ReleaseWizardStep;
    rackId: string | null;
    palletId: string | null;
  }>({ step: 'rack', rackId: null, palletId: null });

  const isPicker = can(currentUser?.role, 'execute:pickTask');
  const pendingTasks = pickTasks.filter((t) => t.status === 'PendingAcceptance');
  const myAcceptedTasks = pickTasks.filter(
    (t) => t.status === 'Accepted' && t.assignedPickerId === currentUser?.id,
  );
  const releaseTask = myAcceptedTasks.find((t) => t.id === releaseTaskId) ?? null;

  function handleAccept(taskId: string) {
    if (!currentUser) return;
    const result = acceptPickTask(taskId, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setReleaseTaskId(taskId);
    setReleaseWizard({ step: 'rack', rackId: null, palletId: null });
    pushToast(`Pick task ${taskId} accepted — scan the rack, then the pallet, for each item`, 'success');
  }

  function handleDecline(taskId: string) {
    if (!currentUser) return;
    const result = declinePickTask(taskId, currentUser.id);
    if (!result.ok) pushToast(result.error, 'error');
    if (releaseTaskId === taskId) setReleaseTaskId(null);
  }

  function handleReleaseScanRack(rackId: string) {
    if (!releaseTask) return;
    const result = findPickItemByRack(releaseTask.id, rackId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setReleaseWizard({ step: 'pallet', rackId, palletId: result.data.palletId });
  }

  function handleReleaseScanPallet(palletId: string) {
    if (!releaseTask || !releaseWizard.rackId || !currentUser) return;
    if (palletId !== releaseWizard.palletId) {
      pushToast(`Pallet ${palletId} does not match the pallet expected at ${releaseWizard.rackId}`, 'error');
      return;
    }
    const result = scanRackForPick({
      pickTaskId: releaseTask.id,
      palletId,
      rackId: releaseWizard.rackId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    if (releaseTask.origin !== 'Bay-Topup') {
      pushToast(`Pallet ${palletId} released to the loading bay — continue on the Loading Bay screen`, 'success');
    }
    setReleaseWizard({ step: 'rack', rackId: null, palletId: null });
  }

  const loadedPallets = pallets.filter((p) => p.status === 'Loaded').map((p) => p.id);
  const inTransitPallets = pallets.filter((p) => p.status === 'InTransitToStorage').map((p) => p.id);

  function handleScanPallet(palletId: string) {
    if (!currentUser) return;
    const pallet = pallets.find((p) => p.id === palletId);

    // Pallet already departed the line in an earlier session (e.g. the page was
    // left mid-move) — resume at the rack step instead of re-departing it.
    if (pallet?.status === 'InTransitToStorage') {
      setWizard({ step: 'rack', palletId });
      return;
    }

    const result = scanPalletLeavingLine(palletId, currentUser.id);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    pushToast(`Pallet ${palletId} left the line — now scan its destination rack`, 'success');
    setWizard({ step: 'rack', palletId });
  }

  function handleScanRack(rackId: string) {
    if (!wizard.palletId || !currentUser) return;
    const result = scanPalletToRack({ palletId: wizard.palletId, rackId, operatorId: currentUser.id });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setWizard({ step: 'pallet', palletId: null });
  }

  function cancel() {
    setWizard({ step: 'pallet', palletId: null });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Stage 2 · Storage</h1>
        <p className="text-sm text-slate-400">
          Scan a pallet leaving the line, then scan the rack it lands on — one continuous move.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <StepDot active={wizard.step === 'pallet'} label="1. Scan pallet leaving line" />
          <StepDot active={wizard.step === 'rack'} label="2. Scan destination rack" />
        </div>

        {wizard.step === 'pallet' && (
          <>
            <ScanInput
              label="Scan pallet leaving production"
              placeholder="e.g. PLT-002"
              onScan={handleScanPallet}
              suggestions={loadedPallets}
            />
            {inTransitPallets.length > 0 && (
              <p className="text-xs text-amber-300">
                Already in transit, awaiting a rack scan: {inTransitPallets.join(', ')} — scan one of
                these to resume.
              </p>
            )}
          </>
        )}

        {wizard.step === 'rack' && (
          <>
            <p className="text-sm text-slate-300">
              Pallet <span className="font-mono font-semibold text-slate-100">{wizard.palletId}</span>{' '}
              is in transit to storage — now scan the destination rack.
            </p>
            <ScanInput
              label="Scan rack barcode"
              placeholder="e.g. R-A"
              onScan={handleScanRack}
              suggestions={racks.map((r) => r.id)}
            />
            <button onClick={cancel} className="text-xs text-slate-500 hover:text-slate-300">
              Cancel / start over
            </button>
          </>
        )}
      </div>

      {isPicker && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200">
            Pending pick tasks — Storage only releases stock after a Loading Bay request
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            A pick task waits here until a Picker accepts it. Only the assigned Picker can then
            release its pallets — scan the rack first, then the pallet, per pallet.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Awaiting acceptance
              </h3>
              {pendingTasks.length === 0 && <p className="text-xs text-slate-500">None right now.</p>}
              {pendingTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm">
                  <span className="text-slate-200">
                    {t.id} <span className="text-slate-500">· {t.origin}</span> · {t.items.length} pallet(s) for{' '}
                    {t.salesOrderId}
                  </span>
                  <button
                    onClick={() => handleAccept(t.id)}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Accept
                  </button>
                </div>
              ))}

              <h3 className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Accepted by me
              </h3>
              {myAcceptedTasks.length === 0 && <p className="text-xs text-slate-500">None right now.</p>}
              {myAcceptedTasks.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    releaseTaskId === t.id ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800'
                  }`}
                >
                  <button
                    onClick={() => {
                      setReleaseTaskId(t.id);
                      setReleaseWizard({ step: 'rack', rackId: null, palletId: null });
                    }}
                    className="flex-1 text-left text-slate-200"
                  >
                    {t.id} · for {t.salesOrderId}
                    <span className="ml-2 text-xs text-slate-500">
                      {t.items.filter((i) => i.picked).length}/{t.items.length} released
                    </span>
                  </button>
                  <button
                    onClick={() => handleDecline(t.id)}
                    className="ml-2 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Decline
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Release wizard
              </h3>
              {!releaseTask && <p className="text-sm text-slate-500">Select an accepted task to release its pallets.</p>}
              {releaseTask && (
                <>
                  <ul className="space-y-1 text-xs">
                    {releaseTask.items.map((item) => (
                      <li key={item.palletId} className="flex items-center justify-between">
                        <span className="font-mono text-slate-300">{item.palletId}</span>
                        <StatusPill status={item.picked ? 'Released' : `at ${item.sourceRackId}`} />
                      </li>
                    ))}
                  </ul>
                  {releaseWizard.step === 'rack' && (
                    <ScanInput
                      label="Scan rack (step 1)"
                      placeholder="e.g. R-A"
                      onScan={handleReleaseScanRack}
                      suggestions={racks.map((r) => r.id)}
                    />
                  )}
                  {releaseWizard.step === 'pallet' && (
                    <ScanInput
                      label={`Scan pallet at ${releaseWizard.rackId} (step 2)`}
                      placeholder="e.g. PLT-005"
                      onScan={handleReleaseScanPallet}
                      suggestions={releaseWizard.palletId ? [releaseWizard.palletId] : []}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Live inventory by rack
          </h2>
          <span className="text-xs text-slate-500">
            {countFreeRackSlots(racks)} free slots · {countRackedPallets(racks)} pallets stored
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((rack) => (
            <RackGrid key={rack.id} rack={rack} highlightPalletId={wizard.palletId ?? undefined} loads={loads} />
          ))}
        </div>
      </div>
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
