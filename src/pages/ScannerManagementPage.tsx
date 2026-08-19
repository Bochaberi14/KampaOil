import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { can } from '../rbac';

export function ScannerManagementPage() {
  const scanners = useWarehouseStore((s) => s.scanners);
  const scannerConfigChanges = useWarehouseStore((s) => s.scannerConfigChanges);
  const updateScannerWorkLocation = useWarehouseStore((s) => s.updateScannerWorkLocation);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const pushToast = useWarehouseStore((s) => s.pushToast);

  const [editingScannerIds, setEditingScannerIds] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({});

  const isAuthorized = can(currentUser?.role, 'admin:scanner-config');
  const workLocations: Array<'Production' | 'Storage' | 'Loading Bay' | 'Dispatch'> = [
    'Production',
    'Storage',
    'Loading Bay',
    'Dispatch',
  ];

  function handleEditClick(scannerId: string) {
    setEditingScannerIds((prev) => new Set(prev).add(scannerId));
    const scanner = scanners.find((s) => s.id === scannerId);
    if (scanner) {
      setSelectedLocations((prev) => ({ ...prev, [scannerId]: scanner.currentWorkLocation }));
    }
  }

  function handleCancelEdit(scannerId: string) {
    setEditingScannerIds((prev) => {
      const next = new Set(prev);
      next.delete(scannerId);
      return next;
    });
    setSelectedLocations((prev) => {
      const next = { ...prev };
      delete next[scannerId];
      return next;
    });
  }

  function handleSaveLocation(scannerId: string) {
    if (!currentUser) return;

    const newLocation = selectedLocations[scannerId];
    const result = updateScannerWorkLocation({
      scannerId,
      newLocation: newLocation as 'Production' | 'Storage' | 'Loading Bay' | 'Dispatch',
      operatorId: currentUser.id,
    });

    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }

    pushToast(`✓ Scanner ${scannerId} updated to ${newLocation}`, 'success');
    setEditingScannerIds((prev) => {
      const next = new Set(prev);
      next.delete(scannerId);
      return next;
    });
  }

  const recentChanges = scannerConfigChanges.slice(-10).reverse();
  const getUserName = (userId: string) => {
    // This would be better with a user lookup function, but we can show ID for now
    return userId;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Scanner Management</h1>
        <p className="text-sm text-slate-400">
          Configure scanner work locations. Only authorized users can make changes.
        </p>
      </div>

      {!isAuthorized && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-300">
            ⚠️ You don't have permission to manage scanners. Contact an administrator.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
          Active Scanners
        </h2>

        <div className="space-y-3">
          {scanners.map((scanner) => {
            const isEditing = editingScannerIds.has(scanner.id);
            const selectedLocation = selectedLocations[scanner.id] || scanner.currentWorkLocation;

            return (
              <div
                key={scanner.id}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="font-mono font-semibold text-slate-100">{scanner.scannerId}</p>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        scanner.status === 'Active'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {scanner.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {new Date(scanner.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {isEditing ? (
                    <>
                      <select
                        value={selectedLocation}
                        onChange={(e) =>
                          setSelectedLocations((prev) => ({ ...prev, [scanner.id]: e.target.value }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100"
                      >
                        {workLocations.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSaveLocation(scanner.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => handleCancelEdit(scanner.id)}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Current Location
                        </p>
                        <p className="mt-1 font-mono text-sm text-slate-100">
                          {scanner.currentWorkLocation}
                        </p>
                      </div>
                      {isAuthorized && (
                        <button
                          onClick={() => handleEditClick(scanner.id)}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                        >
                          Change
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {recentChanges.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Recent Configuration Changes
          </h2>

          <div className="space-y-2">
            {recentChanges.map((change) => (
              <div
                key={change.id}
                className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-xs"
              >
                <div className="flex-1">
                  <p className="font-mono font-semibold text-slate-100">{change.scannerId}</p>
                  <p className="mt-1 text-slate-400">
                    {change.previousLocation} → <span className="text-emerald-400">{change.newLocation}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">{getUserName(change.changedByUserId)}</p>
                  <p className="text-slate-500">{new Date(change.changedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
