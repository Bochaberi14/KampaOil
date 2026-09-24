import { useWarehouseStore } from '../store/useWarehouseStore';
import { LOADING_BAY_ZONES, STORAGE_ZONES } from '../data/seed';
import { RackGrid } from '../components/RackGrid';
import { PrintSheet } from '../components/PrintSheet';
import {
  InventoryReportPrint,
  BayInventoryReportPrint,
  ShelfInventoryReportPrint,
  RackInventoryReportPrint,
} from '../components/InventoryReportPrint';
import { can } from '../rbac';
import type { Zone, Load, Shelf, Rack } from '../types/domain';

export function ZoneInventoryPage() {
  const pallets = useWarehouseStore((s) => s.pallets);
  const loads = useWarehouseStore((s) => s.loads);
  const racks = useWarehouseStore((s) => s.racks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const storageShelves = useWarehouseStore((s) => s.storageShelves);
  const loadingBayShelves = useWarehouseStore((s) => s.loadingBayShelves);
  const currentUser = useWarehouseStore((s) => s.currentUser);
  const canPrintInventory = can(currentUser?.role, 'print:inventory');

  function getZoneStats(zone: Zone) {
    const zoneRacks = zone.warehouseType === 'Storage' ? racks : bayRacks;
    const zoneShelves = zone.warehouseType === 'Storage' ? storageShelves : loadingBayShelves;
    const relevantRacks = zoneRacks.filter((r) => r.zoneId === zone.id);
    const relevantShelves = zoneShelves.filter((s) => s.zoneId === zone.id);

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
      shelves: relevantShelves,
    };
  }

  const storageStats = STORAGE_ZONES.map(getZoneStats);
  const loadingBayStats = LOADING_BAY_ZONES.map(getZoneStats);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Zone Inventory Dashboard</h1>
          <p className="text-sm text-slate-400">
            Real-time view of warehouse zones with utilization, contents, and pallet locations.
          </p>
        </div>
        {canPrintInventory && (
          <PrintSheet title="Warehouse Inventory Report" triggerLabel="🖨️ Print inventory report">
            <InventoryReportPrint
              storageZones={STORAGE_ZONES}
              storageShelves={storageShelves}
              storageRacks={racks}
              bayZones={LOADING_BAY_ZONES}
              bayShelves={loadingBayShelves}
              bayRacks={bayRacks}
              loads={loads}
              generatedAt={new Date().toISOString()}
            />
          </PrintSheet>
        )}
      </div>

      {/* Storage Zones */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">Storage Zones</h2>
        <div className="grid grid-cols-1 gap-4">
          {storageStats.map((stat) => (
            <ZoneCard key={stat.zone.id} stat={stat} loads={loads} canPrint={canPrintInventory} />
          ))}
        </div>
      </div>

      {/* Loading Bay Zones */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">Loading Bay Zones</h2>
        <div className="grid grid-cols-1 gap-4">
          {loadingBayStats.map((stat) => (
            <ZoneCard key={stat.zone.id} stat={stat} loads={loads} canPrint={canPrintInventory} />
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
  racks: Rack[];
  shelves: Shelf[];
}

function ZoneCard({
  stat,
  loads,
  canPrint,
}: {
  stat: ZoneStats;
  loads?: Load[];
  canPrint?: boolean;
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
          <div className="flex items-start gap-3">
            {canPrint && (
              <PrintSheet title={`${typedStat.zone.name} Inventory Report`} triggerLabel="🖨️ Print bay">
                <BayInventoryReportPrint
                  zone={typedStat.zone}
                  shelves={typedStat.shelves}
                  racks={typedStat.racks}
                  loads={loads ?? []}
                  generatedAt={new Date().toISOString()}
                />
              </PrintSheet>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-100">{typedStat.utilizationPercent}%</div>
              <p className="text-xs text-slate-500">Utilization</p>
            </div>
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

      {/* Racks Display, grouped by shelf */}
      {typedStat.racks.length > 0 && (
        <div className="space-y-4">
          {typedStat.shelves.map((shelf) => {
            const shelfRacks = typedStat.racks.filter((r) => r.shelfId === shelf.id);
            if (shelfRacks.length === 0) return null;
            return (
              <div key={shelf.id}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Shelf {shelf.index}
                  </p>
                  {canPrint && (
                    <PrintSheet title={`${typedStat.zone.name} · Shelf ${shelf.index} Inventory Report`} triggerLabel="🖨️ Print shelf">
                      <ShelfInventoryReportPrint
                        zone={typedStat.zone}
                        shelf={shelf}
                        racks={shelfRacks}
                        loads={loads ?? []}
                        generatedAt={new Date().toISOString()}
                      />
                    </PrintSheet>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shelfRacks.map((rack) => (
                    <div key={rack.id} className="space-y-2">
                      <RackGrid rack={rack} loads={loads} />
                      {canPrint && (
                        <PrintSheet title={`Rack ${rack.name} Inventory Report`} triggerLabel="🖨️ Print rack">
                          <RackInventoryReportPrint
                            zone={typedStat.zone}
                            rack={rack}
                            loads={loads ?? []}
                            generatedAt={new Date().toISOString()}
                          />
                        </PrintSheet>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
