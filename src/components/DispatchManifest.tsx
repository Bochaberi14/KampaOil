import type { DispatchVerification, SalesOrderRelease } from '../types/domain';
import { unitsPerPallet } from '../data/products';

interface DispatchManifestProps {
  verification: DispatchVerification;
  loaderName: string;
  // The registered vehicle's plate/driver (from Truck) — verification only
  // stores a truckId, not these, so the caller resolves and passes them.
  vehiclePlate: string;
  driverName: string | null;
  // Distinguishes which slice of the order's release history this printout
  // covers — e.g. "This release" (default, just the newest batch) vs "Full
  // order — all releases to date" (the optional all-inclusive reprint).
  subtitle?: string;
  // All of this order's release events (any truck), for the all-inclusive
  // view only — lets it show each product's total broken down by the actual
  // batches it was released in, rather than one combined number that hides
  // that the order went out in stages.
  releases?: SalesOrderRelease[];
  // Every vehicle that has ever served this order (active or departed), for
  // the all-inclusive view only — an order can be split across several
  // vehicles, so that view lists them all rather than just the one
  // currently selected. When provided (and non-empty) this replaces the
  // single vehiclePlate/driverName/dispatch-line fields above.
  vehicles?: { plate: string; driverName: string | null; dispatchLine: string }[];
}

export function DispatchManifest({ verification, loaderName, vehiclePlate, driverName, subtitle, releases, vehicles }: DispatchManifestProps) {
  return (
    <div className="space-y-6 bg-white p-12 text-black">
      {/* Header */}
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">DISPATCH MANIFEST</h1>
        <p className="text-sm text-gray-600">Goods Handover & Verification Record</p>
        {subtitle && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{subtitle}</p>}
      </div>

      {/* Order & Vehicle Details */}
      <div className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-semibold">Sales Order</p>
          <p className="text-lg">{verification.salesOrderId}</p>
        </div>
        <div>
          <p className="font-semibold">Customer</p>
          <p className="text-lg">{verification.customer}</p>
        </div>
        {!vehicles || vehicles.length === 0 ? (
          <>
            <div>
              <p className="font-semibold">Vehicle Number Plate</p>
              <p className="text-lg font-mono">{vehiclePlate}</p>
            </div>
            <div>
              <p className="font-semibold">Driver</p>
              <p className="text-lg">{driverName || 'Not recorded'}</p>
            </div>
            <div>
              <p className="font-semibold">Dispatch Line</p>
              <p className="text-lg">{verification.dispatchLine}</p>
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <p className="font-semibold mb-1">
              Vehicle{vehicles.length > 1 ? 's' : ''} ({vehicles.length})
            </p>
            <div className="space-y-1">
              {vehicles.map((v, i) => (
                <p key={i} className="text-sm">
                  <span className="font-mono font-semibold">{v.plate}</span>
                  {' — '}{v.driverName || 'Driver not recorded'}
                  {' — '}{v.dispatchLine}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Released Items Checklist — kept deliberately simple: just what was
          ordered and what's been released, no pallet/staging bookkeeping.
          Each product gets its own bordered card with Ordered/Released as
          clearly separated, labeled stat blocks rather than run-on text. */}
      <div>
        <h2 className="font-semibold mb-3 border-b border-black pb-2">Released Items Checklist</h2>
        <div className="grid grid-cols-2 gap-3">
          {verification.products.map((product) => {
            // Computed only — a display convenience, not a pallet-ID/staging
            // tracker (that complexity was deliberately dropped).
            const pallets = Math.ceil(product.releasedQty / unitsPerPallet(product.sku));
            const skuReleases = releases
              ?.filter((r) => r.sku === product.sku)
              .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt));
            return (
              <div key={product.sku} className="rounded border border-gray-400 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-gray-400 bg-gray-100 px-3 py-2">
                  <input
                    type="checkbox"
                    className="w-4 h-4 cursor-pointer shrink-0"
                    style={{ accentColor: '#000' }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{product.productName}</p>
                    <p className="text-[10px] text-gray-500">{product.sku}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-300 text-center">
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Ordered</p>
                    <p className="text-lg font-semibold">{product.orderedQty.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Released</p>
                    <p className="text-lg font-bold">{product.releasedQty.toLocaleString()}</p>
                    {product.releasedQty > 0 && (
                      <p className="text-[10px] text-gray-500">{pallets} pallet{pallets === 1 ? '' : 's'}</p>
                    )}
                  </div>
                </div>
                {skuReleases && skuReleases.length > 1 && (
                  <div className="border-t border-gray-300 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Released in {skuReleases.length} batches
                    </p>
                    <div className="space-y-0.5">
                      {skuReleases.map((r, i) => (
                        <div key={r.id} className="flex justify-between text-[11px] text-gray-700">
                          <span>Batch {i + 1} — {new Date(r.releasedAt).toLocaleDateString()}</span>
                          <span className="font-medium">{r.qty.toLocaleString()} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Handover Verification Section */}
      <div className="mt-8 border-t-2 border-black pt-6">
        <h2 className="text-lg font-bold mb-6">HANDOVER SIGN-OFF</h2>

        {/* Pre-dispatch Checklist */}
        <div className="mb-6 bg-gray-50 p-4 rounded border border-gray-300">
          <p className="font-semibold text-sm mb-3">Before Dispatch Confirmation:</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" style={{ accentColor: '#000' }} />
              All products verified correct ✓
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" style={{ accentColor: '#000' }} />
              Quantity matches documentation ✓
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" style={{ accentColor: '#000' }} />
              Goods condition acceptable ✓
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Loader Section */}
          <div>
            <h3 className="font-semibold mb-4">Warehouse Loader</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-600">Name</p>
                <p className="text-sm font-medium">{loaderName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Signature</p>
                <div className="w-full h-16 border-b-2 border-black"></div>
              </div>
              <div>
                <p className="text-xs text-gray-600">Date/Time</p>
                <p className="text-sm">_______________________</p>
              </div>
            </div>
          </div>

          {/* Driver Section */}
          <div>
            <h3 className="font-semibold mb-4">Vehicle Driver</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-600">Name</p>
                <p className="text-sm font-medium">{verification.driverName || '______________________'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Signature</p>
                <div className="w-full h-16 border-b-2 border-black"></div>
              </div>
              <div>
                <p className="text-xs text-gray-600">Date/Time</p>
                <p className="text-sm">_______________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="mt-8 text-xs text-gray-600 border-t pt-4">
        <p>
          Both parties confirm that all goods listed above have been counted, verified, and found to be in order.
        </p>
        <p className="mt-2">
          Loader confirms: products correct ✓ | quantity correct ✓ | condition acceptable ✓
        </p>
        <p>
          Driver confirms: received all goods ✓ | condition acceptable ✓ | departure authorized ✓
        </p>
      </div>
    </div>
  );
}
