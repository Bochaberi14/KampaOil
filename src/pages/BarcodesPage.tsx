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

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

// Longer IDs (e.g. rack codes like BIN-A-BAY-S-01-R-01) encode to a much wider
// Code128 barcode. In a 2-column layout that width overflows the column, and
// the SVG's `maxWidth: 100%, height: auto` scales the whole thing down to fit
// — shrinking the height along with it, which is why those labels rendered
// tiny. Give long IDs a full-width single column instead, so the barcode
// never needs to be scaled down from its requested size.
const LONG_ID_THRESHOLD = 14;

function pickLayout(ids: string[]) {
  const maxLen = ids.reduce((m, id) => Math.max(m, id.length), 0);
  if (maxLen > LONG_ID_THRESHOLD) {
    // Bar width matters more than overall size for scanability — a longer ID
    // encodes to more modules, so keeping a wider bar width than the
    // short-ID groups (not thinner) is what actually keeps it readable by a
    // webcam. Landscape + single column is what makes room for that width
    // without the SVG getting auto-shrunk; perPage is lower since the
    // tradeoff is less page height to work with.
    return { columns: 1, perPage: 3, height: 120, fontSize: 22, barWidth: 3.5 };
  }
  return { columns: 2, perPage: 6, height: 90, fontSize: 20, barWidth: 3 };
}

// One category per page (or several pages, for long lists), a handful of
// large labels per page so each barcode has room to be scanned reliably by a
// webcam.
function PrintPages({ title, ids }: LabelGroup) {
  const { columns, perPage, height, fontSize, barWidth } = pickLayout(ids);
  const pages = chunk(ids, perPage);
  return (
    <>
      {pages.map((pageIds, i) => (
        <div key={i} className={`print-page${columns === 1 ? ' print-page-wide' : ''}`}>
          <h2 className="mb-4 text-lg font-bold">
            {title}
            {pages.length > 1 ? ` (page ${i + 1} of ${pages.length})` : ''}
          </h2>
          <div className={`grid gap-6 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {pageIds.map((id) => (
              <div
                key={id}
                className="print-label flex items-center justify-center border border-dashed border-slate-400 p-3"
              >
                <Barcode value={id} height={height} fontSize={fontSize} barWidth={barWidth} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
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
          <div>
            {groups.map((g) => (
              <PrintPages key={g.title} title={g.title} ids={g.ids} />
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
