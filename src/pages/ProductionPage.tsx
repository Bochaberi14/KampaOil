import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { PALLET_CAPACITY } from '../data/seed';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import type { Line, ProductionOrder } from '../types/domain';

type Step = 'line' | 'pallet' | 'quantity';

export function ProductionPage() {
  const lines = useWarehouseStore((s) => s.lines);
  const pallets = useWarehouseStore((s) => s.pallets);
  const productionOrders = useWarehouseStore((s) => s.productionOrders);
  const scanLine = useWarehouseStore((s) => s.scanLine);
  const scanPalletForLoad = useWarehouseStore((s) => s.scanPalletForLoad);
  const confirmLoad = useWarehouseStore((s) => s.confirmLoad);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [step, setStep] = useState<Step>('line');
  const [selectedLine, setSelectedLine] = useState<Line | null>(null);
  const [selectedPO, setSelectedPO] = useState<ProductionOrder | null>(null);
  const [selectedPallet, setSelectedPallet] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');

  const emptyPallets = pallets.filter((p) => p.status === 'Empty').map((p) => p.id);

  function handleScanLine(lineId: string) {
    const result = scanLine(lineId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSelectedLine(result.data.line);
    setSelectedPO(result.data.productionOrder);
    setStep('pallet');
  }

  function handleScanPallet(palletId: string) {
    const result = scanPalletForLoad(palletId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSelectedPallet(palletId);
    setStep('quantity');
  }

  function handleConfirm() {
    if (!selectedLine || !selectedPallet || !currentUser) return;
    const qty = Number(quantity);
    const result = confirmLoad({
      lineId: selectedLine.id,
      palletId: selectedPallet,
      quantity: qty,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSelectedPallet(null);
    setQuantity('');
    if (result.data.poComplete) {
      setStep('line');
      setSelectedLine(null);
      setSelectedPO(null);
    } else {
      setStep('pallet');
    }
  }

  function reset() {
    setStep('line');
    setSelectedLine(null);
    setSelectedPO(null);
    setSelectedPallet(null);
    setQuantity('');
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-xl font-bold text-white">Stage 1 · Production</h1>
          <p className="text-sm text-slate-400">
            Scan the line, bind an empty pallet, then confirm the load once it's full.
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <StepDot active={step === 'line'} done={!!selectedLine} label="1. Scan line" />
            <StepDot active={step === 'pallet'} done={!!selectedPallet} label="2. Scan pallet" />
            <StepDot active={step === 'quantity'} done={false} label="3. Confirm quantity" />
          </div>

          {step === 'line' && (
            <ScanInput
              label="Scan line barcode"
              placeholder="e.g. L001"
              onScan={handleScanLine}
              suggestions={lines.map((l) => l.id)}
            />
          )}

          {step !== 'line' && selectedLine && selectedPO && (
            <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-sm">
              <Row label="Line" value={`${selectedLine.name} (${selectedLine.id})`} />
              <Row label="Production order" value={selectedPO.id} />
              <Row label="Product" value={selectedPO.productName} />
              <Row
                label="Progress"
                value={`${selectedPO.fulfilledQty.toLocaleString()} / ${selectedPO.targetQty.toLocaleString()} units`}
              />
            </div>
          )}

          {step === 'pallet' && (
            <ScanInput
              label="Scan empty pallet barcode"
              placeholder="e.g. PLT-001"
              onScan={handleScanPallet}
              suggestions={emptyPallets.slice(0, 8)}
            />
          )}

          {step === 'quantity' && selectedPallet && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Pallet <span className="font-mono font-semibold text-slate-100">{selectedPallet}</span>{' '}
                bound. Enter the quantity to confirm the load — it only confirms once the pallet is full
                (<strong className="text-slate-100">{PALLET_CAPACITY} units</strong>).
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`${PALLET_CAPACITY}`}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <button
                  onClick={handleConfirm}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Confirm load
                </button>
              </div>
            </div>
          )}

          {step !== 'line' && (
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300">
              Cancel / start over
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lines</h2>
        {lines.map((line) => {
          const po =
            productionOrders.find((p) => p.id === line.activeProductionOrderId) ??
            productionOrders.find((p) => p.lineId === line.id && p.status === 'Open');
          return (
            <div key={line.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{line.name}</span>
                <StatusPill status={line.status} />
              </div>
              {po && (
                <div className="mt-2 text-xs text-slate-400">
                  <div>
                    {po.productName} — {po.id}
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, (po.fulfilledQty / po.targetQty) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1">
                    {po.fulfilledQty.toLocaleString()} / {po.targetQty.toLocaleString()} units
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 ${
        active
          ? 'bg-indigo-500/15 text-indigo-300'
          : done
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-slate-800 text-slate-500'
      }`}
    >
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-200">{value}</span>
    </div>
  );
}
