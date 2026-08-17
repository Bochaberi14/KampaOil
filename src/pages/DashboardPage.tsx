import { Link } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { RackGrid } from '../components/RackGrid';
import { StatusPill } from '../components/StatusPill';
import { countFreeRackSlots, countRackedPallets, summarizePallets } from '../engine/rules';
import { ROLE_BLURB } from '../rbac';
import { USERS } from '../data/seed';

export function DashboardPage() {
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const trucks = useWarehouseStore((s) => s.trucks);
  const productionOrders = useWarehouseStore((s) => s.productionOrders);
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const movements = useWarehouseStore((s) => s.movements);
  const loads = useWarehouseStore((s) => s.loads);
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const manifests = useWarehouseStore((s) => s.manifests);
  const holds = useWarehouseStore((s) => s.holds);
  const recallCases = useWarehouseStore((s) => s.recallCases);
  const sapSyncing = useWarehouseStore((s) => s.sapSyncing);

  const freePallets = pallets.filter((p) => p.status === 'Empty').length;
  const rackedCount = countRackedPallets(racks);
  const freeSlots = countFreeRackSlots(racks);
  const palletSummary = summarizePallets(pallets);

  // Nobody currently has a bird's-eye view across pickers — Storage only
  // shows "my tasks" for whoever's logged in. This gives a Manager/HOD/
  // Director/Loader a read of who's actively picking vs. free, using data
  // the store already tracks (no new state needed).
  const pendingAcceptanceCount = pickTasks.filter((t) => t.status === 'PendingAcceptance').length;
  const pickerStatuses = USERS.filter((u) => u.role === 'Picker').map((picker) => {
    const myTasks = pickTasks
      .filter((t) => t.assignedPickerId === picker.id)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const active = myTasks.find((t) => t.status === 'Accepted');
    if (active) {
      const released = active.items.filter((i) => i.picked).length;
      return {
        userId: picker.id,
        name: picker.name,
        status: 'Picking',
        detail: `${active.salesOrderId} — ${released}/${active.items.length} released`,
      };
    }
    const lastCompleted = myTasks.find((t) => t.status === 'Completed');
    return {
      userId: picker.id,
      name: picker.name,
      status: 'Available',
      detail: lastCompleted
        ? `Last completed: ${lastCompleted.salesOrderId} · ${lastCompleted.items.length} pallet(s)`
        : 'No tasks yet',
    };
  });

  const guideSteps = [
    {
      label: '1 · Production',
      hint: 'Scan a line, bind an empty pallet, confirm the load once full.',
      to: '/production',
      done: loads.length > 0,
    },
    {
      label: '2 · Storage',
      hint: 'Scan a loaded pallet leaving the line, then scan the rack it lands on.',
      to: '/storage',
      done: pallets.some((p) => p.status === 'Racked'),
    },
    {
      label: '3 · Loading Bay',
      hint: 'Request a pick for a sales order — Storage then accepts and releases it, and it arrives here.',
      to: '/loading-bay',
      done: pickTasks.some((t) => t.status === 'Completed'),
    },
    {
      label: '4 · Dispatch',
      hint: 'Picker scans LINE 001 once picking is complete, then the Loader registers/verifies the vehicle and signs the handover.',
      to: '/dispatch',
      done: manifests.length > 0,
    },
    {
      label: '5 · Hold',
      hint: 'Place a hold on a pallet (requires Manager, HOD, or Director).',
      to: '/hold',
      done: holds.length > 0,
    },
    {
      label: '6 · Recall',
      hint: 'Process a held pallet through Line 50 and return it to storage.',
      to: '/recall',
      done: recallCases.some((c) => c.status === 'Completed'),
    },
    {
      label: '7 · Audit',
      hint: 'Review live inventory reports and flag discrepancies.',
      to: '/audit',
      done: countRackedPallets(racks) > 0,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Warehouse Dashboard</h1>
        <p className="text-sm text-slate-400">
          Live view across production, storage, loading bay, and dispatch.
          {sapSyncing && ' Syncing with SAP…'}
        </p>
        {currentUser && (
          <p className="mt-1 text-xs text-slate-500">
            Signed in as <span className="text-slate-300">{currentUser.name}</span> ·{' '}
            {currentUser.role} — {ROLE_BLURB[currentUser.role]}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Guided demo walkthrough
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {guideSteps.map((step) => (
            <Link
              key={step.to}
              to={step.to}
              className={`rounded-xl border p-4 transition ${
                step.done
                  ? 'border-emerald-800 bg-emerald-950/30'
                  : 'border-slate-800 bg-slate-800/60 hover:border-indigo-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{step.label}</span>
                <span className={step.done ? 'text-emerald-400' : 'text-slate-600'}>
                  {step.done ? '✓' : '→'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{step.hint}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Free pallets" value={freePallets} />
        <StatTile label="Pallets in storage" value={rackedCount} />
        <StatTile label="Free rack slots" value={freeSlots} />
        <StatTile
          label="Trucks staged"
          value={`${trucks.filter((t) => t.status === 'Staged').length} / ${trucks.length}`}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Picker activity
          </h2>
          <span className="text-xs text-slate-500">
            {pendingAcceptanceCount} task{pendingAcceptanceCount === 1 ? '' : 's'} awaiting acceptance
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pickerStatuses.map((p) => (
            <div key={p.userId} className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{p.name}</span>
                <StatusPill status={p.status} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{p.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pallet inventory
          </h2>
          <span className="text-xs text-slate-500">{palletSummary.total} pallets total</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Total pallets" value={palletSummary.total} />
          <StatTile label="Empty pallets" value={palletSummary.empty} />
          <StatTile label="Occupied pallets" value={palletSummary.occupied} />
          <StatTile label="Stages in use" value={palletSummary.byStage.length} />
        </div>
        {palletSummary.byStage.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {palletSummary.byStage.map((s) => (
              <span
                key={s.label}
                className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300"
              >
                {s.label}: <span className="font-semibold text-slate-100">{s.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Production orders (from SAP)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {productionOrders.map((po) => (
            <div key={po.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-200">
                  {po.id} — {po.productName}
                </span>
                <StatusPill status={po.status} />
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
                <div
                  className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, (po.fulfilledQty / po.targetQty) * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {po.fulfilledQty.toLocaleString()} / {po.targetQty.toLocaleString()} units · Line{' '}
                {po.lineId}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sales orders (from SAP)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {salesOrders.map((so) => (
            <div key={so.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-200">
                  {so.id} — {so.customer}
                </span>
                <StatusPill status={so.status} />
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, (so.dispatchedQty / so.qty) * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {so.dispatchedQty.toLocaleString()} / {so.qty.toLocaleString()} units · {so.productName}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Inventory by rack
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {racks.map((r) => (
            <RackGrid key={r.id} rack={r} loads={loads} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent movements
        </h2>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900">
          {movements.length === 0 && <p className="p-4 text-sm text-slate-500">No movements yet.</p>}
          {movements
            .slice()
            .reverse()
            .slice(0, 20)
            .map((m) => (
              <div
                key={m.id}
                className="flex justify-between border-b border-slate-800 px-4 py-2 text-xs last:border-0"
              >
                <span className="font-mono text-slate-300">{m.palletId}</span>
                <span className="text-slate-500">
                  {m.from} → {m.to}
                </span>
                <span className="text-slate-600">{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
