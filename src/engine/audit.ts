import type { Batch, HoldRecord, Load, Manifest, Movement, Pallet, Rack, RecallCase, DispatchVerification } from '../types/domain';
import { formatBayLocation, formatStorageLocation } from './storageRecommendation';

export interface ScannerOperation {
  id: string;
  scannerId: string;
  workLocation: string;
  operationType: 'SCAN_LINE' | 'SCAN_PRODUCT' | 'SCAN_PALLET' | 'CONFIRM_LOAD' | 'SCAN_RACK' | 'VERIFY_VEHICLE' | 'SIGN_HANDOVER';
  details: Record<string, string>;
  palletId?: string;
  operatorId: string;
  timestamp: string;
}

export function getRackedLoads(loads: Load[], pallets: Pallet[]): Load[] {
  const rackedIds = new Set(pallets.filter((p) => p.status === 'Racked').map((p) => p.id));
  return loads.filter((l) => rackedIds.has(l.palletId));
}

export interface GroupSummary {
  key: string;
  label: string;
  totalQty: number;
  palletCount: number;
}

export function groupLoadsBy(
  loads: Load[],
  keyFn: (l: Load) => string,
  labelFn: (l: Load) => string,
): GroupSummary[] {
  const map = new Map<string, GroupSummary>();
  for (const l of loads) {
    const key = keyFn(l);
    const existing = map.get(key);
    if (existing) {
      existing.totalQty += l.quantity;
      existing.palletCount += 1;
    } else {
      map.set(key, { key, label: labelFn(l), totalQty: l.quantity, palletCount: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
}

export function ageInHours(producedAt: string): number {
  return Math.round((Date.now() - new Date(producedAt).getTime()) / (1000 * 60 * 60));
}

export interface PalletJourney {
  pallet: Pallet;
  load: Load | null;
  batch: Batch | null;
  holds: HoldRecord[];
  recallCase: RecallCase | null;
  manifest: Manifest | null;
  steps: Movement[];
}

// End-to-end traceability for a single pallet — production through dispatch —
// built entirely from data already recorded elsewhere (movements, holds,
// recall cases, manifests), so this is just a read-only projection.
export function buildPalletJourney(
  palletId: string,
  data: {
    pallets: Pallet[];
    loads: Load[];
    batches: Batch[];
    holds: HoldRecord[];
    recallCases: RecallCase[];
    manifests: Manifest[];
    movements: Movement[];
  },
): PalletJourney | null {
  const pallet = data.pallets.find((p) => p.id === palletId);
  if (!pallet) return null;
  const load = data.loads.find((l) => l.palletId === palletId) ?? null;
  const batch = load ? (data.batches.find((b) => b.id === load.batchId) ?? null) : null;
  const holds = data.holds.filter((h) => h.targetId === palletId);
  const recallCase = data.recallCases.find((r) => r.palletId === palletId) ?? null;
  const manifest = data.manifests.find((m) => m.palletIds.includes(palletId)) ?? null;
  const steps = data.movements
    .filter((m) => m.palletId === palletId)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { pallet, load, batch, holds, recallCase, manifest, steps };
}

export interface PalletLocationSummary {
  zoneId: string;
  shelfId: string | null;
  rackId: string;
  slotIndex: number | null;
  formatted: string;
}

export interface PalletLocationCheck {
  pallet: Pallet;
  // Where the pallet should be, per the storage/bay recommendation recorded
  // when it left production/storage — null if no recommendation was ever made
  // (e.g. the pallet never left production, or was scrapped before racking).
  expected: PalletLocationSummary | null;
  // Where the pallet is currently recorded, if it's sitting in a storage or
  // bay rack right now.
  actual: PalletLocationSummary | null;
  // Human-readable note when `actual` is null — the pallet isn't in a rack
  // (in transit, on a truck, dispatched, etc).
  actualStatusNote: string | null;
  // true/false only when both expected and actual resolve to a rack; null
  // when there's nothing to compare.
  matches: boolean | null;
}

// "Where should this pallet be, and does that match where the system has it
// recorded right now?" — a read-only lookup, distinct from buildPalletJourney
// (full history) and the scan-based Inventory Verification workflow (which
// compares the system record against a *physical* scan and raises a formal
// discrepancy on mismatch). This just answers the question, no side effects.
export function resolvePalletLocationCheck(
  palletId: string,
  data: { pallets: Pallet[]; racks: Rack[]; bayRacks: Rack[] },
): PalletLocationCheck | null {
  const pallet = data.pallets.find((p) => p.id === palletId);
  if (!pallet) return null;

  let expected: PalletLocationSummary | null = null;
  if (pallet.recommendedStorageLocation) {
    const { binId, shelfId, rackId } = pallet.recommendedStorageLocation;
    expected = {
      zoneId: binId,
      shelfId,
      rackId,
      slotIndex: null,
      formatted: formatStorageLocation({ binId, shelfId, rackId }),
    };
  } else if (pallet.recommendedBayLocation) {
    const { rackId } = pallet.recommendedBayLocation;
    const rack = data.bayRacks.find((r) => r.id === rackId);
    expected = {
      zoneId: rack?.zoneId ?? 'Unknown zone',
      shelfId: rack?.shelfId ?? null,
      rackId,
      slotIndex: null,
      formatted: formatBayLocation({ rackId }),
    };
  }

  let actual: PalletLocationSummary | null = null;
  let actualStatusNote: string | null = null;
  const location = pallet.location;
  if (location.type === 'Rack') {
    const rackId = location.rackId;
    const rack = data.racks.find((r) => r.id === rackId);
    actual = {
      zoneId: rack?.zoneId ?? 'Unknown zone',
      shelfId: rack?.shelfId ?? null,
      rackId,
      slotIndex: location.slotIndex,
      formatted: formatStorageLocation({
        binId: rack?.zoneId ?? 'Unknown zone',
        shelfId: rack?.shelfId ?? rackId,
        rackId,
      }),
    };
  } else if (location.type === 'BayRack') {
    const bayRackId = location.bayRackId;
    const rack = data.bayRacks.find((r) => r.id === bayRackId);
    actual = {
      zoneId: rack?.zoneId ?? 'Unknown zone',
      shelfId: rack?.shelfId ?? null,
      rackId: bayRackId,
      slotIndex: location.slotIndex,
      formatted: formatBayLocation({ rackId: bayRackId }),
    };
  } else {
    actualStatusNote = `Not currently racked — status: ${pallet.status}`;
  }

  const matches = expected && actual ? expected.rackId === actual.rackId : null;

  return { pallet, expected, actual, actualStatusNote, matches };
}

// Generate traceability summary for a dispatch verification
export interface DispatchTraceabilitySummary {
  salesOrderId: string;
  customer: string;
  totalPallets: number;
  palletJourneys: {
    palletId: string;
    status: string;
    journey: string[]; // Step descriptions
  }[];
  completionDetails: {
    dispatchedAt: string;
    vehicleBarcode: string;
    dispatchLine: string;
    loaderName: string;
    driverName: string;
    loaderSignedAt: string;
    driverSignedAt: string;
  };
}

export function generateDispatchTraceability(
  verification: DispatchVerification,
  data: {
    pallets: Pallet[];
    loads: Load[];
    batches: Batch[];
    holds: HoldRecord[];
    recallCases: RecallCase[];
    manifests: Manifest[];
    movements: Movement[];
  },
): DispatchTraceabilitySummary {
  const journeys = verification.palletIds.map((palletId) => {
    const journey = buildPalletJourney(palletId, data);
    const steps = journey?.steps || [];
    const journeyDescription = [
      'Production',
      ...steps.map((s) => `${s.to} (${new Date(s.timestamp).toLocaleTimeString()})`),
      'Dispatch',
    ];

    return {
      palletId,
      status: journey?.pallet.status || 'Unknown',
      journey: journeyDescription,
    };
  });

  return {
    salesOrderId: verification.salesOrderId,
    customer: verification.customer,
    totalPallets: verification.palletIds.length,
    palletJourneys: journeys,
    completionDetails: {
      dispatchedAt: verification.stagedAt,
      vehicleBarcode: verification.vehicleBarcode,
      dispatchLine: verification.dispatchLine,
      loaderName: verification.loaderUserId ? 'Signed' : 'Pending',
      driverName: verification.driverName || 'Unknown',
      loaderSignedAt: verification.loaderSignedAt || 'Not signed',
      driverSignedAt: verification.driverSignedAt || 'Not signed',
    },
  };
}
