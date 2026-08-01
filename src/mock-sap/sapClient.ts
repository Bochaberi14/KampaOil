import {
  INITIAL_PRODUCTION_ORDERS,
  INITIAL_SALES_ORDERS,
} from '../data/seed';
import type { ProductionOrder, SalesOrder } from '../types/domain';

// Stand-in for a real SAP connector (RFC/IDoc/OData). Same shape as what
// M1 scoping will replace this with, so swapping it out later shouldn't
// touch the store or UI.
const FAKE_LATENCY_MS = 600;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchProductionOrders(): Promise<ProductionOrder[]> {
  await delay(FAKE_LATENCY_MS);
  return INITIAL_PRODUCTION_ORDERS;
}

export async function fetchSalesOrders(): Promise<SalesOrder[]> {
  await delay(FAKE_LATENCY_MS);
  return INITIAL_SALES_ORDERS;
}

export interface DispatchConfirmation {
  salesOrderId: string;
  truckId: string;
  palletIds: string[];
  qty: number;
  dispatchedAt: string;
}

export async function postDispatchConfirmation(
  _confirmation: DispatchConfirmation,
): Promise<{ ok: true; sapDocNumber: string }> {
  await delay(FAKE_LATENCY_MS);
  return { ok: true, sapDocNumber: `SAP-DOC-${Date.now()}` };
}

// Generic stand-in for every other warehouse transaction (storage, picking,
// holds, recall, direct-dispatch approval, driver confirmation) that the spec
// requires to sync to SAP. Same shape/latency as postDispatchConfirmation.
export async function postGenericTransaction(
  _type: string,
  _payload: unknown,
): Promise<{ ok: true; sapDocNumber: string }> {
  await delay(FAKE_LATENCY_MS);
  return { ok: true, sapDocNumber: `SAP-DOC-${Date.now()}` };
}
