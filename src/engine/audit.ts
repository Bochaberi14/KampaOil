import type { Batch, HoldRecord, Load, Manifest, Movement, Pallet, RecallCase } from '../types/domain';

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
