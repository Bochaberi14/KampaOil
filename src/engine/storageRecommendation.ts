import type { Rack, Pallet } from '../types/domain';

export interface StorageRecommendation {
  binId: string;
  shelfId: string;
  rackId: string;
  isOverflow?: boolean;
}

const SLOTS_PER_RACK = 6;

// Recommend storage location with overflow fallback
// Considers both racked pallets AND pallets in transit to storage
export function recommendStorageLocation(
  racks: Rack[],
  sku: string,
  _palletId: string,
  pallets?: Pallet[],
): StorageRecommendation | null {
  // Map SKU to bin ID (Product-specific bins)
  const skuToBin: Record<string, string> = {
    'RINA1L': 'BIN-A',
    'PRESTIGE500G': 'BIN-B',
    'KASUKU1KG': 'BIN-C',
  };

  const targetBin = skuToBin[sku];
  if (!targetBin) return null;

  // Get all racks in the target bin
  const binRacks = racks.filter((r) => r.zoneId === targetBin);

  // Find the rack with available slots, considering in-transit pallets
  const availableRack = binRacks.find((rack) => {
    // Count already racked pallets
    const rackedCount = rack.slots.filter((s) => s.palletId).length;

    // Count in-transit pallets assigned to this rack
    const inTransitCount = pallets
      ? pallets.filter(
          (p) =>
            (p.status === 'InTransitToStorage' || p.status === 'Loaded') &&
            p.recommendedStorageLocation &&
            p.recommendedStorageLocation.rackId === rack.id,
        ).length
      : 0;

    // Calculate occupied slots
    const occupiedSlots = rackedCount + inTransitCount;
    return occupiedSlots < SLOTS_PER_RACK;
  });

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
  const overflowAvailableRack = overflowRacks.find((rack) => {
    const rackedCount = rack.slots.filter((s) => s.palletId).length;
    const inTransitCount = pallets
      ? pallets.filter(
          (p) =>
            (p.status === 'InTransitToStorage' || p.status === 'Loaded') &&
            p.recommendedStorageLocation &&
            p.recommendedStorageLocation.rackId === rack.id,
        ).length
      : 0;
    const occupiedSlots = rackedCount + inTransitCount;
    return occupiedSlots < SLOTS_PER_RACK;
  });

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

// Recommend loading bay rack location (similar to storage recommendations)
export function recommendBayLocation(
  bayRacks: Rack[],
  _palletId: string,
  pallets?: Pallet[],
): { rackId: string } | null {
  const SLOTS_PER_BAY_RACK = 6;

  // Find first available bay rack, considering in-transit pallets
  const availableRack = bayRacks.find((rack) => {
    const rackedCount = rack.slots.filter((s) => s.palletId).length;

    // Count in-transit pallets assigned to this rack
    const inTransitCount = pallets
      ? pallets.filter(
          (p) =>
            p.status === 'InTransitToBay' &&
            p.recommendedBayLocation &&
            p.recommendedBayLocation.rackId === rack.id,
        ).length
      : 0;

    const occupiedSlots = rackedCount + inTransitCount;
    return occupiedSlots < SLOTS_PER_BAY_RACK;
  });

  if (availableRack) {
    return { rackId: availableRack.id };
  }

  return null;
}

// Format bay location for display
export function formatBayLocation(recommendation: { rackId: string }): string {
  // Bay location follows bin/shelf/rack format: BIN-A-S-01-R-01
  const binMatch = recommendation.rackId.match(/BIN-([A-Z])/);
  const shelfMatch = recommendation.rackId.match(/S-(\d+)/);
  const rackMatch = recommendation.rackId.match(/R-(\d+)/);

  const binId = binMatch ? `BIN-${binMatch[1]}` : 'BIN-?';
  const shelfNum = shelfMatch ? shelfMatch[1] : '?';
  const rackNum = rackMatch ? rackMatch[1] : '?';

  return `${binId} → Shelf ${shelfNum} → Rack ${rackNum}`;
}
