import type { Department } from '../types/domain';
import { PALLET_CAPACITY } from './seed';

export interface ProductDef {
  sku: string;
  name: string;
  unitsPerPallet: number;
  department: Department;
}

// Per-product pallet fill quantities — different container sizes fill a
// pallet at different counts, unlike the old flat 100-units-for-everything
// assumption. Each product belongs to a department for task-routing purposes.
export const PRODUCTS: ProductDef[] = [
  { sku: 'RINA1L', name: 'Rina 1L', unitsPerPallet: 100, department: 'Oil & Refinery' },
  { sku: 'TOSS500G', name: 'Toss 500g', unitsPerPallet: 80, department: 'Soap' },
  { sku: 'PRESTIGE500G', name: 'Prestige 500g', unitsPerPallet: 150, department: 'Oil & Refinery' },
];

export function unitsPerPallet(sku: string): number {
  return PRODUCTS.find((p) => p.sku === sku)?.unitsPerPallet ?? PALLET_CAPACITY;
}

// Real GS1/EAN-13 barcodes off actual Kapa Oil cartons, aliased to the demo's
// internal SKU codes — the camera scanner (ScanInput) already decodes EAN-13,
// so a live demo can hold up the physical carton instead of the printed
// Code128 label and still resolve to the right product.
const REAL_BARCODE_ALIASES: Record<string, string> = {
  '6161101661253': 'RINA1L', // Rina Veg 5 Litres carton
  '6161101660058': 'TOSS500G', // Toss 500g soap carton
  '6161101660225': 'PRESTIGE500G', // Prestige 500g carton
};

export function resolveScannedSku(code: string): string {
  const trimmed = code.trim();
  return REAL_BARCODE_ALIASES[trimmed] ?? trimmed;
}
