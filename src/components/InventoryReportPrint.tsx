import type { Zone, Shelf, Rack, Load } from '../types/domain';

interface InventoryReportPrintProps {
  storageZones: Zone[];
  storageShelves: Shelf[];
  storageRacks: Rack[];
  bayZones: Zone[];
  bayShelves: Shelf[];
  bayRacks: Rack[];
  loads: Load[];
  generatedAt: string;
}

export function InventoryReportPrint({
  storageZones,
  storageShelves,
  storageRacks,
  bayZones,
  bayShelves,
  bayRacks,
  loads,
  generatedAt,
}: InventoryReportPrintProps) {
  return (
    <div className="space-y-8 bg-white p-12 text-black">
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">WAREHOUSE INVENTORY REPORT</h1>
        <p className="text-sm text-gray-600">
          Physical verification checklist — Storage &amp; Loading Bay, by zone / shelf / rack
        </p>
        <p className="text-xs text-gray-500 mt-1">Generated {new Date(generatedAt).toLocaleString()}</p>
      </div>

      <ReportSection title="Storage" zones={storageZones} shelves={storageShelves} racks={storageRacks} loads={loads} />
      <ReportSection title="Loading Bay" zones={bayZones} shelves={bayShelves} racks={bayRacks} loads={loads} />
    </div>
  );
}

interface BayInventoryReportPrintProps {
  zone: Zone;
  shelves: Shelf[];
  racks: Rack[];
  loads: Load[];
  generatedAt: string;
}

export function BayInventoryReportPrint({ zone, shelves, racks, loads, generatedAt }: BayInventoryReportPrintProps) {
  return (
    <div className="space-y-8 bg-white p-12 text-black">
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">LOADING BAY INVENTORY REPORT</h1>
        <p className="text-sm text-gray-600">
          Physical verification checklist — {zone.name} ({zone.id})
        </p>
        <p className="text-xs text-gray-500 mt-1">Generated {new Date(generatedAt).toLocaleString()}</p>
      </div>

      <ReportSection title={zone.name} zones={[zone]} shelves={shelves} racks={racks} loads={loads} />
    </div>
  );
}

function ReportSection({
  title,
  zones,
  shelves,
  racks,
  loads,
}: {
  title: string;
  zones: Zone[];
  shelves: Shelf[];
  racks: Rack[];
  loads: Load[];
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-4 border-b border-black pb-2">{title}</h2>
      <div className="space-y-6">
        {zones.map((zone) => {
          const zoneShelves = shelves.filter((s) => s.zoneId === zone.id);
          return (
            <div key={zone.id}>
              <h3 className="font-semibold mb-2">
                {zone.name} <span className="text-xs font-mono text-gray-500">({zone.id})</span>
                {zone.requiresRefrigeration && <span className="text-xs text-gray-600"> — Refrigerated</span>}
              </h3>
              {zoneShelves.map((shelf) => {
                const shelfRacks = racks.filter((r) => r.shelfId === shelf.id);
                if (shelfRacks.length === 0) return null;
                return (
                  <div key={shelf.id} className="ml-4 mb-3" style={{ breakInside: 'avoid' }}>
                    <p className="text-xs font-semibold uppercase text-gray-600 mb-1">Shelf {shelf.index}</p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-black text-left">
                          <th className="py-1 pr-2">Rack</th>
                          <th className="py-1 pr-2">Slot</th>
                          <th className="py-1 pr-2">Pallet</th>
                          <th className="py-1 pr-2">Product</th>
                          <th className="py-1 pr-2">Qty</th>
                          <th className="py-1">Verified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shelfRacks.flatMap((rack) =>
                          rack.slots.map((slot) => {
                            const load = slot.palletId ? loads.find((l) => l.palletId === slot.palletId) : undefined;
                            return (
                              <tr key={`${rack.id}-${slot.index}`} className="border-b border-gray-300">
                                <td className="py-1 pr-2 font-mono">{rack.id}</td>
                                <td className="py-1 pr-2">{slot.index}</td>
                                <td className="py-1 pr-2 font-mono">{slot.palletId ?? '— empty —'}</td>
                                <td className="py-1 pr-2">
                                  {load ? `${load.productName} (${load.sku})` : '—'}
                                </td>
                                <td className="py-1 pr-2">{load ? load.quantity.toLocaleString() : '—'}</td>
                                <td className="py-1">
                                  <span className="inline-block h-3 w-3 border border-black" />
                                </td>
                              </tr>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
