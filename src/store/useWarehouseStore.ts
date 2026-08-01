import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BayRack,
  Batch,
  DirectDispatchApproval,
  DriverConfirmation,
  HoldRecord,
  Line,
  Load,
  Manifest,
  Movement,
  Pallet,
  PickTask,
  ProductionOrder,
  Rack,
  RecallCase,
  RecallStageName,
  Role,
  SalesOrder,
  SapSyncTask,
  Truck,
  User,
} from '../types/domain';
import {
  INITIAL_BATCHES,
  INITIAL_BAY_RACKS,
  INITIAL_HOLDS,
  INITIAL_LINES,
  INITIAL_LOADS,
  INITIAL_PALLETS,
  INITIAL_RACKS,
  INITIAL_RECALL_CASES,
  INITIAL_TRUCKS,
  PALLET_CAPACITY,
  USERS,
} from '../data/seed';
import {
  fetchProductionOrders,
  fetchSalesOrders,
  postDispatchConfirmation,
  postGenericTransaction,
} from '../mock-sap/sapClient';
import {
  generateApprovalId,
  generateBatchId,
  generateDriverConfirmationId,
  generateHoldId,
  generateLoadId,
  generateManifestId,
  generateMovementId,
  generatePickTaskId,
  generateRecallCaseId,
  generateSyncTaskId,
} from '../engine/ids';
import { findRackHoldingPallet, selectFifoLoads } from '../engine/rules';

// Hold placement, hold release, recall sign-off, and direct-dispatch approval
// all require one of these roles — the spec names HOD/Manager/Director as the
// people who can authorize these exception paths.
const APPROVER_ROLES: Role[] = ['Manager', 'HOD', 'Director'];

const RECALL_STAGE_ORDER: RecallStageName[] = [
  'Inspection',
  'Repacking',
  'Relabelling',
  'QA',
  'ReturnedToStorage',
];

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

  lines: Line[];
  racks: Rack[];
  bayRacks: BayRack[];
  trucks: Truck[];
  pallets: Pallet[];

  productionOrders: ProductionOrder[];
  salesOrders: SalesOrder[];
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
  driverConfirmations: DriverConfirmation[];

  syncQueue: SapSyncTask[];
  simulateSapOutage: boolean;
  setSimulateSapOutage: (value: boolean) => void;
  enqueueSapSync: (type: string, description: string) => void;
  attemptSyncTask: (taskId: string) => void;

  toasts: Toast[];
  pushToast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;

  // Stage 1 — Production
  scanLine: (lineId: string) => Result<{ line: Line; productionOrder: ProductionOrder }>;
  scanPalletForLoad: (palletId: string) => Result<{ pallet: Pallet }>;
  confirmLoad: (args: {
    lineId: string;
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
  requestPick: (salesOrderId: string) => Result<{ task: PickTask }>;
  scanRackForPick: (args: {
    pickTaskId: string;
    palletId: string;
    rackId: string;
    operatorId: string;
  }) => Result;
  scanBayRackForPick: (args: {
    pickTaskId: string;
    palletId: string;
    bayRackId: string;
    operatorId: string;
  }) => Result<{ completed: boolean }>;

  // Stage 4 — Dispatch
  availableOnBay: (sku: string) => number;
  requestTopUp: (salesOrderId: string) => Result<{ task: PickTask }>;
  scanDispatch: (args: {
    salesOrderId: string;
    bayRackId: string;
    palletId: string;
    truckId: string;
    operatorId: string;
  }) => Result<{ fulfilled: boolean; manifestId?: string }>;

  // Direct-dispatch shortfall exception — requires HOD/Manager/Director approval
  requestDirectDispatchApproval: (
    salesOrderId: string,
    operatorId: string,
  ) => Result<{ approval: DirectDispatchApproval }>;
  approveDirectDispatchRequest: (approvalId: string, operatorId: string) => Result<{ task: PickTask }>;
  rejectDirectDispatchRequest: (approvalId: string, operatorId: string) => Result;

  // Driver confirmation form
  signDriverConfirmation: (args: {
    manifestId: string;
    driverName: string;
    operatorId: string;
  }) => Result<{ confirmation: DriverConfirmation }>;

  // Stage 5 — Hold & Investigation
  placeHold: (args: {
    targetType: 'Pallet' | 'Batch';
    targetId: string;
    reason: string;
    operatorId: string;
  }) => Result<{ hold: HoldRecord }>;
  releaseHold: (holdId: string, operatorId: string) => Result;

  // Stage 6 — Recall Processing (Line 50)
  sendToRecall: (holdId: string, operatorId: string) => Result<{ recallCase: RecallCase }>;
  advanceRecallStage: (args: {
    recallCaseId: string;
    notes: string | null;
    operatorId: string;
  }) => Result<{ recallCase: RecallCase }>;
  returnRecallPalletToRack: (args: {
    recallCaseId: string;
    rackId: string;
    operatorId: string;
  }) => Result;

  resetDemo: () => void;
}

const seedState = () => ({
  lines: INITIAL_LINES,
  racks: INITIAL_RACKS,
  bayRacks: INITIAL_BAY_RACKS,
  trucks: INITIAL_TRUCKS,
  pallets: INITIAL_PALLETS,
  productionOrders: [] as ProductionOrder[],
  salesOrders: [] as SalesOrder[],
  sapSyncing: false,
  loads: INITIAL_LOADS,
  batches: INITIAL_BATCHES,
  movements: [] as Movement[],
  pickTasks: [] as PickTask[],
  manifests: [] as Manifest[],
  holds: INITIAL_HOLDS,
  recallCases: INITIAL_RECALL_CASES,
  directDispatchApprovals: [] as DirectDispatchApproval[],
  driverConfirmations: [] as DriverConfirmation[],
  syncQueue: [] as SapSyncTask[],
  simulateSapOutage: false,
});

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      login: (userId) => {
        const user = USERS.find((u) => u.id === userId);
        if (!user) return false;
        set({ currentUser: user });
        return true;
      },
      logout: () => set({ currentUser: null }),

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
        const line = state.lines.find((l) => l.id === lineId);
        if (!line) return err(`Line "${lineId}" not found`);

        let po: ProductionOrder | undefined;
        if (line.status === 'Running' && line.activeProductionOrderId) {
          po = state.productionOrders.find((p) => p.id === line.activeProductionOrderId);
        } else if (line.status === 'Free') {
          po = state.productionOrders.find(
            (p) => p.lineId === line.id && p.status === 'Open',
          );
        }
        if (!po) {
          return err(
            `Line ${lineId} has no product assigned — no open production order for this line`,
          );
        }
        return ok({ line, productionOrder: po });
      },

      scanPalletForLoad: (palletId) => {
        const pallet = get().pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'Empty') {
          return err(`Pallet ${palletId} is not empty (status: ${pallet.status})`);
        }
        return ok({ pallet });
      },

      confirmLoad: ({ lineId, palletId, quantity, operatorId }) => {
        const lineResult = get().scanLine(lineId);
        if (!lineResult.ok) return err(lineResult.error);
        const { line, productionOrder: po } = lineResult.data;

        const palletResult = get().scanPalletForLoad(palletId);
        if (!palletResult.ok) return err(palletResult.error);

        if (quantity !== PALLET_CAPACITY) {
          return err(
            `Quantity must equal a full pallet (${PALLET_CAPACITY} units) to confirm the load — got ${quantity}`,
          );
        }

        const now = new Date().toISOString();
        const batchId = generateBatchId(po.id);
        const existingBatch = get().batches.find((b) => b.id === batchId);
        const loadId = generateLoadId();
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
          lines: state.lines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  status: poComplete ? 'Free' : 'Running',
                  activeProductionOrderId: poComplete ? null : po.id,
                }
              : l,
          ),
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, status: 'Loaded', loadId } : p,
          ),
        }));

        get().pushToast(
          `Load confirmed on ${palletId} — Batch ${batch.id}${poComplete ? ' (production order complete)' : ''}`,
          'success',
        );
        return ok({ loadId, batchId: batch.id, poComplete });
      },

      scanPalletLeavingLine: (palletId, operatorId) => {
        const pallet = get().pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'Loaded') {
          return err(
            `Pallet ${palletId} is not a loaded pallet awaiting transit (status: ${pallet.status})`,
          );
        }
        set((state) => ({
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, status: 'InTransitToStorage', location: { type: 'InTransit' } } : p,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: 'Line',
              to: 'InTransit',
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        return ok(undefined);
      },

      scanPalletToRack: ({ palletId, rackId, operatorId }) => {
        const state = get();
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet) return err(`Pallet "${palletId}" not found`);
        if (pallet.status !== 'InTransitToStorage') {
          return err(`Pallet ${palletId} is not in transit to storage (status: ${pallet.status})`);
        }
        const rack = state.racks.find((r) => r.id === rackId);
        if (!rack) return err(`Rack "${rackId}" not found`);
        const slot = rack.slots.find((s) => s.palletId === null);
        if (!slot) return err(`Rack ${rackId} has no free slot`);

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
        get().pushToast(`Pallet ${palletId} racked at ${rackId} / slot ${slot.index + 1}`, 'success');
        get().enqueueSapSync('StorageMovement', `Pallet ${palletId} stored at ${rackId}/slot ${slot.index + 1}`);
        return ok(undefined);
      },

      requestPick: (salesOrderId) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const remaining = so.qty - so.dispatchedQty;
        if (remaining <= 0) return err('Sales order already fulfilled');

        const rackedPalletIds = new Set(
          state.pallets.filter((p) => p.status === 'Racked' && !p.holdId).map((p) => p.id),
        );
        const candidates = state.loads.filter((l) => rackedPalletIds.has(l.palletId));
        const picked = selectFifoLoads(candidates, so.sku, remaining);
        if (picked.length === 0) {
          return err(`No stock available in storage for SKU ${so.sku}`);
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
          origin: 'Storage',
          items,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          pickTasks: [...state.pickTasks, task],
          salesOrders: state.salesOrders.map((s) =>
            s.id === salesOrderId ? { ...s, status: 'Picking' } : s,
          ),
        }));
        return ok({ task });
      },

      scanRackForPick: ({ pickTaskId, palletId, rackId, operatorId }) => {
        const state = get();
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        const item = task.items.find((i) => i.palletId === palletId && !i.picked);
        if (!item) return err(`Pallet ${palletId} is not part of this pick task`);
        if (item.sourceRackId !== rackId) {
          return err(
            `Wrong rack — pallet ${palletId} is at ${item.sourceRackId}, not ${rackId}. Scan rejected.`,
          );
        }
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
            p.id === palletId ? { ...p, status: 'InTransitToBay', location: { type: 'InTransit' } } : p,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: `Rack ${rackId}`,
              to: 'InTransit',
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        return ok(undefined);
      },

      scanBayRackForPick: ({ pickTaskId, palletId, bayRackId, operatorId }) => {
        const state = get();
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        const item = task.items.find((i) => i.palletId === palletId);
        if (!item) return err(`Pallet ${palletId} is not part of this pick task`);
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet || pallet.status !== 'InTransitToBay') {
          return err(`Pallet ${palletId} is not currently in transit to the bay. Scan rejected.`);
        }
        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);
        if (bayRack.palletId) return err(`Bay rack ${bayRackId} is already occupied`);

        const updatedItems = task.items.map((i) =>
          i.palletId === palletId ? { ...i, picked: true } : i,
        );
        const completed = updatedItems.every((i) => i.picked);

        set((state) => ({
          bayRacks: state.bayRacks.map((b) => (b.id === bayRackId ? { ...b, palletId } : b)),
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, status: 'OnBay', location: { type: 'BayRack', bayRackId } } : p,
          ),
          pickTasks: state.pickTasks.map((t) =>
            t.id === pickTaskId
              ? { ...t, items: updatedItems, status: completed ? 'Completed' : 'InProgress' }
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

      availableOnBay: (sku) => {
        const state = get();
        return state.bayRacks.reduce((sum, b) => {
          if (!b.palletId) return sum;
          const load = state.loads.find((l) => l.palletId === b.palletId);
          return sum + (load && load.sku === sku ? load.quantity : 0);
        }, 0);
      },

      requestTopUp: (salesOrderId) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const remaining = so.qty - so.dispatchedQty;
        const available = get().availableOnBay(so.sku);
        const shortfall = remaining - available;
        if (shortfall <= 0) return err('Bay already holds enough stock — no top-up needed');

        const rackedPalletIds = new Set(
          state.pallets.filter((p) => p.status === 'Racked' && !p.holdId).map((p) => p.id),
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
          status: 'Pending',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ pickTasks: [...state.pickTasks, task] }));
        get().pushToast(
          `Bay short by ${shortfall} units for ${so.sku} — top-up pick task created from Storage (FIFO)`,
          'info',
        );
        return ok({ task });
      },

      scanDispatch: ({ salesOrderId, bayRackId, palletId, truckId, operatorId }) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);
        if (bayRack.palletId !== palletId) {
          return err(`Pallet ${palletId} is not on bay rack ${bayRackId}. Scan rejected.`);
        }
        const load = state.loads.find((l) => l.palletId === palletId);
        if (!load) return err('Load record not found for this pallet');
        if (load.sku !== so.sku) {
          return err(
            `Product mismatch — pallet ${palletId} is ${load.productName}, sales order requires ${so.productName}. Scan rejected.`,
          );
        }
        const truck = state.trucks.find((t) => t.id === truckId);
        if (!truck) return err(`Truck "${truckId}" not found`);
        if (truck.salesOrderId && truck.salesOrderId !== salesOrderId) {
          return err(`Truck ${truckId} is already assigned to a different sales order. Scan rejected.`);
        }
        if (so.assignedTruckId && so.assignedTruckId !== truckId) {
          return err(`This sales order is already being loaded onto truck ${so.assignedTruckId}`);
        }

        const newDispatchedQty = so.dispatchedQty + load.quantity;
        const fulfilled = newDispatchedQty >= so.qty;
        const newDispatchedPalletIds = [...so.dispatchedPalletIds, palletId];

        set((state) => ({
          bayRacks: state.bayRacks.map((b) => (b.id === bayRackId ? { ...b, palletId: null } : b)),
          pallets: state.pallets.map((p) =>
            p.id === palletId ? { ...p, status: 'Empty', loadId: null, location: { type: 'FreePool' } } : p,
          ),
          loads: state.loads.map((l) => (l.palletId === palletId ? { ...l, status: 'Dispatched' } : l)),
          trucks: state.trucks.map((t) =>
            t.id === truckId
              ? { ...t, status: fulfilled ? 'Dispatched' : 'Loading', salesOrderId }
              : t,
          ),
          salesOrders: state.salesOrders.map((s) =>
            s.id === salesOrderId
              ? {
                  ...s,
                  dispatchedQty: newDispatchedQty,
                  status: fulfilled ? 'Fulfilled' : 'Picking',
                  assignedTruckId: truckId,
                  dispatchedPalletIds: newDispatchedPalletIds,
                }
              : s,
          ),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId,
              from: `Bay ${bayRackId}`,
              to: `Truck ${truckId}`,
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        get().pushToast(`Pallet ${palletId} dispatched to truck ${truckId}`, 'success');

        if (fulfilled) {
          const manifestId = generateManifestId();
          const dispatchedAt = new Date().toISOString();
          const manifest: Manifest = {
            id: manifestId,
            salesOrderId,
            truckId,
            customer: so.customer,
            productName: so.productName,
            totalQty: newDispatchedQty,
            palletIds: newDispatchedPalletIds,
            dispatchedAt,
            sapStatus: 'Syncing',
            sapDocNumber: null,
          };
          set((state) => ({ manifests: [...state.manifests, manifest] }));
          postDispatchConfirmation({
            salesOrderId,
            truckId,
            palletIds: newDispatchedPalletIds,
            qty: newDispatchedQty,
            dispatchedAt,
          }).then((res) => {
            set((state) => ({
              manifests: state.manifests.map((m) =>
                m.id === manifestId ? { ...m, sapStatus: 'Synced', sapDocNumber: res.sapDocNumber } : m,
              ),
            }));
            get().pushToast(`Dispatch synced to SAP — ${res.sapDocNumber}`, 'success');
          });
          return ok({ fulfilled: true, manifestId });
        }
        return ok({ fulfilled: false });
      },

      requestDirectDispatchApproval: (salesOrderId, operatorId) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const remaining = so.qty - so.dispatchedQty;
        const available = get().availableOnBay(so.sku);
        const shortfall = remaining - available;
        if (shortfall <= 0) return err('Bay already holds enough stock — no direct dispatch needed');

        const existing = state.directDispatchApprovals.find(
          (a) => a.salesOrderId === salesOrderId && a.status === 'PendingApproval',
        );
        if (existing) return ok({ approval: existing });

        const approval: DirectDispatchApproval = {
          id: generateApprovalId(),
          salesOrderId,
          shortfallQty: shortfall,
          requestedByUserId: operatorId,
          requestedAt: new Date().toISOString(),
          status: 'PendingApproval',
          approvedByUserId: null,
          approvedAt: null,
        };
        set((state) => ({ directDispatchApprovals: [...state.directDispatchApprovals, approval] }));
        get().pushToast(
          `Direct dispatch requested for ${salesOrderId} (shortfall ${shortfall} units) — awaiting HOD/Manager/Director approval`,
          'info',
        );
        return ok({ approval });
      },

      approveDirectDispatchRequest: (approvalId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!APPROVER_ROLES.includes(user.role)) {
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
        if (!APPROVER_ROLES.includes(user.role)) {
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

      signDriverConfirmation: ({ manifestId, driverName, operatorId }) => {
        const state = get();
        const manifest = state.manifests.find((m) => m.id === manifestId);
        if (!manifest) return err(`Manifest "${manifestId}" not found`);
        if (state.driverConfirmations.some((c) => c.manifestId === manifestId)) {
          return err(`Manifest ${manifestId} already has a signed confirmation`);
        }
        if (!driverName.trim()) return err('Driver name is required');
        const truck = state.trucks.find((t) => t.id === manifest.truckId);
        if (!truck) return err(`Truck "${manifest.truckId}" not found`);

        const batchNumbers = Array.from(
          new Set(
            manifest.palletIds
              .map((palletId) => state.loads.find((l) => l.palletId === palletId)?.batchId)
              .filter((b): b is string => !!b),
          ),
        );

        const now = new Date().toISOString();
        const confirmation: DriverConfirmation = {
          id: generateDriverConfirmationId(),
          manifestId,
          salesOrderId: manifest.salesOrderId,
          truckId: manifest.truckId,
          dispatchLine: truck.dispatchLine,
          productName: manifest.productName,
          totalQty: manifest.totalQty,
          batchNumbers,
          palletIds: manifest.palletIds,
          driverName: driverName.trim(),
          driverSignedAt: now,
          supervisorUserId: operatorId,
          supervisorSignedAt: now,
          createdAt: now,
        };
        set((state) => ({ driverConfirmations: [...state.driverConfirmations, confirmation] }));
        get().pushToast(`Dispatch confirmation ${confirmation.id} signed for ${manifest.truckId}`, 'success');
        get().enqueueSapSync(
          'DriverConfirmationSigned',
          `Dispatch confirmation signed — truck ${manifest.truckId}, driver ${confirmation.driverName}`,
        );
        return ok({ confirmation });
      },

      placeHold: ({ targetType, targetId, reason, operatorId }) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!APPROVER_ROLES.includes(user.role)) {
          return err(`${user.role} cannot place a hold — requires Manager, HOD, or Director`);
        }
        if (targetType === 'Pallet') {
          const pallet = state.pallets.find((p) => p.id === targetId);
          if (!pallet) return err(`Pallet "${targetId}" not found`);
          if (pallet.holdId) return err(`Pallet ${targetId} already has an active hold`);
          if (pallet.status !== 'Racked') {
            return err(
              `Pallet ${targetId} must be in storage (Racked) to place a hold — current status: ${pallet.status}`,
            );
          }
        }

        const hold: HoldRecord = {
          id: generateHoldId(),
          targetType,
          targetId,
          reason,
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
        get().pushToast(`Hold ${hold.id} placed on ${targetId} — ${reason}`, 'error');
        get().enqueueSapSync('HoldPlaced', `Hold placed on ${targetId} — ${reason}`);
        return ok({ hold });
      },

      releaseHold: (holdId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!APPROVER_ROLES.includes(user.role)) {
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

      sendToRecall: (holdId, operatorId) => {
        const state = get();
        const user = state.currentUser;
        if (!user) return err('Not logged in');
        if (!APPROVER_ROLES.includes(user.role)) {
          return err(`${user.role} cannot send a pallet to recall — requires Manager, HOD, or Director`);
        }
        const hold = state.holds.find((h) => h.id === holdId);
        if (!hold) return err(`Hold "${holdId}" not found`);
        if (hold.status !== 'Active') return err(`Hold ${holdId} is not active (status: ${hold.status})`);
        if (hold.targetType !== 'Pallet') return err('Only pallet-level holds can be sent to recall');
        const pallet = state.pallets.find((p) => p.id === hold.targetId);
        if (!pallet) return err(`Pallet "${hold.targetId}" not found`);
        if (pallet.status !== 'Racked' || pallet.location.type !== 'Rack') {
          return err(`Pallet ${hold.targetId} is not currently racked (status: ${pallet.status})`);
        }
        const load = state.loads.find((l) => l.palletId === pallet.id);
        if (!load) return err('Load record not found for this pallet');

        const { rackId, slotIndex } = pallet.location;
        const recallCase: RecallCase = {
          id: generateRecallCaseId(),
          holdId,
          palletId: pallet.id,
          batchId: load.batchId,
          currentStage: 'Inspection',
          history: [],
          status: 'InProgress',
        };

        set((state) => ({
          racks: state.racks.map((r) =>
            r.id === rackId
              ? { ...r, slots: r.slots.map((s) => (s.index === slotIndex ? { ...s, palletId: null } : s)) }
              : r,
          ),
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
              from: `Rack ${rackId}`,
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
        const recallCase = state.recallCases.find((r) => r.id === recallCaseId);
        if (!recallCase) return err(`Recall case "${recallCaseId}" not found`);
        if (recallCase.status !== 'InProgress') return err('Recall case is already completed');
        const currentIndex = RECALL_STAGE_ORDER.indexOf(recallCase.currentStage);
        const nextStage = RECALL_STAGE_ORDER[currentIndex + 1];
        if (!nextStage || nextStage === 'ReturnedToStorage') {
          return err('QA is the final processing stage — scan a rack to return this pallet to storage');
        }
        const updated: RecallCase = {
          ...recallCase,
          currentStage: nextStage,
          history: [
            ...recallCase.history,
            { stage: recallCase.currentStage, completedAt: new Date().toISOString(), byUserId: operatorId, notes },
          ],
        };
        set((state) => ({
          recallCases: state.recallCases.map((r) => (r.id === recallCaseId ? updated : r)),
        }));
        get().pushToast(`Recall ${recallCaseId} advanced to ${nextStage}`, 'success');
        return ok({ recallCase: updated });
      },

      returnRecallPalletToRack: ({ recallCaseId, rackId, operatorId }) => {
        const state = get();
        const recallCase = state.recallCases.find((r) => r.id === recallCaseId);
        if (!recallCase) return err(`Recall case "${recallCaseId}" not found`);
        if (recallCase.status !== 'InProgress') return err('Recall case is already completed');
        if (recallCase.currentStage !== 'QA') {
          return err(`Recall case must complete QA before returning to storage (currently ${recallCase.currentStage})`);
        }
        const rack = state.racks.find((r) => r.id === rackId);
        if (!rack) return err(`Rack "${rackId}" not found`);
        const slot = rack.slots.find((s) => s.palletId === null);
        if (!slot) return err(`Rack ${rackId} has no free slot`);

        const now = new Date().toISOString();
        set((state) => ({
          racks: state.racks.map((r) =>
            r.id === rackId
              ? { ...r, slots: r.slots.map((s) => (s.index === slot.index ? { ...s, palletId: recallCase.palletId } : s)) }
              : r,
          ),
          pallets: state.pallets.map((p) =>
            p.id === recallCase.palletId
              ? { ...p, status: 'Racked', location: { type: 'Rack', rackId, slotIndex: slot.index } }
              : p,
          ),
          // Recalled stock rejoins FIFO at the back of the queue — the
          // original batch is what triggered the hold, so it shouldn't jump
          // ahead of untouched stock just because it was produced earlier.
          loads: state.loads.map((l) => (l.palletId === recallCase.palletId ? { ...l, producedAt: now } : l)),
          recallCases: state.recallCases.map((r) =>
            r.id === recallCaseId
              ? {
                  ...r,
                  currentStage: 'ReturnedToStorage' as const,
                  status: 'Completed' as const,
                  history: [...r.history, { stage: 'QA' as const, completedAt: now, byUserId: operatorId, notes: null }],
                }
              : r,
          ),
          holds: state.holds.map((h) => (h.id === recallCase.holdId ? { ...h, status: 'Released' as const } : h)),
          movements: [
            ...state.movements,
            {
              id: generateMovementId(),
              palletId: recallCase.palletId,
              from: 'Recall Line 50',
              to: `Rack ${rackId}`,
              timestamp: now,
              operatorId,
            },
          ],
        }));
        get().pushToast(`Pallet ${recallCase.palletId} returned to storage at ${rackId} — rejoins FIFO`, 'success');
        get().enqueueSapSync('ReturnedFromRecall', `Pallet ${recallCase.palletId} returned to storage at ${rackId}`);
        return ok(undefined);
      },

      resetDemo: () => {
        set({ currentUser: null, toasts: [], ...seedState() });
      },
    }),
    {
      name: 'kampaoil-warehouse-demo',
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
