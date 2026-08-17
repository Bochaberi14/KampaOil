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
      scanner = new Html5Qrcode(regionId, { verbose: false, formatsToSupport: formats });
      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
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
      scanner?.stop().then(() => scanner?.clear()).catch(() => {});
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
