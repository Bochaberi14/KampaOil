import type { BayRack, Load, Rack } from '../types/domain';

export function findFreeRackSlot(racks: Rack[]) {
  for (const rack of racks) {
    const slot = rack.slots.find((s) => s.palletId === null);
    if (slot) return { rackId: rack.id, slotIndex: slot.index };
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

export function findFreeBayRack(bayRacks: BayRack[]) {
  return bayRacks.find((b) => b.palletId === null) ?? null;
}

export function findRackHoldingPallet(racks: Rack[], palletId: string) {
  for (const rack of racks) {
    const slot = rack.slots.find((s) => s.palletId === palletId);
    if (slot) return { rackId: rack.id, slotIndex: slot.index };
  }
  return null;
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
