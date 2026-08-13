import type {
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

// Units per full pallet — drives the "load confirms only when pallet is full" rule.
export const PALLET_CAPACITY = 100;

export const USERS: User[] = [
  { id: 'op1', name: 'Alex Mwangi', role: 'Picker' },
  { id: 'pick1', name: 'Sam Otieno', role: 'Picker' },
  { id: 'mgr1', name: 'Jordan Wanjiru', role: 'Manager' },
  { id: 'hod1', name: 'Priya Kimani', role: 'HOD' },
  { id: 'dir1', name: 'Michael Ochieng', role: 'Director' },
  { id: 'clerk1', name: 'Grace Achieng', role: 'Clerk' },
];

// The only valid "Rework" recall destination — a dedicated line for
// reprocessing recalled stock, kept separate from the numbered production
// lines so recalled pallets never mix into a live production run.
export const EXCEPTION_LINE_ID = 'L-EXC';

export const INITIAL_LINES: Line[] = [
  {
    id: 'L001',
    name: 'Line 1',
    status: 'Free',
    assignedSku: 'RINA1L',
    assignedProductName: 'Rina 1L',
    activeProductionOrderId: null,
  },
  {
    id: 'L002',
    name: 'Line 2',
    status: 'Free',
    assignedSku: 'KASUKU1KG',
    assignedProductName: 'Kasuku 1kg',
    activeProductionOrderId: null,
  },
  {
    id: 'L003',
    name: 'Line 3',
    status: 'Free',
    assignedSku: 'PRESTIGE500G',
    assignedProductName: 'Prestige 500g',
    activeProductionOrderId: null,
  },
  {
    id: EXCEPTION_LINE_ID,
    name: 'Exception Line',
    status: 'Free',
    assignedSku: null,
    assignedProductName: null,
    activeProductionOrderId: null,
  },
];

// Simulates production orders already pulled from SAP.
export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [
  {
    id: 'PO001',
    sku: 'RINA1L',
    productName: 'Rina 1L',
    lineId: 'L001',
    targetQty: 10000,
    createdAt: '2026-07-20T08:00:00.000Z',
    fulfilledQty: 0,
    status: 'Open',
  },
  {
    id: 'PO002',
    sku: 'KASUKU1KG',
    productName: 'Kasuku 1kg',
    lineId: 'L002',
    targetQty: 5000,
    createdAt: '2026-07-20T08:00:00.000Z',
    fulfilledQty: 0,
    status: 'Open',
  },
  {
    id: 'PO003',
    sku: 'PRESTIGE500G',
    productName: 'Prestige 500g',
    lineId: 'L003',
    targetQty: 6000,
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
    sku: 'RINA1L',
    productName: 'Rina 1L',
    qty: 2000,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:00:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
  {
    id: 'SO002',
    customer: 'Customer XYZ',
    sku: 'KASUKU1KG',
    productName: 'Kasuku 1kg',
    qty: 1500,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:05:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
  {
    id: 'SO003',
    customer: 'Customer QRS',
    sku: 'PRESTIGE500G',
    productName: 'Prestige 500g',
    qty: 1000,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:10:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
];

const RACK_IDS = ['R-A', 'R-B', 'R-C'];
const SLOTS_PER_RACK = 6;

export const INITIAL_RACKS: Rack[] = RACK_IDS.map((id) => ({
  id,
  name: `Rack ${id.split('-')[1]}`,
  slots: Array.from({ length: SLOTS_PER_RACK }, (_, i) => ({ index: i, palletId: null })),
}));

const BAY_RACK_IDS = ['BAY-A', 'BAY-B'];
const SLOTS_PER_BAY_RACK = 4;

export const INITIAL_BAY_RACKS: Rack[] = BAY_RACK_IDS.map((id) => ({
  id,
  name: `Bay Rack ${id.split('-')[1]}`,
  slots: Array.from({ length: SLOTS_PER_BAY_RACK }, (_, i) => ({ index: i, palletId: null })),
}));

export const INITIAL_TRUCKS: Truck[] = [
  { id: 'TRK-100', plate: 'KDA 100X', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-001', tempDispatchBarcode: null },
  { id: 'TRK-101', plate: 'KDB 201Y', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-002', tempDispatchBarcode: null },
  { id: 'TRK-102', plate: 'KDC 302Z', status: 'Waiting', salesOrderId: null, dispatchLine: 'LINE-003', tempDispatchBarcode: null },
];

const PALLET_COUNT = 24;

// Clean slate — every pallet starts Empty/FreePool and every rack starts
// empty, so Hold / Recall / Storage can be built live during a demo instead
// of already existing on first load.
export const INITIAL_PALLETS: Pallet[] = Array.from({ length: PALLET_COUNT }, (_, i) => ({
  id: `PLT-${String(i + 1).padStart(3, '0')}`,
  status: 'Empty' as const,
  loadId: null,
  location: { type: 'FreePool' as const },
  holdId: null,
}));

export const INITIAL_BATCHES: Batch[] = [];

export const INITIAL_LOADS: Load[] = [];

export const INITIAL_HOLDS: HoldRecord[] = [];

export const INITIAL_RECALL_CASES: RecallCase[] = [];
