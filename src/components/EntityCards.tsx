import type { BayRack, Truck } from '../types/domain';
import { StatusPill } from './StatusPill';

export function BayRackCard({ bayRack, highlighted }: { bayRack: BayRack; highlighted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        highlighted ? 'border-indigo-500 bg-indigo-950/40 ring-2 ring-indigo-500/40' : 'border-slate-800 bg-slate-900'
      }`}
    >
      <span className="font-semibold text-slate-200">{bayRack.name}</span>
      {bayRack.palletId ? (
        <span className="font-mono text-xs text-slate-400">{bayRack.palletId}</span>
      ) : (
        <StatusPill status="Empty" />
      )}
    </div>
  );
}

export function TruckCard({ truck }: { truck: Truck }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div>
        <div className="font-semibold text-slate-200">{truck.id}</div>
        <div className="text-xs text-slate-500">
          {truck.plate} · {truck.dispatchLine}
        </div>
        {truck.tempDispatchBarcode && (
          <div className="mt-0.5 font-mono text-xs text-indigo-400">{truck.tempDispatchBarcode}</div>
        )}
      </div>
      <StatusPill status={truck.status} />
    </div>
  );
}
