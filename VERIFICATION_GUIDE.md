# Kapa Oil WMS - Complete System Verification Guide

This guide provides comprehensive end-to-end verification of all Phase 2 features with zone-based warehouse management and pallet journey tracking.

## Pre-Verification Setup

1. **Start Fresh**: Reset the demo to baseline state
2. **Login as Loader**: Check `/loader` to verify dispatch planning features
3. **Login as Picker (Oil & Refinery)**: Check `/picker-tasks` to verify task assignment
4. **Login as Manager/HOD**: Check `/returns` to verify review workflow

---

## Test Scenario 1: Zone-Aware Production & Storage Flow

**Objective**: Verify pallets are stored in correct zones based on product department

### Step 1: Create Production Load
- Login as **Factory Manager**
- Go to `/production`
- Start a new order for **Rina 1L** (Oil & Refinery department)
- Produce 200 units (2 pallets × 100 units each)
- Verify pallets show as "Loaded"

### Step 2: Scan to Storage (Zone-Aware)
- Login as **Picker (Oil & Refinery)**
- Go to `/storage`
- Scan first pallet leaving production → should move to "Stage 2 · Storage"
- Scan destination rack → **should recommend BIN-A-OILS-S-01-R-01** (Oil zone)
- Confirm scan
- Verify in "Live inventory by zone" section:
  - ✓ Pallet appears under **"Edible Oils"** zone (BIN-A)
  - ✓ Rack name shows full BIN naming: `BIN-A-OILS-S-01-R-01`

### Verification Checklist
- [ ] Pallet moved to correct zone (BIN-A for Oil)
- [ ] Zone header shows "Edible Oils" with BIN-A identifier
- [ ] Refrigeration indicator shows for BIN-B if applicable
- [ ] Rack display shows full naming convention

---

## Test Scenario 2: Zone Inventory Dashboard

**Objective**: Verify real-time zone utilization and inventory visibility

### Step 1: View Zone Dashboard
- Login as any user with audit permission
- Go to `/zones`
- Verify page loads with "Zone Inventory Dashboard"

### Step 2: Verify Storage Zones Display
- **BIN-A (Edible Oils)** should show:
  - Utilization percentage (based on filled slots)
  - Slot count (e.g., "1 / 6")
  - Pallet count from previous test
  - Product contents with SKU and units
- **BIN-B (Margarine)** should show:
  - ❄ Refrigerated badge
  - Empty status (no pallets yet)

### Step 3: Verify Loading Bay Zones
- **BIN-A-BAY (Edible Oils)** zone
- **BIN-E-BAY (Returns)** zone with different styling
- Utilization bars color-coded:
  - Green: < 50%
  - Amber: 50-80%
  - Red: > 80%

### Verification Checklist
- [ ] All storage zones displayed (BIN-A through BIN-D)
- [ ] All loading bay zones displayed (BIN-A-BAY through BIN-E-BAY)
- [ ] Utilization bars show correct percentages
- [ ] Refrigeration badge appears for BIN-B and BIN-B-BAY
- [ ] Contents show product names and quantities
- [ ] Empty zones display "Zone is empty"

---

## Test Scenario 3: Enhanced Task Details with Zone Information

**Objective**: Verify all task pages display zone context (BIN naming)

### Step 3A: Check My Tasks Page
- Login as **Picker (Oil & Refinery)**
- Go to `/picker-tasks`
- Select an "Assigned" task (storage to loading bay)
- In task details panel, verify:
  - **Type**: Shows "Pick (Storage)" or "Put-away (Production)"
  - **From storage (zones)**: Shows format like:
    ```
    PLT-001 at BIN-A-OILS-S-01-R-01
    Edible Oils
    ```
  - Zone name appears next to rack ID

### Step 3B: Check Storage Page
- Go to `/storage` 
- View live inventory grouped by **Zone**:
  - Each zone has header: "Edible Oils" + "BIN-A" identifier
  - ❄ Badge for refrigerated zones
  - Racks nested under zone headers (not flat list)

### Step 3C: Check Loading Bay Page
- Go to `/loading-bay`
- View inventory grouped by **Zone**:
  - Zones from BIN-A-BAY through BIN-E-BAY
  - BIN-E-BAY marked as Returns zone
  - Returns Zone section shows approved/in-zone returns

### Verification Checklist
- [ ] PickerTasksPage shows zone info for each pallet
- [ ] StoragePage groups racks by zone with headers
- [ ] LoadingBayPage groups racks by zone with headers
- [ ] BIN naming convention visible in all rack displays
- [ ] Refrigeration badges visible where applicable
- [ ] Zone department visible (e.g., "Oil & Refinery" for BIN-A)

---

## Test Scenario 4: Pallet Journey Tracking Through Zones

**Objective**: Verify pallet journey shows complete zone path from production → storage → loading bay

### Step 1: Trigger a Full Pallet Path
- Using previous pallets from Test Scenario 1
- Request a **Sales Order** for Rina 1L (100 units = 1 pallet)
- Release and dispatch the pallet

### Step 2: View Pallet Journey
- Go to `/audit`
- Scroll to "Pallet journey — full traceability" section
- Scan one of the pallets (e.g., PLT-001)
- Verify journey shows:
  - **Current status**: Racked (or next status if progressed)
  - **Product**: Rina 1L (RINA1L)
  - **Movement timeline** with entries like:
    ```
    FreePool → Line (L001)
    Line (L001) → Storage (BIN-A-OILS-S-01-R-01)
    Storage (BIN-A-OILS-S-01-R-01) → BayRack (BIN-A-BAY-OILS-S-01-R-01)
    BayRack (BIN-A-BAY-OILS-S-01-R-01) → DispatchLine (LINE 001)
    ```
  - Timestamps and operator names for each movement

### Step 3: Verify Zone Context in Journey
- Each movement should include **full BIN naming**
- Zone transitions visible (BIN-A → BIN-A-BAY)
- Timestamps show exact moment of zone transfer

### Verification Checklist
- [ ] Journey timeline displays correctly
- [ ] Each movement shows BIN naming (not just rack ID)
- [ ] Zone names visible in movement descriptions
- [ ] Timestamps accurate for all movements
- [ ] Operator names displayed for each action
- [ ] Manifest information shows for dispatched pallets

---

## Test Scenario 5: Customer Returns Zone Management

**Objective**: Verify returns flow with zone tracking and manager decision

### Step 1: Log a Return
- Go to `/returns`
- Log a customer return:
  - Product: Rina 1L
  - Quantity: 5 units
  - Department: Oil & Refinery
  - Remark: Damaged packaging
  - Photo: Take a photo
- Verify return status: **"Logged"** (amber badge)

### Step 2: Check Loading Bay Returns Zone
- Go to `/loading-bay`
- Scroll to "Returns Zone" section
- Verify return appears in "In Zone — Awaiting Review" section:
  - Shows quantity and product name
  - Shows remark
  - Displays as "InReturnZone" status

### Step 3: Review & Decide (HOD/Manager)
- Go to `/returns`
- Login as **HOD (Oil & Refinery)** or **Factory Manager**
- Find the logged return
- Click "Review & Decide"
- Select decision: **"Restock"** (or Scrap/Replace)
- Confirm decision
- Verify return status changes to **"Approved"** (indigo badge)
- Decision shows in details

### Step 4: Execute Decision (Picker)
- Go to `/loading-bay`
- Check Returns Zone → should show under "Approved — Waiting Execution"
- Login as **Picker** (Oil & Refinery)
- Click "Execute" button
- Verify return status changes to **"Actioned"** (green badge)
- Completion timestamp appears

### Verification Checklist
- [ ] Return can be logged with all required fields
- [ ] Return appears in Loading Bay Returns Zone
- [ ] HOD can review and decide (Scrap/Restock/Replace)
- [ ] Decision persists in return record
- [ ] Picker can execute approved decision
- [ ] Status flow: Logged → InReturnZone → Approved → Actioned
- [ ] Timestamps track who approved and when
- [ ] Return history visible in ReturnsPage

---

## Test Scenario 6: Zone Utilization & Overflow Handling

**Objective**: Verify zone-aware rack selection and overflow detection

### Step 1: Fill a Zone Partially
- Produce multiple batches of **Kasuku 1kg** (Edibles dept → BIN-D)
- Store pallets to BIN-D zone
- Go to `/zones`
- Watch BIN-D utilization bar increase

### Step 2: Approach Zone Capacity
- Continue adding pallets to BIN-D until utilization > 80%
- Verify utilization bar turns amber on `/zones` dashboard
- Go to `/storage` and observe zone status

### Step 3: Zone Full Handling
- Continue until all BIN-D racks are full
- Try to add another pallet
- System should either:
  - Show recommendation for overflow zone, OR
  - Prevent add with clear error message
- Verify error message names the full zone

### Verification Checklist
- [ ] Utilization percentage updates in real-time
- [ ] Color coding changes correctly (green → amber → red)
- [ ] Zone displays as "full" when all slots occupied
- [ ] System handles overflow gracefully
- [ ] Operator guidance provided when zone full
- [ ] Alternative rack recommendations shown

---

## Test Scenario 7: Multi-Zone Dispatch Verification

**Objective**: Verify dispatch workflow with zone context visible

### Step 1: Create Multi-SKU Sales Order
- Request stock from multiple products (different zones):
  - Rina 1L (BIN-A / Oil)
  - Kasuku 1kg (BIN-D / Edibles)
- Load both into loading bay via `/loading-bay`

### Step 2: View Dispatch Planning
- Go to `/loader`
- Create dispatch allocation for sales order
- Assign dispatch line: LINE 001
- Verify assignment shows:
  - Sales order details
  - Planned quantity
  - Truck assignment

### Step 3: View Picking Progress
- Go to `/dispatch`
- Select the sales order
- View "Picking progress" showing:
  - Product from BIN-A zone
  - Product from BIN-D zone
  - Picker names
  - Task completion status

### Step 4: Complete Dispatch
- Verify all picks complete
- Scan dispatch line code
- Scan vehicle barcode
- Manifest generates showing:
  - Multiple products (different zones)
  - Total quantity
  - Pallet IDs
  - Dispatch line: LINE 001

### Verification Checklist
- [ ] Dispatch shows products from multiple zones
- [ ] Zone information visible in dispatch summary
- [ ] Picking tasks grouped by zone
- [ ] Manifest includes zone context
- [ ] All pallets stage at correct dispatch line
- [ ] Vehicle verification completes successfully

---

## Regression Testing Checklist

Run these tests to verify no existing features broke:

### Production Workflow
- [ ] Create production order
- [ ] Scan pallet leaving production
- [ ] Confirm pallet status changes to "Loaded"

### Storage Workflow
- [ ] Request stock from storage
- [ ] Scan pallet to rack
- [ ] Verify FIFO selection honors date order
- [ ] Verify held pallets excluded from FIFO

### Hold & Recall Workflow
- [ ] Place hold on racked pallet
- [ ] Verify hold prevents picking
- [ ] Release hold
- [ ] Create recall case
- [ ] Complete recall flow to QA

### Dispatch Workflow
- [ ] Create sales order
- [ ] Assign picker to task
- [ ] Execute picking
- [ ] Stage at dispatch line
- [ ] Generate manifest

### Barcodes
- [ ] Print pallet barcodes
- [ ] Print rack barcodes
- [ ] Print zone barcodes (new)
- [ ] Verify all scan correctly

---

## Performance Checks

- [ ] Zone inventory dashboard loads in < 2 seconds
- [ ] Pallet journey scan completes in < 1 second
- [ ] Switching between zones on storage page responsive (< 500ms)
- [ ] Return logging doesn't cause lag
- [ ] No memory leaks after rapid zone switching (check DevTools)

---

## User Feedback Checklist

After implementation, verify with end users:

### Picker Feedback
- [ ] Zone names help understand where to go
- [ ] BIN naming is readable on printed barcodes
- [ ] Task details show enough context
- [ ] Recommended racks are sensible

### HOD/Manager Feedback
- [ ] Zone dashboard gives actionable insights
- [ ] Returns zone is easy to manage
- [ ] Can see pallet journeys clearly
- [ ] Capacity warnings prevent stockouts

### Loader Feedback
- [ ] Dispatch planning shows zone context
- [ ] Can track multi-zone orders easily
- [ ] Zone information aids verification

---

## Sign-Off

| Role | Name | Verified | Date |
|------|------|----------|------|
| QA Lead | _________ | ☐ | _____ |
| Warehouse Manager | _________ | ☐ | _____ |
| IT Manager | _________ | ☐ | _____ |

---

## Known Limitations & Future Enhancements

1. **Single Dispatch Line**: Currently demo uses "LINE 001" for all vehicles
   - *Enhancement*: Support multiple dispatch lines per zone

2. **Basic Utilization Alerts**: Dashboard shows percentages only
   - *Enhancement*: Proactive alerts when zone > 90%, automatic requests for emptying

3. **Zone Movement Logs**: Stored as text in Movement records
   - *Enhancement*: Structured zone transition tracking for analytics

4. **Manual Rack Assignment**: Picker scans rack freely
   - *Enhancement*: System-assigned racks with no picker choice (enforcement mode)

---

## Troubleshooting

**Q: Pallets not appearing in expected zone?**
- A: Verify rack has correct `zoneId` in store. Check `INITIAL_RACKS` in seed.ts.

**Q: Zone dashboard shows 0% utilization?**
- A: Verify pallets have correct location.type. Check pallet status is "Racked".

**Q: Pallet journey missing zone movements?**
- A: Verify Movement records are being logged. Check `scanPalletToRack` action in store.

**Q: BIN naming not showing in tasks?**
- A: Verify Rack objects have `zoneId` populated. Clear browser cache.

---

## Contact

For issues or questions, contact the WMS development team.
