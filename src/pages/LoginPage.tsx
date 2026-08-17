import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { USERS } from '../data/seed';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { ROLE_BLURB } from '../rbac';
import { generateTOTPCode } from '../auth/auth';

type LoginStep = 'select' | 'credentials' | 'totp';

export function LoginPage() {
  const login = useWarehouseStore((s) => s.login);
  const loadSapData = useWarehouseStore((s) => s.loadSapData);
  const [step, setStep] = useState<LoginStep>('select');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  const selectedUser = selectedUserId ? USERS.find((u) => u.id === selectedUserId) : null;

  async function handleSelectUser(userId: string) {
    const user = USERS.find((u) => u.id === userId);
    if (!user) return;

    // Check if account is locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / 60000
      );
      setError(`Account locked. Try again in ${remainingMinutes} minutes.`);
      return;
    }

    setSelectedUserId(userId);
    setError('');
    setStep('credentials');
  }

  async function handleCredentialsSubmit() {
    if (!selectedUser) return;

    setPending(true);
    setError('');

    // Validate account is not locked before MFA
    if (selectedUser.lockedUntil && new Date(selectedUser.lockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(selectedUser.lockedUntil).getTime() - Date.now()) / 60000
      );
      setError(`Account locked. Try again in ${remainingMinutes} minutes.`);
      setPending(false);
      return;
    }

    // Generate TOTP code for demo
    const code = generateTOTPCode();
    setGeneratedCode(code);
    setTotpCode('');
    setStep('totp');
    setPending(false);
  }

  async function handleTOTPSubmit() {
    if (!selectedUser || !generatedCode) return;

    setPending(true);
    setError('');

    // Validate TOTP code
    if (totpCode !== generatedCode) {
      setError('Invalid MFA code. Please try again.');
      setTotpCode('');
      setPending(false);
      return;
    }

    // Proceed with login
    try {
      login(selectedUser.id);
      await loadSapData();
      navigate('/dashboard');
    } catch {
      setError('Login failed. Please try again.');
      setPending(false);
    }
  }

  function handleBack() {
    setStep('select');
    setSelectedUserId(null);
    setTotpCode('');
    setGeneratedCode('');
    setError('');
  }

  const departments = ['Oil & Refinery', 'Edibles', 'Soap', 'Other'];
  const departmentIcons: Record<string, string> = {
    'Oil & Refinery': '🛢️',
    'Edibles': '🥘',
    'Soap': '🧼',
    'Other': '📦',
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-black/30">
        <h1 className="text-2xl font-bold text-white">Kapa Oil</h1>
        <p className="mt-1 text-sm text-slate-400">
          Warehousing & Production Execution — Multi-Department Platform
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {departments.map((dept) => (
            <span key={dept} className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-1 text-xs text-slate-300">
              {departmentIcons[dept]} {dept}
            </span>
          ))}
        </div>

        {step === 'select' && (
          <>
            <div className="mt-8 space-y-3">
              {USERS.filter((u) => u.role !== 'Picker').map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u.id)}
                  disabled={pending}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-left hover:border-indigo-500 hover:bg-indigo-950/40 disabled:opacity-50"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{u.name}</div>
                    <div className="text-xs text-slate-500">
                      {u.role}
                      {u.department ? ` · ${u.department}` : ''}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">{ROLE_BLURB[u.role]}</div>
                  </div>
                  <span className="text-xs text-slate-600">Sign in →</span>
                </button>
              ))}
            </div>

            {/* Picker Access Info */}
            <div className="mt-6 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
              <div className="text-xs font-semibold text-amber-300">📱 Picker Access</div>
              <p className="mt-1 text-xs text-amber-200/80">
                Pickers use barcode scanner devices (Zebra TC53/TC58) for warehouse operations. No login required.
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-slate-600">
              Enterprise-grade security with MFA authentication
            </p>
          </>
        )}

        {step === 'credentials' && selectedUser && (
          <>
            <div className="mt-8">
              <div className="rounded-lg bg-slate-800/50 px-4 py-3">
                <div className="text-xs text-slate-400">User</div>
                <div className="mt-1 font-semibold text-slate-100">{selectedUser.name}</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">{selectedUser.role}</div>
                  {selectedUser.department && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {departmentIcons[selectedUser.department]} {selectedUser.department}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Password</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    defaultValue="demo"
                  />
                  <p className="mt-1 text-xs text-slate-500">(Demo: password is "demo")</p>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleBack}
                    disabled={pending}
                    className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-600 hover:text-slate-200 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCredentialsSubmit}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {pending ? 'Verifying…' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 'totp' && selectedUser && (
          <>
            <div className="mt-8">
              <div className="rounded-lg bg-slate-800/50 px-4 py-3">
                <div className="text-xs text-slate-400">User</div>
                <div className="mt-1 font-semibold text-slate-100">{selectedUser.name}</div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">{selectedUser.role}</div>
                  {selectedUser.department && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {departmentIcons[selectedUser.department]} {selectedUser.department}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
                  <div className="text-xs font-medium text-amber-300">🔐 Multi-Factor Authentication</div>
                  <p className="mt-2 text-xs text-amber-200/80">
                    Enter the 6-digit code from your authenticator app or SMS.
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300">MFA Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-center text-2xl tracking-[0.5em] font-mono text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Demo: code is <span className="font-mono font-semibold text-indigo-400">{generatedCode}</span>
                  </p>
                </div>

                {error && (
                  <div className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-6">
                  <button
                    onClick={handleBack}
                    disabled={pending}
                    className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-600 hover:text-slate-200 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleTOTPSubmit}
                    disabled={pending || totpCode.length !== 6}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {pending ? 'Signing in…' : 'Sign In'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
