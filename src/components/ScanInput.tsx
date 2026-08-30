import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';

interface ScanInputProps {
  label: string;
  placeholder?: string;
  onScan: (value: string) => void;
  suggestions?: string[];
  disabled?: boolean;
}

// Simulates a handheld barcode scanner: type/paste a code and press Enter
// (or tap a suggestion chip) — same as a real scanner firing a keyboard event.
// Also supports scanning for real with a phone/webcam camera via html5-qrcode.
export function ScanInput({ label, placeholder, onScan, suggestions, disabled }: ScanInputProps) {
  const [value, setValue] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const regionId = `scan-region-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || disabled) return;
      onScan(trimmed);
      setValue('');
      inputRef.current?.focus();
    },
    [disabled, onScan],
  );

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    // Loaded on demand — this pulls in a real barcode-decoding library
    // (zxing under the hood), no reason to ship it in the main bundle for a
    // page that might never open the camera.
    import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (cancelled) return;
      // Real-world labels this app is likely pointed at during a live demo —
      // 1D retail/logistics barcodes as well as QR — decoded narrower than
      // "every format" for a faster, steadier lock-on.
      const formats = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
      ];
      scanner = new Html5Qrcode(regionId, {
        verbose: false,
        formatsToSupport: formats,
        // Prefer the browser's native BarcodeDetector (hardware-accelerated,
        // Chrome/Edge) over the bundled JS decoder — it's noticeably more
        // reliable on long/dense 1D codes like the rack labels.
        useBarCodeDetectorIfSupported: true,
      });
      scanner
        .start(
          // html5-qrcode requires this object to have exactly one key
          // (facingMode or deviceId) — the resolution hint below goes in
          // the scan config's `videoConstraints` instead.
          { facingMode: 'environment' },
          {
            fps: 10,
            // Wide, short box: these are horizontal 1D barcodes, not square
            // QR codes, so the aiming region shouldn't force the label
            // further from the camera than it needs to be just to fit its
            // width in.
            qrbox: { width: 380, height: 200 },
            // Request a higher-resolution feed than the browser default so
            // a long Code128 label (many thin bars) still resolves clearly
            // — low-res webcams otherwise blur adjacent bars together.
            videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true; // stop() below is async — don't fire twice on rapid re-reads
            submit(decodedText);
            setCameraOpen(false);
          },
          () => {
            // Fires every frame with no code found yet — expected while
            // aiming, not a real error.
          },
        )
        .catch((e: unknown) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : String(e);
          setCameraError(
            /permission/i.test(message)
              ? 'Camera permission denied — allow camera access and try again, or type the code below.'
              : `Could not start the camera: ${message}`,
          );
          setCameraOpen(false);
        });
    });

    return () => {
      cancelled = true;
      // This effect can be torn down while the camera is still negotiating
      // (e.g. a slower resolution request, or this effect re-running because
      // `submit`/`regionId` changed identity on an unrelated parent
      // re-render) — before start() has resolved. html5-qrcode's stop()
      // throws *synchronously* (not a rejected promise) if the scanner
      // isn't in a running/paused state yet, and an uncaught throw from a
      // cleanup function takes down the whole React tree. Guard it.
      try {
        scanner?.stop().then(() => scanner?.clear()).catch(() => {});
      } catch {
        // Nothing to stop/clear — it never finished starting.
      }
    };
  }, [cameraOpen, regionId, submit]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">{label}</label>

      {cameraOpen ? (
        <div className="space-y-2">
          <div id={regionId} className="overflow-hidden rounded-lg border border-indigo-500" />
          <button
            type="button"
            onClick={() => setCameraOpen(false)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel camera scan
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            disabled={disabled}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? 'Scan or type barcode…'}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-900 disabled:text-slate-600"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setCameraError(null);
              setCameraOpen(true);
            }}
            title="Scan with camera"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            📷
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Scan
          </button>
        </form>
      )}

      {cameraError && <p className="text-xs text-rose-400">{cameraError}</p>}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => submit(s)}
              className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-400 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
