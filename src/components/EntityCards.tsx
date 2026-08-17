import type { Truck } from '../types/domain';
import { StatusPill } from './StatusPill';

export function TruckCard({ truck }: { truck: Truck }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div>
        <div className="font-semibold text-slate-200">{truck.id}</div>
        <div className="text-xs text-slate-500">
          {truck.plate} · {truck.dispatchLine}
        </div>
        {truck.salesOrderId && (
          <div className="mt-0.5 font-mono text-xs text-indigo-400">{truck.salesOrderId}</div>
        )}
      </div>
      <StatusPill status={truck.status} />
    </div>
  );
}
