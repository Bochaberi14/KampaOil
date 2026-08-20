import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { unitsPerPallet } from '../data/products';
import { formatStorageLocation } from '../engine/storageRecommendation';
import type { StorageRecommendation } from '../engine/storageRecommendation';
import { ScanInput } from '../components/ScanInput';
import { StatusPill } from '../components/StatusPill';
import { STORAGE_ZONES } from '../data/seed';
import type { Line, ProductionOrder } from '../types/domain';

type Step = 'line' | 'product' | 'pallet';

function getZoneForSku(sku: string) {
  // Map specific products to their zones (handles refrigeration requirements)
  const skuToZone: Record<string, string> = {
    'RINA1L': 'BIN-A',           // Oil & Refinery
    'PRESTIGE500G': 'BIN-B',     // Oil & Refinery (refrigerated)
    'KASUKU1KG': 'BIN-C',        // Oil & Refinery
  };

  const zoneId = skuToZone[sku];
  if (!zoneId) return null;

  return STORAGE_ZONES.find((z) => z.id === zoneId) || null;
}

export function ProductionPage() {
  const lines = useWarehouseStore((s) => s.lines);
  const pallets = useWarehouseStore((s) => s.pallets);
  const productionOrders = useWarehouseStore((s) => s.productionOrders);
  const salesOrders = useWarehouseStore((s) => s.salesOrders);
  const directDispatchApprovals = useWarehouseStore((s) => s.directDispatchApprovals);
  const scanLine = useWarehouseStore((s) => s.scanLine);
  const scanProductForLine = useWarehouseStore((s) => s.scanProductForLine);
  const scanPalletForLoad = useWarehouseStore((s) => s.scanPalletForLoad);
  const confirmLoad = useWarehouseStore((s) => s.confirmLoad);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [step, setStep] = useState<Step>('line');
  const [selectedLine, setSelectedLine] = useState<Line | null>(null);
  const [selectedPO, setSelectedPO] = useState<ProductionOrder | null>(null);
  const [lastRecommendation, setLastRecommendation] = useState<StorageRecommendation | null>(null);
  const [lastPalletIsDirectDispatch, setLastPalletIsDirectDispatch] = useState(false);

  const emptyPallets = pallets.filter((p) => p.status === 'Empty').map((p) => p.id);
  const openSkusForLine = selectedLine
    ? productionOrders
        .filter((p) => p.lineId === selectedLine.id && p.status === 'Open')
        .map((p) => p.sku)
    : [];

  function handleScanLine(lineId: string) {
    const result = scanLine(lineId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSelectedLine(result.data.line);
    setStep('product');
  }

  function handleScanProduct(productCode: string) {
    if (!selectedLine) return;
    const result = scanProductForLine({ lineId: selectedLine.id, productCode });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSelectedLine(result.data.line);
    setSelectedPO(result.data.productionOrder);
    setStep('pallet');
  }

  function handleScanPallet(palletId: string) {
    if (!selectedLine || !selectedPO || !currentUser) return;
    const result = scanPalletForLoad(palletId);
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    // Auto-confirm load with full pallet capacity
    const capacity = unitsPerPallet(selectedPO.sku);
    const confirmResult = confirmLoad({
      lineId: selectedLine.id,
      productionOrderId: selectedPO.id,
      palletId,
      quantity: capacity,
      operatorId: currentUser.id,
    });
    if (!confirmResult.ok) {
      pushToast(confirmResult.error, 'error');
      return;
    }

    // This pallet's SKU may be covered by an approved Production Direct
    // order — if so it'll skip storage entirely, so don't show a storage
    // recommendation the picker would otherwise (wrongly) act on.
    const isDirectDispatch = directDispatchApprovals.some((a) => {
      if (a.source !== 'Production' || a.status !== 'Approved') return false;
      const so = salesOrders.find((s) => s.id === a.salesOrderId);
      return !!so && so.sku === selectedPO.sku && so.dispatchedQty < so.qty;
    });
    setLastPalletIsDirectDispatch(isDirectDispatch);

    const updatedPallet = useWarehouseStore.getState().pallets.find((p) => p.id === palletId);
    if (!isDirectDispatch && updatedPallet?.recommendedStorageLocation) {
      setLastRecommendation(updatedPallet.recommendedStorageLocation);
    } else {
      setLastRecommendation(null);
    }

    if (confirmResult.data.poComplete) {
      setStep('line');
      setSelectedLine(null);
      setSelectedPO(null);
      setLastRecommendation(null);
      setLastPalletIsDirectDispatch(false);
    } else {
      setStep('pallet');
    }
  }

  function reset() {
    setStep('line');
    setSelectedLine(null);
    setSelectedPO(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-xl font-bold text-white">Stage 1 · Production</h1>
          <p className="text-sm text-slate-400">
            Scan the line, then scan the product running on it. When you scan a pallet, the load
            auto-confirms at full capacity — a Picker is immediately assigned to transport it to storage.
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <StepDot active={step === 'line'} done={!!selectedLine} label="1. Scan line" />
            <StepDot active={step === 'product'} done={!!selectedPO} label="2. Scan product" />
            <StepDot active={step === 'pallet'} done={false} label="3. Scan pallet (auto-confirm)" />
          </div>

          {step === 'line' && (
            <ScanInput
              label="Scan line barcode"
              placeholder="e.g. L001"
              onScan={handleScanLine}
              suggestions={lines.map((l) => l.id)}
            />
          )}

          {step === 'product' && selectedLine && (
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                Line <span className="font-mono font-semibold text-slate-100">{selectedLine.id}</span>{' '}
                — scan the product that's actually running on it right now.
              </p>
              <ScanInput
                label="Scan product barcode"
                placeholder="e.g. RINA1L"
                onScan={handleScanProduct}
                suggestions={openSkusForLine}
              />
              <p className="text-xs text-slate-600">
                Scans the printed product label or the real carton's own barcode.
              </p>
            </div>
          )}

          {step === 'pallet' && selectedLine && selectedPO && (
            <>
              <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-800/60 p-4 text-sm">
                <Row label="Line" value={`${selectedLine.name} (${selectedLine.id})`} />
                <Row label="Production order" value={selectedPO.id} />
                <Row label="Product" value={selectedPO.productName} />
                <Row label="Pallet capacity" value={`${unitsPerPallet(selectedPO.sku)} units`} />
                <Row
                  label="Progress"
                  value={`${selectedPO.fulfilledQty.toLocaleString()} / ${selectedPO.targetQty.toLocaleString()} units`}
                />
              </div>

              {(() => {
                const productionDirectApprovals = directDispatchApprovals.filter(
                  (a) => a.source === 'Production' && a.status === 'Approved'
                );
                if (productionDirectApprovals.length > 0) {
                  const orders = productionDirectApprovals
                    .map((a) => salesOrders.find((s) => s.id === a.salesOrderId))
                    .filter(Boolean) as any[];
                  return (
                    <div className="rounded-lg bg-green-900/20 border border-green-800/50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-300 mb-2">
                        ⚡ Production Direct Dispatch Active
                      </p>
                      <p className="text-xs text-green-100">
                        Upcoming pallets will route directly to dispatch for: {orders.map((o) => o.id).join(', ')}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              {lastPalletIsDirectDispatch && (
                <div className="rounded-lg bg-green-900/20 border border-green-800/50 p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-300 mb-2">
                    ⚡ Move direct to dispatch
                  </p>
                  <p className="text-xs text-green-100">
                    Do not move this pallet to storage — a Storage Picker will scan it leaving the line, then
                    confirm arrival at the loading bay, then straight to dispatch.
                  </p>
                </div>
              )}

              {!lastPalletIsDirectDispatch && lastRecommendation && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300 mb-2">
                    ✓ Move to
                  </p>
                  <div className="bg-emerald-900/20 rounded px-3 py-2">
                    <p className="text-emerald-100 font-mono font-semibold">
                      {formatStorageLocation(lastRecommendation)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Hand picker will move this pallet to this location
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'pallet' && (
            <ScanInput
              label="Scan empty pallet barcode"
              placeholder="e.g. PLT-001"
              onScan={handleScanPallet}
              suggestions={emptyPallets.slice(0, 8)}
            />
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
                <div className="mt-2 text-xs text-slate-400 space-y-2">
                  <div>
                    {po.productName} — {po.id}
                  </div>

                  {(() => {
                    const zone = getZoneForSku(po.sku);
                    if (zone) {
                      return (
                        <div className="rounded px-2 py-1 bg-indigo-500/15 border border-indigo-500/30">
                          <span className="text-indigo-300 font-semibold">{zone.id}</span>
                          <span className="text-indigo-200"> — {zone.name}</span>
                          {zone.requiresRefrigeration && <span className="text-blue-300 ml-1">❄</span>}
                        </div>
                      );
                    }
                    return null;
                  })()}

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
