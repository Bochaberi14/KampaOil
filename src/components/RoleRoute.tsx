import type { ReactNode } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { can, type Permission } from '../rbac';

export function RoleRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  const user = useWarehouseStore((s) => s.currentUser);

  if (!can(user?.role, permission)) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-white">Access denied</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your role ({user?.role ?? 'unknown'}) does not have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
