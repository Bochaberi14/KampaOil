import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { StatusPill } from '../components/StatusPill';
import { can } from '../rbac';
import type { PickTask } from '../types/domain';
import { STORAGE_ZONES, LOADING_BAY_ZONES } from '../data/seed';

export function PickerTasksPage() {
  const pickTasks = useWarehouseStore((s) => s.pickTasks);
  const racks = useWarehouseStore((s) => s.racks);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const isPicker = can(currentUser?.role, 'execute:pickTask');

  const getZoneFromRackId = (rackId: string) => {
    const rack = racks.find((r) => r.id === rackId);
    if (!rack?.zoneId) return null;
    const zone = STORAGE_ZONES.find((z) => z.id === rack.zoneId) || LOADING_BAY_ZONES.find((z) => z.id === rack.zoneId);
    return zone;
  };

  const myAssignedTasks = pickTasks.filter(
    (t) => t.status === 'Accepted' && t.assignedPickerId === currentUser?.id,
  );
  const myCompletedTasks = pickTasks.filter(
    (t) => t.status === 'Completed' && t.assignedPickerId === currentUser?.id,
  );
  const selectedTask = pickTasks.find((t) => t.id === selectedTaskId) ?? null;


  if (!isPicker) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold text-white">My Pick Tasks</h1>
          <p className="text-sm text-slate-400">This page is for Pickers only.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const getTaskTypeLabel = (task: PickTask) => {
    if (task.origin === 'Production') return 'Put-away (Production)';
    if (task.origin === 'Storage') return 'Pick (Storage)';
    if (task.origin === 'Bay-Topup') return 'Pick (Bay Top-up)';
    if (task.origin === 'Dispatch') return 'Dispatch Picking';
    return task.origin;
  };

  const getTaskInstructions = (task: PickTask) => {
    if (task.origin === 'Production') {
      return 'Move pallets to loading bay: scan pallet → scan bay rack';
    }
    if (task.origin === 'Storage') {
      return 'Release pallets from storage to loading bay: scan pallet → scan bay rack';
    }
    if (task.origin === 'Dispatch') {
      return 'Pick products from bay and stage at assigned dispatch line';
    }
    return 'Release pallets to loading bay';
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">My Pick Tasks</h1>
        <p className="text-sm text-slate-400">Tasks assigned to you — click for details.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Assigned tasks */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold text-slate-200 mb-3">Assigned</h2>
            {myAssignedTasks.length === 0 && (
              <p className="text-sm text-slate-500">No assigned tasks right now.</p>
            )}
            <div className="space-y-2">
              {myAssignedTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selectedTaskId === t.id
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-200">{t.id}</div>
                    <div className="text-xs text-slate-500">{getTaskTypeLabel(t)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 mb-1">
                      {t.items.filter((i) => i.picked).length}/{t.items.length} done
                    </div>
                    <span className="inline-block px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-xs font-medium">
                      Assigned
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Completed tasks */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold text-slate-200 mb-3">Completed</h2>
            {myCompletedTasks.length === 0 && (
              <p className="text-sm text-slate-500">No completed tasks yet.</p>
            )}
            <div className="space-y-2">
              {myCompletedTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selectedTaskId === t.id
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-200">{t.id}</div>
                    <div className="text-xs text-slate-500">{getTaskTypeLabel(t)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 mb-1">
                      {t.items.length}/{t.items.length} done
                    </div>
                    <span className="inline-block px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-medium">
                      Completed ✓
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task details */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200 mb-4">Details</h2>
          {!selectedTask && (
            <p className="text-sm text-slate-500">Select a task to view details.</p>
          )}
          {selectedTask && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task ID</p>
                <p className="font-mono text-sm text-slate-200">{selectedTask.id}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</p>
                <p className="text-sm text-slate-200">{getTaskTypeLabel(selectedTask)}</p>
              </div>

              {selectedTask.salesOrderId && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales Order</p>
                  <p className="text-sm text-slate-200">{selectedTask.salesOrderId}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <StatusPill status={selectedTask.status} />
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pallets to move</p>
                  <div className="text-xs text-slate-300 bg-slate-800/40 rounded px-2 py-1.5">
                    {selectedTask.items.map((item) => item.palletId).join(', ')}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">From storage (zones)</p>
                  <div className="space-y-1">
                    {selectedTask.items.map((item) => {
                      const zone = getZoneFromRackId(item.sourceRackId);
                      return (
                        <div key={item.palletId} className="text-xs text-slate-300 bg-slate-800/40 rounded px-2 py-1.5 flex justify-between items-center">
                          <span>{item.palletId} at {item.sourceRackId}</span>
                          {zone && (
                            <span className="text-slate-500 font-mono text-[10px]">{zone.id} ({zone.name})</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">To loading bay</p>
                  <div className="text-xs text-slate-300 bg-slate-800/40 rounded px-2 py-1.5">
                    Bay racks (system will guide you)
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <div className="text-xs">
                    {selectedTask.items.every((i) => i.picked) ? (
                      <span className="text-emerald-400">✓ Complete — all pallets in bay</span>
                    ) : (
                      <span className="text-slate-400">{selectedTask.items.filter((i) => i.picked).length}/{selectedTask.items.length} pallets in bay</span>
                    )}
                  </div>
                </div>
              </div>

              {selectedTask.status === 'Accepted' && (
                <div className="rounded-lg border border-amber-800 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-amber-300">{getTaskInstructions(selectedTask)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
