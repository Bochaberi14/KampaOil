import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  height?: number;
  fontSize?: number;
  barWidth?: number;
}

// Renders a phone-scannable Code128 barcode optimized for mobile camera scanning
// Improvements: thicker bars, larger size, bigger margins, high contrast (black on white)
export function Barcode({ value, height = 80, fontSize = 14, barWidth = 2.5 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      width: barWidth, // Thicker bars for phone/webcam cameras
      height,
      fontSize,
      margin: 15, // Larger margins to reduce glare/edge issues
      background: '#ffffff',
      lineColor: '#000000',
      displayValue: true,
      textMargin: 6,
    });
  }, [value, height, fontSize, barWidth]);

  return (
    <div className="flex justify-center bg-white p-4 rounded-lg">
      <svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto' }} />
    </div>
  );
}
