export type Role =
  | 'Picker'
  | 'Manager'
  | 'HOD'
  | 'Director'
  | 'Clerk'
  | 'Loader'
  | 'QA'
  | 'Customer Return Clerk'
  | 'Sales Manager';

export type Department = 'Oil & Refinery' | 'Edibles' | 'Soap' | 'Other';

export type ZoneName = 'Edible Oils' | 'Margarine & Shortening' | 'Detergents & Soaps' | 'Specialty Products' | 'Returns';

export interface Zone {
  id: string;
  name: ZoneName;
  warehouseType: 'Storage' | 'LoadingBay';
  department: Department | 'Returns';
  requiresRefrigeration: boolean;
}

export interface Shelf {
  id: string;
  zoneId: string;
  index: number; // 0, 1, 2
  rackIds: string[]; // rack IDs in this shelf
}

export interface User {
  id: string;
  name: string;
  role: Role;
  // Meaningful for: department-scoped HODs (returns routing), Pickers (task
  // assignment must match product dept), QA HOD (approval scope).
  department?: Department;
  // Security fields
  mfaEnabled: boolean;
  mfaSecret?: string; // TOTP secret (encrypted)
  loginAttempts: number;
  lockedUntil?: string; // ISO timestamp
  lastLoginAt?: string;
}

// Security event types
export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'MFA_FAILED'
  | 'PERMISSION_DENIED'
  | 'HOLD_APPROVED'
  | 'RETURN_DECIDED'
  | 'DISPATCH_AUTHORIZED'
  | 'SUSPICIOUS_ACTIVITY';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  userId?: string;
  userName?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export interface SessionToken {
  userId: string;
  role: Role;
  iat: number; // issued at
  exp: number; // expiration
}

export type PalletStatus =
  | 'Empty'
  | 'Loaded'
  | 'InTransitToStorage'
  | 'Racked'
  | 'InTransitToBay'
  | 'OnBay'
  | 'InTransitToTruck'
  | 'StagedForDispatch'
  | 'InRecall'
  | 'Scrapped';

export type PalletLocation =
  | { type: 'FreePool' }
  | { type: 'Line'; lineId: string }
  | { type: 'InTransit' }
  | { type: 'Rack'; rackId: string; slotIndex: number }
  | { type: 'BayRack'; bayRackId: string; slotIndex: number }
  | { type: 'Truck'; truckId: string }
  // Staged at the physical dispatch line, waiting for the (out-of-scope)
  // physical loading onto the vehicle — the pallet itself is never
  // considered "in" the truck.
  | { type: 'DispatchLine'; dispatchLine: string; truckId: string }
  | { type: 'Recall' }
  | { type: 'Scrapped' };

export interface Pallet {
  id: string;
  status: PalletStatus;
  loadId: string | null;
  location: PalletLocation;
  // Active HoldRecord id, or null. A held pallet stays physically Racked —
  // this is what excludes it from FIFO, not a status change.
  holdId: string | null;
}

// A line has no fixed product — it runs whatever the operator scans onto it
// next (activeProductionOrderId), same as a real changeover.
export interface Line {
  id: string;
  name: string;
  status: 'Free' | 'Running';
  activeProductionOrderId: string | null;
}

export interface ProductionOrder {
  id: string;
  sku: string;
  productName: string;
  lineId: string;
  targetQty: number;
  createdAt: string;
  fulfilledQty: number;
  status: 'Open' | 'Complete';
}

export interface Batch {
  id: string;
  productionOrderId: string;
  lineId: string;
  sku: string;
  productName: string;
  date: string;
  loadIds: string[];
  totalQty: number;
}

export interface Load {
  id: string;
  palletId: string;
  batchId: string;
  sku: string;
  productName: string;
  quantity: number;
  lineId: string;
  producedAt: string;
  operatorId: string;
  status: 'InStorage' | 'Dispatched' | 'Disposed';
}

export interface RackSlot {
  index: number;
  palletId: string | null;
}

export interface Rack {
  id: string;
  name: string;
  zoneId?: string; // zone this rack belongs to
  shelfId?: string; // shelf this rack is on (within zone)
  slots: RackSlot[];
}

export interface Truck {
  id: string;
  // Vehicles aren't a fixed fleet — SAP doesn't know the vehicle in advance,
  // so a Truck record is created ad hoc by the Loader when the customer's
  // vehicle physically arrives to collect an order (see
  // registerVehicleForSalesOrder). plate/driverName are captured then.
  plate: string;
  driverName: string | null;
  // Generated once, immediately after the Loader confirms the physical
  // plate match — this is what the Loader scans later to verify the vehicle
  // before signing the handover (not how the vehicle is discovered).
  dispatchBarcode: string | null;
  // 'Staged' once scanDispatchLine has verified and staged its sales
  // order's goods at its dispatch line — the WMS's workflow ends there
  // (see DispatchVerification), so there's no further truck status beyond it.
  status: 'Waiting' | 'Staged';
  salesOrderId: string | null;
  dispatchLine: string;
}

export interface SalesOrder {
  id: string;
  customer: string;
  sku: string;
  productName: string;
  qty: number;
  // Cumulative quantity the Loader has released into warehouse execution —
  // picking/dispatch-planning can never draw on more than this, regardless
  // of how much of the order is still outstanding. Starts at 0; the Loader
  // is the mandatory first stop for every order.
  releasedQty: number;
  dispatchedQty: number;
  status: 'Pending' | 'Picking' | 'Fulfilled';
  createdAt: string;
  assignedTruckId: string | null;
  dispatchedPalletIds: string[];
}

// One row per Loader release event — the audit trail for "who released what,
// when," since a large order's release can be spread across several days.
export interface SalesOrderRelease {
  id: string;
  salesOrderId: string;
  qty: number;
  releasedByUserId: string;
  releasedAt: string;
}

export interface Manifest {
  id: string;
  salesOrderId: string;
  truckId: string;
  customer: string;
  productName: string;
  totalQty: number;
  palletIds: string[];
  dispatchedAt: string;
  sapStatus: 'Syncing' | 'Synced';
  sapDocNumber: string | null;
}

export interface Movement {
  id: string;
  palletId: string;
  from: string;
  to: string;
  timestamp: string;
  operatorId: string;
}

export interface PickTaskItem {
  palletId: string;
  sourceRackId: string;
  sourceSlotIndex: number;
  sku: string;
  quantity: number;
  picked: boolean;
}

export interface PickTask {
  id: string;
  salesOrderId: string | null;  // null for staging requests (no specific SO)
  origin: 'Production' | 'Storage' | 'Bay-Topup' | 'Dispatch';
  items: PickTaskItem[];
  status: 'PendingAcceptance' | 'Accepted' | 'Completed';
  assignedPickerId: string | null;
  createdAt: string;
}

export interface HoldRecord {
  id: string;
  targetType: 'Pallet' | 'Batch';
  targetId: string;
  reason: string;
  placedByUserId: string;
  placedByRole: Role;
  placedAt: string;
  // A Clerk-flagged problem starts PendingApproval — the pallet is locked
  // immediately, but only becomes a real (recall-eligible) hold once a
  // Manager/HOD/Director approves it; they can also Reject it, which
  // releases the pallet without ever treating it as an active hold.
  status: 'PendingApproval' | 'Active' | 'Released' | 'Rejected' | 'SentToRecall';
  releaseNote: string | null;
}

export type RecallStageName = 'Inspection' | 'Repacking' | 'Relabelling' | 'QA';

// Where Manager/HOD/Director decide a recalled pallet ends up once it clears
// QA — a Picker then physically scans it there (see RecallCase.status).
export type RecallDestinationType = 'Storage' | 'ReworkLine' | 'Scrap';

export interface RecallDestinationDecision {
  type: RecallDestinationType;
  targetRackId: string | null; // set when type === 'Storage'
  targetLineId: string | null; // set when type === 'ReworkLine'
  decidedByUserId: string;
  decidedByRole: Role;
  decidedAt: string;
}

export interface RecallCase {
  id: string;
  holdId: string;
  palletId: string;
  batchId: string;
  currentStage: RecallStageName;
  history: { stage: RecallStageName; completedAt: string; byUserId: string; notes: string | null }[];
  status: 'InProgress' | 'AwaitingDestinationDecision' | 'AwaitingPickerAction' | 'Completed';
  destinationDecision: RecallDestinationDecision | null;
  // The rack this pallet was racked in immediately before being sent to
  // recall (null if it was held somewhere other than storage) — lets the
  // approver send it straight back where it came from instead of picking a
  // rack from scratch.
  originalRackId: string | null;
}

export interface DirectDispatchApproval {
  id: string;
  salesOrderId: string;
  shortfallQty: number;
  requestedByUserId: string;
  requestedAt: string;
  status: 'PendingApproval' | 'Approved' | 'Rejected';
  approvedByUserId: string | null;
  approvedAt: string | null;
  // Storage: the existing bay-shortfall path (FIFO pick task from storage).
  // Production: pulls a still-Loaded pallet straight off the line, skipping
  // storage and the bay entirely.
  source: 'Storage' | 'Production';
}

// A Loader's pre-plan of how much of a sales order's quantity goes onto a
// given truck — lets one large sales order be split across several trucks
// instead of the strict one-SO-one-truck relationship elsewhere in the app.
export interface DispatchAllocation {
  id: string;
  salesOrderId: string;
  truckId: string;
  plannedQty: number;
  dispatchedQty: number;
  dispatchedPalletIds: string[];
  // Dispatch line assigned by Loader during planning — where the truck will load
  dispatchLine: string | null;
  createdByUserId: string;
  createdAt: string;
  status: 'Planned' | 'Fulfilled';
}

export interface CustomerReturn {
  id: string;
  sku: string;
  productName: string;
  qty: number;
  department: Department;
  remark: string;
  photoDataUrl: string | null;
  reportedByUserId: string;
  reportedAt: string;
  // Return lifecycle
  status: 'Logged' | 'InReturnZone' | 'UnderReview' | 'Approved' | 'Rejected' | 'Actioned';
  decision: 'Scrap' | 'Restock' | 'Replace' | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  actionedByUserId: string | null;
  actionedAt: string | null;
}

// The final handover printout's backing record. Generated once picking is
// complete and the Picker has scanned LINE 001 (AwaitingVerification); the
// Loader then scans the vehicle barcode (VehicleVerified) before the Loader
// and Driver physically check the goods and both sign (Verified). The WMS's
// workflow ends here — not "loaded," which happens outside this system.
// There is no Clerk step in this flow.
export interface DispatchVerification {
  id: string;
  salesOrderId: string;
  truckId: string;
  vehicleBarcode: string;
  dispatchLine: string;
  customer: string;
  products: { sku: string; productName: string; orderedQty: number; releasedQty: number; pickedQty: number }[];
  palletIds: string[];
  loaderUserId: string | null;
  pickerUserIds: string[];
  stagedAt: string;
  stagedByUserId: string;
  vehicleVerifiedAt: string | null;
  vehicleVerifiedByUserId: string | null;
  driverName: string | null;
  driverSignedAt: string | null;
  loaderSignedByUserId: string | null;
  loaderSignedAt: string | null;
  status: 'AwaitingVerification' | 'VehicleVerified' | 'Verified';
}

export interface SapSyncTask {
  id: string;
  type: string;
  description: string;
  status: 'Pending' | 'Syncing' | 'Synced' | 'Failed';
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  sapDocNumber: string | null;
}
