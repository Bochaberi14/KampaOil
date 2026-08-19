import type { DispatchVerification } from '../types/domain';
import { unitsPerPallet } from '../data/products';

interface DispatchManifestProps {
  verification: DispatchVerification;
  loaderName: string;
}

export function DispatchManifest({ verification, loaderName }: DispatchManifestProps) {
  const palletCount = verification.palletIds.length;

  return (
    <div className="space-y-6 bg-white p-12 text-black">
      {/* Header */}
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">DISPATCH MANIFEST</h1>
        <p className="text-sm text-gray-600">Goods Handover & Verification Record</p>
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
        <div>
          <p className="font-semibold">Vehicle Registration</p>
          <p className="text-lg font-mono">{verification.truckId}</p>
        </div>
        <div>
          <p className="font-semibold">Dispatch Line</p>
          <p className="text-lg">{verification.dispatchLine}</p>
        </div>
      </div>

      {/* Products with Pallet Count */}
      <div>
        <h2 className="font-semibold mb-3 border-b border-black pb-2">Products Being Dispatched</h2>
        <div className="space-y-3">
          {verification.products.map((product) => {
            const pallets = Math.ceil(product.pickedQty / unitsPerPallet(product.sku));
            return (
              <div key={product.sku} className="grid grid-cols-4 gap-4 text-sm py-2 border-b border-gray-300">
                <div>
                  <p className="font-medium">{product.productName}</p>
                  <p className="text-xs text-gray-600">{product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{pallets} pallets</p>
                  <p className="text-xs text-gray-600">{product.pickedQty} units</p>
                </div>
                <div className="text-right">
                  <p className="text-xs">Ordered: {product.orderedQty}</p>
                  <p className="text-xs">Released: {product.releasedQty}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs">Picked: {product.pickedQty}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Release Items Checklist */}
      <div>
        <h2 className="font-semibold mb-3 border-b border-black pb-2">Released Items Checklist</h2>
        <div className="space-y-2">
          {verification.products.map((product) => {
            const pallets = Math.ceil(product.pickedQty / unitsPerPallet(product.sku));
            return (
              <div key={product.sku} className="flex items-start gap-3 text-sm py-1">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 cursor-pointer"
                  style={{ accentColor: '#000' }}
                />
                <div className="flex-1">
                  <p className="font-medium">{product.productName}</p>
                  <p className="text-xs text-gray-600">
                    {product.pickedQty} units ({pallets} pallets) of {product.releasedQty} released
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pallet Summary */}
      <div className="bg-gray-100 p-4 rounded">
        <p className="text-sm">
          <strong>Total Pallets:</strong> {palletCount} pallets
        </p>
        <p className="text-xs text-gray-600 mt-1">Pallet IDs: {verification.palletIds.join(', ')}</p>
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
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" style={{ accentColor: '#000' }} />
              Pallet IDs match manifest ✓
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
