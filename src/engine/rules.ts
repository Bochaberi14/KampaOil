import type { Department, Load, Pallet, Rack, Zone } from '../types/domain';

export function findFreeRackSlot(racks: Rack[]) {
  for (const rack of racks) {
    const slot = rack.slots.find((s) => s.palletId === null);
    if (slot) return { rackId: rack.id, slotIndex: slot.index };
  }
  return null;
}

// Zone-aware rack selection: prefers racks in the zone matching the product's department
export function findZoneAwareRackSlot(racks: Rack[], zones: Zone[], department: Department | 'Returns') {
  // Find the zone(s) matching this department
  const matchingZones = zones.filter((z) => z.department === department);

  // First pass: try racks in matching zones
  for (const zone of matchingZones) {
    for (const rack of racks) {
      if (rack.zoneId === zone.id) {
        const slot = rack.slots.find((s) => s.palletId === null);
        if (slot) return { rackId: rack.id, slotIndex: slot.index, zoneId: zone.id, zoneMatch: true };
      }
    }
  }

  // Fallback: any free rack if zone is full
  for (const rack of racks) {
    const slot = rack.slots.find((s) => s.palletId === null);
    if (slot) {
      return { rackId: rack.id, slotIndex: slot.index, zoneId: rack.zoneId || 'unknown', zoneMatch: false };
    }
  }
  return null;
}

export function countFreeRackSlots(racks: Rack[]): number {
  return racks.reduce(
    (sum, r) => sum + r.slots.filter((s) => s.palletId === null).length,
    0,
  );
}

export function countRackedPallets(racks: Rack[]): number {
  return racks.reduce(
    (sum, r) => sum + r.slots.filter((s) => s.palletId !== null).length,
    0,
  );
}

export function findRackHoldingPallet(racks: Rack[], palletId: string) {
  for (const rack of racks) {
    const slot = rack.slots.find((s) => s.palletId === palletId);
    if (slot) return { rackId: rack.id, slotIndex: slot.index };
  }
  return null;
}

const STAGE_LABELS: Record<string, string> = {
  Empty: 'Free pallet pool',
  Loaded: 'Production / Line',
  InTransitToStorage: 'In transit to storage',
  Racked: 'Storage',
  InTransitToBay: 'In transit to loading bay',
  OnBay: 'Loading bay',
  InTransitToTruck: 'In transit to dispatch',
  InRecall: 'Recall (Line 50)',
  Scrapped: 'Scrapped',
};

// Human-readable stage name for a pallet's current status — used wherever a
// held/tracked pallet needs to show "where" it is beyond a bare status enum
// (Hold page, pallet inventory breakdown).
export function stageLabel(pallet: Pallet): string {
  return STAGE_LABELS[pallet.status] ?? pallet.status;
}

export interface PalletSummary {
  total: number;
  empty: number;
  occupied: number;
  byStage: { label: string; count: number }[];
}

export function summarizePallets(pallets: Pallet[]): PalletSummary {
  const total = pallets.length;
  const empty = pallets.filter((p) => p.status === 'Empty').length;
  const occupied = total - empty;

  const counts = new Map<string, number>();
  for (const pallet of pallets) {
    if (pallet.status === 'Empty') continue;
    const label = stageLabel(pallet);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const byStage = Array.from(counts, ([label, count]) => ({ label, count }));

  return { total, empty, occupied, byStage };
}

/**
 * FIFO, whole-pallet-only selection: oldest producedAt first, stopping once
 * accumulated quantity meets or exceeds what's needed (may slightly overshoot
 * since partial pallets are never split).
 */
export function selectFifoLoads(
  candidateLoads: Load[],
  sku: string,
  neededQty: number,
): Load[] {
  const matching = candidateLoads
    .filter((l) => l.sku === sku && l.status === 'InStorage')
    .sort((a, b) => a.producedAt.localeCompare(b.producedAt));

  const picked: Load[] = [];
  let accumulated = 0;
  for (const load of matching) {
    if (accumulated >= neededQty) break;
    picked.push(load);
    accumulated += load.quantity;
  }
  return picked;
}
