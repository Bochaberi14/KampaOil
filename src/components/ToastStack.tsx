import { useWarehouseStore } from '../store/useWarehouseStore';

export function ToastStack() {
  const toasts = useWarehouseStore((s) => s.toasts);
  const dismiss = useWarehouseStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto cursor-pointer rounded-lg border px-4 py-3 text-sm shadow-lg shadow-black/30 ${
            t.kind === 'success'
              ? 'border-emerald-800 bg-emerald-950 text-emerald-200'
              : t.kind === 'error'
                ? 'border-red-800 bg-red-950 text-red-200'
                : 'border-indigo-800 bg-indigo-950 text-indigo-200'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
