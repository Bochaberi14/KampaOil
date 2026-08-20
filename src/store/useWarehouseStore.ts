import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Batch,
  CustomerReturn,
  Department,
  DirectDispatchApproval,
  DispatchAllocation,
  DispatchVerification,
  HoldRecord,
  Line,
  Load,
  Manifest,
  Movement,
  Pallet,
  PickTask,
  PickTaskItem,
  ProductionOrder,
  Rack,
  RecallCase,
  RecallStageName,
  SalesOrder,
  SalesOrderRelease,
  Scanner,
  ScannerConfigChange,
  ScannerWorkLocation,
  SapSyncTask,
  SecurityEvent,
  Shelf,
  Truck,
  User,
  Zone,
} from '../types/domain';
import {
  DISPATCH_LINE,
  EXCEPTION_LINE_ID,
  INITIAL_BATCHES,
  INITIAL_BAY_RACKS,
  INITIAL_HOLDS,
  INITIAL_LINES,
  INITIAL_LOADS,
  INITIAL_PALLETS,
  INITIAL_RACKS,
  INITIAL_RECALL_CASES,
  INITIAL_SCANNERS,
  INITIAL_TRUCKS,
  LOADING_BAY_SHELVES,
  LOADING_BAY_ZONES,
  STORAGE_SHELVES,
  STORAGE_ZONES,
  USERS,
} from '../data/seed';
import { unitsPerPallet, resolveScannedSku, PRODUCTS } from '../data/products';
import {
  fetchProductionOrders,
  fetchSalesOrders,
  postGenericTransaction,
} from '../mock-sap/sapClient';
import {
  generateAllocationId,
  generateApprovalId,
  generateBatchId,
  generateReturnId,
  generateReleaseId,
  generateHoldId,
  generateLoadId,
  generateMovementId,
  generatePickTaskId,
  generateRecallCaseId,
  generateSyncTaskId,
  generateVerificationId,
  generateTruckId,
  generateVehicleBarcodeId,
} from '../engine/ids';
import { findRackHoldingPallet, selectFifoLoads } from '../engine/rules';
import { recommendStorageLocation } from '../engine/storageRecommendation';
import { can, getPickerType } from '../rbac';

const RECALL_STAGE_ORDER: RecallStageName[] = ['Inspection', 'Repacking', 'Relabelling', 'QA'];

// A held pallet can sit at any of these statuses — everything except Empty
// (nothing to hold) and InRecall/Scrapped (already past the hold gate).
const HOLDABLE_PALLET_STATUSES: Pallet['status'][] = [
  'Loaded',
  'InTransitToStorage',
  'Racked',
  'InTransitToBay',
  'OnBay',
  'InTransitToTruck',
];

// Pallets already claimed by an open pick task (requested, but not yet
// physically released/arrived) — excluded from FIFO candidates so a second
// request for the same or another sales order can't double-book the same
// physical pallet while the first task is still pending/in transit.
function reservedPalletIds(pickTasks: PickTask[]): Set<string> {
  const ids = new Set<string>();
  for (const t of pickTasks) {
    if (t.status === 'Completed') continue;
    for (const i of t.items) {
      if (!i.picked) ids.add(i.palletId);
    }
  }
  return ids;
}

// Shared by requestPick and assignPickTaskToPickers — FIFO-selects racked,
// unheld, unreserved stock for a sku up to qty and shapes it into PickTask
// items. Callers own their own "is there enough?" error messaging; this just
// does the selection.
function selectFifoPickItems(
  state: { pallets: Pallet[]; loads: Load[]; racks: Rack[]; pickTasks: PickTask[] },
  sku: string,
  qty: number,
): PickTaskItem[] {
  const reserved = reservedPalletIds(state.pickTasks);
  const rackedPalletIds = new Set(
    state.pallets.filter((p) => p.status === 'Racked' && !p.holdId && !reserved.has(p.id)).map((p) => p.id),
  );
  const candidates = state.loads.filter((l) => rackedPalletIds.has(l.palletId));
  const picked = selectFifoLoads(candidates, sku, qty);
  return picked.map((l) => {
    const loc = findRackHoldingPallet(state.racks, l.palletId);
    return {
      palletId: l.palletId,
      sourceRackId: loc?.rackId ?? '',
      sourceSlotIndex: loc?.slotIndex ?? -1,
      sku: l.sku,
      quantity: l.quantity,
      picked: false,
    };
  });
}

// Select FIFO items from bay racks for dispatch picking
function selectFifoBayPickItems(
  state: { pallets: Pallet[]; loads: Load[]; bayRacks: any[] },
  sku: string,
  qty: number,
): PickTaskItem[] {
  // Find all pallets physically in bay racks (have palletId in a slot)
  const bayPalletMap = new Map<string, { rackId: string; slotIndex: number }>();

  for (const bayRack of state.bayRacks) {
    if (!bayRack.slots) continue;
    for (let slotIndex = 0; slotIndex < bayRack.slots.length; slotIndex++) {
      const slot = bayRack.slots[slotIndex];
      if (slot.palletId) {
        // Map pallet to its bay rack location (regardless of status)
        bayPalletMap.set(slot.palletId, { rackId: bayRack.id, slotIndex });
      }
    }
  }

  // Get loads for bay pallets that match the SKU, maintain FIFO order
  const candidates = state.loads.filter((l) => {
    // Must be a pallet physically in a bay rack
    if (!bayPalletMap.has(l.palletId)) return false;
    // Must match the SKU
    if (l.sku !== sku) return false;
    return true;
  });

  // Select just enough pallets to fulfill the quantity
  let remainingQty = qty;
  const picked: Load[] = [];
  for (const load of candidates) {
    if (remainingQty <= 0) break;
    picked.push(load);
    remainingQty -= load.quantity;
  }

  return picked.map((l) => {
    const loc = bayPalletMap.get(l.palletId)!;
    return {
      palletId: l.palletId,
      sourceRackId: loc.rackId,
      sourceSlotIndex: loc.slotIndex,
      sku: l.sku,
      quantity: l.quantity,
      picked: false,
    };
  });
}

// Find the first available Picker in a department who has no active task.
// Returns null if no Picker is available (task will stay unassigned, waiting).
// Find available picker of specific type/location (e.g., 'storage', 'loading-bay')
function findAvailablePickerByType(
  state: { pickTasks: PickTask[]; currentUser: User | null },
  department: string | undefined,
  pickerType: 'storage' | 'loading-bay',
): User | null {
  if (!department) return null;
  const pickerCandidates = USERS.filter((u) => {
    if (u.role !== 'Picker' || u.department !== department) return false;
    const typeMatch = pickerType === 'storage' ? u.id.startsWith('pick-stor-') : u.id.startsWith('pick-bay-');
    return typeMatch;
  });
  for (const picker of pickerCandidates) {
    const hasActiveTask = state.pickTasks.some(
      (t) => t.assignedPickerId === picker.id && t.status === 'Accepted',
    );
    if (!hasActiveTask) return picker;
  }
  return null;
}

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

export type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

interface WarehouseState {
  currentUser: User | null;
  login: (userId: string) => boolean;
  logout: () => void;

  // Scanner management
  scanners: Scanner[];
  scannerConfigChanges: ScannerConfigChange[];
  updateScannerWorkLocation: (args: {
    scannerId: string;
    newLocation: ScannerWorkLocation;
    operatorId: string;
  }) => Result;
  getScannerByWorkLocation: (location: ScannerWorkLocation) => Scanner | null;

  lines: Line[];
  racks: Rack[];
  bayRacks: Rack[];
  storageZones: Zone[];
  storageShelves: Shelf[];
  loadingBayZones: Zone[];
  loadingBayShelves: Shelf[];
  trucks: Truck[];
  pallets: Pallet[];

  productionOrders: ProductionOrder[];
  salesOrders: SalesOrder[];
  salesOrderReleases: SalesOrderRelease[];
  releaseSalesOrderQuantity: (args: {
    salesOrderId: string;
    qty: number;
    operatorId: string;
  }) => Result<{ release: SalesOrderRelease }>;
  sapSyncing: boolean;
  loadSapData: () => Promise<void>;

  loads: Load[];
  batches: Batch[];
  movements: Movement[];
  pickTasks: PickTask[];
  manifests: Manifest[];

  holds: HoldRecord[];
  recallCases: RecallCase[];
  directDispatchApprovals: DirectDispatchApproval[];
  dispatchVerifications: DispatchVerification[];
  dispatchAllocations: DispatchAllocation[];

  syncQueue: SapSyncTask[];
  simulateSapOutage: boolean;
  setSimulateSapOutage: (value: boolean) => void;
  enqueueSapSync: (type: string, description: string) => void;
  attemptSyncTask: (taskId: string) => void;

  // Security & Auditing
  securityEvents: SecurityEvent[];
  logSecurityEvent: (event: SecurityEvent) => void;

  toasts: Toast[];
  pushToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;

  // Stage 1 — Production
  scanLine: (lineId: string) => Result<{ line: Line }>;
  scanProductForLine: (args: { lineId: string; productCode: string }) => Result<{
    line: Line;
    productionOrder: ProductionOrder;
  }>;
  scanPalletForLoad: (palletId: string) => Result<{ pallet: Pallet }>;
  confirmLoad: (args: {
    lineId: string;
    productionOrderId: string;
    palletId: string;
    quantity: number;
    operatorId: string;
  }) => Result<{ loadId: string; batchId: string; poComplete: boolean }>;

  // Stage 2 — Storage
  scanPalletLeavingLine: (palletId: string, operatorId: string) => Result;
  scanPalletToRack: (args: {
    palletId: string;
    rackId: string;
    operatorId: string;
  }) => Result;

  // Stage 3 — Loading bay
  assignPickTaskToPickers: (args: {
    salesOrderId: string;
    assignments: { pickerId: string; qty: number }[];
    operatorId: string;
  }) => Result<{ tasks: PickTask[] }>;
  requestStockFromStorageToLoadingBay: (args: {
    sku: string;
    qty: number;
    operatorId: string;
  }) => Result<{ task: PickTask | null }>;
  findPickItemByRack: (pickTaskId: string, rackId: string) => Result<{ palletId: string }>;
  scanRackForPick: (args: {
    pickTaskId: string;
    palletId: string;
    rackId: string;
    operatorId: string;
  }) => Result;
  scanPalletLeavingStorage: (args: {
    pickTaskId: string;
    palletId: string;
    operatorId: string;
  }) => Result;
  scanBayRackForPick: (args: {
    pickTaskId: string;
    palletId: string;
    bayRackId: string;
    operatorId: string;
  }) => Result<{ completed: boolean }>;
  placePalletInBay: (args: {
    palletId: string;
    bayRackId: string;
    operatorId: string;
  }) => Result;
  // Direct-dispatch pallets (InTransitToTruck) skip bay staging entirely —
  // this is their one loading-bay checkpoint: confirm physical arrival,
  // no destination rack scan, then the picker takes it straight to dispatch.
  scanPalletArrivedForDirectDispatch: (args: {
    palletId: string;
    operatorId: string;
  }) => Result<{ dispatchLine: string | null }>;

  // Phase 2 — Dispatch picking (bay → dispatch line)
  assignDispatchPickingTasks: (args: {
    salesOrderId: string;
    assignments: { pickerId: string; qty: number }[];
    operatorId: string;
  }) => Result<{ tasks: PickTask[] }>;
  assignStorageDirectDispatchTasks: (args: {
    salesOrderId: string;
    assignments: { pickerId: string; qty: number }[];
    operatorId: string;
  }) => Result<{ tasks: PickTask[] }>;
  executeDispatchPicking: (args: {
    pickTaskId: string;
    bayRackId: string;
    palletIds: string[];
    operatorId: string;
  }) => Result<{ completed: boolean }>;

  // Stage 4 — Dispatch
  availableOnBay: (sku: string) => number;
  availableInStorage: (sku: string) => number;
  availableInProduction: (sku: string) => number;
  requestTopUp: (salesOrderId: string, directDispatch?: boolean) => Result<{ task: PickTask }>;
  // Loader pre-plans how much of a sales order goes on a given truck — lets
  // one large order be split across several trucks instead of 1 SO : 1 truck.
  planDispatchAllocation: (args: {
    salesOrderId: string;
    truckId: string;
    qty: number;
    dispatchLine: string;
    operatorId: string;
  }) => Result<{ allocation: DispatchAllocation }>;
  // Direct-dispatch shortfall exception — requires HOD/Manager/Director approval.
  // 'Storage' is the original bay-shortfall path; 'Production' pulls a still-
  // Loaded pallet straight off the line, skipping storage and the bay.
  requestDirectDispatchApproval: (
    salesOrderId: string,
    operatorId: string,
    source?: 'Storage' | 'Production',
  ) => Result<{ approval: DirectDispatchApproval }>;
  approveDirectDispatchRequest: (approvalId: string, operatorId: string) => Result<{ task: PickTask | null }>;
  rejectDirectDispatchRequest: (approvalId: string, operatorId: string) => Result;
  // Diverts a still-Loaded (on-the-line) pallet straight to the dispatch area
  // under an Approved 'Production' direct-dispatch approval.
  // Loader-only: the collecting vehicle is captured when it physically
  // arrives (SAP never provides it) — generates a permanent vehicle
  // barcode tied to this sales order.
  allocateVehicleToSalesOrder: (args: {
    salesOrderId: string;
    plate: string;
    dispatchLine: string;
    operatorId: string;
  }) => Result<{ truck: Truck }>;
  registerVehicleForSalesOrder: (args: {
    salesOrderId: string;
    plate: string;
    driverName: string;
    operatorId: string;
  }) => Result<{ truck: Truck }>;
  // Picking-complete verification — the Picker scans LINE 001 once every
  // assigned task is Completed, staging every ready pallet and generating
  // the DispatchVerification handover printout (AwaitingVerification).
  generateManifestForPickingComplete: (args: {
    salesOrderId: string;
    operatorId: string;
  }) => Result<{ verification: DispatchVerification }>;
  scanDispatchLine: (args: {
    salesOrderId: string;
    dispatchLineCode: string;
    operatorId: string;
  }) => Result<{ verification: DispatchVerification }>;
  // Loader scans the vehicle's own barcode to verify it (VehicleVerified).
  verifyDispatchVehicle: (args: {
    verificationId: string;
    vehicleBarcode: string;
    operatorId: string;
  }) => Result<{ verification: DispatchVerification }>;
  // Loader + driver sign-off on the handover printout — the WMS's workflow
  // ends here. No separate Clerk step.
  signDispatchVerification: (args: {
    verificationId: string;
    driverName: string;
    operatorId: string;
  }) => Result<{ verification: DispatchVerification }>;

  // Stage 5 — Hold & Investigation
  placeHold: (args: {
    targetType: 'Pallet' | 'Batch';
    targetId: string;
    reason: string;
    note: string;
    operatorId: string;
  }) => Result<{ hold: HoldRecord }>;
  releaseHold: (holdId: string, operatorId: string) => Result;
  reportDiscrepancy: (args: {
    palletId: string;
    note: string;
    operatorId: string;
  }) => Result<{ hold: HoldRecord }>;
  // Clerk flags any pallet with a problem — locks it immediately, but only
  // Manager/HOD/Director approving or rejecting it decides whether it's a
  // real hold.
  flagHoldRequest: (args: {
    palletId: string;
    reason: string;
    note: string | null;
    operatorId: string;
  }) => Result<{ hold: HoldRecord }>;
  approveHoldRequest: (holdId: string, operatorId: string) => Result<{ hold: HoldRecord }>;
  rejectHoldRequest: (args: { holdId: string; note: string | null; operatorId: string }) => Result;

  // Stage 6 — Recall Processing (Line 50)
  sendToRecall: (holdId: string, operatorId: string) => Result<{ recallCase: RecallCase }>;
  advanceRecallStage: (args: {
    recallCaseId: string;
    notes: string | null;
    operatorId: string;
  }) => Result<{ recallCase: RecallCase }>;
  // Manager/HOD/Director decide where a QA-cleared recalled pallet goes.
  decideRecallDestination: (args: {
    recallCaseId: string;
    decision:
      | { type: 'Storage'; rackId: string }
      | { type: 'ReworkLine' }
      | { type: 'Scrap' };
    operatorId: string;
  }) => Result<{ recallCase: RecallCase }>;
  // Picker physically scans the pallet to the decided destination.
  executeRecallDestination: (args: {
    recallCaseId: string;
    scannedId: string;
    operatorId: string;
  }) => Result<{ recallCase: RecallCase }>;

  // Customer returns — logged by the Customer Return Clerk, independent of
  // the pallet/rack model (reverse logistics, not warehouse stock).
  customerReturns: CustomerReturn[];
  logCustomerReturn: (args: {
    sku: string;
    productName: string;
    qty: number;
    department: Department;
    remark: string;
    photoDataUrl: string | null;
    operatorId: string;
  }) => Result<{ customerReturn: CustomerReturn }>;
  reviewAndDecideReturn: (args: {
    returnId: string;
    decision: 'Scrap' | 'Restock' | 'Replace';
    operatorId: string;
  }) => Result<{ customerReturn: CustomerReturn }>;
  actionReturnDecision: (args: {
    returnId: string;
    operatorId: string;
  }) => Result<{ customerReturn: CustomerReturn }>;

  resetDemo: () => void;
}

const seedState = () => ({
  scanners: INITIAL_SCANNERS,
  scannerConfigChanges: [] as ScannerConfigChange[],
  lines: INITIAL_LINES,
  racks: INITIAL_RACKS,
  bayRacks: INITIAL_BAY_RACKS,
  storageZones: STORAGE_ZONES,
  storageShelves: STORAGE_SHELVES,
  loadingBayZones: LOADING_BAY_ZONES,
  loadingBayShelves: LOADING_BAY_SHELVES,
  trucks: INITIAL_TRUCKS,
  pallets: INITIAL_PALLETS,
  productionOrders: [] as ProductionOrder[],
  salesOrders: [] as SalesOrder[],
  salesOrderReleases: [] as SalesOrderRelease[],
  sapSyncing: false,
  loads: INITIAL_LOADS,
  batches: INITIAL_BATCHES,
  movements: [] as Movement[],
  pickTasks: [] as PickTask[],
  manifests: [] as Manifest[],
  holds: INITIAL_HOLDS,
  recallCases: INITIAL_RECALL_CASES,
  directDispatchApprovals: [] as DirectDispatchApproval[],
  dispatchVerifications: [] as DispatchVerification[],
  dispatchAllocations: [] as DispatchAllocation[],
  customerReturns: [] as CustomerReturn[],
  syncQueue: [] as SapSyncTask[],
  simulateSapOutage: false,
  securityEvents: [] as SecurityEvent[],
});

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      login: (userId) => {
        const user = USERS.find((u) => u.id === userId);
        if (!user) {
          // Log failed login
          const state = get();
          const event: SecurityEvent = {
            id: `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'LOGIN_FAILED',
            severity: 'medium',
            details: `Login attempt for unknown user: ${userId}`,
            timestamp: new Date().toISOString(),
          };
          state.logSecurityEvent(event);
          return false;
        }

        // Check if account is locked
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          const remainingMinutes = Math.ceil(
            (new Date(user.lockedUntil).getTime() - Date.now()) / 60000
          );
          const state = get();
          const event: SecurityEvent = {
            id: `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'ACCOUNT_LOCKED',
            severity: 'high',
            details: `Account locked. Try again in ${remainingMinutes} minutes.`,
            userId: user.id,
            userName: user.name,
            timestamp: new Date().toISOString(),
          };
          state.logSecurityEvent(event);
          return false;
        }

        // Successful login
        set((state) => {
          const event: SecurityEvent = {
            id: `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'LOGIN_SUCCESS',
            severity: 'low',
            details: `${user.name} logged in successfully`,
            userId: user.id,
            userName: user.name,
            timestamp: new Date().toISOString(),
          };
          return {
            currentUser: user,
            securityEvents: [...state.securityEvents, event].slice(-100),
          };
        });
        return true;
      },
      logout: () => set({ currentUser: null }),

      updateScannerWorkLocation: (args) => {
        const { scannerId, newLocation, operatorId } = args;
        const state = get();
        const scanner = state.scanners.find((s) => s.id === scannerId);
        if (!scanner) {
          return err('Scanner not found');
        }
        if (!can(state.currentUser?.role, 'admin:scanner-config')) {
          return err('Only authorized users can change scanner work location');
        }
        const previousLocation = scanner.currentWorkLocation;
        set((state) => ({
          scanners: state.scanners.map((s) =>
            s.id === scannerId ? { ...s, currentWorkLocation: newLocation, updatedAt: new Date().toISOString() } : s
          ),
          scannerConfigChanges: [
            ...state.scannerConfigChanges,
            {
              id: `SCC-${Date.now()}`,
              scannerId,
              previousLocation,
              newLocation,
              changedByUserId: operatorId,
              changedAt: new Date().toISOString(),
            },
          ],
        }));
        return ok(undefined);
      },

      getScannerByWorkLocation: (location) => {
        const state = get();
        return state.scanners.find((s) => s.currentWorkLocation === location && s.status === 'Active') ?? null;
      },

      ...seedState(),

      loadSapData: async () => {
        set({ sapSyncing: true });
        const [productionOrders, salesOrders] = await Promise.all([
          fetchProductionOrders(),
          fetchSalesOrders(),
        ]);
        set((state) => ({
          productionOrders: state.productionOrders.length
            ? state.productionOrders
            : productionOrders,
          salesOrders: state.salesOrders.length ? state.salesOrders : salesOrders,
          sapSyncing: false,
        }));
      },

      toasts: [],
      pushToast: (message, kind = 'info') => {
        const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({ toasts: [...state.toasts, { id, message, kind }].slice(-4) }));
        setTimeout(() => get().dismissToast(id), 4500);
      },
      dismissToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      logSecurityEvent: (event) =>
        set((state) => ({ securityEvents: [...state.securityEvents, event].slice(-100) })),

      setSimulateSapOutage: (value) => {
        set({ simulateSapOutage: value });
        get().pushToast(
          value ? 'Simulating SAP outage — new transactions will queue and retry' : 'SAP connection restored',
          value ? 'error' : 'success',
        );
      },

      enqueueSapSync: (type, description) => {
        const task: SapSyncTask = {
          id: generateSyncTaskId(),
          type,
          description,
          status: 'Pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
          lastAttemptAt: null,
          sapDocNumber: null,
        };
        set((state) => ({ syncQueue: [...state.syncQueue, task] }));
        get().attemptSyncTask(task.id);
      },

      attemptSyncTask: (taskId) => {
        const state = get();
        const task = state.syncQueue.find((t) => t.id === taskId);
        if (!task || task.status === 'Synced') return;

        if (state.simulateSapOutage) {
          set((s) => ({
            syncQueue: s.syncQueue.map((t) =>
              t.id === taskId
                ? { ...t, status: 'Failed', attempts: t.attempts + 1, lastAttemptAt: new Date().toISOString() }
                : t,
            ),
          }));
          return;
        }

        set((s) => ({
          syncQueue: s.syncQueue.map((t) => (t.id === taskId ? { ...t, status: 'Syncing' } : t)),
        }));
        postGenericTransaction(task.type, task.description).then((res) => {
          set((s) => ({
            syncQueue: s.syncQueue.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'Synced',
                    attempts: t.attempts + 1,
                    lastAttemptAt: new Date().toISOString(),
                    sapDocNumber: res.sapDocNumber,
                  }
                : t,
            ),
          }));
        });
      },

      scanLine: (lineId) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        if (state.currentUser && getPickerType(state.currentUser.id) !== 'production') {
          return err('❌ Only production pickers can scan lines');
        }
        const line = state.lines.find((l) => l.id === lineId);
        if (!line) return err(`Line "${lineId}" not found`);
        return ok({ line });
      },

      // A line isn't wired to one fixed product — it's whatever the operator
      // scans next, same as a physical changeover. Resolves the scanned code
      // (internal SKU or a real product's own EAN-13) against an Open
      // production order for this line and hands the line over to it.
      scanProductForLine: ({ lineId, productCode }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        if (state.currentUser && getPickerType(state.currentUser.id) !== 'production') {
          return err('❌ Only production pickers can scan products for production');
        }
        const line = state.lines.find((l) => l.id === lineId);
        if (!line) return err(`Line "${lineId}" not found`);

        const sku = resolveScannedSku(productCode);
        const po = state.productionOrders.find(
          (p) => p.lineId === lineId && p.sku === sku && p.status === 'Open',
        );
        if (!po) {
          return err(`No open production order for "${productCode}" on line ${lineId}`);
        }

        const updatedLine: Line = { ...line, status: 'Running', activeProductionOrderId: po.id };
        set((state) => ({
          lines: state.lines.map((l) => (l.id === lineId ? updatedLine : l)),
        }));
        return ok({ line: updatedLine, productionOrder: po });
      },

      scanPalletForLoad: (palletId) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        if (state.currentUser && getPickerType(state.currentUser.id) !== 'production') {
          return err('❌ Only production pickers can scan pallets for production loading');
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'Empty') {
          return err(`Pallet ${palletId} is not empty (status: ${pallet.status})`);
        }
        return ok({ pallet });
      },

      confirmLoad: ({ lineId, productionOrderId, palletId, quantity, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const line = state.lines.find((l) => l.id === lineId);
        if (!line) return err(`Line "${lineId}" not found`);

        // Pinned to the production order the operator was shown when they
        // started this pallet — NOT re-derived from the line's current
        // active order, which may have already moved on to a new product by
        // the time this pallet is confirmed.
        const po = state.productionOrders.find((p) => p.id === productionOrderId);
        if (!po) return err(`Production order "${productionOrderId}" not found`);
        if (po.lineId !== lineId) {
          return err(`Production order ${productionOrderId} does not belong to line ${lineId}`);
        }

        const palletResult = get().scanPalletForLoad(palletId);
        if (!palletResult.ok) return err(palletResult.error);

        const capacity = unitsPerPallet(po.sku);
        if (quantity !== capacity) {
          return err(
            `Quantity must equal a full pallet of ${po.productName} (${capacity} units) to confirm the load — got ${quantity}`,
          );
        }

        const now = new Date().toISOString();
        const batchId = generateBatchId(po.id);
        const existingBatch = get().batches.find((b) => b.id === batchId);
        const loadId = generateLoadId();

        // Generate storage recommendation for this pallet (considering in-transit pallets)
        const storageRec = recommendStorageLocation(state.racks, po.sku, palletId, state.pallets);

        const load: Load = {
          id: loadId,
          palletId,
          batchId,
          sku: po.sku,
          productName: po.productName,
          quantity,
          lineId: line.id,
          producedAt: now,
          operatorId,
          status: 'InStorage',
        };
        const batch: Batch = existingBatch
          ? {
              ...existingBatch,
              loadIds: [...existingBatch.loadIds, loadId],
              totalQty: existingBatch.totalQty + quantity,
            }
          : {
              id: batchId,
              productionOrderId: po.id,
              lineId: line.id,
              sku: po.sku,
              productName: po.productName,
              date: now,
              loadIds: [loadId],
              totalQty: quantity,
            };

        const newFulfilled = po.fulfilledQty + quantity;
        const poComplete = newFulfilled >= po.targetQty;

        set((state) => ({
          loads: [...state.loads, load],
          batches: [...state.batches.filter((b) => b.id !== batch.id), batch],
          productionOrders: state.productionOrders.map((p) =>
            p.id === po.id
              ? { ...p, fulfilledQty: newFulfilled, status: poComplete ? 'Complete' : 'Open' }
              : p,
          ),
          // Only touch the line's own running/active-order state if it's
          // still on the pinned PO — if it already moved on to a newer order
          // by the time this (now-stale) confirmation lands, that newer
          // order's own confirmLoad calls own the line's status from here.
          lines: state.lines.map((l) =>
            l.id === lineId && l.activeProductionOrderId === po.id
              ? {
                  ...l,
                  status: poComplete ? 'Free' : 'Running',
                  activeProductionOrderId: poComplete ? null : po.id,
                }
              : l,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? {
                  ...p,
                  status: 'Loaded',
                  loadId,
                  recommendedStorageLocation: storageRec ?? undefined,
                }
              : p,
          ),
        }));

        get().pushToast(
          `✓ Load confirmed on ${palletId} — Batch ${batch.id}${poComplete ? ' (production order complete)' : ''} · Storage recommendation ready`,
          'success',
        );

        get().enqueueSapSync(
          'PalletCreated',
          `Pallet ${palletId} completed on ${line.name} — Batch ${batch.id}, ${quantity} units of ${po.productName}`,
        );
        return ok({ loadId, batchId: batch.id, poComplete });
      },

      scanPalletLeavingLine: (palletId, operatorId) => {
        const state0 = get();
        if (!can(state0.currentUser?.role, 'execute:scan')) {
          return err(`${state0.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const pallet = get().pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'Loaded') {
          return err(
            `Pallet ${palletId} is not a loaded pallet awaiting transit (status: ${pallet.status})`,
          );
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot move until the hold is released`);

        // Check if there's a Production Direct Dispatch approval for a sales order
        // matching this pallet's SKU that isn't fully dispatched yet — freshly
        // produced pallets have no pick task yet, so match by SKU like the rest
        // of the direct-dispatch flow (e.g. generateManifestForPickingComplete).
        const load = state0.loads.find((l) => l.palletId === palletId);
        const hasProductionDirectApproval = !!load && state0.directDispatchApprovals.some((a) => {
          if (a.source !== 'Production' || a.status !== 'Approved') return false;
          const so = state0.salesOrders.find((s) => s.id === a.salesOrderId);
          return !!so && so.sku === load.sku && so.dispatchedQty < so.qty;
        });

        const isDirectDispatch = !!hasProductionDirectApproval;
        const newStatus = isDirectDispatch ? 'InTransitToTruck' : 'InTransitToStorage';
        const destination = isDirectDispatch ? 'Dispatch (Production Direct)' : 'InTransit to Storage';

        set((state) => ({
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, status: newStatus, location: { type: 'InTransit' } } : p,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: 'Line',
              to: destination,
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));

        if (isDirectDispatch) {
          get().pushToast(
            `Pallet ${palletId} routed directly to dispatch per Production Direct approval`,
            'success',
          );
        }
        return ok(undefined);
      },

      scanPalletToRack: ({ palletId, rackId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'InTransitToStorage') {
          return err(`Pallet ${palletId} is not in transit to storage (status: ${pallet.status})`);
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot move until the hold is released`);
        const rack = state.racks.find((r) => r.id === rackId);
        if (!rack) return err(`Rack "${rackId}" not found`);
        const slot = rack.slots.find((s) => s.palletId === null);
        if (!slot) return err(`Rack ${rackId} has no free slot`);

        // Check if this pallet is part of a put-away task and mark it as picked
        const putAwayTask = state.pickTasks.find(
          (t) => t.origin === 'Production' && t.items.some((i) => i.palletId === palletId && !i.picked),
        );
        const updatedItems = putAwayTask
          ? putAwayTask.items.map((i) => (i.palletId === palletId ? { ...i, picked: true } : i))
          : undefined;
        const putAwayCompleted = updatedItems && updatedItems.every((i) => i.picked);

        set((state) => ({
          racks: state.racks.map((r) =>
            r.id === rackId
              ? { ...r, slots: r.slots.map((s) => (s.index === slot.index ? { ...s, palletId } : s)) }
              : r,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? { ...p, status: 'Racked', location: { type: 'Rack', rackId, slotIndex: slot.index } }
              : p,
          ),
          pickTasks: putAwayTask
            ? state.pickTasks.map((t) =>
                t.id === putAwayTask.id
                  ? { ...t, items: updatedItems!, status: putAwayCompleted ? 'Completed' : t.status }
                  : t,
              )
            : state.pickTasks,
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: 'InTransit',
              to: `Rack ${rackId}`,
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        if (putAwayTask && putAwayCompleted) {
          get().pushToast(`Pallet ${palletId} racked at ${rackId} / slot ${slot.index + 1} · Put-away task complete`, 'success');
        } else {
          get().pushToast(`Pallet ${palletId} racked at ${rackId} / slot ${slot.index + 1}`, 'success');
        }
        get().enqueueSapSync('StorageMovement', `Pallet ${palletId} stored at ${rackId}/slot ${slot.index + 1}`);
        return ok(undefined);
      },

      assignPickTaskToPickers: ({ salesOrderId, assignments, operatorId }) => {
        // Recorded via the RBAC check only — PickTask has no "assigned by"
        // field (the picker on each task is what matters downstream).
        void operatorId;
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot assign pickers — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (assignments.length === 0) return err('Assign at least one picker');
        const productDept = PRODUCTS.find((p) => p.sku === so.sku)?.department;
        for (const a of assignments) {
          if (a.qty <= 0) return err('Each picker\'s quantity must be greater than zero');
          const picker = USERS.find((u) => u.id === a.pickerId);
          if (!picker || picker.role !== 'Picker') return err(`"${a.pickerId}" is not a valid Picker`);
          if (productDept && picker.department !== productDept) {
            return err(
              `Picker ${picker.name} is in ${picker.department}, but ${so.productName} is in ${productDept} — cannot cross-assign`,
            );
          }
        }

        // Same released-not-yet-committed ceiling requestPick enforces.
        const committedQty = state.pickTasks
          .filter((t) => t.salesOrderId === salesOrderId && t.origin === 'Storage')
          .flatMap((t) => t.items)
          .reduce((sum, i) => {
            const load = state.loads.find((l) => l.palletId === i.palletId);
            return load && load.status === 'InStorage' ? sum + i.quantity : sum;
          }, 0);
        const availableToAssign = so.releasedQty - so.dispatchedQty - committedQty;
        const totalRequested = assignments.reduce((sum, a) => sum + a.qty, 0);
        if (totalRequested > availableToAssign) {
          return err(
            availableToAssign <= 0
              ? `No released quantity available yet for ${salesOrderId} — ask the Loader to release stock first`
              : `Only ${availableToAssign.toLocaleString()} released units of ${salesOrderId} are available to assign`,
          );
        }

        const tasks: PickTask[] = [];
        for (const a of assignments) {
          // Re-read fresh state each iteration so an earlier assignment in
          // this same batch is already excluded from the next one's FIFO pool.
          const liveState = get();
          const items = selectFifoPickItems(liveState, so.sku, a.qty);
          if (items.length === 0) {
            return err(
              `Ran out of storage stock for SKU ${so.sku} while assigning ${a.pickerId} — assigned ${tasks.length} of ${assignments.length} picker(s) before running out`,
            );
          }
          const task: PickTask = {
            id: generatePickTaskId(),
            salesOrderId,
            origin: 'Storage',
            items,
            status: 'Accepted',
            assignedPickerId: a.pickerId,
            directDispatch: false,
            createdAt: new Date().toISOString(),
          };
          tasks.push(task);
          set((s) => ({ pickTasks: [...s.pickTasks, task] }));
        }
        set((s) => ({
          salesOrders: s.salesOrders.map((so2) => (so2.id === salesOrderId ? { ...so2, status: 'Picking' } : so2)),
        }));
        get().pushToast(
          `Assigned ${tasks.length} picker(s) to ${salesOrderId}: ${assignments
            .map((a) => `${USERS.find((u) => u.id === a.pickerId)?.name ?? a.pickerId} (${a.qty})`)
            .join(', ')}`,
          'success',
        );
        return ok({ tasks });
      },

      requestStockFromStorageToLoadingBay: ({ sku, qty, operatorId }) => {
        const state = get();
        // Only HODs from the product's department can request stock
        if (!can(state.currentUser?.role, 'approve:hold')) {
          return err(
            `${state.currentUser?.role ?? 'This role'} cannot request stock staging — requires HOD, Manager, or Director`,
          );
        }
        const product = PRODUCTS.find((p) => p.sku === sku);
        if (!product) return err(`Product ${sku} not found`);
        if (
          state.currentUser?.role === 'HOD' &&
          state.currentUser.department !== product.department
        ) {
          return err(
            `${sku} is in ${product.department}, but you are HOD of ${state.currentUser.department} — cannot request`,
          );
        }
        if (qty <= 0) return err('Request quantity must be greater than zero');

        // FIFO selection from storage
        const items = selectFifoPickItems(state, sku, qty);
        if (items.length === 0) {
          return err(`No available stock in storage for ${sku}`);
        }

        // Try to auto-assign to an available Storage Picker in this product's department
        const availablePicker = findAvailablePickerByType(state, product.department, 'storage');

        const now = new Date().toISOString();
        const task: PickTask = {
          id: generatePickTaskId(),
          salesOrderId: null,  // No specific SO — pure staging request
          origin: 'Storage',
          items,
          status: availablePicker ? 'Accepted' : 'PendingAcceptance',
          assignedPickerId: availablePicker?.id ?? null,
          directDispatch: false,
          createdAt: now,
        };
        set((state) => ({
          pickTasks: [...state.pickTasks, task],
        }));
        const msg = availablePicker
          ? `Stock request for ${qty} units of ${product.name} assigned to ${availablePicker.name}`
          : `Stock request for ${qty} units of ${product.name} queued (awaiting available Picker from ${product.department})`;
        get().pushToast(msg, 'success');
        get().enqueueSapSync(
          'StockStagingRequested',
          `${qty} units of ${sku} staged by ${operatorId}${availablePicker ? ` (assigned to ${availablePicker.name})` : ''}`,
        );
        return ok({ task: availablePicker ? task : null });
      },

      // Storage-side "step 1" scan — scan the rack first, before the
      // pallet is known, and look up which pending item is sourced from it.
      findPickItemByRack: (pickTaskId, rackId) => {
        const task = get().pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        const item = task.items.find((i) => i.sourceRackId === rackId && !i.picked);
        if (!item) return err(`No pallet from this pick task is stored at rack ${rackId}`);
        return ok({ palletId: item.palletId });
      },

      scanRackForPick: ({ pickTaskId, palletId, rackId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot release pallets from storage — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        if (task.status !== 'Accepted' || task.assignedPickerId !== operatorId) {
          return err(`Pick task ${pickTaskId} must be accepted by you before releasing pallets`);
        }
        const item = task.items.find((i) => i.palletId === palletId && !i.picked);
        if (!item) return err(`Pallet ${palletId} is not part of this pick task`);
        if (item.sourceRackId !== rackId) {
          return err(
            `Wrong rack — pallet ${palletId} is at ${item.sourceRackId}, not ${rackId}. Scan rejected.`,
          );
        }

        // Mark item as picked regardless of dispatch type
        const updatedItems = task.items.map((i) => (i.palletId === palletId ? { ...i, picked: true } : i));

        // Direct-dispatch (approved shortfall) top-ups bypass the Loading Bay entirely (spec §17)
        const isDirectDispatch = task.directDispatch;
        const taskCompleted = updatedItems.every((i) => i.picked);

        set((state) => ({
          racks: state.racks.map((r) =>
            r.id === rackId
              ? {
                  ...r,
                  slots: r.slots.map((s) =>
                    s.index === item.sourceSlotIndex ? { ...s, palletId: null } : s,
                  ),
                }
              : r,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? {
                  ...p,
                  status: isDirectDispatch ? 'InTransitToTruck' : 'InTransitToBay',
                  location: { type: 'InTransit' },
                }
              : p,
          ),
          pickTasks: state.pickTasks.map((t) =>
            t.id === pickTaskId
              ? { ...t, items: updatedItems, status: taskCompleted ? 'Completed' : t.status }
              : t,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: `Rack ${rackId}`,
              to: isDirectDispatch ? 'Dispatch Area (Direct)' : 'InTransit',
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        if (isDirectDispatch) {
          get().pushToast(
            `Pallet ${palletId} released directly to the dispatch area — bypassing the loading bay`,
            'success',
          );
        }
        return ok(undefined);
      },

      scanPalletLeavingStorage: ({ pickTaskId, palletId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot perform picks — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        if (task.assignedPickerId !== operatorId) {
          return err(`Pick task ${pickTaskId} must be assigned to you`);
        }
        const item = task.items.find((i) => i.palletId === palletId);
        if (!item) return err(`Pallet ${palletId} is not part of this pick task`);
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet ${palletId} not found`);
        if (pallet.status !== 'Racked') {
          return err(`Pallet ${palletId} must be in storage (Racked) to be released — current status: ${pallet.status}`);
        }

        const isDirectDispatch = task.directDispatch;
        set((state) => ({
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? { ...p, status: isDirectDispatch ? 'InTransitToTruck' : 'InTransitToBay' }
              : p,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: `Rack ${item.sourceRackId}`,
              to: isDirectDispatch ? 'Dispatch (Direct)' : 'InTransit to Bay',
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        const message = isDirectDispatch
          ? `Pallet ${palletId} released directly to dispatch — bypassing the loading bay`
          : `Pallet ${palletId} released from storage — en route to bay`;
        get().pushToast(message, 'success');
        get().enqueueSapSync('PickMovement', `Pallet ${palletId} released from storage`);
        return ok(undefined);
      },

      scanBayRackForPick: ({ pickTaskId, palletId, bayRackId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot confirm bay arrivals — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        if (task.assignedPickerId !== operatorId) {
          return err(`Pick task ${pickTaskId} must be accepted by you before confirming bay arrival`);
        }
        const item = task.items.find((i) => i.palletId === palletId);
        if (!item) return err(`Pallet ${palletId} is not part of this pick task`);
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet || pallet.status !== 'InTransitToBay') {
          return err(`Pallet ${palletId} is not currently in transit to the bay. Scan rejected.`);
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot move until the hold is released`);
        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);
        const freeSlot = bayRack.slots.find((s) => s.palletId === null);
        if (!freeSlot) return err(`Bay rack ${bayRackId} has no free slot`);

        const updatedItems = task.items.map((i) =>
          i.palletId === palletId ? { ...i, picked: true } : i,
        );
        const completed = updatedItems.every((i) => i.picked);

        set((state) => ({
          racks: state.racks.map((r) => ({
            ...r,
            slots: r.slots.map((s) => (s.palletId === palletId ? { ...s, palletId: null } : s)),
          })),
          bayRacks: state.bayRacks.map((b) =>
            b.id === bayRackId
              ? { ...b, slots: b.slots.map((s) => (s.index === freeSlot.index ? { ...s, palletId } : s)) }
              : b,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? { ...p, status: 'OnBay', location: { type: 'BayRack', bayRackId, slotIndex: freeSlot.index } }
              : p,
          ),
          pickTasks: state.pickTasks.map((t) =>
            t.id === pickTaskId
              ? { ...t, items: updatedItems, status: completed ? 'Completed' : t.status }
              : t,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: 'InTransit',
              to: `Bay ${bayRackId}`,
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        get().pushToast(`Pallet ${palletId} placed on ${bayRackId}`, 'success');
        get().enqueueSapSync('PickMovement', `Pallet ${palletId} moved to bay rack ${bayRackId}`);
        return ok({ completed });
      },

      // Loading Bay intake - place pallet in bay rack (no task required)
      placePalletInBay: ({ palletId, bayRackId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot place pallets in bay — requires Picker`);
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet || pallet.status !== 'InTransitToBay') {
          return err(`Pallet ${palletId} is not in transit to bay (status: ${pallet?.status || 'unknown'})`);
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot move`);

        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);
        const freeSlot = bayRack.slots.find((s) => s.palletId === null);
        if (!freeSlot) return err(`Bay rack ${bayRackId} has no free slot`);

        set((state) => ({
          bayRacks: state.bayRacks.map((b) =>
            b.id === bayRackId
              ? { ...b, slots: b.slots.map((s) => (s.index === freeSlot.index ? { ...s, palletId } : s)) }
              : b,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId
              ? { ...p, status: 'OnBay', location: { type: 'BayRack', bayRackId, slotIndex: freeSlot.index } }
              : p,
          ),
        }));
        get().pushToast(`Pallet ${palletId} placed in bay rack ${bayRackId}`, 'success');
        get().enqueueSapSync('BayPlacement', `Pallet ${palletId} placed in bay by ${operatorId}`);
        return ok(undefined);
      },

      scanPalletArrivedForDirectDispatch: ({ palletId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'InTransitToTruck') {
          return err(`Pallet ${palletId} is not a direct-dispatch pallet in transit (status: ${pallet.status})`);
        }
        if (pallet.directDispatchArrivedAt) {
          return err(`Pallet ${palletId} arrival was already confirmed`);
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot move until the hold is released`);

        const load = state.loads.find((l) => l.palletId === palletId);
        const matchedSo = load
          ? state.salesOrders.find((s) => {
              if (s.sku !== load.sku || !s.assignedTruckId) return false;
              return state.directDispatchApprovals.some(
                (a) => a.salesOrderId === s.id && a.status === 'Approved',
              );
            })
          : undefined;
        const truck = matchedSo?.assignedTruckId
          ? state.trucks.find((t) => t.id === matchedSo.assignedTruckId)
          : undefined;
        const dispatchLine = truck?.dispatchLine ?? null;

        const now = new Date().toISOString();
        set((state) => ({
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, directDispatchArrivedAt: now } : p,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: 'InTransit',
              to: 'Loading Bay (Direct Dispatch Arrival)',
              timestamp: now,
              operatorId,
            },
          ],
        }));
        get().pushToast(
          dispatchLine
            ? `✓ Pallet ${palletId} arrived — take it straight to ${dispatchLine}`
            : `✓ Pallet ${palletId} arrived — take it straight to dispatch`,
          'success',
        );
        return ok({ dispatchLine });
      },

      assignDispatchPickingTasks: ({ salesOrderId, assignments }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot assign pickers — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (assignments.length === 0) return err('Assign at least one picker');
        const productDept = PRODUCTS.find((p) => p.sku === so.sku)?.department;
        for (const a of assignments) {
          if (a.qty <= 0) return err('Each picker\'s quantity must be greater than zero');
          const picker = USERS.find((u) => u.id === a.pickerId);
          if (!picker || picker.role !== 'Picker') return err(`"${a.pickerId}" is not a valid Picker`);
          if (productDept && picker.department !== productDept) {
            return err(
              `Picker ${picker.name} is in ${picker.department}, but ${so.productName} is in ${productDept} — cannot cross-assign`,
            );
          }
        }

        const onBayQty = state.bayRacks.reduce((sum, b) => {
          const palletIds = b.slots.map((s) => s.palletId).filter((id): id is string => !!id);
          return (
            sum +
            palletIds.reduce((slotSum, palletId) => {
              const load = state.loads.find((l) => l.palletId === palletId);
              return load && load.sku === so.sku ? slotSum + load.quantity : slotSum;
            }, 0)
          );
        }, 0);

        const totalRequested = assignments.reduce((sum, a) => sum + a.qty, 0);
        if (totalRequested > onBayQty) {
          return err(
            onBayQty <= 0
              ? `No stock on bay yet for ${salesOrderId} — request stocking first via HOD`
              : `Only ${onBayQty.toLocaleString()} units on bay; cannot dispatch ${totalRequested.toLocaleString()} units`,
          );
        }

        const tasks: PickTask[] = [];
        for (const a of assignments) {
          const liveState = get();
          const items = selectFifoBayPickItems(liveState, so.sku, a.qty);
          if (items.length === 0) {
            return err(
              `Ran out of bay stock for SKU ${so.sku} while assigning ${a.pickerId} — assigned ${tasks.length} of ${assignments.length} picker(s) before running out`,
            );
          }
          const task: PickTask = {
            id: generatePickTaskId(),
            salesOrderId,
            origin: 'Dispatch',
            items,
            status: 'Accepted',
            assignedPickerId: a.pickerId,
            directDispatch: false,
            createdAt: new Date().toISOString(),
          };
          tasks.push(task);
          set((s) => ({ pickTasks: [...s.pickTasks, task] }));
        }
        get().pushToast(
          `Assigned ${tasks.length} picker(s) for dispatch: ${assignments
            .map((a) => `${USERS.find((u) => u.id === a.pickerId)?.name ?? a.pickerId} (${a.qty} units)`)
            .join(', ')}`,
          'success',
        );
        return ok({ tasks });
      },

      assignStorageDirectDispatchTasks: ({ salesOrderId, assignments, operatorId: _operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot assign pickers — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (assignments.length === 0) return err('Assign at least one picker');

        const productDept = PRODUCTS.find((p) => p.sku === so.sku)?.department;
        for (const a of assignments) {
          if (a.qty <= 0) return err('Each picker\'s quantity must be greater than zero');
          const picker = USERS.find((u) => u.id === a.pickerId);
          if (!picker || picker.role !== 'Picker') return err(`"${a.pickerId}" is not a valid Picker`);
          if (productDept && picker.department !== productDept) {
            return err(
              `Picker ${picker.name} is in ${picker.department}, but ${so.productName} is in ${productDept} — cannot cross-assign`,
            );
          }
        }

        // Check storage has stock
        const inStorageQty = state.racks.reduce((sum, r) => {
          const palletIds = r.slots.filter((s) => s.palletId).map((s) => s.palletId!) as string[];
          return sum + palletIds.reduce((slotSum, pId) => {
            const load = state.loads.find((l) => l.palletId === pId);
            return load && load.sku === so.sku ? slotSum + load.quantity : slotSum;
          }, 0);
        }, 0);

        const totalRequested = assignments.reduce((sum, a) => sum + a.qty, 0);
        if (totalRequested > inStorageQty) {
          return err(
            inStorageQty <= 0
              ? `No stock in storage for ${salesOrderId}`
              : `Only ${inStorageQty.toLocaleString()} units in storage; cannot pick ${totalRequested.toLocaleString()} units`,
          );
        }

        const tasks: PickTask[] = [];
        for (const a of assignments) {
          const liveState = get();
          // Select from storage for direct dispatch
          const items = selectFifoPickItems(liveState, so.sku, a.qty);
          if (items.length === 0) {
            return err(
              `Ran out of storage stock for SKU ${so.sku} while assigning ${a.pickerId} — assigned ${tasks.length} of ${assignments.length} picker(s) before running out`,
            );
          }
          const task: PickTask = {
            id: generatePickTaskId(),
            salesOrderId,
            origin: 'Storage',
            items,
            status: 'Accepted',
            assignedPickerId: a.pickerId,
            directDispatch: true,  // Key flag: this bypasses staging
            createdAt: new Date().toISOString(),
          };
          tasks.push(task);
          set((s) => ({ pickTasks: [...s.pickTasks, task] }));
        }
        get().pushToast(
          `Assigned ${tasks.length} storage picker(s) for direct dispatch: ${assignments
            .map((a) => `${USERS.find((u) => u.id === a.pickerId)?.name ?? a.pickerId} (${a.qty} units)`)
            .join(', ')}`,
          'success',
        );
        return ok({ tasks });
      },

      executeDispatchPicking: ({ pickTaskId, bayRackId, palletIds, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot execute dispatch picking — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Dispatch task "${pickTaskId}" not found`);
        if (task.origin !== 'Dispatch') return err(`Task ${pickTaskId} is not a dispatch picking task`);
        if (task.assignedPickerId !== operatorId) {
          return err(`Task ${pickTaskId} must be assigned to you`);
        }

        const so = state.salesOrders.find((s) => s.id === task.salesOrderId);
        if (!so || !so.assignedTruckId) return err(`Sales order not found or no vehicle assigned`);

        const truck = state.trucks.find((t) => t.id === so.assignedTruckId);
        if (!truck) return err(`Truck not found`);

        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);

        const taskPalletIds = task.items.map((i) => i.palletId);
        for (const palletId of palletIds) {
          if (!taskPalletIds.includes(palletId)) {
            return err(`Pallet ${palletId} is not part of this dispatch task`);
          }
          const pallet = state.pallets.find((p) => p.id === palletId);
          if (!pallet || pallet.status !== 'OnBay') {
            return err(`Pallet ${palletId} is not on bay — cannot dispatch`);
          }
        }

        const updatedItems = task.items.map((i) =>
          palletIds.includes(i.palletId) ? { ...i, picked: true } : i,
        );
        const completed = updatedItems.every((i) => i.picked);

        set((state) => ({
          racks: state.racks.map((r) => ({
            ...r,
            slots: r.slots.map((s) => (palletIds.includes(s.palletId ?? '') ? { ...s, palletId: null } : s)),
          })),
          bayRacks: state.bayRacks.map((b) =>
            b.id === bayRackId
              ? { ...b, slots: b.slots.map((s) => (palletIds.includes(s.palletId ?? '') ? { ...s, palletId: null } : s)) }
              : b,
          ),
          pallets: state.pallets.map((p) =>
            palletIds.includes(p.id)
              ? { ...p, status: 'StagedForDispatch', location: { type: 'DispatchLine', dispatchLine: truck.dispatchLine, truckId: so.assignedTruckId! } }
              : p,
          ),
          pickTasks: state.pickTasks.map((t) =>
            t.id === pickTaskId
              ? { ...t, items: updatedItems, status: completed ? 'Completed' : t.status }
              : t,
          ),
          movements: [
            ...state.movements,
            ...palletIds.map((palletId) => ({
              id: generateMovementId(),
              palletId,
              from: `Bay Rack ${bayRackId}`,
              to: `${truck.dispatchLine}`,
              timestamp: new Date().toISOString(),
              operatorId,
            })),
          ],
        }));
        get().pushToast(
          `${palletIds.length} pallet(s) staged for dispatch at ${truck.dispatchLine}`,
          'success',
        );
        get().enqueueSapSync('PickMovement', `${palletIds.length} pallets moved to ${truck.dispatchLine}`);
        return ok({ completed });
      },

      availableOnBay: (sku) => {
        const state = get();
        return state.bayRacks.reduce((sum, b) => {
          const palletIds = b.slots.map((s) => s.palletId).filter((id): id is string => !!id);
          return (
            sum +
            palletIds.reduce((slotSum, palletId) => {
              const load = state.loads.find((l) => l.palletId === palletId);
              return slotSum + (load && load.sku === sku ? load.quantity : 0);
            }, 0)
          );
        }, 0);
      },

      availableInStorage: (sku) => {
        const state = get();
        // Sum all Racked pallets that match the SKU (excluding held/reserved stock)
        const reserved = reservedPalletIds(state.pickTasks);
        return state.pallets
          .filter((p) => p.status === 'Racked' && !p.holdId && !reserved.has(p.id))
          .reduce((sum, pallet) => {
            const load = state.loads.find((l) => l.palletId === pallet.id);
            return sum + (load && load.sku === sku ? load.quantity : 0);
          }, 0);
      },

      availableInProduction: (sku) => {
        const state = get();
        // Sum all Loaded pallets (still on production lines) that match the SKU
        return state.pallets
          .filter((p) => p.status === 'Loaded')
          .reduce((sum, pallet) => {
            const load = state.loads.find((l) => l.palletId === pallet.id);
            return sum + (load && load.sku === sku ? load.quantity : 0);
          }, 0);
      },

      requestTopUp: (salesOrderId, directDispatch = false) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        // Capped by released quantity, same principle as requestPick — a
        // top-up can't pull unreleased stock either.
        const remaining = so.releasedQty - so.dispatchedQty;
        if (remaining <= 0) {
          return err(`No released quantity available yet for ${salesOrderId} — ask the Loader to release stock first`);
        }
        const available = get().availableOnBay(so.sku);
        const shortfall = remaining - available;
        if (shortfall <= 0) return err('Bay already holds enough stock — no top-up needed');

        const reserved = reservedPalletIds(state.pickTasks);
        const rackedPalletIds = new Set(
          state.pallets
            .filter((p) => p.status === 'Racked' && !p.holdId && !reserved.has(p.id))
            .map((p) => p.id),
        );
        const candidates = state.loads.filter((l) => rackedPalletIds.has(l.palletId));
        const picked = selectFifoLoads(candidates, so.sku, shortfall);
        if (picked.length === 0) {
          return err(`Storage has no additional stock for SKU ${so.sku} — cannot top up`);
        }

        const items = picked.map((l) => {
          const loc = findRackHoldingPallet(state.racks, l.palletId);
          return {
            palletId: l.palletId,
            sourceRackId: loc?.rackId ?? '',
            sourceSlotIndex: loc?.slotIndex ?? -1,
            sku: l.sku,
            quantity: l.quantity,
            picked: false,
          };
        });
        const task: PickTask = {
          id: generatePickTaskId(),
          salesOrderId,
          origin: 'Bay-Topup',
          items,
          status: 'PendingAcceptance',
          assignedPickerId: null,
          directDispatch,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ pickTasks: [...state.pickTasks, task] }));
        get().pushToast(
          `Bay short by ${shortfall} units for ${so.sku} — top-up pick task created from Storage (FIFO)`,
          'info',
        );
        return ok({ task });
      },

      releaseSalesOrderQuantity: ({ salesOrderId, qty, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot release a sales order — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        // The collecting vehicle is what triggers release, not the other way
        // round — SAP doesn't hand it over in advance, so nothing gets pulled
        // for picking until the customer/driver has actually shown up with a
        // receipt and the Loader has registered them.
        if (!so.assignedTruckId) {
          return err(
            `Register the collecting vehicle for ${salesOrderId} before releasing it for picking`,
          );
        }
        if (qty <= 0) return err('Release quantity must be greater than zero');
        const unreleased = so.qty - so.releasedQty;
        if (qty > unreleased) {
          return err(`Only ${unreleased.toLocaleString()} units of ${salesOrderId} remain unreleased`);
        }

        const release: SalesOrderRelease = {
          id: generateReleaseId(),
          salesOrderId,
          qty,
          releasedByUserId: operatorId,
          releasedAt: new Date().toISOString(),
        };
        set((state) => ({
          salesOrders: state.salesOrders.map((s) =>
            s.id === salesOrderId ? { ...s, releasedQty: s.releasedQty + qty } : s,
          ),
          salesOrderReleases: [...state.salesOrderReleases, release],
        }));
        get().pushToast(
          `Released ${qty.toLocaleString()} units of ${so.productName} for ${salesOrderId}`,
          'success',
        );
        get().enqueueSapSync(
          'SalesOrderReleased',
          `${salesOrderId}: ${qty.toLocaleString()} units released by ${operatorId}`,
        );
        return ok({ release });
      },

      planDispatchAllocation: ({ salesOrderId, truckId, qty, dispatchLine, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot plan a dispatch — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (so.status === 'Fulfilled') return err(`Sales order ${salesOrderId} is already fulfilled`);
        const truck = state.trucks.find((t) => t.id === truckId);
        if (!truck) return err(`Truck "${truckId}" not found`);
        if (qty <= 0) return err('Planned quantity must be greater than zero');

        const existingAllocations = state.dispatchAllocations.filter((a) => a.salesOrderId === salesOrderId);
        if (existingAllocations.some((a) => a.truckId === truckId)) {
          return err(`Truck ${truckId} already has an allocation for ${salesOrderId}`);
        }
        // A truck already committed elsewhere (and not via an allocation for
        // this SO) can't also be planned in here.
        if (truck.salesOrderId && truck.salesOrderId !== salesOrderId) {
          return err(`Truck ${truckId} is already assigned to a different sales order`);
        }
        const plannedSoFar = existingAllocations.reduce((sum, a) => sum + a.plannedQty, 0);
        // Capped by what's actually been released, not the whole order — a
        // Loader can only plan vehicles for quantity they've released.
        const remaining = so.releasedQty - so.dispatchedQty - plannedSoFar;
        if (qty > remaining) {
          return err(
            remaining <= 0
              ? `No released, unplanned quantity left for ${salesOrderId} — release more before planning another vehicle`
              : `Only ${remaining.toLocaleString()} released units of ${salesOrderId} remain unplanned`,
          );
        }

        const allocation: DispatchAllocation = {
          id: generateAllocationId(),
          salesOrderId,
          truckId,
          plannedQty: qty,
          dispatchedQty: 0,
          dispatchedPalletIds: [],
          dispatchLine,
          createdByUserId: operatorId,
          createdAt: new Date().toISOString(),
          status: 'Planned',
        };
        set((state) => ({
          dispatchAllocations: [...state.dispatchAllocations, allocation],
          trucks: state.trucks.map((t) => (t.id === truckId ? { ...t, salesOrderId } : t)),
        }));
        get().pushToast(
          `Planned ${qty.toLocaleString()} units of ${salesOrderId} onto ${truckId}`,
          'success',
        );
        return ok({ allocation });
      },

      requestDirectDispatchApproval: (salesOrderId, operatorId, source = 'Storage') => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot request a direct dispatch — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const remaining = so.qty - so.dispatchedQty;
        if (remaining <= 0) return err(`Sales order ${salesOrderId} is already fulfilled`);

        // The Storage bypass only makes sense when the bay is genuinely
        // short; the Production bypass is a broader exception (diverting
        // still-Loaded stock straight off the line) with no bay-stock check.
        let shortfall = remaining;
        if (source === 'Storage') {
          const available = get().availableOnBay(so.sku);
          shortfall = remaining - available;
          if (shortfall <= 0) return err('Bay already holds enough stock — no direct dispatch needed');
        }

        // Auto-approve and execute immediately (no manager approval needed)
        const approval: DirectDispatchApproval = {
          id: generateApprovalId(),
          salesOrderId,
          shortfallQty: shortfall,
          requestedByUserId: operatorId,
          requestedAt: new Date().toISOString(),
          status: 'Approved',
          approvedByUserId: operatorId,
          approvedAt: new Date().toISOString(),
          source,
        };
        set((state) => ({ directDispatchApprovals: [...state.directDispatchApprovals, approval] }));
        get().enqueueSapSync(
          'DirectDispatchApproved',
          `Direct dispatch from ${source} requested for ${approval.salesOrderId} — ${approval.shortfallQty} units`,
        );

        if (source === 'Production') {
          get().pushToast(
            `Direct dispatch from Production approved for ${salesOrderId} — system will recommend dispatch for upcoming pallets until fulfilled`,
            'success',
          );
          return ok({ approval });
        }

        // For Storage source, the Loader assigns Storage Pickers directly
        // (assignStorageDirectDispatchTasks) — this just records the approval
        // for tracking/UI display, it does not create its own pick task.
        get().pushToast(
          `Direct dispatch from Storage approved for ${salesOrderId} — ${shortfall.toLocaleString()} units — assign Storage Pickers to pick it`,
          'success',
        );
        return ok({ approval });
      },

      approveDirectDispatchRequest: (approvalId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:directDispatch')) {
          return err(`${user.role} cannot approve a direct dispatch — requires Manager, HOD, or Director`);
        }
        const approval = state.directDispatchApprovals.find((a) => a.id === approvalId);
        if (!approval) return err(`Approval "${approvalId}" not found`);
        if (approval.status !== 'PendingApproval') return err(`Approval ${approvalId} is not pending`);

        set((state) => ({
          directDispatchApprovals: state.directDispatchApprovals.map((a) =>
            a.id === approvalId
              ? { ...a, status: 'Approved', approvedByUserId: operatorId, approvedAt: new Date().toISOString() }
              : a,
          ),
        }));
        get().enqueueSapSync(
          'DirectDispatchApproved',
          `Direct dispatch approved for ${approval.salesOrderId} — ${approval.shortfallQty} units`,
        );

        if (approval.source === 'Production') {
          get().pushToast(
            `Direct dispatch from Production approved for ${approval.salesOrderId} — a Picker can now divert a Loaded pallet straight to dispatch`,
            'success',
          );
          return ok({ task: null });
        }

        const topUpResult = get().requestTopUp(approval.salesOrderId);
        if (!topUpResult.ok) {
          get().pushToast(topUpResult.error, 'error');
          return err(topUpResult.error);
        }
        get().pushToast(
          `Direct dispatch approved — pick task ${topUpResult.data.task.id} created from Storage`,
          'success',
        );
        return ok({ task: topUpResult.data.task });
      },

      rejectDirectDispatchRequest: (approvalId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:directDispatch')) {
          return err(`${user.role} cannot reject a direct dispatch request — requires Manager, HOD, or Director`);
        }
        const approval = state.directDispatchApprovals.find((a) => a.id === approvalId);
        if (!approval) return err(`Approval "${approvalId}" not found`);
        if (approval.status !== 'PendingApproval') return err(`Approval ${approvalId} is not pending`);

        set((state) => ({
          directDispatchApprovals: state.directDispatchApprovals.map((a) =>
            a.id === approvalId
              ? { ...a, status: 'Rejected', approvedByUserId: operatorId, approvedAt: new Date().toISOString() }
              : a,
          ),
        }));
        get().pushToast(`Direct dispatch request ${approvalId} rejected`, 'error');
        return ok(undefined);
      },

      allocateVehicleToSalesOrder: ({ salesOrderId, plate, dispatchLine, operatorId: _operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot allocate a vehicle — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (so.assignedTruckId) {
          return err(`Sales order ${salesOrderId} already has a vehicle allocated`);
        }
        if (!plate.trim()) return err('Vehicle plate is required');
        if (!dispatchLine.trim()) return err('Dispatch line is required');

        const truck: Truck = {
          id: generateTruckId(),
          plate: plate.trim(),
          driverName: null,
          dispatchBarcode: null,
          status: 'Waiting',
          salesOrderId,
          dispatchLine,
        };
        set((state) => ({
          trucks: [...state.trucks, truck],
          salesOrders: state.salesOrders.map((s) =>
            s.id === salesOrderId ? { ...s, assignedTruckId: truck.id } : s,
          ),
        }));
        get().pushToast(`Vehicle ${truck.plate} allocated to ${dispatchLine} for ${salesOrderId}`, 'success');
        return ok({ truck });
      },

      registerVehicleForSalesOrder: ({ salesOrderId, plate, driverName, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot register a vehicle — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (so.assignedTruckId) {
          return err(`Sales order ${salesOrderId} already has a vehicle registered`);
        }
        if (!plate.trim()) return err('Vehicle registration is required');
        if (!driverName.trim()) return err('Driver name is required');

        const dispatchBarcode = generateVehicleBarcodeId();
        const truck: Truck = {
          id: generateTruckId(),
          plate: plate.trim(),
          driverName: driverName.trim(),
          dispatchBarcode,
          status: 'Waiting',
          salesOrderId,
          dispatchLine: DISPATCH_LINE,
        };
        set((state) => ({
          trucks: [...state.trucks, truck],
          salesOrders: state.salesOrders.map((s) =>
            s.id === salesOrderId ? { ...s, assignedTruckId: truck.id } : s,
          ),
        }));
        get().pushToast(`Vehicle ${truck.plate} registered for ${salesOrderId} — barcode ${dispatchBarcode} generated`, 'success');
        get().enqueueSapSync(
          'VehicleRegistered',
          `${truck.plate} (driver ${truck.driverName}) registered for ${salesOrderId} by ${operatorId}`,
        );
        return ok({ truck });
      },

      generateManifestForPickingComplete: ({ salesOrderId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot generate manifests — requires Loader`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (!so.assignedTruckId) {
          return err(`No vehicle registered yet for ${salesOrderId} — register the vehicle first`);
        }

        const truck = state.trucks.find((t) => t.id === so.assignedTruckId);
        if (!truck) return err(`Truck not found`);

        // Check if verification already exists
        const existing = state.dispatchVerifications.find((v) => v.salesOrderId === salesOrderId);
        if (existing) {
          return ok({ verification: existing });
        }

        // Find pallets that are either staged for dispatch, on bay, or in direct dispatch
        const readyPallets = state.pallets.filter((p) => {
          const load = state.loads.find((l) => l.palletId === p.id);
          if (!load || load.sku !== so.sku) return false;

          // Include staged pallets for this truck
          if (p.status === 'StagedForDispatch' && p.location.type === 'DispatchLine') {
            return (p.location as any).truckId === so.assignedTruckId;
          }

          // Include on-bay pallets that haven't been assigned to another truck yet
          if (p.status === 'OnBay') return true;

          // Direct dispatch pallets (bypassing bay staging) only count as ready
          // once the picker has confirmed physical arrival at the loading bay
          if (p.status === 'InTransitToTruck') return !!p.directDispatchArrivedAt;

          return false;
        });

        if (readyPallets.length === 0) {
          return err(`No goods available for ${salesOrderId} — check if products are in bay or being picked`);
        }

        // Only include up to released quantity
        let remainingQty = so.releasedQty;
        const selectedPallets = [];
        for (const p of readyPallets) {
          if (remainingQty <= 0) break;
          const load = state.loads.find((l) => l.palletId === p.id);
          if (load) {
            selectedPallets.push(p);
            remainingQty -= load.quantity;
          }
        }

        const palletIds = selectedPallets.map((p) => p.id);

        // Only count actually staged (picked) quantity, not all selected pallets
        const stagedPallets = selectedPallets.filter((p) => p.status === 'StagedForDispatch');
        const pickedQty = stagedPallets.reduce((sum, p) => {
          const load = state.loads.find((l) => l.palletId === p.id);
          return sum + (load?.quantity ?? 0);
        }, 0);

        // Get pickers from pick tasks for this order
        const pickerUserIds = Array.from(
          new Set(
            state.pickTasks
              .filter((t) => t.salesOrderId === salesOrderId && t.assignedPickerId)
              .map((t) => t.assignedPickerId)
              .filter((id): id is string => !!id),
          ),
        );
        const allocation = state.dispatchAllocations.find(
          (a) => a.salesOrderId === salesOrderId && a.truckId === truck.id,
        );

        const now = new Date().toISOString();
        const verification: DispatchVerification = {
          id: generateVerificationId(),
          salesOrderId,
          truckId: truck.id,
          vehicleBarcode: truck.dispatchBarcode ?? '',
          dispatchLine: truck.dispatchLine,
          customer: so.customer,
          products: [
            { sku: so.sku, productName: so.productName, orderedQty: so.qty, releasedQty: so.releasedQty, pickedQty },
          ],
          palletIds,
          loaderUserId: allocation?.createdByUserId ?? null,
          pickerUserIds,
          stagedAt: now,
          stagedByUserId: operatorId,
          vehicleVerifiedAt: null,
          vehicleVerifiedByUserId: null,
          driverName: null,
          driverSignedAt: null,
          loaderSignedByUserId: null,
          loaderSignedAt: null,
          status: 'AwaitingVerification',
        };
        set((state) => ({
          dispatchVerifications: [...state.dispatchVerifications, verification],
          pallets: state.pallets.map((p) => {
            if (palletIds.includes(p.id) && p.status === 'InTransitToTruck') {
              return { ...p, status: 'StagedForDispatch', location: { type: 'DispatchLine', dispatchLine: truck.dispatchLine, truckId: so.assignedTruckId! } };
            }
            return p;
          }),
        }));
        get().pushToast(
          `Manifest generated for ${salesOrderId} — ${pickedQty.toLocaleString()} units ready to stage`,
          'success',
        );
        return ok({ verification });
      },

      // Picking-complete verification: the Picker scans LINE 001 once every
      // assigned pick task is Completed. The vehicle itself is checked only
      // for "has one been registered yet" here — the Loader verifies its
      // actual identity afterward via verifyDispatchVehicle. On success,
      // every ready pallet (OnBay from the normal path, or InTransitToTruck
      // from a Storage-shortfall/Production-bypass exception) is staged —
      // never emptied, never "in" the truck — and the handover printout is
      // generated.
      scanDispatchLine: (args) => {
        const { salesOrderId, dispatchLineCode } = args;
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        if (!so.assignedTruckId) {
          return err(`No vehicle registered yet for ${salesOrderId} — ask the Loader to register the collecting vehicle`);
        }
        const truck = state.trucks.find((t) => t.id === so.assignedTruckId);
        if (!truck) return err(`Truck "${so.assignedTruckId}" not found`);

        if (dispatchLineCode !== truck.dispatchLine) {
          return err(`Wrong dispatch line. Please proceed to ${truck.dispatchLine}.`);
        }

        const verification = state.dispatchVerifications.find((v) => v.salesOrderId === salesOrderId);
        if (!verification) {
          return err(`No goods have been staged yet for ${salesOrderId} — generate dispatch documents first`);
        }

        get().pushToast(`✓ Dispatch line verified. Ready to scan vehicle barcode.`, 'success');
        return ok({ verification });
      },

      // Loader-only: scans the vehicle's own barcode (generated at
      // registration) to verify it's actually the vehicle associated with
      // this sales order before anyone signs anything.
      verifyDispatchVehicle: ({ verificationId, vehicleBarcode, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'plan:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot verify a vehicle — requires Loader`);
        }
        const verification = state.dispatchVerifications.find((v) => v.id === verificationId);
        if (!verification) return err(`Dispatch verification "${verificationId}" not found`);
        if (verification.status !== 'AwaitingVerification') {
          return err(`Dispatch verification ${verificationId} is not awaiting vehicle verification`);
        }
        if (vehicleBarcode !== verification.vehicleBarcode) {
          const truck = state.trucks.find((t) => t.id === verification.truckId);
          return err(
            `Wrong vehicle. This sales order is not associated with that barcode — expected the vehicle for ${verification.salesOrderId}${truck ? ` (${truck.plate})` : ''}.`,
          );
        }

        const now = new Date().toISOString();
        const updated: DispatchVerification = {
          ...verification,
          vehicleVerifiedAt: now,
          vehicleVerifiedByUserId: operatorId,
          status: 'VehicleVerified',
        };
        set((state) => ({
          dispatchVerifications: state.dispatchVerifications.map((v) => (v.id === verificationId ? updated : v)),
        }));
        get().pushToast(`Vehicle verified for ${verification.salesOrderId}`, 'success');
        return ok({ verification: updated });
      },

      // Loader + Driver both confirm the goods staged at the dispatch line
      // match the printout — no separate Clerk step. Captured together in
      // one action since both confirmations happen at the same moment.
      signDispatchVerification: ({ verificationId, driverName, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'sign:dispatch')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot sign a dispatch verification — requires Loader`);
        }
        const verification = state.dispatchVerifications.find((v) => v.id === verificationId);
        if (!verification) return err(`Dispatch verification "${verificationId}" not found`);
        if (verification.status !== 'VehicleVerified') {
          return err(`Dispatch verification ${verificationId} must have its vehicle verified before signing`);
        }
        if (!driverName.trim()) return err('Driver name is required');

        const now = new Date().toISOString();
        const updated: DispatchVerification = {
          ...verification,
          driverName: driverName.trim(),
          driverSignedAt: now,
          loaderSignedByUserId: operatorId,
          loaderSignedAt: now,
          status: 'Verified',
        };
        set((state) => ({
          dispatchVerifications: state.dispatchVerifications.map((v) => (v.id === verificationId ? updated : v)),
        }));
        get().pushToast(`Dispatch verification ${verificationId} signed — handover complete`, 'success');
        get().enqueueSapSync(
          'DispatchVerified',
          `Handover complete — ${verification.salesOrderId}, truck ${verification.truckId}`,
        );
        return ok({ verification: updated });
      },

      placeHold: ({ targetType, targetId, reason, note, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:hold')) {
          return err(`${user.role} cannot place a hold — requires Manager, HOD, or Director`);
        }
        if (!note.trim()) {
          return err('Describe why this is being held before placing the hold');
        }
        if (targetType === 'Pallet') {
          const pallet = state.pallets.find((p) => p.id === targetId);
          if (!pallet) return err(`Pallet "${targetId}" not found`);
          if (pallet.holdId) return err(`Pallet ${targetId} already has an active hold`);
          if (!HOLDABLE_PALLET_STATUSES.includes(pallet.status)) {
            return err(
              `Pallet ${targetId} cannot be held (status: ${pallet.status}) — it must be an active pallet somewhere in the workflow (production, storage, bay, or dispatch)`,
            );
          }
        }

        const fullReason = `${reason} — ${note.trim()}`;
        const hold: HoldRecord = {
          id: generateHoldId(),
          targetType,
          targetId,
          reason: fullReason,
          placedByUserId: operatorId,
          placedByRole: user.role,
          placedAt: new Date().toISOString(),
          status: 'Active',
          releaseNote: null,
        };
        set((state) => ({
          holds: [...state.holds, hold],
          pallets:
            targetType === 'Pallet'
              ? state.pallets.map((p) => (p.id === targetId ? { ...p, holdId: hold.id } : p))
              : state.pallets,
        }));
        get().pushToast(`Hold ${hold.id} placed on ${targetId} — ${fullReason}`, 'error');
        get().enqueueSapSync('HoldPlaced', `Hold placed on ${targetId} — ${fullReason}`);
        return ok({ hold });
      },

      releaseHold: (holdId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:hold')) {
          return err(`${user.role} cannot release a hold — requires Manager, HOD, or Director`);
        }
        const hold = state.holds.find((h) => h.id === holdId);
        if (!hold) return err(`Hold "${holdId}" not found`);
        if (hold.status !== 'Active') return err(`Hold ${holdId} is not active (status: ${hold.status})`);

        set((state) => ({
          holds: state.holds.map((h) =>
            h.id === holdId ? { ...h, status: 'Released', releaseNote: `Released by ${operatorId}` } : h,
          ),
          pallets: state.pallets.map((p) => (p.id === hold.targetId ? { ...p, holdId: null } : p)),
        }));
        get().pushToast(`Hold ${holdId} released — ${hold.targetId} rejoins FIFO`, 'success');
        get().enqueueSapSync('HoldReleased', `Hold ${holdId} released on ${hold.targetId}`);
        return ok(undefined);
      },

      // Clerk-only: physical inventory verification surfaces a discrepancy,
      // which locks the pallet immediately (spec §21) — distinct from the
      // Director/Manager/HOD general hold path (spec §22), so it isn't gated
      // behind approver sign-off.
      reportDiscrepancy: ({ palletId, note, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'report:discrepancy')) {
          return err(`${user.role} cannot report a discrepancy — requires Clerk`);
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.holdId) return err(`Pallet ${palletId} already has an active hold`);
        if (!HOLDABLE_PALLET_STATUSES.includes(pallet.status)) {
          return err(
            `Pallet ${palletId} cannot be locked (status: ${pallet.status}) — it must be an active pallet somewhere in the workflow`,
          );
        }

        const hold: HoldRecord = {
          id: generateHoldId(),
          targetType: 'Pallet',
          targetId: palletId,
          reason: `Inventory discrepancy — ${note}`,
          placedByUserId: operatorId,
          placedByRole: user.role,
          placedAt: new Date().toISOString(),
          status: 'Active',
          releaseNote: null,
        };
        set((state) => ({
          holds: [...state.holds, hold],
          pallets: state.pallets.map((p) => (p.id === palletId ? { ...p, holdId: hold.id } : p)),
        }));
        get().pushToast(`Pallet ${palletId} locked — under investigation (${note})`, 'error');
        get().enqueueSapSync('DiscrepancyReported', `Discrepancy reported on ${palletId} — ${note}`);
        return ok({ hold });
      },

      flagHoldRequest: ({ palletId, reason, note, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'flag:hold')) {
          return err(`${user.role} cannot flag a product for hold — requires Clerk`);
        }
        if (!note || !note.trim()) {
          return err('Describe the issue before flagging — the approver needs to know why');
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.holdId) return err(`Pallet ${palletId} already has an active hold`);
        if (!HOLDABLE_PALLET_STATUSES.includes(pallet.status)) {
          return err(
            `Pallet ${palletId} cannot be held (status: ${pallet.status}) — it must be an active pallet somewhere in the workflow`,
          );
        }

        const hold: HoldRecord = {
          id: generateHoldId(),
          targetType: 'Pallet',
          targetId: palletId,
          reason: `${reason} — ${note.trim()}`,
          placedByUserId: operatorId,
          placedByRole: user.role,
          placedAt: new Date().toISOString(),
          status: 'PendingApproval',
          releaseNote: null,
        };
        set((state) => ({
          holds: [...state.holds, hold],
          pallets: state.pallets.map((p) => (p.id === palletId ? { ...p, holdId: hold.id } : p)),
        }));
        get().pushToast(`Pallet ${palletId} locked pending review — ${reason}`, 'error');
        get().enqueueSapSync('HoldFlagged', `Pallet ${palletId} flagged for hold — ${reason}`);
        return ok({ hold });
      },

      approveHoldRequest: (holdId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:hold')) {
          return err(`${user.role} cannot approve a hold — requires Manager, HOD, or Director`);
        }
        const hold = state.holds.find((h) => h.id === holdId);
        if (!hold) return err(`Hold "${holdId}" not found`);
        if (hold.status !== 'PendingApproval') return err(`Hold ${holdId} is not awaiting approval (status: ${hold.status})`);

        void operatorId;
        const updated: HoldRecord = { ...hold, status: 'Active' };
        set((state) => ({ holds: state.holds.map((h) => (h.id === holdId ? updated : h)) }));
        get().pushToast(`Hold ${holdId} approved by ${user.role} — ${hold.targetId} stays locked`, 'success');
        get().enqueueSapSync('HoldApproved', `Hold ${holdId} approved on ${hold.targetId}`);
        return ok({ hold: updated });
      },

      rejectHoldRequest: ({ holdId, note, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:hold')) {
          return err(`${user.role} cannot reject a hold — requires Manager, HOD, or Director`);
        }
        const hold = state.holds.find((h) => h.id === holdId);
        if (!hold) return err(`Hold "${holdId}" not found`);
        if (hold.status !== 'PendingApproval') return err(`Hold ${holdId} is not awaiting approval (status: ${hold.status})`);

        set((state) => ({
          holds: state.holds.map((h) =>
            h.id === holdId
              ? { ...h, status: 'Rejected', releaseNote: note ?? `Rejected by ${operatorId}` }
              : h,
          ),
          pallets: state.pallets.map((p) => (p.id === hold.targetId ? { ...p, holdId: null } : p)),
        }));
        get().pushToast(`Hold ${holdId} rejected — ${hold.targetId} rejoins normal flow`, 'info');
        get().enqueueSapSync('HoldRejected', `Hold ${holdId} rejected on ${hold.targetId}`);
        return ok(undefined);
      },

      sendToRecall: (holdId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:recall')) {
          return err(`${user.role} cannot send a pallet to recall — requires Manager, HOD, or Director`);
        }
        const hold = state.holds.find((h) => h.id === holdId);
        if (!hold) return err(`Hold "${holdId}" not found`);
        if (hold.status !== 'Active') return err(`Hold ${holdId} is not active (status: ${hold.status})`);
        if (hold.targetType !== 'Pallet') return err('Only pallet-level holds can be sent to recall');
        const pallet = state.pallets.find((p) => p.id === hold.targetId);
        if (!pallet) return err(`Pallet "${hold.targetId}" not found`);
        if (pallet.holdId !== hold.id) return err(`Pallet ${hold.targetId} does not match this hold`);
        const load = state.loads.find((l) => l.palletId === pallet.id);
        if (!load) return err('Load record not found for this pallet');

        // A held pallet can be anywhere in the workflow now — vacate whatever
        // slot it currently occupies (a Rack/BayRack slot, or nothing at all
        // if it was mid-line/in-transit/on a truck) before moving it to Recall.
        const location = pallet.location;
        const fromLabel =
          location.type === 'Rack'
            ? `Rack ${location.rackId}`
            : location.type === 'BayRack'
              ? `Bay ${location.bayRackId}`
              : location.type === 'Line'
                ? `Line ${location.lineId}`
                : location.type === 'Truck'
                  ? `Truck ${location.truckId}`
                  : location.type === 'DispatchLine'
                    ? `Dispatch Line (${location.truckId})`
                    : 'In transit';

        const recallCase: RecallCase = {
          id: generateRecallCaseId(),
          holdId,
          palletId: pallet.id,
          batchId: load.batchId,
          currentStage: 'Inspection',
          history: [],
          status: 'InProgress',
          destinationDecision: null,
          originalRackId: location.type === 'Rack' ? location.rackId : null,
        };

        set((state) => ({
          racks:
            location.type === 'Rack'
              ? state.racks.map((r) =>
                  r.id === location.rackId
                    ? { ...r, slots: r.slots.map((s) => (s.index === location.slotIndex ? { ...s, palletId: null } : s)) }
                    : r,
                )
              : state.racks,
          bayRacks:
            location.type === 'BayRack'
              ? state.bayRacks.map((b) =>
                  b.id === location.bayRackId
                    ? { ...b, slots: b.slots.map((s) => (s.index === location.slotIndex ? { ...s, palletId: null } : s)) }
                    : b,
                )
              : state.bayRacks,
          pallets: state.pallets.map((p) =>
            p.id === pallet.id
              ? { ...p, status: 'InRecall', location: { type: 'Recall' }, holdId: null }
              : p,
          ),
          holds: state.holds.map((h) => (h.id === holdId ? { ...h, status: 'SentToRecall' } : h)),
          recallCases: [...state.recallCases, recallCase],
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId: pallet.id,
              from: fromLabel,
              to: 'Recall Line 50',
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        get().pushToast(`Pallet ${pallet.id} sent to Recall Processing (Line 50)`, 'info');
        get().enqueueSapSync('SentToRecall', `Pallet ${pallet.id} sent to Line 50 recall processing`);
        return ok({ recallCase });
      },

      advanceRecallStage: ({ recallCaseId, notes, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'approve:recall')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot advance a recall case — requires Manager, HOD, or Director`);
        }
        const recallCase = state.recallCases.find((r) => r.id === recallCaseId);
        if (!recallCase) return err(`Recall case "${recallCaseId}" not found`);
        if (recallCase.status !== 'InProgress') return err('Recall case is not awaiting a stage advance');
        const currentIndex = RECALL_STAGE_ORDER.indexOf(recallCase.currentStage);
        const nextStage = RECALL_STAGE_ORDER[currentIndex + 1];
        const historyEntry = {
          stage: recallCase.currentStage,
          completedAt: new Date().toISOString(),
          byUserId: operatorId,
          notes,
        };

        // Past QA there's no next pipeline stage — hand off to Manager/HOD/
        // Director to decide where the pallet goes (see decideRecallDestination).
        const updated: RecallCase = nextStage
          ? { ...recallCase, currentStage: nextStage, history: [...recallCase.history, historyEntry] }
          : { ...recallCase, status: 'AwaitingDestinationDecision', history: [...recallCase.history, historyEntry] };

        set((state) => ({
          recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
        }));
        get().pushToast(
          nextStage
            ? `Recall ${recallCaseId} advanced to ${nextStage}`
            : `Recall ${recallCaseId} passed QA — awaiting Manager/HOD/Director to decide its destination`,
          'success',
        );
        return ok({ recallCase: updated });
      },

      decideRecallDestination: ({ recallCaseId, decision, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!can(user.role, 'approve:recall')) {
          return err(`${user.role} cannot decide a recall destination — requires Manager, HOD, or Director`);
        }
        const recallCase = state.recallCases.find((r) => r.id === recallCaseId);
        if (!recallCase) return err(`Recall case "${recallCaseId}" not found`);
        if (recallCase.status !== 'AwaitingDestinationDecision') {
          return err(`Recall case ${recallCaseId} is not awaiting a destination decision (status: ${recallCase.status})`);
        }

        let targetRackId: string | null = null;
        let targetLineId: string | null = null;
        let destinationLabel = 'Scrap';
        if (decision.type === 'Storage') {
          const rack = state.racks.find((r) => r.id === decision.rackId);
          if (!rack) return err(`Rack "${decision.rackId}" not found`);
          targetRackId = rack.id;
          destinationLabel = `Storage — ${rack.id}`;
        } else if (decision.type === 'ReworkLine') {
          // Rework always goes to the dedicated Exception Line — never a live
          // numbered production line, so recalled stock never mixes into a
          // batch currently running for a sales order.
          const line = state.lines.find((l) => l.id === EXCEPTION_LINE_ID);
          if (!line) return err('Exception Line not found');
          targetLineId = line.id;
          destinationLabel = `Rework on ${line.name}`;
        }

        const updated: RecallCase = {
          ...recallCase,
          status: 'AwaitingPickerAction',
          destinationDecision: {
            type: decision.type,
            targetRackId,
            targetLineId,
            decidedByUserId: operatorId,
            decidedByRole: user.role,
            decidedAt: new Date().toISOString(),
          },
        };
        set((state) => ({
          recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
        }));
        get().pushToast(
          `Recall ${recallCaseId} destination decided: ${destinationLabel} — awaiting a Picker to complete the move`,
          'info',
        );
        get().enqueueSapSync('RecallDestinationDecided', `Recall ${recallCaseId} destination decided: ${destinationLabel}`);
        return ok({ recallCase: updated });
      },

      executeRecallDestination: ({ recallCaseId, scannedId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot complete a recall move — requires Picker`);
        }
        const recallCase = state.recallCases.find((r) => r.id === recallCaseId);
        if (!recallCase) return err(`Recall case "${recallCaseId}" not found`);
        const decision = recallCase.destinationDecision;
        if (recallCase.status !== 'AwaitingPickerAction' || !decision) {
          return err(`Recall case ${recallCaseId} has no pending picker action`);
        }
        const now = new Date().toISOString();

        if (decision.type === 'Storage') {
          if (scannedId !== decision.targetRackId) {
            return err(
              `Scan rejected — Manager/HOD/Director decided this pallet returns to rack ${decision.targetRackId}, not ${scannedId}`,
            );
          }
          const rack = state.racks.find((r) => r.id === scannedId);
          if (!rack) return err(`Rack "${scannedId}" not found`);
          const slot = rack.slots.find((s) => s.palletId === null);
          if (!slot) return err(`Rack ${scannedId} has no free slot`);

          const updated: RecallCase = { ...recallCase, status: 'Completed' };
          set((state) => ({
            racks: state.racks.map((r) =>
              r.id === scannedId
                ? { ...r, slots: r.slots.map((s) => (s.index === slot.index ? { ...s, palletId: recallCase.palletId } : s)) }
                : r,
            ),
            pallets: state.pallets.map((p) =>
              p.id === recallCase.palletId
                ? { ...p, status: 'Racked', location: { type: 'Rack', rackId: scannedId, slotIndex: slot.index } }
                : p,
            ),
            // Recalled stock rejoins FIFO at the back of the queue — the
            // original batch is what triggered the hold, so it shouldn't jump
            // ahead of untouched stock just because it was produced earlier.
            loads: state.loads.map((l) => (l.palletId === recallCase.palletId ? { ...l, producedAt: now } : l)),
            recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
            holds: state.holds.map((h) => (h.id === recallCase.holdId ? { ...h, status: 'Released' as const } : h)),
            movements: [
              ...state.movements,
              { id: generateMovementId(), palletId: recallCase.palletId, from: 'Recall Line 50', to: `Rack ${scannedId}`, timestamp: now, operatorId },
            ],
          }));
          get().pushToast(`Pallet ${recallCase.palletId} returned to storage at ${scannedId} — rejoins FIFO`, 'success');
          get().enqueueSapSync('ReturnedFromRecall', `Pallet ${recallCase.palletId} returned to storage at ${scannedId}`);
          return ok({ recallCase: updated });
        }

        if (decision.type === 'ReworkLine') {
          if (scannedId !== decision.targetLineId) {
            return err(
              `Scan rejected — Manager/HOD/Director decided this pallet reworks on ${decision.targetLineId}, not ${scannedId}`,
            );
          }
          const line = state.lines.find((l) => l.id === scannedId);
          if (!line) return err(`Line "${scannedId}" not found`);

          const updated: RecallCase = { ...recallCase, status: 'Completed' };
          set((state) => ({
            pallets: state.pallets.map((p) =>
              p.id === recallCase.palletId
                ? { ...p, status: 'Loaded', location: { type: 'Line', lineId: scannedId } }
                : p,
            ),
            recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
            holds: state.holds.map((h) => (h.id === recallCase.holdId ? { ...h, status: 'Released' as const } : h)),
            movements: [
              ...state.movements,
              { id: generateMovementId(), palletId: recallCase.palletId, from: 'Recall Line 50', to: `${line.name} (rework)`, timestamp: now, operatorId },
            ],
          }));
          get().pushToast(`Pallet ${recallCase.palletId} handed back to ${line.name} for rework`, 'success');
          get().enqueueSapSync('ReturnedFromRecall', `Pallet ${recallCase.palletId} sent to ${line.name} for rework`);
          return ok({ recallCase: updated });
        }

        // Scrap — the picker scans the pallet itself to confirm disposal.
        if (scannedId !== recallCase.palletId) {
          return err(`Scan rejected — scan the pallet itself (${recallCase.palletId}) to confirm disposal`);
        }
        const updated: RecallCase = { ...recallCase, status: 'Completed' };
        set((state) => ({
          pallets: state.pallets.map((p) =>
            p.id === recallCase.palletId ? { ...p, status: 'Scrapped', location: { type: 'Scrapped' } } : p,
          ),
          loads: state.loads.map((l) =>
            l.palletId === recallCase.palletId ? { ...l, status: 'Disposed' as const } : l,
          ),
          recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
          holds: state.holds.map((h) => (h.id === recallCase.holdId ? { ...h, status: 'Released' as const } : h)),
          movements: [
            ...state.movements,
            { id: generateMovementId(), palletId: recallCase.palletId, from: 'Recall Line 50', to: 'Scrapped', timestamp: now, operatorId },
          ],
        }));
        get().pushToast(`Pallet ${recallCase.palletId} confirmed scrapped`, 'error');
        get().enqueueSapSync('RecallScrapped', `Pallet ${recallCase.palletId} scrapped after recall`);
        return ok({ recallCase: updated });
      },

      logCustomerReturn: ({ sku, productName, qty, department, remark, photoDataUrl, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'report:return')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot log a return — requires Customer Return Clerk`);
        }
        if (!sku) return err('Select a product');
        if (qty <= 0) return err('Quantity must be greater than zero');
        if (!department) return err('Select the department responsible for this product');
        if (!remark.trim()) return err('A remark describing the return is required');

        const customerReturn: CustomerReturn = {
          id: generateReturnId(),
          sku,
          productName,
          qty,
          department,
          remark: remark.trim(),
          photoDataUrl,
          reportedByUserId: operatorId,
          reportedAt: new Date().toISOString(),
          status: 'Logged',
          decision: null,
          approvedByUserId: null,
          approvedAt: null,
          actionedByUserId: null,
          actionedAt: null,
        };
        set((state) => ({ customerReturns: [...state.customerReturns, customerReturn] }));
        get().pushToast(`Logged return of ${qty} × ${productName}`, 'success');
        return ok({ customerReturn });
      },

      reviewAndDecideReturn: ({ returnId, decision, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'decide:return')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot review returns — requires QA`);
        }
        const customerReturn = state.customerReturns.find((r) => r.id === returnId);
        if (!customerReturn) return err(`Return "${returnId}" not found`);
        if (customerReturn.status !== 'Logged' && customerReturn.status !== 'InReturnZone') {
          return err(`Return ${returnId} has already been reviewed`);
        }

        const updated: CustomerReturn = {
          ...customerReturn,
          status: 'Approved',
          decision,
          approvedByUserId: operatorId,
          approvedAt: new Date().toISOString(),
        };
        set((state) => ({
          customerReturns: state.customerReturns.map((r) => (r.id === returnId ? updated : r)),
        }));
        get().pushToast(`Return approved — decision: ${decision}`, 'success');
        return ok({ customerReturn: updated });
      },

      actionReturnDecision: ({ returnId, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot action returns — requires Picker/Warehouse staff`);
        }
        const customerReturn = state.customerReturns.find((r) => r.id === returnId);
        if (!customerReturn) return err(`Return "${returnId}" not found`);
        if (customerReturn.status !== 'Approved') {
          return err(`Return ${returnId} must be approved before actioning`);
        }
        if (!customerReturn.decision) return err(`No decision made for return ${returnId}`);

        const updated: CustomerReturn = {
          ...customerReturn,
          status: 'Actioned',
          actionedByUserId: operatorId,
          actionedAt: new Date().toISOString(),
        };
        set((state) => ({
          customerReturns: state.customerReturns.map((r) => (r.id === returnId ? updated : r)),
        }));
        const action = customerReturn.decision === 'Scrap' ? 'discarded' : customerReturn.decision === 'Restock' ? 'restocked' : 'prepared for replacement';
        get().pushToast(`Return actioned — ${action}`, 'success');
        return ok({ customerReturn: updated });
      },

      resetDemo: () => {
        set({ currentUser: null, toasts: [], ...seedState() });
      },
    }),
    {
      name: 'kapaoil-warehouse-demo-v3',
      partialize: (state) => {
        const { toasts: _toasts, sapSyncing: _sapSyncing, ...rest } = state;
        return rest;
      },
    },
  ),
);

// "If SAP is unavailable, transactions are queued and retried every 5 seconds
// until SAP acknowledges them" — this is what makes that behavior real
// instead of just narrated: every Failed task gets another attempt each tick.
setInterval(() => {
  const state = useWarehouseStore.getState();
  state.syncQueue.filter((t) => t.status === 'Failed').forEach((t) => state.attemptSyncTask(t.id));
}, 5000);
