import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  height?: number;
  fontSize?: number;
}

// Renders a real, camera-scannable Code128 barcode (black-on-white,
// regardless of the surrounding dark theme — scanners need the contrast).
export function Barcode({ value, height = 40, fontSize = 12 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, value, {
      format: 'CODE128',
      height,
      fontSize,
      margin: 6,
      background: '#ffffff',
      lineColor: '#000000',
      displayValue: true,
    });
  }, [value, height, fontSize]);

  return <svg ref={svgRef} />;
}
