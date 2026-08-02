export type Role = 'Picker' | 'Manager' | 'HOD' | 'Director' | 'Clerk';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export type PalletStatus =
  | 'Empty'
  | 'Loaded'
  | 'InTransitToStorage'
  | 'Racked'
  | 'InTransitToBay'
  | 'OnBay'
  | 'InTransitToTruck'
  | 'InRecall';

export type PalletLocation =
  | { type: 'FreePool' }
  | { type: 'Line'; lineId: string }
  | { type: 'InTransit' }
  | { type: 'Rack'; rackId: string; slotIndex: number }
  | { type: 'BayRack'; bayRackId: string }
  | { type: 'Truck'; truckId: string }
  | { type: 'Recall' };

export interface Pallet {
  id: string;
  status: PalletStatus;
  loadId: string | null;
  location: PalletLocation;
  // Active HoldRecord id, or null. A held pallet stays physically Racked —
  // this is what excludes it from FIFO, not a status change.
  holdId: string | null;
}

export interface Line {
  id: string;
  name: string;
  status: 'Free' | 'Running';
  assignedSku: string | null;
  assignedProductName: string | null;
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
  status: 'InStorage' | 'Dispatched';
}

export interface RackSlot {
  index: number;
  palletId: string | null;
}

export interface Rack {
  id: string;
  name: string;
  slots: RackSlot[];
}

export interface BayRack {
  id: string;
  name: string;
  palletId: string | null;
}

export interface Truck {
  id: string;
  plate: string;
  status: 'Waiting' | 'Loading' | 'Dispatched';
  salesOrderId: string | null;
  dispatchLine: string;
  // Printed once per sales-order loading — the operator scans THIS, not the
  // truck ID, per spec §18 ("temporary dispatch barcode... attached to the vehicle").
  tempDispatchBarcode: string | null;
}

export interface SalesOrder {
  id: string;
  customer: string;
  sku: string;
  productName: string;
  qty: number;
  dispatchedQty: number;
  status: 'Pending' | 'Picking' | 'Fulfilled';
  createdAt: string;
  assignedTruckId: string | null;
  dispatchedPalletIds: string[];
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
  salesOrderId: string;
  origin: 'Storage' | 'Bay-Topup';
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
  status: 'Active' | 'Released' | 'SentToRecall';
  releaseNote: string | null;
}

export type RecallStageName = 'Inspection' | 'Repacking' | 'Relabelling' | 'QA' | 'ReturnedToStorage';

export interface RecallCase {
  id: string;
  holdId: string;
  palletId: string;
  batchId: string;
  currentStage: RecallStageName;
  history: { stage: RecallStageName; completedAt: string; byUserId: string; notes: string | null }[];
  status: 'InProgress' | 'Completed';
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
}

export interface DriverConfirmation {
  id: string;
  manifestId: string;
  salesOrderId: string;
  truckId: string;
  dispatchLine: string;
  productName: string;
  totalQty: number;
  batchNumbers: string[];
  palletIds: string[];
  driverName: string;
  driverSignedAt: string;
  supervisorUserId: string;
  supervisorSignedAt: string;
  createdAt: string;
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
