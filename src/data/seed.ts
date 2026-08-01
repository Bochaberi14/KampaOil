import type {
  BayRack,
  Batch,
  HoldRecord,
  Line,
  Load,
  Pallet,
  ProductionOrder,
  Rack,
  RecallCase,
  SalesOrder,
  Truck,
  User,
} from '../types/domain';

// Units per full pallet — drives the "load confirms only when pallet is full" rule
// and lets small demo quantities (100s) still produce multi-pallet batches.
export const PALLET_CAPACITY = 500;

export const USERS: User[] = [
  { id: 'op1', name: 'Alex Mwangi', role: 'Operator' },
  { id: 'pick1', name: 'Sam Otieno', role: 'Picker' },
  { id: 'mgr1', name: 'Jordan Wanjiru', role: 'Manager' },
  { id: 'hod1', name: 'Priya Kimani', role: 'HOD' },
  { id: 'dir1', name: 'Michael Ochieng', role: 'Director' },
];

export const INITIAL_LINES: Line[] = [
  {
    id: 'L001',
    name: 'Line 1',
    status: 'Free',
    assignedSku: 'SODA500',
    assignedProductName: 'Soda 500ml',
    activeProductionOrderId: null,
  },
  {
    id: 'L002',
    name: 'Line 2',
    status: 'Free',
    assignedSku: 'TONIC500',
    assignedProductName: 'Tonic 500ml',
    activeProductionOrderId: null,
  },
];

// Simulates production orders already pulled from SAP.
export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [
  {
    id: 'PO001',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    lineId: 'L001',
    targetQty: 10000,
    createdAt: '2026-07-20T08:00:00.000Z',
    fulfilledQty: 0,
    status: 'Open',
  },
  {
    id: 'PO002',
    sku: 'TONIC500',
    productName: 'Tonic 500ml',
    lineId: 'L002',
    targetQty: 5000,
    createdAt: '2026-07-20T08:00:00.000Z',
    fulfilledQty: 0,
    status: 'Open',
  },
];

// Simulates sales orders already pulled from SAP.
export const INITIAL_SALES_ORDERS: SalesOrder[] = [
  {
    id: 'SO001',
    customer: 'Customer ABC',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    qty: 1000,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:00:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
  {
    id: 'SO002',
    customer: 'Customer XYZ',
    sku: 'TONIC500',
    productName: 'Tonic 500ml',
    qty: 500,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:05:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
];

const RACK_IDS = ['R-A', 'R-B', 'R-C'];
const SLOTS_PER_RACK = 6;

// R-A slot 0 / slot 2 pre-hold PLT-001 / PLT-003 (see INITIAL_PALLETS above).
// R-A slot 1 is deliberately left free — PLT-002 vacated it when it was sent
// to the Line 50 recall pipeline.
const RACK_SEED_OCCUPANTS: Record<string, Record<number, string>> = {
  'R-A': { 0: 'PLT-001', 2: 'PLT-003' },
};

export const INITIAL_RACKS: Rack[] = RACK_IDS.map((id) => ({
  id,
  name: `Rack ${id.split('-')[1]}`,
  slots: Array.from({ length: SLOTS_PER_RACK }, (_, i) => ({
    index: i,
    palletId: RACK_SEED_OCCUPANTS[id]?.[i] ?? null,
  })),
}));

export const INITIAL_BAY_RACKS: BayRack[] = ['BAY-1', 'BAY-2', 'BAY-3', 'BAY-4'].map(
  (id) => ({ id, name: id, palletId: null }),
);

export const INITIAL_TRUCKS: Truck[] = [
  { id: 'TRK-100', plate: 'KDA 100X', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-001' },
  { id: 'TRK-101', plate: 'KDB 201Y', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-002' },
  { id: 'TRK-102', plate: 'KDC 302Z', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-003' },
];

const PALLET_COUNT = 24;

// Backdated history so Hold / Recall / Audit have something to show on first
// visit, without a long live setup: PLT-001 is already racked and on an active
// hold, PLT-002 is already mid-way through the Line 50 recall pipeline (its
// rack slot is freed, matching what sendToRecall would have done live), and
// PLT-003 is plain aged storage stock for FIFO-ageing/audit variety.
export const INITIAL_PALLETS: Pallet[] = Array.from(
  { length: PALLET_COUNT },
  (_, i) => {
    const id = `PLT-${String(i + 1).padStart(3, '0')}`;
    if (id === 'PLT-001') {
      return {
        id,
        status: 'Racked' as const,
        loadId: 'LOAD-H001',
        location: { type: 'Rack' as const, rackId: 'R-A', slotIndex: 0 },
        holdId: 'HOLD-001',
      };
    }
    if (id === 'PLT-002') {
      return {
        id,
        status: 'InRecall' as const,
        loadId: 'LOAD-H002',
        location: { type: 'Recall' as const },
        holdId: null,
      };
    }
    if (id === 'PLT-003') {
      return {
        id,
        status: 'Racked' as const,
        loadId: 'LOAD-H003',
        location: { type: 'Rack' as const, rackId: 'R-A', slotIndex: 2 },
        holdId: null,
      };
    }
    return { id, status: 'Empty' as const, loadId: null, location: { type: 'FreePool' as const }, holdId: null };
  },
);

export const INITIAL_BATCHES: Batch[] = [
  {
    id: 'BATCH-H001',
    productionOrderId: 'PO001',
    lineId: 'L001',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    date: '2026-07-29T09:00:00.000Z',
    loadIds: ['LOAD-H001'],
    totalQty: PALLET_CAPACITY,
  },
  {
    id: 'BATCH-H002',
    productionOrderId: 'PO001',
    lineId: 'L001',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    date: '2026-07-30T10:00:00.000Z',
    loadIds: ['LOAD-H002'],
    totalQty: PALLET_CAPACITY,
  },
  {
    id: 'BATCH-H003',
    productionOrderId: 'PO002',
    lineId: 'L002',
    sku: 'TONIC500',
    productName: 'Tonic 500ml',
    date: '2026-07-31T11:00:00.000Z',
    loadIds: ['LOAD-H003'],
    totalQty: PALLET_CAPACITY,
  },
];

export const INITIAL_LOADS: Load[] = [
  {
    id: 'LOAD-H001',
    palletId: 'PLT-001',
    batchId: 'BATCH-H001',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    quantity: PALLET_CAPACITY,
    lineId: 'L001',
    producedAt: '2026-07-29T09:00:00.000Z',
    operatorId: 'op1',
    status: 'InStorage',
  },
  {
    id: 'LOAD-H002',
    palletId: 'PLT-002',
    batchId: 'BATCH-H002',
    sku: 'SODA500',
    productName: 'Soda 500ml',
    quantity: PALLET_CAPACITY,
    lineId: 'L001',
    producedAt: '2026-07-30T10:00:00.000Z',
    operatorId: 'op1',
    status: 'InStorage',
  },
  {
    id: 'LOAD-H003',
    palletId: 'PLT-003',
    batchId: 'BATCH-H003',
    sku: 'TONIC500',
    productName: 'Tonic 500ml',
    quantity: PALLET_CAPACITY,
    lineId: 'L002',
    producedAt: '2026-07-31T11:00:00.000Z',
    operatorId: 'op1',
    status: 'InStorage',
  },
];

export const INITIAL_HOLDS: HoldRecord[] = [
  {
    id: 'HOLD-001',
    targetType: 'Pallet',
    targetId: 'PLT-001',
    reason: 'Packaging damage',
    placedByUserId: 'mgr1',
    placedByRole: 'Manager',
    placedAt: '2026-07-30T08:00:00.000Z',
    status: 'Active',
    releaseNote: null,
  },
  {
    id: 'HOLD-002',
    targetType: 'Pallet',
    targetId: 'PLT-002',
    reason: 'Quality defects',
    placedByUserId: 'hod1',
    placedByRole: 'HOD',
    placedAt: '2026-07-30T14:00:00.000Z',
    status: 'SentToRecall',
    releaseNote: null,
  },
];

export const INITIAL_RECALL_CASES: RecallCase[] = [
  {
    id: 'RECALL-001',
    holdId: 'HOLD-002',
    palletId: 'PLT-002',
    batchId: 'BATCH-H002',
    currentStage: 'Repacking',
    history: [
      {
        stage: 'Inspection',
        completedAt: '2026-07-31T09:00:00.000Z',
        byUserId: 'hod1',
        notes: 'Inspected — minor packaging tear confirmed, product intact',
      },
    ],
    status: 'InProgress',
  },
];
