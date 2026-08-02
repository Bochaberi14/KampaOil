const NEUTRAL = 'bg-slate-800 text-slate-300';
const INFO = 'bg-indigo-500/15 text-indigo-300';
const PENDING_ACTION = 'bg-amber-500/15 text-amber-300';
const DONE = 'bg-emerald-500/15 text-emerald-300';
const MID = 'bg-violet-500/15 text-violet-300';
const ERROR = 'bg-rose-500/15 text-rose-300';

const STYLES: Record<string, string> = {
  Empty: NEUTRAL,
  Loaded: INFO,
  InTransitToStorage: PENDING_ACTION,
  Racked: DONE,
  InTransitToBay: PENDING_ACTION,
  OnBay: MID,
  InTransitToTruck: PENDING_ACTION,
  Free: NEUTRAL,
  Running: INFO,
  Open: INFO,
  Complete: DONE,
  Pending: NEUTRAL,
  Picking: PENDING_ACTION,
  Fulfilled: DONE,
  Waiting: NEUTRAL,
  Loading: PENDING_ACTION,
  Dispatched: DONE,
  InTransit: PENDING_ACTION,
  Syncing: PENDING_ACTION,
  Synced: DONE,
  Failed: ERROR,
  InRecall: MID,
  Active: ERROR,
  Released: DONE,
  SentToRecall: MID,
  InProgress: PENDING_ACTION,
  PendingAcceptance: PENDING_ACTION,
  Accepted: MID,
  Inspection: PENDING_ACTION,
  Repacking: PENDING_ACTION,
  Relabelling: PENDING_ACTION,
  QA: PENDING_ACTION,
  ReturnedToStorage: DONE,
  PendingApproval: PENDING_ACTION,
  Approved: DONE,
  Rejected: ERROR,
};

export function StatusPill({ status }: { status: string }) {
  const cls = STYLES[status] ?? NEUTRAL;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}
