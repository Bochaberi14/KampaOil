import type { Load, Pallet } from '../types/domain';

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
