import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ToastStack } from './ToastStack';
import { SapSyncPanel } from './SapSyncPanel';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/production', label: '1 · Production' },
  { to: '/storage', label: '2 · Storage' },
  { to: '/loading-bay', label: '3 · Loading Bay' },
  { to: '/dispatch', label: '4 · Dispatch' },
  { to: '/hold', label: '5 · Hold' },
  { to: '/recall', label: '6 · Recall' },
  { to: '/audit', label: '7 · Audit' },
];

export function Layout() {
  const user = useWarehouseStore((s) => s.currentUser);
  const logout = useWarehouseStore((s) => s.logout);
  const resetDemo = useWarehouseStore((s) => s.resetDemo);
  const navigate = useNavigate();

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
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
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
