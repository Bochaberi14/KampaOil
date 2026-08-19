import type {
  Batch,
  Department,
  HoldRecord,
  Line,
  Load,
  Pallet,
  ProductionOrder,
  Rack,
  RecallCase,
  SalesOrder,
  Scanner,
  Shelf,
  Truck,
  User,
  Zone,
  ZoneName,
} from '../types/domain';

export const DEPARTMENTS: Department[] = ['Oil & Refinery'];

// Units per full pallet — drives the "load confirms only when pallet is full" rule.
export const PALLET_CAPACITY = 100;

// WAREHOUSE ZONING FOR OIL & REFINERY DEPARTMENT
// BIN-{Letter}-{Product}-S-{Shelf#}-R-{Rack#}
// Storage: BIN-A (Kasuku), BIN-B (Rina), BIN-C (Prestige)
// Loading Bay: BIN-A, BIN-B, BIN-C (products) + BIN-D (returns)
// Each bin: 2 shelves, 3 racks per shelf

const createZone = (
  id: string,
  name: ZoneName,
  warehouseType: 'Storage' | 'LoadingBay',
  department: Department | 'Returns',
  requiresRefrigeration: boolean,
): Zone => ({
  id,
  name,
  warehouseType,
  department,
  requiresRefrigeration,
});

const createShelf = (id: string, zoneId: string, shelfNum: string, rackIds: string[]): Shelf => ({
  id,
  zoneId,
  index: parseInt(shelfNum),
  rackIds,
});

// STORAGE ZONES: BIN-A (Rina 1L), BIN-B (Kasuku 1kg), BIN-C (Prestige 500g), OVERFLOW
export const STORAGE_ZONES: Zone[] = [
  createZone('BIN-A', 'Oil & Refinery', 'Storage', 'Oil & Refinery', false),
  createZone('BIN-B', 'Oil & Refinery', 'Storage', 'Oil & Refinery', false),
  createZone('BIN-C', 'Oil & Refinery', 'Storage', 'Oil & Refinery', false),
  createZone('OVERFLOW', 'Oil & Refinery', 'Storage', 'Oil & Refinery', false),
];

// STORAGE SHELVES: Each zone has 2 shelves (S-01, S-02) with 3 racks each
// OVERFLOW has 3 shelves with 4 racks each for excess production
export const STORAGE_SHELVES: Shelf[] = [
  // BIN-A (Rina 1L) - 2 shelves
  createShelf('BIN-A-S-01', 'BIN-A', '01', ['BIN-A-S-01-R-01', 'BIN-A-S-01-R-02', 'BIN-A-S-01-R-03']),
  createShelf('BIN-A-S-02', 'BIN-A', '02', ['BIN-A-S-02-R-01', 'BIN-A-S-02-R-02', 'BIN-A-S-02-R-03']),
  // BIN-B (Kasuku 1kg) - 2 shelves
  createShelf('BIN-B-S-01', 'BIN-B', '01', ['BIN-B-S-01-R-01', 'BIN-B-S-01-R-02', 'BIN-B-S-01-R-03']),
  createShelf('BIN-B-S-02', 'BIN-B', '02', ['BIN-B-S-02-R-01', 'BIN-B-S-02-R-02', 'BIN-B-S-02-R-03']),
  // BIN-C (Prestige 500g) - 2 shelves
  createShelf('BIN-C-S-01', 'BIN-C', '01', ['BIN-C-S-01-R-01', 'BIN-C-S-01-R-02', 'BIN-C-S-01-R-03']),
  createShelf('BIN-C-S-02', 'BIN-C', '02', ['BIN-C-S-02-R-01', 'BIN-C-S-02-R-02', 'BIN-C-S-02-R-03']),
  // OVERFLOW - 3 shelves with 4 racks each
  createShelf('OVERFLOW-S-01', 'OVERFLOW', '01', ['OVERFLOW-S-01-R-01', 'OVERFLOW-S-01-R-02', 'OVERFLOW-S-01-R-03', 'OVERFLOW-S-01-R-04']),
  createShelf('OVERFLOW-S-02', 'OVERFLOW', '02', ['OVERFLOW-S-02-R-01', 'OVERFLOW-S-02-R-02', 'OVERFLOW-S-02-R-03', 'OVERFLOW-S-02-R-04']),
  createShelf('OVERFLOW-S-03', 'OVERFLOW', '03', ['OVERFLOW-S-03-R-01', 'OVERFLOW-S-03-R-02', 'OVERFLOW-S-03-R-03', 'OVERFLOW-S-03-R-04']),
];

// LOADING BAY ZONES: BIN-A, BIN-B, BIN-C (products) + BIN-D (returns)
export const LOADING_BAY_ZONES: Zone[] = [
  createZone('BIN-A-BAY', 'Oil & Refinery', 'LoadingBay', 'Oil & Refinery', false),
  createZone('BIN-B-BAY', 'Oil & Refinery', 'LoadingBay', 'Oil & Refinery', false),
  createZone('BIN-C-BAY', 'Oil & Refinery', 'LoadingBay', 'Oil & Refinery', false),
  createZone('BIN-D-BAY', 'Returns', 'LoadingBay', 'Returns', false),
];

// LOADING BAY SHELVES: Each zone has 2 shelves with 3 racks each
export const LOADING_BAY_SHELVES: Shelf[] = [
  // BIN-A-BAY - 2 shelves
  createShelf('BIN-A-BAY-S-01', 'BIN-A-BAY', '01', ['BIN-A-BAY-S-01-R-01', 'BIN-A-BAY-S-01-R-02', 'BIN-A-BAY-S-01-R-03']),
  createShelf('BIN-A-BAY-S-02', 'BIN-A-BAY', '02', ['BIN-A-BAY-S-02-R-01', 'BIN-A-BAY-S-02-R-02', 'BIN-A-BAY-S-02-R-03']),
  // BIN-B-BAY - 2 shelves
  createShelf('BIN-B-BAY-S-01', 'BIN-B-BAY', '01', ['BIN-B-BAY-S-01-R-01', 'BIN-B-BAY-S-01-R-02', 'BIN-B-BAY-S-01-R-03']),
  createShelf('BIN-B-BAY-S-02', 'BIN-B-BAY', '02', ['BIN-B-BAY-S-02-R-01', 'BIN-B-BAY-S-02-R-02', 'BIN-B-BAY-S-02-R-03']),
  // BIN-C-BAY - 2 shelves
  createShelf('BIN-C-BAY-S-01', 'BIN-C-BAY', '01', ['BIN-C-BAY-S-01-R-01', 'BIN-C-BAY-S-01-R-02', 'BIN-C-BAY-S-01-R-03']),
  createShelf('BIN-C-BAY-S-02', 'BIN-C-BAY', '02', ['BIN-C-BAY-S-02-R-01', 'BIN-C-BAY-S-02-R-02', 'BIN-C-BAY-S-02-R-03']),
  // BIN-D-BAY (Returns) - 2 shelves
  createShelf('BIN-D-BAY-S-01', 'BIN-D-BAY', '01', ['BIN-D-BAY-S-01-R-01', 'BIN-D-BAY-S-01-R-02']),
  createShelf('BIN-D-BAY-S-02', 'BIN-D-BAY', '02', ['BIN-D-BAY-S-02-R-01', 'BIN-D-BAY-S-02-R-02']),
];

export const USERS: User[] = [
  // Oil & Refinery Production Pickers (3)
  { id: 'pick-prod-1', name: 'Production Picker 1', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick-prod-2', name: 'Production Picker 2', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick-prod-3', name: 'Production Picker 3', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  // Oil & Refinery Storage Pickers (2)
  { id: 'pick-stor-1', name: 'Storage Picker 1', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick-stor-2', name: 'Storage Picker 2', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  // Oil & Refinery Loading Bay Pickers (2)
  { id: 'pick-bay-1', name: 'Loading Bay Picker 1', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick-bay-2', name: 'Loading Bay Picker 2', role: 'Picker', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  // Management
  { id: 'mgr1', name: 'Manager', role: 'Manager', mfaEnabled: true, loginAttempts: 0 },
  { id: 'hod1', name: 'HOD', role: 'HOD', department: 'Oil & Refinery', mfaEnabled: true, loginAttempts: 0 },
  { id: 'dir1', name: 'Director', role: 'Director', mfaEnabled: true, loginAttempts: 0 },
  { id: 'clerk1', name: 'Clerk', role: 'Clerk', mfaEnabled: true, loginAttempts: 0 },
  { id: 'load1', name: 'Loader', role: 'Loader', mfaEnabled: true, loginAttempts: 0 },
  { id: 'qa1', name: 'QA', role: 'QA', mfaEnabled: true, loginAttempts: 0 },
  { id: 'ret1', name: 'Returns Clerk', role: 'Customer Return Clerk', mfaEnabled: true, loginAttempts: 0 },
  { id: 'salesmgr1', name: 'Sales Manager', role: 'Sales Manager', mfaEnabled: true, loginAttempts: 0 },
];

// The only valid "Rework" recall destination — a dedicated line for
// reprocessing recalled stock, kept separate from the numbered production
// lines so recalled pallets never mix into a live production run.
export const EXCEPTION_LINE_ID = 'L-EXC';

export const INITIAL_LINES: Line[] = [
  { id: 'L001', name: 'Line 1', status: 'Running', activeProductionOrderId: 'PO001' },
  { id: 'L002', name: 'Line 2', status: 'Running', activeProductionOrderId: 'PO002' },
  { id: 'L003', name: 'Line 3', status: 'Running', activeProductionOrderId: 'PO003' },
  { id: EXCEPTION_LINE_ID, name: 'Exception Line', status: 'Free', activeProductionOrderId: null },
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

// Sales orders start unallocated — Loader allocates vehicles via Vehicle Allocation page
export const INITIAL_SALES_ORDERS: SalesOrder[] = [
  {
    id: 'SO001',
    customer: 'Joy',
    sku: 'RINA1L',
    productName: 'Rina 1L',
    qty: 2000,
    releasedQty: 0,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:00:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
  {
    id: 'SO002',
    customer: 'Laura',
    sku: 'KASUKU1KG',
    productName: 'Kasuku 1kg',
    qty: 1500,
    releasedQty: 0,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:05:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
  {
    id: 'SO003',
    customer: 'Tasha',
    sku: 'PRESTIGE500G',
    productName: 'Prestige 500g',
    qty: 1000,
    releasedQty: 0,
    dispatchedQty: 0,
    status: 'Pending',
    createdAt: '2026-07-27T08:10:00.000Z',
    assignedTruckId: null,
    dispatchedPalletIds: [],
  },
];

const SLOTS_PER_RACK = 6;
const SLOTS_PER_BAY_RACK = 6; // Changed from 4 to 6 for better utilization

// Create zone-aware storage racks with standard naming (3 racks per shelf, 2 shelves per bin for Oil & Refinery)
const createStorageRacks = (): Rack[] => {
  const rackMap: Record<string, { zoneId: string; shelfId: string }> = {
    // BIN-A (Kasuku) - Shelf 1
    'BIN-A-S-01-R-01': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-01' },
    'BIN-A-S-01-R-02': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-01' },
    'BIN-A-S-01-R-03': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-01' },
    // BIN-A (Kasuku) - Shelf 2
    'BIN-A-S-02-R-01': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-02' },
    'BIN-A-S-02-R-02': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-02' },
    'BIN-A-S-02-R-03': { zoneId: 'BIN-A', shelfId: 'BIN-A-S-02' },
    // BIN-B (Rina) - Shelf 1
    'BIN-B-S-01-R-01': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-01' },
    'BIN-B-S-01-R-02': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-01' },
    'BIN-B-S-01-R-03': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-01' },
    // BIN-B (Rina) - Shelf 2
    'BIN-B-S-02-R-01': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-02' },
    'BIN-B-S-02-R-02': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-02' },
    'BIN-B-S-02-R-03': { zoneId: 'BIN-B', shelfId: 'BIN-B-S-02' },
    // BIN-C (Prestige) - Shelf 1
    'BIN-C-S-01-R-01': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-01' },
    'BIN-C-S-01-R-02': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-01' },
    'BIN-C-S-01-R-03': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-01' },
    // BIN-C (Prestige) - Shelf 2
    'BIN-C-S-02-R-01': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-02' },
    'BIN-C-S-02-R-02': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-02' },
    'BIN-C-S-02-R-03': { zoneId: 'BIN-C', shelfId: 'BIN-C-S-02' },
    // OVERFLOW - Shelf 1 (4 racks)
    'OVERFLOW-S-01-R-01': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-01' },
    'OVERFLOW-S-01-R-02': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-01' },
    'OVERFLOW-S-01-R-03': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-01' },
    'OVERFLOW-S-01-R-04': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-01' },
    // OVERFLOW - Shelf 2 (4 racks)
    'OVERFLOW-S-02-R-01': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-02' },
    'OVERFLOW-S-02-R-02': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-02' },
    'OVERFLOW-S-02-R-03': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-02' },
    'OVERFLOW-S-02-R-04': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-02' },
    // OVERFLOW - Shelf 3 (4 racks)
    'OVERFLOW-S-03-R-01': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-03' },
    'OVERFLOW-S-03-R-02': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-03' },
    'OVERFLOW-S-03-R-03': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-03' },
    'OVERFLOW-S-03-R-04': { zoneId: 'OVERFLOW', shelfId: 'OVERFLOW-S-03' },
  };

  return Object.entries(rackMap).map(([id, { zoneId, shelfId }]) => ({
    id,
    name: id,
    zoneId,
    shelfId,
    slots: Array.from({ length: SLOTS_PER_RACK }, (_, i) => ({ index: i, palletId: null })),
  }));
};

export const INITIAL_RACKS: Rack[] = createStorageRacks();

// Create zone-aware loading bay racks with standard naming (3 racks per shelf, 2 shelves per bin for Oil & Refinery)
const createBayRacks = (): Rack[] => {
  const rackMap: Record<string, { zoneId: string; shelfId: string }> = {
    // BIN-A-BAY - Shelf 1
    'BIN-A-BAY-S-01-R-01': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-01' },
    'BIN-A-BAY-S-01-R-02': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-01' },
    'BIN-A-BAY-S-01-R-03': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-01' },
    // BIN-A-BAY - Shelf 2
    'BIN-A-BAY-S-02-R-01': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-02' },
    'BIN-A-BAY-S-02-R-02': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-02' },
    'BIN-A-BAY-S-02-R-03': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-S-02' },
    // BIN-B-BAY - Shelf 1
    'BIN-B-BAY-S-01-R-01': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-01' },
    'BIN-B-BAY-S-01-R-02': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-01' },
    'BIN-B-BAY-S-01-R-03': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-01' },
    // BIN-B-BAY - Shelf 2
    'BIN-B-BAY-S-02-R-01': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-02' },
    'BIN-B-BAY-S-02-R-02': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-02' },
    'BIN-B-BAY-S-02-R-03': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-S-02' },
    // BIN-C-BAY - Shelf 1
    'BIN-C-BAY-S-01-R-01': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-01' },
    'BIN-C-BAY-S-01-R-02': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-01' },
    'BIN-C-BAY-S-01-R-03': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-01' },
    // BIN-C-BAY - Shelf 2
    'BIN-C-BAY-S-02-R-01': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-02' },
    'BIN-C-BAY-S-02-R-02': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-02' },
    'BIN-C-BAY-S-02-R-03': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-S-02' },
    // BIN-D-BAY (Returns) - Shelf 1
    'BIN-D-BAY-S-01-R-01': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-S-01' },
    'BIN-D-BAY-S-01-R-02': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-S-01' },
    // BIN-D-BAY (Returns) - Shelf 2
    'BIN-D-BAY-S-02-R-01': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-S-02' },
    'BIN-D-BAY-S-02-R-02': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-S-02' },
  };

  return Object.entries(rackMap).map(([id, { zoneId, shelfId }]) => ({
    id,
    name: id,
    zoneId,
    shelfId,
    slots: Array.from({ length: SLOTS_PER_BAY_RACK }, (_, i) => ({ index: i, palletId: null })),
  }));
};

export const INITIAL_BAY_RACKS: Rack[] = createBayRacks();

// Single physical dispatch line for this demo — every vehicle stages at the
// same LINE 001.
export const DISPATCH_LINE = 'LINE 001';

// Not a fixed fleet — a Truck record is created ad hoc by the Loader when a
// collecting vehicle physically arrives (registerVehicleForSalesOrder), so
// there's nothing to seed here.
export const INITIAL_TRUCKS: Truck[] = [];

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

// Scanner seed data with Scanner ID and Work Location
export const INITIAL_SCANNERS: Scanner[] = [
  {
    id: 'SC001',
    scannerId: 'SC001',
    currentWorkLocation: 'Production',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SC002',
    scannerId: 'SC002',
    currentWorkLocation: 'Storage',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SC003',
    scannerId: 'SC003',
    currentWorkLocation: 'Loading Bay',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
