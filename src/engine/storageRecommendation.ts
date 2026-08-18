import type { Rack } from '../types/domain';

export interface StorageRecommendation {
  binId: string;
  shelfId: string;
  rackId: string;
  isOverflow?: boolean;
}

// Recommend storage location with overflow fallback
// Returns recommendation for designated bin, or OVERFLOW if bin is full
export function recommendStorageLocation(
  racks: Rack[],
  sku: string,
  _palletId: string,
): StorageRecommendation | null {
  // Map SKU to bin ID (Product-specific bins)
  const skuToBin: Record<string, string> = {
    'RINA1L': 'BIN-A',
    'KASUKU1KG': 'BIN-B',
    'PRESTIGE500G': 'BIN-C',
  };

  const targetBin = skuToBin[sku];
  if (!targetBin) return null;

  // Get all racks in the target bin
  const binRacks = racks.filter((r) => r.zoneId === targetBin);

  // Find the rack with available slots in designated bin
  const availableRack = binRacks.find((r) => r.slots.some((s) => !s.palletId));
  if (availableRack) {
    return {
      binId: targetBin,
      shelfId: availableRack.shelfId || targetBin,
      rackId: availableRack.id,
      isOverflow: false,
    };
  }

  // Designated bin is full — try OVERFLOW
  const overflowRacks = racks.filter((r) => r.zoneId === 'OVERFLOW');
  const overflowAvailableRack = overflowRacks.find((r) => r.slots.some((s) => !s.palletId));

  if (overflowAvailableRack) {
    return {
      binId: 'OVERFLOW',
      shelfId: overflowAvailableRack.shelfId || 'OVERFLOW',
      rackId: overflowAvailableRack.id,
      isOverflow: true,
    };
  }

  // Both bin and overflow are full
  return null;
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
