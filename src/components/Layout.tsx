import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ToastStack } from './ToastStack';
import { SapSyncPanel } from './SapSyncPanel';
import { can, type Permission } from '../rbac';

const NAV: { to: string; label: string; permission: Permission }[] = [
  { to: '/dashboard', label: 'Dashboard', permission: 'view:dashboard' },
  { to: '/production', label: '1 · Production', permission: 'view:production' },
  { to: '/storage', label: '2 · Storage', permission: 'view:storage' },
  { to: '/loading-bay', label: '3 · Loading Bay', permission: 'view:loading-bay' },
  { to: '/dispatch', label: '4 · Dispatch', permission: 'view:dispatch' },
  { to: '/hold', label: '5 · Hold', permission: 'view:hold' },
  { to: '/recall', label: '6 · Recall', permission: 'view:recall' },
  { to: '/audit', label: '7 · Audit', permission: 'view:audit' },
];

export function Layout() {
  const user = useWarehouseStore((s) => s.currentUser);
  const logout = useWarehouseStore((s) => s.logout);
  const resetDemo = useWarehouseStore((s) => s.resetDemo);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const pendingAcceptanceCount = useWarehouseStore(
    (s) => s.pickTasks.filter((t) => t.status === 'PendingAcceptance').length,
  );
  const pendingApprovalCount = useWarehouseStore(
    (s) => s.directDispatchApprovals.filter((a) => a.status === 'PendingApproval').length,
  );
  const navigate = useNavigate();
  const visibleNav = NAV.filter((item) => can(user?.role, item.permission));

  const badgeByPath: Record<string, number> = {
    '/storage': pendingAcceptanceCount,
    '/dispatch': pendingApprovalCount,
  };

  // Announce what's awaiting this role the moment they log in — and again if
  // more piles up while they're still signed in (e.g. a second shortfall gets
  // approved while a Picker is mid-session).
  const notifiedRef = useRef<{ userId: string | null; acceptance: number; approval: number }>({
    userId: null,
    acceptance: 0,
    approval: 0,
  });
  useEffect(() => {
    if (!user) {
      notifiedRef.current = { userId: null, acceptance: 0, approval: 0 };
      return;
    }
    const isNewSession = notifiedRef.current.userId !== user.id;
    const prevAcceptance = isNewSession ? 0 : notifiedRef.current.acceptance;
    const prevApproval = isNewSession ? 0 : notifiedRef.current.approval;

    if (can(user.role, 'execute:pickTask') && pendingAcceptanceCount > prevAcceptance) {
      pushToast(
        `${pendingAcceptanceCount} pick task${pendingAcceptanceCount === 1 ? '' : 's'} awaiting your acceptance in Storage`,
        'info',
      );
    }
    if (can(user.role, 'approve:directDispatch') && pendingApprovalCount > prevApproval) {
      pushToast(
        `${pendingApprovalCount} direct-dispatch request${pendingApprovalCount === 1 ? '' : 's'} awaiting your approval`,
        'info',
      );
    }
    notifiedRef.current = { userId: user.id, acceptance: pendingAcceptanceCount, approval: pendingApprovalCount };
  }, [user, pendingAcceptanceCount, pendingApprovalCount, pushToast]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleReset() {
    if (
      confirm(
        'Reset the demo? This clears all production/storage/dispatch state back to the starting seed.',
      )
    ) {
      resetDemo();
      navigate('/login');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-lg font-bold text-white">
              Kampa Oil <span className="font-normal text-slate-500">· WMS Prototype</span>
            </span>
            <nav className="flex flex-wrap gap-1">
              {visibleNav.map((item) => {
                const badge = badgeByPath[item.to] ?? 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                        isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`
                    }
                  >
                    {item.label}
                    {badge > 0 && (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold leading-none text-slate-950">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-slate-400">
                {user.name} <span className="text-slate-600">·</span> {user.role}
              </span>
            )}
            <SapSyncPanel />
            <button
              onClick={handleReset}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
            >
              Reset demo
            </button>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <ToastStack />
    </div>
  );
}
