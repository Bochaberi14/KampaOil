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
  Shelf,
  Truck,
  User,
  Zone,
  ZoneName,
} from '../types/domain';

export const DEPARTMENTS: Department[] = ['Edible Oils', 'Margarine & Shortening', 'Detergents & Soaps', 'Specialty Products'];

// Units per full pallet — drives the "load confirms only when pallet is full" rule.
export const PALLET_CAPACITY = 100;

// WAREHOUSE ZONING WITH STANDARD NAMING CONVENTION
// BIN-{Letter}-{Zone Name}-S-{Shelf#}-R-{Rack#}
// Storage: BIN-A (Oils), BIN-B (Margarine), BIN-C (Soaps), BIN-D (Specialty)
// Loading Bay: BIN-A through BIN-D (product zones) + BIN-E (returns)
// Each zone: up to 3 shelves (S-01, S-02, S-03), each shelf: up to 3 racks

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

// STORAGE ZONES: BIN-A through BIN-D
export const STORAGE_ZONES: Zone[] = [
  createZone('BIN-A', 'Edible Oils', 'Storage', 'Edible Oils', false),
  createZone('BIN-B', 'Margarine & Shortening', 'Storage', 'Margarine & Shortening', true),
  createZone('BIN-C', 'Detergents & Soaps', 'Storage', 'Detergents & Soaps', false),
  createZone('BIN-D', 'Specialty Products', 'Storage', 'Specialty Products', false),
];

// STORAGE SHELVES: Each zone has 1 shelf (S-01) with 3 racks
export const STORAGE_SHELVES: Shelf[] = [
  createShelf('BIN-A-OILS-S-01', 'BIN-A', '01', ['BIN-A-OILS-S-01-R-01', 'BIN-A-OILS-S-01-R-02', 'BIN-A-OILS-S-01-R-03']),
  createShelf('BIN-B-MARG-S-01', 'BIN-B', '01', ['BIN-B-MARG-S-01-R-01', 'BIN-B-MARG-S-01-R-02', 'BIN-B-MARG-S-01-R-03']),
  createShelf('BIN-C-SOAP-S-01', 'BIN-C', '01', ['BIN-C-SOAP-S-01-R-01', 'BIN-C-SOAP-S-01-R-02', 'BIN-C-SOAP-S-01-R-03']),
  createShelf('BIN-D-SPEC-S-01', 'BIN-D', '01', ['BIN-D-SPEC-S-01-R-01', 'BIN-D-SPEC-S-01-R-02', 'BIN-D-SPEC-S-01-R-03']),
];

// LOADING BAY ZONES: BIN-A through BIN-E (includes Returns)
export const LOADING_BAY_ZONES: Zone[] = [
  createZone('BIN-A-BAY', 'Edible Oils', 'LoadingBay', 'Edible Oils', false),
  createZone('BIN-B-BAY', 'Margarine & Shortening', 'LoadingBay', 'Margarine & Shortening', true),
  createZone('BIN-C-BAY', 'Detergents & Soaps', 'LoadingBay', 'Detergents & Soaps', false),
  createZone('BIN-D-BAY', 'Specialty Products', 'LoadingBay', 'Specialty Products', false),
  createZone('BIN-E-BAY', 'Returns', 'LoadingBay', 'Returns', false),
];

// LOADING BAY SHELVES: Each zone has 1 shelf with 3 racks (6-pallet capacity each = 18 per zone)
export const LOADING_BAY_SHELVES: Shelf[] = [
  createShelf('BIN-A-BAY-OILS-S-01', 'BIN-A-BAY', '01', ['BIN-A-BAY-OILS-S-01-R-01', 'BIN-A-BAY-OILS-S-01-R-02', 'BIN-A-BAY-OILS-S-01-R-03']),
  createShelf('BIN-B-BAY-MARG-S-01', 'BIN-B-BAY', '01', ['BIN-B-BAY-MARG-S-01-R-01', 'BIN-B-BAY-MARG-S-01-R-02', 'BIN-B-BAY-MARG-S-01-R-03']),
  createShelf('BIN-C-BAY-SOAP-S-01', 'BIN-C-BAY', '01', ['BIN-C-BAY-SOAP-S-01-R-01', 'BIN-C-BAY-SOAP-S-01-R-02', 'BIN-C-BAY-SOAP-S-01-R-03']),
  createShelf('BIN-D-BAY-SPEC-S-01', 'BIN-D-BAY', '01', ['BIN-D-BAY-SPEC-S-01-R-01', 'BIN-D-BAY-SPEC-S-01-R-02', 'BIN-D-BAY-SPEC-S-01-R-03']),
  createShelf('BIN-E-BAY-RET-S-01', 'BIN-E-BAY', '01', ['BIN-E-BAY-RET-S-01-R-01', 'BIN-E-BAY-RET-S-01-R-02']),
];

export const USERS: User[] = [
  { id: 'op1', name: 'Alex Mwangi', role: 'Picker', department: 'Edible Oils', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick1', name: 'Sam Otieno', role: 'Picker', department: 'Detergents & Soaps', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick2', name: 'Moses Kipchoge', role: 'Picker', department: 'Edible Oils', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick3', name: 'Amara Koech', role: 'Picker', department: 'Margarine & Shortening', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick4', name: 'Rashid Hassan', role: 'Picker', department: 'Margarine & Shortening', mfaEnabled: true, loginAttempts: 0 },
  { id: 'pick5', name: 'Zainab Omondi', role: 'Picker', department: 'Detergents & Soaps', mfaEnabled: true, loginAttempts: 0 },
  { id: 'mgr1', name: 'Jordan Wanjiru', role: 'Manager', mfaEnabled: true, loginAttempts: 0 },
  { id: 'hod1', name: 'Priya Kimani', role: 'HOD', department: 'Edible Oils', mfaEnabled: true, loginAttempts: 0 },
  { id: 'hod2', name: 'David Mutua', role: 'HOD', department: 'Margarine & Shortening', mfaEnabled: true, loginAttempts: 0 },
  { id: 'hod3', name: 'Lucy Wambui', role: 'HOD', department: 'Detergents & Soaps', mfaEnabled: true, loginAttempts: 0 },
  { id: 'dir1', name: 'Winnie Bochaberi', role: 'Director', mfaEnabled: true, loginAttempts: 0 },
  { id: 'clerk1', name: 'Grace Achieng', role: 'Clerk', mfaEnabled: true, loginAttempts: 0 },
  { id: 'load1', name: 'Brian Kiptoo', role: 'Loader', mfaEnabled: true, loginAttempts: 0 },
  { id: 'qa1', name: 'Fatuma Noor', role: 'QA', mfaEnabled: true, loginAttempts: 0 },
  { id: 'ret1', name: 'Wanjiku Njeri', role: 'Customer Return Clerk', mfaEnabled: true, loginAttempts: 0 },
  { id: 'salesmgr1', name: 'Esther Njoroge', role: 'Sales Manager', mfaEnabled: true, loginAttempts: 0 },
];

// The only valid "Rework" recall destination — a dedicated line for
// reprocessing recalled stock, kept separate from the numbered production
// lines so recalled pallets never mix into a live production run.
export const EXCEPTION_LINE_ID = 'L-EXC';

export const INITIAL_LINES: Line[] = [
  { id: 'L001', name: 'Line 1', status: 'Free', activeProductionOrderId: null },
  { id: 'L002', name: 'Line 2', status: 'Free', activeProductionOrderId: null },
  { id: 'L003', name: 'Line 3', status: 'Free', activeProductionOrderId: null },
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
    sku: 'TOSS500G',
    productName: 'Toss 500g',
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

// SAP does NOT know the vehicle in advance — it's only known once the
// customer/driver physically arrives to collect, at which point the Loader
// registers it (see registerVehicleForSalesOrder). Every order therefore
// starts with no assigned vehicle.
export const INITIAL_SALES_ORDERS: SalesOrder[] = [
  {
    id: 'SO001',
    customer: 'Customer ABC',
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
    customer: 'Customer XYZ',
    sku: 'TOSS500G',
    productName: 'Toss 500g',
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
    customer: 'Customer QRS',
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

// Create zone-aware storage racks with standard naming (3 racks per zone)
const createStorageRacks = (): Rack[] => {
  const rackMap: Record<string, { zoneId: string; shelfId: string }> = {
    'BIN-A-OILS-S-01-R-01': { zoneId: 'BIN-A', shelfId: 'BIN-A-OILS-S-01' },
    'BIN-A-OILS-S-01-R-02': { zoneId: 'BIN-A', shelfId: 'BIN-A-OILS-S-01' },
    'BIN-A-OILS-S-01-R-03': { zoneId: 'BIN-A', shelfId: 'BIN-A-OILS-S-01' },
    'BIN-B-MARG-S-01-R-01': { zoneId: 'BIN-B', shelfId: 'BIN-B-MARG-S-01' },
    'BIN-B-MARG-S-01-R-02': { zoneId: 'BIN-B', shelfId: 'BIN-B-MARG-S-01' },
    'BIN-B-MARG-S-01-R-03': { zoneId: 'BIN-B', shelfId: 'BIN-B-MARG-S-01' },
    'BIN-C-SOAP-S-01-R-01': { zoneId: 'BIN-C', shelfId: 'BIN-C-SOAP-S-01' },
    'BIN-C-SOAP-S-01-R-02': { zoneId: 'BIN-C', shelfId: 'BIN-C-SOAP-S-01' },
    'BIN-C-SOAP-S-01-R-03': { zoneId: 'BIN-C', shelfId: 'BIN-C-SOAP-S-01' },
    'BIN-D-SPEC-S-01-R-01': { zoneId: 'BIN-D', shelfId: 'BIN-D-SPEC-S-01' },
    'BIN-D-SPEC-S-01-R-02': { zoneId: 'BIN-D', shelfId: 'BIN-D-SPEC-S-01' },
    'BIN-D-SPEC-S-01-R-03': { zoneId: 'BIN-D', shelfId: 'BIN-D-SPEC-S-01' },
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

// Create zone-aware loading bay racks with standard naming (3 racks per zone, 6-pallet capacity)
const createBayRacks = (): Rack[] => {
  const rackMap: Record<string, { zoneId: string; shelfId: string }> = {
    'BIN-A-BAY-OILS-S-01-R-01': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-OILS-S-01' },
    'BIN-A-BAY-OILS-S-01-R-02': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-OILS-S-01' },
    'BIN-A-BAY-OILS-S-01-R-03': { zoneId: 'BIN-A-BAY', shelfId: 'BIN-A-BAY-OILS-S-01' },
    'BIN-B-BAY-MARG-S-01-R-01': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-MARG-S-01' },
    'BIN-B-BAY-MARG-S-01-R-02': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-MARG-S-01' },
    'BIN-B-BAY-MARG-S-01-R-03': { zoneId: 'BIN-B-BAY', shelfId: 'BIN-B-BAY-MARG-S-01' },
    'BIN-C-BAY-SOAP-S-01-R-01': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-SOAP-S-01' },
    'BIN-C-BAY-SOAP-S-01-R-02': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-SOAP-S-01' },
    'BIN-C-BAY-SOAP-S-01-R-03': { zoneId: 'BIN-C-BAY', shelfId: 'BIN-C-BAY-SOAP-S-01' },
    'BIN-D-BAY-SPEC-S-01-R-01': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-SPEC-S-01' },
    'BIN-D-BAY-SPEC-S-01-R-02': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-SPEC-S-01' },
    'BIN-D-BAY-SPEC-S-01-R-03': { zoneId: 'BIN-D-BAY', shelfId: 'BIN-D-BAY-SPEC-S-01' },
    'BIN-E-BAY-RET-S-01-R-01': { zoneId: 'BIN-E-BAY', shelfId: 'BIN-E-BAY-RET-S-01' },
    'BIN-E-BAY-RET-S-01-R-02': { zoneId: 'BIN-E-BAY', shelfId: 'BIN-E-BAY-RET-S-01' },
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
