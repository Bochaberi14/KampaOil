# Kampa Oil — Warehouse Management System (Demo)

An interactive prototype of an SAP-integrated warehouse execution system for
Kampa Oil, covering the full production-to-dispatch lifecycle:

- **Production** — scan a line, bind a pallet, confirm a load once it's full
- **Storage** — scan a pallet into a rack, live inventory by rack
- **Loading Bay** — FIFO picking from storage to the bay
- **Dispatch** — bay → truck, sales-order fulfillment, dispatch manifests
- **Hold & Investigation** — place/release holds on pallets (Manager/HOD/Director only), excluded from FIFO while held
- **Recall Processing (Line 50)** — Inspection → Repacking → Relabelling → QA → back into storage, rejoining FIFO
- **Inventory Audits** — live reports by product/batch/rack/FIFO age/held/recall/SAP status, with discrepancy flagging
- **Direct Dispatch approval** — an approval-gated exception path for pulling stock straight from storage when the bay falls short
- **Driver Confirmation** — a signed dispatch confirmation form per truck load
- **SAP sync simulation** — every warehouse transaction syncs to a mock SAP endpoint, with a toggleable outage mode that queues and retries every 5 seconds

Built with React, TypeScript, Vite, Zustand, and Tailwind CSS. All state lives
in a single Zustand store (`src/store/useWarehouseStore.ts`) and persists to
`localStorage`, so the demo can be reset from the header at any time.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL and log in as any of the seeded demo users
(Operator, Picker, Manager, HOD, Director) — no password required.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build locally
