import { useWarehouseStore } from '../store/useWarehouseStore';
import type { SecurityEventType } from '../types/domain';

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-950/40 border-blue-800 text-blue-300',
  medium: 'bg-amber-950/40 border-amber-800 text-amber-300',
  high: 'bg-orange-950/40 border-orange-800 text-orange-300',
  critical: 'bg-red-950/40 border-red-800 text-red-300',
};

const SEVERITY_BADGES: Record<string, string> = {
  low: 'bg-blue-900 text-blue-300',
  medium: 'bg-amber-900 text-amber-300',
  high: 'bg-orange-900 text-orange-300',
  critical: 'bg-red-900 text-red-300',
};

const EVENT_ICONS: Record<SecurityEventType, string> = {
  LOGIN_SUCCESS: '✅',
  LOGIN_FAILED: '❌',
  ACCOUNT_LOCKED: '🔒',
  MFA_FAILED: '🔐',
  PERMISSION_DENIED: '🚫',
  HOLD_APPROVED: '✓',
  RETURN_DECIDED: '📋',
  DISPATCH_AUTHORIZED: '📦',
  SUSPICIOUS_ACTIVITY: '⚠️',
};

export function SecurityDashboardPage() {
  const securityEvents = useWarehouseStore((s) => s.securityEvents);

  const sortedEvents = [...securityEvents].reverse(); // Most recent first
  const recentEvents = sortedEvents.slice(0, 50); // Last 50 events

  const statsByType: Record<string, number> = {};
  const statsBySeverity: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  sortedEvents.forEach((event) => {
    statsByType[event.type] = (statsByType[event.type] || 0) + 1;
    statsBySeverity[event.severity] = (statsBySeverity[event.severity] || 0) + 1;
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Security Dashboard</h1>
        <p className="mt-2 text-slate-400">Monitor security events and access logs</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Events */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="text-xs font-medium text-slate-400">Total Events</div>
          <div className="mt-2 text-3xl font-bold text-white">{sortedEvents.length}</div>
          <div className="mt-1 text-xs text-slate-500">Last 100 events tracked</div>
        </div>

        {/* Critical Events */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="text-xs font-medium text-red-300">Critical Events</div>
          <div className="mt-2 text-3xl font-bold text-red-400">{statsBySeverity.critical}</div>
          <div className="mt-1 text-xs text-slate-500">Highest priority incidents</div>
        </div>

        {/* Failed Logins */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="text-xs font-medium text-orange-300">Failed Logins</div>
          <div className="mt-2 text-3xl font-bold text-orange-400">{statsByType.LOGIN_FAILED || 0}</div>
          <div className="mt-1 text-xs text-slate-500">Unauthorized access attempts</div>
        </div>

        {/* Accounts Locked */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="text-xs font-medium text-blue-300">Locked Accounts</div>
          <div className="mt-2 text-3xl font-bold text-blue-400">{statsByType.ACCOUNT_LOCKED || 0}</div>
          <div className="mt-1 text-xs text-slate-500">After failed attempts</div>
        </div>
      </div>

      {/* Events by Type */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="text-lg font-semibold text-white">Events by Type</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {Object.entries(statsByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span>{EVENT_ICONS[type as SecurityEventType]}</span>
                  <span className="text-slate-300">{type.replace(/_/g, ' ')}</span>
                </span>
                <span className="font-semibold text-white">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="text-lg font-semibold text-white">Recent Security Events</h2>
        <div className="mt-4 space-y-3 max-h-[600px] overflow-y-auto">
          {recentEvents.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-6 text-center">
              <p className="text-slate-400">No security events yet</p>
            </div>
          ) : (
            recentEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-lg border px-4 py-3 ${SEVERITY_COLORS[event.severity]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{EVENT_ICONS[event.type]}</span>
                      <span className="font-semibold text-white">
                        {event.type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          SEVERITY_BADGES[event.severity]
                        }`}
                      >
                        {event.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">{event.details}</div>
                    {event.userName && (
                      <div className="mt-1 text-xs opacity-75">
                        User: <span className="font-mono">{event.userName}</span>
                        {event.ipAddress && (
                          <>
                            {' '}
                            · IP: <span className="font-mono">{event.ipAddress}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 whitespace-nowrap text-right text-xs opacity-75">
                    {formatTime(event.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Security Summary */}
      <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-300">
          🛡️ System Security Status
        </h2>
        <div className="mt-4 space-y-2 text-sm text-emerald-200/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Multi-Factor Authentication (MFA) enabled for all users
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Account lockout after 5 failed login attempts (30-minute window)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Role-Based Access Control (RBAC) enforced
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            8-hour session token expiration
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Complete audit trail of all security events (last 100 logged)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            IP address and timestamp tracking for all events
          </div>
        </div>
      </div>
    </div>
  );
}
