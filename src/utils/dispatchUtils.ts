import { PRODUCTS } from '../data/products';
import { USERS } from '../data/seed';
import type { Department, User } from '../types/domain';

/**
 * Get all pickers from a specific department.
 * Used to filter picker assignment UI based on a product's department.
 */
export function getPickersForDepartment(department: Department): User[] {
  return USERS.filter((u) => u.role === 'Picker' && u.department === department);
}

/**
 * Get the department for a product by SKU.
 */
export function getProductDepartment(sku: string): Department | undefined {
  return PRODUCTS.find((p) => p.sku === sku)?.department;
}

/**
 * Check if a picker can be assigned to a sales order based on department matching.
 */
export function isPickerCompatibleWithSku(pickerId: string, sku: string): boolean {
  const picker = USERS.find((u) => u.id === pickerId);
  if (!picker || picker.role !== 'Picker') return false;

  const productDept = getProductDepartment(sku);
  if (!productDept) return true; // Product not found, allow assignment

  return picker.department === productDept;
}

/**
 * Smart dispatch suggestion: calculates available quantities from bay, storage, and production.
 * Priority order: Bay → Storage → Production
 * Helps the Loader understand what's available before requesting from each source.
 */
export interface DirectDispatchSuggestion {
  sku: string;
  needed: number;
  fromBay: number;
  fromStorage: number;
  fromProduction: number;
  totalAvailable: number;
  summary: string;
}

/**
 * Calculate smart dispatch quantities from available sources.
 * Returns a breakdown of what can be fulfilled from each source in priority order.
 */
export function calculateSmartDispatchSuggestion(
  sku: string,
  neededQty: number,
  bayAvailable: number,
  storageAvailable: number,
  productionAvailable: number,
): DirectDispatchSuggestion {
  // Priority: Bay → Storage → Production
  let fromBay = Math.min(bayAvailable, neededQty);
  let remaining = neededQty - fromBay;

  let fromStorage = Math.min(storageAvailable, remaining);
  remaining -= fromStorage;

  let fromProduction = Math.min(productionAvailable, remaining);

  const totalAvailable = bayAvailable + storageAvailable + productionAvailable;
  const canFulfill = fromBay + fromStorage + fromProduction === neededQty;

  // Build human-readable summary
  const parts: string[] = [];
  if (fromBay > 0) parts.push(`${fromBay.toLocaleString()} from bay`);
  if (fromStorage > 0) parts.push(`${fromStorage.toLocaleString()} from storage`);
  if (fromProduction > 0) parts.push(`${fromProduction.toLocaleString()} from production`);

  let summary = '';
  if (canFulfill) {
    summary = `Can fulfill all ${neededQty.toLocaleString()} units: ${parts.join(' + ')}`;
  } else {
    const shortfall = neededQty - (fromBay + fromStorage + fromProduction);
    summary = `Short by ${shortfall.toLocaleString()} units. Available: ${parts.length > 0 ? parts.join(' + ') : 'none'}`;
  }

  return {
    sku,
    needed: neededQty,
    fromBay,
    fromStorage,
    fromProduction,
    totalAvailable,
    summary,
  };
}

/**
 * Format the suggestion for display in the UI.
 */
export function formatDispatchSuggestion(suggestion: DirectDispatchSuggestion): {
  lines: string[];
  isShortfall: boolean;
} {
  const isShortfall =
    suggestion.fromBay + suggestion.fromStorage + suggestion.fromProduction < suggestion.needed;

  const lines = [
    `Need: ${suggestion.needed.toLocaleString()} units of ${suggestion.sku}`,
    `• Bay: ${suggestion.fromBay.toLocaleString()} units available`,
    `• Storage: ${suggestion.fromStorage.toLocaleString()} units available`,
    `• Production: ${suggestion.fromProduction.toLocaleString()} units available`,
  ];

  if (isShortfall) {
    const shortfall =
      suggestion.needed -
      (suggestion.fromBay + suggestion.fromStorage + suggestion.fromProduction);
    lines.push(`⚠ Shortfall: ${shortfall.toLocaleString()} units`);
  } else {
    lines.push(`✓ Full fulfillment possible`);
  }

  return { lines, isShortfall };
}
