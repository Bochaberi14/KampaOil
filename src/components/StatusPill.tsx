const NEUTRAL = 'bg-slate-800 text-slate-300';
const INFO = 'bg-indigo-500/15 text-indigo-300';
const PENDING_ACTION = 'bg-amber-500/15 text-amber-300';
const DONE = 'bg-emerald-500/15 text-emerald-300';
const MID = 'bg-violet-500/15 text-violet-300';
const ERROR = 'bg-rose-500/15 text-rose-300';

const STYLES: Record<string, string> = {
  // Pallet statuses
  Empty: NEUTRAL,
  Loaded: INFO,
  InTransitToStorage: PENDING_ACTION,
  Racked: DONE,
  InTransitToBay: PENDING_ACTION,
  OnBay: MID,
  InTransitToTruck: PENDING_ACTION,
  StagedForDispatch: INFO,
  InRecall: MID,
  Scrapped: ERROR,

  // Line statuses
  Free: NEUTRAL,
  Running: INFO,

  // Production order statuses
  Open: INFO,
  Complete: DONE,

  // Sales order statuses
  Pending: NEUTRAL,
  Picking: PENDING_ACTION,
  Fulfilled: DONE,

  // Truck statuses
  Waiting: NEUTRAL,

  // Load statuses
  InStorage: DONE,
  Disposed: ERROR,

  // SAP statuses
  Syncing: PENDING_ACTION,
  Synced: DONE,
  Failed: ERROR,

  // Hold statuses
  PendingApproval: PENDING_ACTION,
  Active: ERROR,
  Released: DONE,
  SentToRecall: MID,

  // Recall statuses
  InProgress: PENDING_ACTION,
  AwaitingDestinationDecision: PENDING_ACTION,
  AwaitingPickerAction: PENDING_ACTION,
  Completed: DONE,

  // Recall stages
  Inspection: PENDING_ACTION,
  Repacking: PENDING_ACTION,
  Relabelling: PENDING_ACTION,
  QA: PENDING_ACTION,

  // Pick task statuses
  PendingAcceptance: PENDING_ACTION,
  Accepted: MID,

  // Dispatch verification statuses
  AwaitingVerification: PENDING_ACTION,
  VehicleVerified: MID,
  Verified: DONE,

  // Customer return statuses
  Logged: PENDING_ACTION,
  InReturnZone: MID,
  UnderReview: PENDING_ACTION,
  Approved: DONE,
  Rejected: ERROR,
  Actioned: DONE,

  // Direct dispatch statuses
  Planned: PENDING_ACTION,
  Available: DONE,
  ReturnedToStorage: DONE,
};

export function StatusPill({ status }: { status: string }) {
  const cls = STYLES[status] ?? NEUTRAL;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}
