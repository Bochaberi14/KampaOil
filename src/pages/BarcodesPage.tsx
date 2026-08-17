import { useWarehouseStore } from '../store/useWarehouseStore';
import { Barcode } from '../components/Barcode';
import { PrintSheet } from '../components/PrintSheet';
import { PRODUCTS } from '../data/products';
import { DISPATCH_LINE } from '../data/seed';

interface LabelGroup {
  title: string;
  ids: string[];
  note?: string;
}

function ScreenGrid({ title, ids, note }: LabelGroup) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {note && <p className="mb-3 text-xs text-slate-600">{note}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ids.map((id) => (
          <div key={id} className="flex items-center justify-center rounded-lg border border-slate-800 bg-white p-2">
            <Barcode value={id} height={36} fontSize={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintGrid({ ids }: { ids: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {ids.map((id) => (
        <div key={id} className="flex items-center justify-center border border-dashed border-slate-400 p-2">
          <Barcode value={id} height={40} fontSize={12} />
        </div>
      ))}
    </div>
  );
}

// Pre-printed, camera-scannable Code128 labels for every pallet, rack, and
// production line — lets a live demo scan real physical labels end to end
// (production -> storage -> loading bay -> dispatch) instead of typing IDs.
export function BarcodesPage() {
  const lines = useWarehouseStore((s) => s.lines);
  const pallets = useWarehouseStore((s) => s.pallets);
  const racks = useWarehouseStore((s) => s.racks);
  const bayRacks = useWarehouseStore((s) => s.bayRacks);
  const trucks = useWarehouseStore((s) => s.trucks);

  const groups: LabelGroup[] = [
    { title: 'Production lines', ids: lines.map((l) => l.id) },
    {
      title: 'Products',
      ids: PRODUCTS.map((p) => p.sku),
      note: 'The real Kapa Oil carton barcode also works for each: RINA1L (Rina Veg 5L), KASUKU1KG (Kasuku), PRESTIGE500G (Prestige).',
    },
    { title: 'Pallets', ids: pallets.map((p) => p.id) },
    { title: 'Storage racks', ids: racks.map((r) => r.id) },
    { title: 'Loading bay racks', ids: bayRacks.map((b) => b.id) },
    { title: 'Vehicles', ids: trucks.map((t) => t.plate) },
    { title: 'Dispatch lines', ids: [DISPATCH_LINE] },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Barcode labels</h1>
          <p className="text-sm text-slate-400">
            Every ID the app knows about, as a real Code128 barcode — print these onto labels and
            stick them on physical pallets/racks, or just point a phone camera at this screen, to
            scan the demo end to end instead of typing codes.
          </p>
        </div>
        <PrintSheet title="Kapa Oil WMS — Barcode labels" triggerLabel="Print all as labels">
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.title}>
                <h2 className="mb-2 text-sm font-semibold">{g.title}</h2>
                <PrintGrid ids={g.ids} />
              </div>
            ))}
          </div>
        </PrintSheet>
      </div>

      {groups.map((g) => (
        <ScreenGrid key={g.title} title={g.title} ids={g.ids} />
      ))}
    </div>
  );
}
