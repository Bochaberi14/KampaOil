import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
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
  SalesOrder,
  SapSyncTask,
  Truck,
  User,
} from '../types/domain';
import {
  EXCEPTION_LINE_ID,
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
  generateVehicleLabelId,
} from '../engine/ids';
import { countFreeRackSlots, findRackHoldingPallet, selectFifoLoads } from '../engine/rules';
import { can } from '../rbac';

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
  bayRacks: Rack[];
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
  acceptPickTask: (pickTaskId: string, userId: string) => Result<{ task: PickTask }>;
  declinePickTask: (pickTaskId: string, userId: string) => Result;
  findPickItemByRack: (pickTaskId: string, rackId: string) => Result<{ palletId: string }>;
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
  // Prints the temporary dispatch barcode attached to a vehicle (spec §18) —
  // must happen before that truck can be scanned for dispatch.
  printVehicleLabel: (
    truckId: string,
    salesOrderId: string,
    operatorId: string,
  ) => Result<{ barcode: string }>;
  scanDispatch: (args: {
    salesOrderId: string;
    bayRackId: string;
    palletId: string;
    vehicleBarcode: string;
    operatorId: string;
  }) => Result<{ fulfilled: boolean; manifestId?: string }>;

  // Direct-dispatch shortfall exception — requires HOD/Manager/Director approval
  requestDirectDispatchApproval: (
    salesOrderId: string,
    operatorId: string,
  ) => Result<{ approval: DirectDispatchApproval }>;
  approveDirectDispatchRequest: (approvalId: string, operatorId: string) => Result<{ task: PickTask }>;
  rejectDirectDispatchRequest: (approvalId: string, operatorId: string) => Result;
  // Loads a pallet released straight to the dispatch area (bypassing the bay)
  scanDirectDispatch: (args: {
    salesOrderId: string;
    palletId: string;
    vehicleBarcode: string;
    operatorId: string;
  }) => Result<{ fulfilled: boolean; manifestId?: string }>;

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
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
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
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const pallet = state.pallets.find((p) => p.id === palletId);
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
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot request a pick — requires Picker`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);

        // Stock already pulled for this order — requested, in transit, or
        // sitting on the bay awaiting dispatch — on top of what's already
        // dispatched. Only the remainder is worth requesting, which is what
        // makes this callable again and again as more stock becomes
        // available, instead of only once per sales order.
        const committedQty = state.pickTasks
          .filter((t) => t.salesOrderId === salesOrderId && t.origin === 'Storage')
          .flatMap((t) => t.items)
          .reduce((sum, i) => {
            const load = state.loads.find((l) => l.palletId === i.palletId);
            return load && load.status === 'InStorage' ? sum + i.quantity : sum;
          }, 0);
        const remaining = so.qty - so.dispatchedQty - committedQty;
        if (remaining <= 0) {
          return err(
            committedQty > 0
              ? `Sales order ${salesOrderId} already has enough stock requested or on the bay — dispatch it before requesting more`
              : 'Sales order already fulfilled',
          );
        }

        const reserved = reservedPalletIds(state.pickTasks);
        const rackedPalletIds = new Set(
          state.pallets
            .filter((p) => p.status === 'Racked' && !p.holdId && !reserved.has(p.id))
            .map((p) => p.id),
        );
        const candidates = state.loads.filter((l) => rackedPalletIds.has(l.palletId));
        const picked = selectFifoLoads(candidates, so.sku, remaining);
        if (picked.length === 0) {
          return err(`No stock available in storage for SKU ${so.sku}`);
        }

        // The bay only has so many slots — pallets already requested but not
        // yet arrived (still in Storage or in transit) are each already
        // headed for one, so a new request can't promise more than what's
        // actually left.
        const pendingBayArrivals = state.pickTasks
          .filter((t) => t.origin === 'Storage')
          .flatMap((t) => t.items)
          .filter((i) => !i.picked).length;
        const freeBaySlots = countFreeRackSlots(state.bayRacks);
        if (freeBaySlots - pendingBayArrivals <= 0) {
          return err(
            'Loading bay is full — no free slot available. Dispatch pallets from the bay before requesting more stock.',
          );
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
          status: 'PendingAcceptance',
          assignedPickerId: null,
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

      acceptPickTask: (pickTaskId, userId) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot accept pick tasks — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        if (task.status !== 'PendingAcceptance') {
          return err(`Pick task ${pickTaskId} is not awaiting acceptance (status: ${task.status})`);
        }
        const updated: PickTask = { ...task, status: 'Accepted', assignedPickerId: userId };
        set((state) => ({
          pickTasks: state.pickTasks.map((t) => (t.id === pickTaskId ? updated : t)),
        }));
        get().pushToast(`Pick task ${pickTaskId} accepted — release pallets from storage`, 'success');
        return ok({ task: updated });
      },

      declinePickTask: (pickTaskId, userId) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:pickTask')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot decline pick tasks — requires Picker`);
        }
        const task = state.pickTasks.find((t) => t.id === pickTaskId);
        if (!task) return err(`Pick task "${pickTaskId}" not found`);
        if (task.assignedPickerId !== userId) {
          return err(`Pick task ${pickTaskId} is not assigned to you`);
        }
        set((state) => ({
          pickTasks: state.pickTasks.map((t) =>
            t.id === pickTaskId ? { ...t, status: 'PendingAcceptance', assignedPickerId: null } : t,
          ),
        }));
        get().pushToast(`Pick task ${pickTaskId} declined — reassigned to the pending pool`, 'info');
        return ok(undefined);
      },

      // Storage-side "step 1" scan (spec §13) — scan the rack first, before the
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

        // Direct-dispatch (approved shortfall) top-ups bypass the Loading Bay
        // entirely (spec §17) — Storage releases straight to the dispatch
        // area, so the item is done the moment it leaves the rack.
        const isDirectDispatch = task.origin === 'Bay-Topup';
        const updatedItems = isDirectDispatch
          ? task.items.map((i) => (i.palletId === palletId ? { ...i, picked: true } : i))
          : task.items;
        const taskCompleted = isDirectDispatch && updatedItems.every((i) => i.picked);

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
          pickTasks: isDirectDispatch
            ? state.pickTasks.map((t) =>
                t.id === pickTaskId
                  ? { ...t, items: updatedItems, status: taskCompleted ? 'Completed' : t.status }
                  : t,
              )
            : state.pickTasks,
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

      requestTopUp: (salesOrderId) => {
        const state = get();
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const remaining = so.qty - so.dispatchedQty;
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
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ pickTasks: [...state.pickTasks, task] }));
        get().pushToast(
          `Bay short by ${shortfall} units for ${so.sku} — top-up pick task created from Storage (FIFO)`,
          'info',
        );
        return ok({ task });
      },

      printVehicleLabel: (truckId, salesOrderId, operatorId) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot print a vehicle label — requires Picker`);
        }
        const truck = state.trucks.find((t) => t.id === truckId);
        if (!truck) return err(`Truck "${truckId}" not found`);
        if (truck.salesOrderId && truck.salesOrderId !== salesOrderId) {
          return err(`Truck ${truckId} is already assigned to a different sales order`);
        }
        if (truck.tempDispatchBarcode) {
          // Already printed for this same sales order — reuse it rather than
          // issuing a second label for the same load.
          return ok({ barcode: truck.tempDispatchBarcode });
        }
        const barcode = generateVehicleLabelId();
        set((state) => ({
          trucks: state.trucks.map((t) =>
            t.id === truckId ? { ...t, tempDispatchBarcode: barcode, salesOrderId } : t,
          ),
        }));
        get().pushToast(`Temporary dispatch barcode ${barcode} printed — attach it to ${truckId}`, 'info');
        get().enqueueSapSync('VehicleLabelPrinted', `Barcode ${barcode} printed for ${truckId} — ${salesOrderId}`);
        void operatorId;
        return ok({ barcode });
      },

      scanDispatch: ({ salesOrderId, bayRackId, palletId, vehicleBarcode, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const bayRack = state.bayRacks.find((b) => b.id === bayRackId);
        if (!bayRack) return err(`Bay rack "${bayRackId}" not found`);
        const occupiedSlot = bayRack.slots.find((s) => s.palletId === palletId);
        if (!occupiedSlot) {
          return err(`Pallet ${palletId} is not on bay rack ${bayRackId}. Scan rejected.`);
        }
        const dispatchPallet = state.pallets.find((p) => p.id === palletId);
        if (dispatchPallet?.holdId) {
          return err(`Pallet ${palletId} is on hold — cannot dispatch until the hold is released`);
        }
        const truckId = state.trucks.find((t) => t.tempDispatchBarcode === vehicleBarcode)?.id;
        if (!truckId) {
          return err(`Vehicle barcode "${vehicleBarcode}" not recognized — print a label for a truck first.`);
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
          bayRacks: state.bayRacks.map((b) =>
            b.id === bayRackId
              ? { ...b, slots: b.slots.map((s) => (s.index === occupiedSlot.index ? { ...s, palletId: null } : s)) }
              : b,
          ),
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

      // Approved direct-dispatch shortfall (spec §17) — the pallet was
      // released straight to the dispatch area (see scanRackForPick above),
      // so this loads it onto a truck without ever touching a bay rack.
      scanDirectDispatch: ({ salesOrderId, palletId, vehicleBarcode, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot operate the scanner — requires Picker`);
        }
        const so = state.salesOrders.find((s) => s.id === salesOrderId);
        if (!so) return err(`Sales order "${salesOrderId}" not found`);
        const pallet = state.pallets.find((p) => p.id === palletId);
        if (!pallet || pallet.status !== 'InTransitToTruck') {
          return err(`Pallet ${palletId} is not ready for direct dispatch (status: ${pallet?.status ?? 'unknown'})`);
        }
        if (pallet.holdId) return err(`Pallet ${palletId} is on hold — cannot dispatch until the hold is released`);
        const load = state.loads.find((l) => l.palletId === palletId);
        if (!load) return err('Load record not found for this pallet');
        if (load.sku !== so.sku) {
          return err(
            `Product mismatch — pallet ${palletId} is ${load.productName}, sales order requires ${so.productName}. Scan rejected.`,
          );
        }
        const truckId = state.trucks.find((t) => t.tempDispatchBarcode === vehicleBarcode)?.id;
        if (!truckId) {
          return err(`Vehicle barcode "${vehicleBarcode}" not recognized — print a label for a truck first.`);
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
              from: 'Dispatch Area (Direct)',
              to: `Truck ${truckId}`,
              timestamp: new Date().toISOString(),
              operatorId,
            },
          ],
        }));
        get().pushToast(`Pallet ${palletId} dispatched directly from Storage to truck ${truckId} — bypassed the bay`, 'success');

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
        if (!can(state.currentUser?.role, 'execute:scan')) {
          return err(`${state.currentUser?.role ?? 'This role'} cannot request a direct dispatch — requires Picker`);
        }
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

      signDriverConfirmation: ({ manifestId, driverName, operatorId }) => {
        const state = get();
        if (!can(state.currentUser?.role, 'sign:supervisor')) {
          return err(
            `${state.currentUser?.role ?? 'This role'} cannot sign as loading supervisor — requires Manager, HOD, or Director`,
          );
        }
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

      resetDemo: () => {
        set({ currentUser: null, toasts: [], ...seedState() });
      },
    }),
    {
      name: 'kapaoil-warehouse-demo-v2',
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
