import { useState } from 'react';
import { useWarehouseStore } from '../store/useWarehouseStore';
import { PRODUCTS } from '../data/products';
import { DEPARTMENTS } from '../data/seed';
import { canViewReturn } from '../rbac';
import type { Department } from '../types/domain';

const MAX_PHOTO_WIDTH = 800;

// Downscale the captured photo before it goes into the (localStorage-
// persisted) store — raw Android camera photos are often 3000px+ and several
// MB, which would burn through the ~5-10MB localStorage quota fast across
// even a handful of demo return entries.
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode photo'));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ReturnsPage() {
  const customerReturns = useWarehouseStore((s) => s.customerReturns);
  const logCustomerReturn = useWarehouseStore((s) => s.logCustomerReturn);
  const reviewAndDecideReturn = useWarehouseStore((s) => s.reviewAndDecideReturn);
  const actionReturnDecision = useWarehouseStore((s) => s.actionReturnDecision);
  const pushToast = useWarehouseStore((s) => s.pushToast);
  const currentUser = useWarehouseStore((s) => s.currentUser);

  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [remark, setRemark] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [reviewingReturnId, setReviewingReturnId] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<'Scrap' | 'Restock' | 'Replace' | ''>('');

  const selectedProduct = PRODUCTS.find((p) => p.sku === sku) ?? null;

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingPhoto(true);
    try {
      const dataUrl = await downscaleImage(file);
      setPhotoDataUrl(dataUrl);
    } catch {
      pushToast('Could not process the photo — try again', 'error');
    } finally {
      setProcessingPhoto(false);
    }
  }

  function handleSubmit() {
    if (!currentUser || !selectedProduct || !department) return;
    const parsedQty = Number(qty);
    const result = logCustomerReturn({
      sku: selectedProduct.sku,
      productName: selectedProduct.name,
      qty: parsedQty,
      department,
      remark,
      photoDataUrl,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setSku('');
    setQty('');
    setDepartment('');
    setRemark('');
    setPhotoDataUrl(null);
  }

  function handleDecideReturn() {
    if (!currentUser || !reviewingReturnId || !selectedDecision) return;
    const result = reviewAndDecideReturn({
      returnId: reviewingReturnId,
      decision: selectedDecision as 'Scrap' | 'Restock' | 'Replace',
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
    setReviewingReturnId(null);
    setSelectedDecision('');
  }

  function handleActionReturn(returnId: string) {
    if (!currentUser) return;
    const result = actionReturnDecision({
      returnId,
      operatorId: currentUser.id,
    });
    if (!result.ok) {
      pushToast(result.error, 'error');
      return;
    }
  }

  const canSubmit =
    !!selectedProduct && Number(qty) > 0 && !!department && remark.trim().length > 0 && !processingPhoto;

  const visibleReturns = customerReturns.filter((r) => canViewReturn(currentUser ?? undefined, r));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <h1 className="text-xl font-bold text-white">Log a customer return</h1>
          <p className="text-sm text-slate-400">
            Record the product, quantity, and a photo + remark describing the defect.
          </p>
        </div>

        <div className="space-y-3">
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select a product…</option>
            {PRODUCTS.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>

          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Quantity returned"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Department responsible for this product
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select a department…</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Determines which HOD is routed this return, alongside the Factory Manager and Sales
              Manager.
            </p>
          </div>

          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Describe the defect / reason for return"
            rows={3}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Photo of the defect</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
            />
            {processingPhoto && <p className="text-xs text-slate-500">Processing photo…</p>}
            {photoDataUrl && !processingPhoto && (
              <img src={photoDataUrl} alt="Defect preview" className="max-h-40 rounded-lg border border-slate-800" />
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Log return
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Logged returns {currentUser?.department ? `— ${currentUser.department}` : ''}
        </h2>
        {visibleReturns.length === 0 && (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
            No returns logged yet.
          </p>
        )}
        {visibleReturns
          .slice()
          .reverse()
          .map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex gap-3">
                {r.photoDataUrl && (
                  <img src={r.photoDataUrl} alt="Defect" className="h-16 w-16 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200">
                      {r.qty} × {r.productName}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                        {r.department}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === 'Logged' ? 'bg-amber-500/20 text-amber-300' :
                        r.status === 'InReturnZone' ? 'bg-blue-500/20 text-blue-300' :
                        r.status === 'Approved' ? 'bg-indigo-500/20 text-indigo-300' :
                        r.status === 'Actioned' ? 'bg-emerald-500/20 text-emerald-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{new Date(r.reportedAt).toLocaleString()}</div>
                  <p className="mt-1 text-xs text-slate-400">{r.remark}</p>
                  {r.decision && (
                    <div className="mt-2 rounded-lg bg-slate-800/50 px-2 py-1">
                      <p className="text-xs text-slate-300">
                        <span className="font-semibold">Decision:</span> {r.decision}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {reviewingReturnId === r.id && (
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <p className="text-xs text-slate-400">What should be done with these returned goods?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedDecision('Scrap')}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                        selectedDecision === 'Scrap'
                          ? 'bg-red-600 text-white'
                          : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Scrap
                    </button>
                    <button
                      onClick={() => setSelectedDecision('Restock')}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                        selectedDecision === 'Restock'
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Restock
                    </button>
                    <button
                      onClick={() => setSelectedDecision('Replace')}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                        selectedDecision === 'Replace'
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Replace
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDecideReturn}
                      disabled={!selectedDecision}
                      className="flex-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                    >
                      Confirm Decision
                    </button>
                    <button
                      onClick={() => {
                        setReviewingReturnId(null);
                        setSelectedDecision('');
                      }}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {r.status === 'Logged' && !reviewingReturnId && (
                <div className="border-t border-slate-800 pt-2">
                  <button
                    onClick={() => setReviewingReturnId(r.id)}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Review & Decide
                  </button>
                </div>
              )}

              {r.status === 'Approved' && (
                <div className="border-t border-slate-800 pt-2">
                  <button
                    onClick={() => handleActionReturn(r.id)}
                    className="w-full rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Execute Decision
                  </button>
                </div>
              )}

              {r.status === 'Actioned' && (
                <div className="border-t border-slate-800 pt-2 text-xs text-emerald-400">
                  ✓ Completed by {currentUser?.name ?? 'unknown'} on {r.actionedAt ? new Date(r.actionedAt).toLocaleString() : '—'}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
