import { useEffect, useRef, useState } from 'react';
import { PrintSheet } from './PrintSheet';
import { CustomInventoryReportPrint } from './InventoryReportPrint';
import { binLabelForZoneId } from '../data/seed';
import type { Zone, Shelf, Rack, Load } from '../types/domain';

export interface ZonePrintData {
  zone: Zone;
  shelves: Shelf[];
  racks: Rack[];
}

interface CustomPrintMenuProps {
  zoneData: ZonePrintData[];
  loads: Load[];
}

export function CustomPrintMenu({ zoneData, loads }: CustomPrintMenuProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const { zones, shelves, racks, labels } = resolveSelection(zoneData, selected);
  const rackCount = racks.length;

  const storageZoneData = zoneData.filter(({ zone }) => zone.warehouseType === 'Storage');
  const bayZoneData = zoneData.filter(({ zone }) => zone.warehouseType === 'LoadingBay');

  function renderZone({ zone, shelves: zoneShelves, racks: zoneRacks }: ZonePrintData) {
    return (
      <div key={zone.id}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <input
            type="checkbox"
            checked={selected.has(`zone:${zone.id}`)}
            onChange={() => toggle(`zone:${zone.id}`)}
          />
          {binLabelForZoneId(zone.id)}
        </label>
        <div className="ml-5 mt-1 space-y-1">
          {zoneShelves.map((shelf) => (
            <div key={shelf.id}>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={selected.has(`shelf:${shelf.id}`)}
                  onChange={() => toggle(`shelf:${shelf.id}`)}
                />
                Shelf {shelf.index}
              </label>
              <div className="ml-5 space-y-1">
                {zoneRacks
                  .filter((r) => r.shelfId === shelf.id)
                  .map((rack) => (
                    <label key={rack.id} className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={selected.has(`rack:${rack.id}`)}
                        onChange={() => toggle(`rack:${rack.id}`)}
                      />
                      Rack {rack.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
      >
        🖨️ Custom print{selected.size > 0 ? ` (${selected.size})` : ''}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
          <p className="mb-2 text-xs text-slate-400">
            Select any combination of bays, shelves, or racks to print together.
          </p>
          <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
            {storageZoneData.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Storage</p>
                <div className="space-y-3">{storageZoneData.map(renderZone)}</div>
              </div>
            )}
            {bayZoneData.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Loading Bay</p>
                <div className="space-y-3">{bayZoneData.map(renderZone)}</div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
            <button
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
            >
              Clear
            </button>
            <PrintSheet
              title={`Custom Inventory Report${labels.length ? ` — ${labels.join(', ')}` : ''}`}
              triggerLabel={`🖨️ Print (${rackCount} rack${rackCount === 1 ? '' : 's'})`}
            >
              <CustomInventoryReportPrint
                zones={zones}
                shelves={shelves}
                racks={racks}
                loads={loads}
                generatedAt={new Date().toISOString()}
                label={labels.join(', ')}
              />
            </PrintSheet>
          </div>
        </div>
      )}
    </div>
  );
}

function resolveSelection(zoneData: ZonePrintData[], selected: Set<string>) {
  const zones: Zone[] = [];
  const shelves: Shelf[] = [];
  const racks: Rack[] = [];
  const labels: string[] = [];

  for (const { zone, shelves: zoneShelves, racks: zoneRacks } of zoneData) {
    const zoneSelected = selected.has(`zone:${zone.id}`);
    const binLabel = binLabelForZoneId(zone.id);
    if (zoneSelected) labels.push(binLabel);

    const includedShelves: Shelf[] = [];
    const includedRacks: Rack[] = [];

    for (const shelf of zoneShelves) {
      const shelfSelected = zoneSelected || selected.has(`shelf:${shelf.id}`);
      if (shelfSelected && !zoneSelected) labels.push(`${binLabel} · Shelf ${shelf.index}`);

      const shelfRacks = zoneRacks.filter((r) => r.shelfId === shelf.id);
      const matchedRacks = shelfRacks.filter(
        (r) => shelfSelected || selected.has(`rack:${r.id}`),
      );

      if (!shelfSelected) {
        for (const rack of shelfRacks) {
          if (selected.has(`rack:${rack.id}`)) {
            labels.push(`${binLabel} · Rack ${rack.name}`);
          }
        }
      }

      if (matchedRacks.length > 0) {
        includedShelves.push(shelf);
        includedRacks.push(...matchedRacks);
      }
    }

    if (includedRacks.length > 0) {
      zones.push(zone);
      shelves.push(...includedShelves);
      racks.push(...includedRacks);
    }
  }

  return { zones, shelves, racks, labels };
}
