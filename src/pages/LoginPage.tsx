import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { USERS } from '../data/seed';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ROLE_BLURB } from '../rbac';

export function LoginPage() {
  const login = useWarehouseStore((s) => s.login);
  const loadSapData = useWarehouseStore((s) => s.loadSapData);
  const [pending, setPending] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleLogin(userId: string) {
    setPending(userId);
    login(userId);
    await loadSapData();
    setPending(null);
    navigate('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-black/30">
        <h1 className="text-2xl font-bold text-white">Kapa Oil</h1>
        <p className="mt-1 text-sm text-slate-400">
          Warehousing & Production Execution — Prototype
        </p>

        <div className="mt-8 space-y-3">
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => handleLogin(u.id)}
              disabled={pending !== null}
              className="flex w-full items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-left hover:border-indigo-500 hover:bg-indigo-950/40 disabled:opacity-50"
            >
              <div>
                <div className="font-semibold text-slate-100">{u.name}</div>
                <div className="text-xs text-slate-500">{u.role}</div>
                <div className="mt-0.5 text-xs text-slate-600">{ROLE_BLURB[u.role]}</div>
              </div>
              {pending === u.id ? (
                <span className="text-xs text-indigo-400">Syncing with SAP…</span>
              ) : (
                <span className="text-xs text-slate-600">Sign in →</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-slate-600">
          Demo authentication — no password required
        </p>
      </div>
    </div>
  );
}
