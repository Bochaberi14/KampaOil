import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { USERS } from '../data/seed';
import { generateTOTPCode, getRemainingLockoutTime } from '../auth/auth';

type DemoScenario = 'none' | 'failed-login' | 'account-lockout' | 'mfa-verification' | 'session-management';

export function SecurityDemoPage() {
  const [scenario, setScenario] = useState<DemoScenario>('none');
  const [selectedUser, setSelectedUser] = useState<typeof USERS[0] | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [generatedCode, setGeneratedCode] = useState('');
  const [userCodeInput, setUserCodeInput] = useState('');
  const [testLog, setTestLog] = useState<string[]>([]);
  const securityEvents = useWarehouseStore((s) => s.securityEvents);
  const navigate = useNavigate();

  const addLogEntry = (msg: string) => {
    setTestLog((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const runFailedLoginDemo = () => {
    setScenario('failed-login');
    setFailedAttempts(0);
    setTestLog([]);
    addLogEntry('Starting failed login attempts demo...');
    addLogEntry('Account will lock after 5 failed attempts');
  };

  const simulateFailedLogin = () => {
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    if (selectedUser) {
      addLogEntry(`❌ Login attempt #${newAttempts} failed for ${selectedUser.name}`);

      if (newAttempts >= 5) {
        addLogEntry('🔒 Account locked! User cannot login for 30 minutes.');
        addLogEntry(`User will need to wait: ${getRemainingLockoutTime(selectedUser)} minutes`);
      } else {
        addLogEntry(`Remaining attempts before lockout: ${5 - newAttempts}`);
      }
    }
  };

  const runMFADemo = () => {
    setScenario('mfa-verification');
    const code = generateTOTPCode();
    setGeneratedCode(code);
    setUserCodeInput('');
    setTestLog([]);
    addLogEntry('Starting MFA verification demo...');
    addLogEntry(`📱 Generated TOTP code: ${code}`);
    addLogEntry('User will scan QR code or enter code from authenticator app');
  };

  const validateMFA = () => {
    if (userCodeInput === generatedCode) {
      addLogEntry(`✅ MFA code ${userCodeInput} is VALID`);
      addLogEntry('User has been successfully authenticated');
      addLogEntry('Session token generated with 8-hour expiration');
    } else {
      addLogEntry(`❌ MFA code ${userCodeInput} is INVALID`);
      addLogEntry('Access denied. User must re-enter correct code.');
    }
  };

  const runSessionDemo = () => {
    setScenario('session-management');
    setTestLog([]);
    addLogEntry('Starting session management demo...');
    addLogEntry('User logged in at: ' + new Date().toLocaleTimeString());
    addLogEntry('Session token generated with payload:');
    addLogEntry('  - userId: USER-001');
    addLogEntry('  - role: Director');
    addLogEntry('  - iat (issued at): ' + Date.now());
    addLogEntry('  - exp (expiration): ' + new Date(Date.now() + 8 * 60 * 60 * 1000).toLocaleTimeString());
    addLogEntry('');
    addLogEntry('Session features:');
    addLogEntry('  ✓ 8-hour expiration for security');
    addLogEntry('  ✓ Role-based access control (RBAC)');
    addLogEntry('  ✓ Department-scoped data isolation');
    addLogEntry('  ✓ Real-time audit trail');
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">🔐 Security Demo</h1>
        <p className="mt-2 text-slate-400">
          Demonstration of enterprise-grade security features for the Kapa Oil WMS
        </p>
      </div>

      {/* Main Demo Area */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Demo Controls */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 lg:col-span-1">
          <h2 className="text-lg font-semibold text-white">Security Features</h2>
          <div className="mt-4 space-y-3">
            <button
              onClick={runFailedLoginDemo}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                scenario === 'failed-login'
                  ? 'border-red-500 bg-red-950/40 text-red-300'
                  : 'border-slate-600 text-slate-300 hover:border-red-500 hover:bg-red-950/20'
              }`}
            >
              <div className="font-semibold">❌ Failed Login Attempts</div>
              <div className="text-xs text-slate-400">Account lockout protection</div>
            </button>

            <button
              onClick={runMFADemo}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                scenario === 'mfa-verification'
                  ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                  : 'border-slate-600 text-slate-300 hover:border-blue-500 hover:bg-blue-950/20'
              }`}
            >
              <div className="font-semibold">🔐 MFA Verification</div>
              <div className="text-xs text-slate-400">Two-factor authentication</div>
            </button>

            <button
              onClick={runSessionDemo}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                scenario === 'session-management'
                  ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300'
                  : 'border-slate-600 text-slate-300 hover:border-indigo-500 hover:bg-indigo-950/20'
              }`}
            >
              <div className="font-semibold">🎫 Session Management</div>
              <div className="text-xs text-slate-400">Token expiration & RBAC</div>
            </button>

            <button
              onClick={() => navigate('/security')}
              className="w-full rounded-lg border border-slate-600 px-4 py-3 text-left text-sm font-medium text-slate-300 hover:border-emerald-500 hover:bg-emerald-950/20"
            >
              <div className="font-semibold">📊 Security Dashboard</div>
              <div className="text-xs text-slate-400">View security events</div>
            </button>
          </div>

          {scenario !== 'none' && (
            <button
              onClick={() => {
                setScenario('none');
                setTestLog([]);
                setFailedAttempts(0);
                setSelectedUser(null);
              }}
              className="mt-6 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-700"
            >
              Reset Demo
            </button>
          )}
        </div>

        {/* Demo Content */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 lg:col-span-2">
          {scenario === 'none' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Enterprise-Grade Security Features</h3>
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-4">
                  <div className="flex gap-3">
                    <div className="text-xl">🔐</div>
                    <div>
                      <div className="font-semibold text-blue-300">Multi-Factor Authentication (MFA)</div>
                      <p className="text-sm text-blue-200/80">
                        All users require TOTP code from authenticator app in addition to password.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-red-800 bg-red-950/30 p-4">
                  <div className="flex gap-3">
                    <div className="text-xl">🔒</div>
                    <div>
                      <div className="font-semibold text-red-300">Account Lockout</div>
                      <p className="text-sm text-red-200/80">
                        After 5 failed login attempts, account is locked for 30 minutes.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-indigo-800 bg-indigo-950/30 p-4">
                  <div className="flex gap-3">
                    <div className="text-xl">🎫</div>
                    <div>
                      <div className="font-semibold text-indigo-300">Session Token Management</div>
                      <p className="text-sm text-indigo-200/80">
                        8-hour session expiration and role-based access control (RBAC).
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4">
                  <div className="flex gap-3">
                    <div className="text-xl">📋</div>
                    <div>
                      <div className="font-semibold text-emerald-300">Audit Trail</div>
                      <p className="text-sm text-emerald-200/80">
                        Complete security event logging with IP address and timestamp tracking.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scenario === 'failed-login' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Failed Login Attempts Demo</h3>
              <div>
                <label className="block text-sm font-medium text-slate-300">Select User</label>
                <select
                  value={selectedUser?.id || ''}
                  onChange={(e) => {
                    const user = USERS.find((u) => u.id === e.target.value);
                    if (user) setSelectedUser(user);
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                >
                  <option value="">-- Select a user --</option>
                  {USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {selectedUser && (
                <div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                    <div className="text-sm text-slate-400">Failed Attempts: {failedAttempts}/5</div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full transition-all ${
                          failedAttempts < 3
                            ? 'bg-green-500'
                            : failedAttempts < 5
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${(failedAttempts / 5) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <button
                    onClick={simulateFailedLogin}
                    disabled={failedAttempts >= 5}
                    className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {failedAttempts >= 5 ? '🔒 Account Locked' : 'Simulate Failed Login Attempt'}
                  </button>
                </div>
              )}
            </div>
          )}

          {scenario === 'mfa-verification' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">MFA Verification Demo</h3>
              <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-4">
                <div className="text-sm text-blue-300">
                  <div className="font-semibold">📱 Authenticator Code</div>
                  <div className="mt-2 font-mono text-lg font-bold">{generatedCode}</div>
                  <p className="mt-2 text-xs text-blue-200/80">
                    Scan this code with your authenticator app or enter it manually.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">Enter 6-Digit Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={userCodeInput}
                  onChange={(e) => setUserCodeInput(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-2xl tracking-[0.5em] font-mono text-slate-100"
                />
              </div>

              <button
                onClick={validateMFA}
                disabled={userCodeInput.length !== 6}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Validate MFA Code
              </button>
            </div>
          )}

          {scenario === 'session-management' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Session Management Demo</h3>
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 font-mono text-xs text-slate-300">
                {testLog.length === 0 ? (
                  <p className="text-slate-500">No session created yet</p>
                ) : (
                  testLog.map((log, i) => (
                    <div key={i} className={log.startsWith('✓') || log.startsWith('✅') ? 'text-emerald-400' : ''}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Test Log for all scenarios */}
          {testLog.length > 0 && scenario !== 'session-management' && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-slate-300">Demo Log</h4>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/50 p-4 font-mono text-xs text-slate-300">
                {testLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Events Summary */}
      <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-6">
        <h2 className="text-lg font-semibold text-emerald-300">📊 Live Security Events</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-3">
            <div className="text-xs text-emerald-400">Total Events</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">{securityEvents.length}</div>
          </div>
          <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-3">
            <div className="text-xs text-emerald-400">Successful Logins</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">
              {securityEvents.filter((e) => e.type === 'LOGIN_SUCCESS').length}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-3">
            <div className="text-xs text-emerald-400">Failed Attempts</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">
              {securityEvents.filter((e) => e.type === 'LOGIN_FAILED').length}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-3">
            <div className="text-xs text-emerald-400">Lockouts</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">
              {securityEvents.filter((e) => e.type === 'ACCOUNT_LOCKED').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
