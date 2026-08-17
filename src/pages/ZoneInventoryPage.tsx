import { useWarehouseStore } from '../store/useWarehouseStore';
import { LOADING_BAY_ZONES, STORAGE_ZONES } from '../data/seed';
import { RackGrid } from '../components/RackGrid';
import type { Zone, Load } from '../types/domain';

export function ZoneInventoryPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const loads = useWarehouseStore((s) => s.loads);
  const racks = useWarehouseStore((s) => s.racks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);

  function getZoneStats(zone: Zone) {
    const zoneRacks = zone.warehouseType === 'Storage' ? racks : bayRacks;
    const relevantRacks = zoneRacks.filter((r) => r.zoneId === zone.id);

    let totalSlots = 0;
    let occupiedSlots = 0;
    const palletIds = new Set<string>();

    for (const rack of relevantRacks) {
      totalSlots += rack.slots.length;
      for (const slot of rack.slots) {
        if (slot.palletId) {
          occupiedSlots++;
          palletIds.add(slot.palletId);
        }
      }
    }

    const zonePallets = pallets.filter((p) => palletIds.has(p.id));
    const zoneLoads = zonePallets
      .flatMap((p) => loads.filter((l) => l.palletId === p.id))
      .reduce((acc, load) => {
        const existing = acc.find((a) => a.sku === load.sku);
        if (existing) {
          existing.quantity += load.quantity;
          existing.units += 1;
        } else {
          acc.push({
            sku: load.sku,
            productName: load.productName,
            quantity: load.quantity,
            units: 1,
          });
        }
        return acc;
      }, [] as Array<{ sku: string; productName: string; quantity: number; units: number }>);

    return {
      zone,
      totalSlots,
      occupiedSlots,
      utilizationPercent: totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100),
      palletCount: palletIds.size,
      loads: zoneLoads,
      racks: relevantRacks,
    };
  }

  const storageStats = STORAGE_ZONES.map(getZoneStats);
  const loadingBayStats = LOADING_BAY_ZONES.map(getZoneStats);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Zone Inventory Dashboard</h1>
        <p className="text-sm text-slate-400">
          Real-time view of warehouse zones with utilization, contents, and pallet locations.
        </p>
      </div>

      {/* Storage Zones */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">Storage Zones</h2>
        <div className="grid grid-cols-1 gap-4">
          {storageStats.map((stat) => (
            <ZoneCard key={stat.zone.id} stat={stat} loads={loads} />
          ))}
        </div>
      </div>

      {/* Loading Bay Zones */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">Loading Bay Zones</h2>
        <div className="grid grid-cols-1 gap-4">
          {loadingBayStats.map((stat) => (
            <ZoneCard key={stat.zone.id} stat={stat} loads={loads} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ZoneStats {
  zone: Zone;
  totalSlots: number;
  occupiedSlots: number;
  utilizationPercent: number;
  palletCount: number;
  loads: Array<{ sku: string; productName: string; quantity: number; units: number }>;
  racks: any[];
}

function ZoneCard({
  stat,
  loads,
}: {
  stat: ZoneStats;
  loads?: Load[];
}) {
  const typedStat = stat;
  const utilizationColor =
    typedStat.utilizationPercent === 0
      ? 'bg-slate-700'
      : typedStat.utilizationPercent < 50
        ? 'bg-emerald-600'
        : typedStat.utilizationPercent < 80
          ? 'bg-amber-600'
          : 'bg-red-600';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
      {/* Zone Header & Stats */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-200">{typedStat.zone.name}</h3>
            <p className="text-xs text-slate-500">{typedStat.zone.id}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-100">{typedStat.utilizationPercent}%</div>
            <p className="text-xs text-slate-500">Utilization</p>
          </div>
        </div>

        {/* Utilization Bar */}
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden mb-3">
          <div
            className={`h-full ${utilizationColor} transition-all`}
            style={{ width: `${typedStat.utilizationPercent}%` }}
          />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-slate-300">
            <span>Slots occupied:</span>
            <span className="font-mono">
              {typedStat.occupiedSlots} / {typedStat.totalSlots}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Pallets:</span>
            <span className="font-mono">{typedStat.palletCount}</span>
          </div>
          {typedStat.zone.requiresRefrigeration && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-2 py-1 w-fit">
              <span className="text-xs text-blue-300">❄ Refrigerated</span>
            </div>
          )}
        </div>
      </div>

      {/* Contents Summary */}
      {typedStat.loads.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Contents
          </p>
          <div className="space-y-1 text-xs">
            {typedStat.loads.map((load: any) => (
              <div
                key={load.sku}
                className="flex justify-between border-t border-slate-800 pt-1"
              >
                <span className="text-slate-400">
                  {load.productName} ({load.units}x)
                </span>
                <span className="font-mono text-slate-300">{load.quantity.toLocaleString()} units</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {typedStat.loads.length === 0 && (
        <p className="text-xs text-slate-500 italic">Zone is empty</p>
      )}

      {/* Racks Display */}
      {typedStat.racks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Racks
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {typedStat.racks.map((rack: any) => (
              <RackGrid key={rack.id} rack={rack} loads={loads} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
