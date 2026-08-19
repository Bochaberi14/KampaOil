import { Barcode } from './Barcode';

interface VehicleBarcodePageProps {
  vehicleBarcode: string;
  vehiclePlate: string;
  salesOrderId: string;
  customerName: string;
  dispatchLine: string;
}

export function VehicleBarcodePage({
  vehicleBarcode,
  vehiclePlate,
  salesOrderId,
  customerName,
  dispatchLine,
}: VehicleBarcodePageProps) {
  if (!vehicleBarcode) {
    return (
      <div className="space-y-6 bg-white p-12 text-black">
        <p className="text-red-600">Error: Vehicle barcode not generated</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 bg-white p-12 text-black" style={{ pageBreakAfter: 'always' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-3xl font-bold">VEHICLE BARCODE</h1>
        <p className="text-sm text-gray-600">Dispatch Verification Code</p>
      </div>

      {/* Order Info */}
      <div className="text-center space-y-3 mt-6">
        <p className="text-sm">
          <strong>Sales Order ID:</strong> {salesOrderId}
        </p>
        <p className="text-sm">
          <strong>Customer:</strong> {customerName}
        </p>
        <p className="text-sm">
          <strong>Vehicle Registration:</strong> {vehiclePlate}
        </p>
        <p className="text-sm">
          <strong>Dispatch Line:</strong> {dispatchLine}
        </p>
      </div>

      {/* Barcode Display */}
      <div className="flex justify-center py-12 bg-gray-50 rounded">
        <div className="text-center">
          <Barcode value={vehicleBarcode} height={80} fontSize={16} />
          <p className="text-xs mt-4 text-gray-700 font-mono font-bold">{vehicleBarcode}</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-sm text-gray-600 border-t-2 border-black pt-6">
        <p className="font-semibold mb-2">⚠️ Instructions:</p>
        <p>1. Scan this barcode to verify the vehicle and authorize dispatch</p>
        <p>2. Driver must present this document at the loading dock</p>
        <p>3. Keep this document with the handover manifest</p>
      </div>
    </div>
  );
}
