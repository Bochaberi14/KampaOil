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
  return (
    <div className="space-y-6 bg-white p-12 text-black print-sheet-content">
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-2xl font-bold">VEHICLE BARCODE</h1>
        <p className="text-sm text-gray-600">Dispatch Verification Code</p>
      </div>

      {/* Order Info */}
      <div className="text-center space-y-2 mt-6">
        <p className="text-sm">
          <strong>Sales Order:</strong> {salesOrderId}
        </p>
        <p className="text-sm">
          <strong>Customer:</strong> {customerName}
        </p>
        <p className="text-sm">
          <strong>Vehicle:</strong> {vehiclePlate}
        </p>
        <p className="text-sm">
          <strong>Dispatch Line:</strong> {dispatchLine}
        </p>
      </div>

      {/* Barcode */}
      <div className="flex justify-center py-8">
        <div className="text-center">
          <Barcode value={vehicleBarcode} height={50} fontSize={14} />
          <p className="text-xs mt-2 text-gray-600 font-mono">{vehicleBarcode}</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t pt-4">
        <p>Scan this barcode to verify vehicle and authorize dispatch</p>
      </div>
    </div>
  );
}
