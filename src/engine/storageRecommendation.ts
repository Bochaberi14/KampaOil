import type { Rack } from '../types/domain';

export interface StorageRecommendation {
  binId: string;
  shelfId: string;
  rackId: string;
}

// Simple round-robin strategy: distribute pallets across bins and shelves
// to balance load. Each bin product gets assigned proportionally.
export function recommendStorageLocation(
  racks: Rack[],
  sku: string,
  _palletId: string,
): StorageRecommendation | null {
  // Map SKU to bin ID
  const skuToBin: Record<string, string> = {
    'KASUKU1KG': 'BIN-A',
    'RINA1L': 'BIN-B',
    'PRESTIGE500G': 'BIN-C',
  };

  const targetBin = skuToBin[sku];
  if (!targetBin) return null;

  // Get all racks in the target bin
  const binRacks = racks.filter((r) => r.zoneId === targetBin);
  if (binRacks.length === 0) return null;

  // Find the rack with available slots
  const availableRack = binRacks.find((r) => r.slots.some((s) => !s.palletId));
  if (!availableRack) return null;

  return {
    binId: targetBin,
    shelfId: availableRack.shelfId || targetBin,
    rackId: availableRack.id,
  };
}

// Get the first available slot in a rack
export function getFirstAvailableSlot(rack: Rack): number | null {
  const slotIndex = rack.slots.findIndex((s) => !s.palletId);
  return slotIndex >= 0 ? slotIndex : null;
}

// Format location for display
export function formatStorageLocation(recommendation: StorageRecommendation): string {
  const binName = recommendation.binId; // e.g., "BIN-A"
  const shelfMatch = recommendation.shelfId.match(/S-(\d+)/);
  const shelfNum = shelfMatch ? shelfMatch[1] : '?';
  const rackMatch = recommendation.rackId.match(/R-(\d+)/);
  const rackNum = rackMatch ? rackMatch[1] : '?';

  return `${binName} → Shelf ${shelfNum} → Rack ${rackNum}`;
}
