import type { DispatchVerification } from '../types/domain';

interface HandoverVerificationDocumentProps {
  verification: DispatchVerification;
  loaderName: string;
}

export function HandoverVerificationDocument({
  verification,
  loaderName,
}: HandoverVerificationDocumentProps) {
  const signedDate = verification.loaderSignedAt
    ? new Date(verification.loaderSignedAt).toLocaleString()
    : '__________________';

  return (
    <div className="space-y-8 bg-white p-12 text-black print-sheet-content">
      {/* Header */}
      <div className="border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">HANDOVER VERIFICATION RECORD</h1>
        <p className="text-sm text-gray-600">Dispatch Completion & Traceability Document</p>
      </div>

      {/* Order Details */}
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

      {/* Products & Pallets */}
      <div>
        <h2 className="font-semibold mb-3 border-b border-black pb-2">Products Dispatched</h2>
        <div className="space-y-2">
          {verification.products.map((product) => (
            <div key={product.sku} className="text-sm py-1 border-b border-gray-300">
              <p className="font-medium">{product.productName}</p>
              <p className="text-xs text-gray-600">
                Ordered: {product.orderedQty} | Released: {product.releasedQty} | Picked: {product.pickedQty}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pallet Information */}
      <div>
        <h2 className="font-semibold mb-2 border-b border-black pb-2">Pallet IDs</h2>
        <p className="text-sm font-mono text-gray-700">{verification.palletIds.join(', ')}</p>
        <p className="text-xs text-gray-600 mt-1">Total: {verification.palletIds.length} pallets</p>
      </div>

      {/* Handover Sign-off Section */}
      <div className="mt-8 border-t-2 border-black pt-6">
        <h2 className="text-lg font-bold mb-6">HANDOVER SIGN-OFF</h2>

        <div className="grid grid-cols-2 gap-8">
          {/* Loader Section */}
          <div>
            <h3 className="font-semibold mb-4 text-base">Warehouse Loader</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Name</p>
                <p className="text-sm font-medium">{loaderName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Signature</p>
                <div className="w-full h-16 border-b-2 border-black"></div>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Date & Time</p>
                <p className="text-sm font-mono">{signedDate}</p>
              </div>
            </div>
          </div>

          {/* Driver Section */}
          <div>
            <h3 className="font-semibold mb-4 text-base">Vehicle Driver</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Name</p>
                <p className="text-sm font-medium">{verification.driverName || '___________________'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Signature</p>
                <div className="w-full h-16 border-b-2 border-black"></div>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Date & Time</p>
                <p className="text-sm font-mono">___________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Statements */}
      <div className="mt-8 space-y-4 text-xs">
        <p className="font-semibold">Confirmation Statements:</p>
        <p>
          <strong>Loader:</strong> I confirm that all products listed above have been counter-checked against
          the manifest, verified for quantity and condition, and are ready for handover.
        </p>
        <p>
          <strong>Driver:</strong> I confirm that I have received all goods listed above and verified their
          quantity and condition as satisfactory.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-8 text-xs text-gray-600 border-t pt-4">
        <p>Document generated: {new Date().toLocaleString()}</p>
        <p>Vehicle Barcode: {verification.vehicleBarcode}</p>
        <p className="mt-2">
          This document serves as proof of handover and completes the warehouse dispatch workflow from
          production to vehicle loading.
        </p>
      </div>
    </div>
  );
}
