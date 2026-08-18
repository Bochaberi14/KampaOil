# Oil & Refinery Warehouse, Production, Storage and Dispatch Workflow Requirements

## 1. Department Scope

For the current phase, the system will cover only the **Oil & Refinery Department**.

The following departments/products will not be included at this stage:

* Edible Oils
* Soaps & Detergents
* Margarine
* Shortening

The system should therefore have one department:

**Oil & Refinery**

### Products in Scope

| Product  | Pack Size |
| -------- | --------- |
| Kasuku   | 1 kg      |
| Rina     | 1 litre   |
| Prestige | 500 g     |

---

# 2. Storage and Loading Bay Structure

The previous concept of product-specific **zones** should be removed. The warehouse uses **bins**, so the system should use bins as the primary storage-area identifier.

Each bin can be associated with the product stored there.

For example:

* **Bin A – Kasuku**
* **Bin B – Rina**
* **Bin C – Prestige**

Each bin should contain:

* 2 shelves
* 3 racks per shelf

The storage hierarchy should therefore be:

**Bin → Shelf → Rack**

For example:

**Bin A → Shelf 1 → Rack 1**

The system must be able to identify a pallet's precise storage destination down to the **bin, shelf and rack**.

---

# 3. Simplified Dispatch Workflow

The dispatch workflow should be simplified and consolidated into one page.

When a user logs in as a **Loader**, the default page should be:

**Dispatch Planning**

This should become the main workspace for the loader rather than having the dispatch process spread across multiple pages.

## 3.1 Dispatch Planning Dashboard

At the top of the page, display clearly separated status sections/tabs:

1. New Orders
2. Pending Orders
3. In Progress
4. Completed Orders

When the loader selects **New Orders**, the system should display the available sales orders.

Each order should clearly show:

* Sales Order ID
* Customer Name
* Order Date

Example:

**SO001 – Winnie Arisa – 18 Aug 2026**

The display should remain simple and easy for the loader to understand.

---

# 4. Opening a Sales Order

When the loader clicks on a sales order, the complete dispatch-planning workflow should open on the same page.

The current **Receipt / Order Reference** field should be removed completely.

It should be replaced with:

**Dispatch Line**

The Dispatch Line is mandatory.

The **loader is responsible for deciding which dispatch line to use**.

However, the system should retrieve and recommend **all currently unoccupied dispatch lines** to make the selection easier.

If the loader attempts to select a dispatch line that is already occupied by another vehicle, the system must reject the selection and display an appropriate error message:

> **Dispatch Line Unavailable – This line is currently occupied by another vehicle. Please select another dispatch line.**

The dispatch line must be selected before the loader can proceed.

This is important because the selected dispatch line will be communicated to the pickers, allowing them to know exactly where the products for that dispatch should be taken.

---

# 5. Dispatch Workflow Sequence

The intended sequence should be:

**1. Select Dispatch Line → 2. Select Products/Quantities → 3. Assign Pickers → 4. Release Products → 5. Register Vehicle → 6. Print Vehicle Barcode & Manifest**

Vehicle registration should **not** block the initial product-picking process.

---

## 5.1 Step 1 – Allocate Dispatch Line

The loader selects the dispatch line.

The system should retrieve and display all dispatch lines that are currently unoccupied.

The loader makes the final selection.

Once selected, the system should reserve/associate that dispatch line with the current dispatch so that another vehicle cannot simultaneously be assigned to the same line.

---

## 5.2 Step 2 – Select Products and Quantities

The loader should see the products contained in the sales order.

For example:

**SO001 – Winnie Arisa**

| Product        | Ordered Quantity | Quantity to Release |
| -------------- | ---------------: | ------------------: |
| Rina 1 L       |              500 |                 300 |
| Kasuku 1 kg    |              300 |                 300 |
| Prestige 500 g |              200 |                 200 |

The loader should be able to select the products and specify the quantities to be released.

This allows the loader to release either the complete order or only part of an order.

---

# 6. Picker Assignment

Before releasing the products, the loader must assign pickers to the dispatch.

The system should automatically recommend pickers based on:

### Department

Only pickers assigned to the **Oil & Refinery Department** should be considered.

### Current Task Availability

Pickers who already have an active task should not be recommended.

The system should automatically identify available Oil & Refinery pickers and present them to the loader.

The loader can then select the required pickers for that dispatch.

---

# 7. Releasing Products

Once:

* The dispatch line has been selected
* Products and quantities have been selected
* Pickers have been assigned

the loader can release the products.

The release should immediately generate tasks for the assigned pickers.

Vehicle registration must not delay product picking.

Once products are released:

* Assigned pickers are notified.
* Pickers know what products to collect.
* Pickers know the required source locations.
* Pickers know the selected dispatch line.
* Picking can begin while the vehicle is arriving or being prepared.

If only part of an order is released, the remaining quantities should automatically move to **Pending Orders**.

---

# 8. Vehicle Registration

Vehicle registration should happen after the products have been released.

The loader enters:

* Vehicle Registration Number
* Driver's Name

The loader should confirm that the registration number entered matches the physical vehicle.

After confirmation, the loader registers the vehicle.

This step is required to complete the dispatch.

### SAP Integration

The vehicle registration process should only be required if the vehicle registration number is not already provided by SAP.

If SAP already provides the vehicle registration information, the system should use that information instead of requiring the loader to enter it again.

---

# 9. Vehicle Barcode and Manifest

Once the vehicle has been registered, the system should generate:

1. Vehicle Barcode
2. Dispatch Manifest

Both should be printable.

The vehicle barcode should work in the same way as the existing printable barcode functionality.

---

# 10. Manifest Structure

The manifest should clearly show the products being dispatched and their quantities.

Quantities should be represented in **pallets and units**, since pallets are the physical handling unit used in the warehouse.

For example, if one pallet contains 100 units:

* Rina – 300 units = 3 pallets
* Kasuku – 300 units = 3 pallets
* Prestige – 200 units = 2 pallets

The manifest should therefore show:

**Rina 1 L — 3 pallets — 300 units**

**Kasuku 1 kg — 3 pallets — 300 units**

**Prestige 500 g — 2 pallets — 200 units**

The manifest should be presented in a clear, professional and printable format.

---

# 11. Key Principle: Picking Does Not Wait for Vehicle Registration

Product release and picking can begin before vehicle registration is completed.

The workflow is:

**Dispatch Line Selected → Products Selected → Pickers Assigned → Products Released → Pickers Start Picking**

The vehicle registration can happen while the picking process is underway.

Vehicle registration is required later to complete the dispatch and generate the final:

* Vehicle barcode
* Manifest

---

# 12. Revised Production-to-Storage Workflow

The current assumption that a forklift operator moves finished products directly from production to storage is incorrect.

The actual process is:

**Production → Manual Handling → Storage Handover → Forklift → Final Storage Location**

---

# 13. Production Scanning

Scanners will be available at the different production lines.

For example:

* Line 1 – Scanner
* Line 2 – Scanner
* Line 3 – Scanner

The production operator scans:

1. Production Line
2. Product
3. Pallet

The purpose of this scan is to record the newly produced pallet in the system.

The system already knows the standard number of units required to constitute a pallet for each product.

The scan should therefore allow the system to determine and record the pallet quantity.

---

# 14. Production Storage Recommendation

Immediately after the production line, product and pallet are scanned, the system should **determine and recommend the pallet's storage destination**.

For example:

> **Pallet P000123 successfully recorded.**
> **Recommended storage destination: Bin A → Shelf 1 → Rack 1**

The production scanner therefore performs two functions:

**Scan → Record Production → Recommend Storage Destination**

The production worker does not need to decide where the pallet should go.

The recommended destination is stored against that specific pallet and is later retrieved by the storage forklift operator.

---

# 15. Manual Movement from Production to Storage

After the pallet is produced and scanned, it remains at production temporarily.

It is then manually moved from production to storage by hand pickers.

These workers do not use forklifts or scanners for this part of the process.

The workflow is:

**Production → Scan → System Recommends Location → Hand Picker Manually Moves Pallet → Storage**

---

# 16. Storage Forklift Handover

Once the pallet reaches storage, it is handed over to the forklift operators.

The storage forklift operator uses an operational scanner and scans the pallet.

The system retrieves the destination that was previously recommended during the production scan.

For example:

**Pallet P000123**

**Destination: Bin A → Shelf 1 → Rack 1**

The forklift operator then moves the pallet to that location.

---

# 17. Destination Verification

When the forklift operator reaches the destination, they must scan the destination location/rack.

The system compares:

**Expected Location vs. Scanned Location**

### Correct Location

> **Location confirmed. Pallet accepted.**

The storage sequence is completed.

### Incorrect Location

> **Wrong Location. Move pallet to the assigned location.**

The system should not allow the movement to be completed until the pallet is scanned at the correct destination.

---

# 18. Storage-to-Loading Bay Workflow

When stock is required for dispatch, the Department HOD requests stock from Storage.

Once the request is submitted, storage picking tasks are automatically assigned to available Oil & Refinery forklift pickers using operational scanners.

The system determines which eligible pickers are available and assigns tasks accordingly.

---

# 19. Storage Picker Instructions

The assigned forklift picker receives an instruction such as:

> **Move Pallet P000123 from Bin A → Shelf 1 → Rack 1 to the Loading Bay.**

The picker goes to the specified location.

They perform the required verification scans:

1. Scan the rack/location.
2. Scan the pallet.

The system confirms that:

* The picker is at the correct location.
* The pallet belongs to the requested stock movement.
* The correct pallet is being removed.

Only after successful verification should the pallet be moved.

---

# 20. Storage-to-Loading Bay Handover

The forklift operator moves the pallet to the designated **Loading Bay receiving point**.

At this point, the pallet is handed over to the manual hand pickers.

These hand pickers do not use scanners.

They manually move the pallet/products through the loading-bay handover process.

The pallet is then handed over to the forklift operator working in the Loading Bay.

---

# 21. Loading Bay Structure and Forklift Workflow

The Loading Bay has two physical movement points:

### Loading Bay Receiving Point

This is where products are received from Storage.

**Storage → Loading Bay**

### Loading Bay Dispatch Point

This is where products are moved from the Loading Bay to the assigned Dispatch Line.

**Loading Bay → Dispatch**

These should not be treated as separate scanner locations.

The system should treat both as part of the **Loading Bay** operating location.

The **same forklift operators and scanners** can perform both movements.

---

## 21.1 Loading Bay Receiving

When the loading-bay forklift operator receives a pallet from Storage, they scan the pallet.

The system records that the pallet has entered the Loading Bay.

The scanner/operator can then receive the next relevant task.

---

## 21.2 Loading Bay to Dispatch

When the pallet is ready to move to dispatch, the same forklift operator/scanner can receive a task such as:

> **New Task**
> Pallet P000123
> Current Location: Loading Bay
> Destination: Dispatch Line 03
> **[Accept]**

The operator accepts the task, scans the pallet and moves it to the assigned dispatch line.

At the destination, the operator scans the dispatch destination.

The system validates the location.

### Correct Location

> **Destination confirmed. Pallet accepted.**

### Incorrect Location

> **Wrong Location – Move pallet to the assigned destination.**

The movement remains open until the correct destination is scanned.

---

# 22. Scanner Configuration

Each physical scanner should be registered in the warehouse system with a unique **Scanner ID** and a **Current Work Location**.

For example:

**Scanner ID: SC001**

**Current Work Location: Production**

Another scanner could be:

**Scanner ID: SC002**

**Current Work Location: Storage**

Another:

**Scanner ID: SC003**

**Current Work Location: Loading Bay**

The scanner's current work location determines what type of tasks and instructions it can receive.

### Possible Work Locations

* Production
* Storage
* Loading Bay
* Dispatch

The scanner should **not be permanently restricted** to one location.

A scanner can be reassigned when operational requirements change.

For example:

**SC001**

Monday: Production

Tuesday: Storage

Wednesday: Loading Bay

---

# 23. Authorized Scanner Configuration

Ordinary operators should not be able to change the scanner's Current Work Location.

The initial configuration and any subsequent changes should require an **authorized user**, such as an appropriate supervisor, HOD or system administrator.

For example:

**Scanner Management**

> Scanner ID: SC001
> Current Work Location: Production
> Status: Active

Authorized user selects:

> **Change Work Location → Storage → Confirm**

The system should record the change.

An audit record should ideally capture:

* Scanner ID
* Previous location
* New location
* User who made the change
* Date/time of change

This provides accountability and makes it possible to determine which operating environment the scanner was configured for at a particular time.

---

# 24. Production Scanner Mode

When a scanner is configured for **Production**, it should:

* Scan the production line.
* Scan the product.
* Scan the pallet.
* Record the production output.
* Determine/recommend the storage destination.
* Display the recommended storage destination.
* Not receive forklift movement tasks.
* Not receive picking tasks.
* Not beep for operational movement tasks.

Its purpose is to capture production output and trigger the storage-location recommendation.

The workflow is:

**Scan Line → Scan Product → Scan Pallet → Record Production → Recommend Storage Destination**

---

# 25. Operational Scanner Mode

When a scanner is configured for **Storage, Loading Bay or Dispatch**, it becomes an operational task device.

These scanners can:

* Receive tasks.
* Notify/beep when a new task is assigned.
* Display movement instructions.
* Require the operator to acknowledge/accept the task.
* Guide the operator to the correct source location.
* Validate pallets and locations.
* Confirm successful movements.

For example:

> **NEW TASK**
> Move Pallet P000123
> From: Bin A → Shelf 1 → Rack 1
> To: Loading Bay
>
> **[Accept]**

After completing that movement, the same scanner configured for **Loading Bay** can receive another task:

> **NEW TASK**
> Move Pallet P000123
> From: Loading Bay
> To: Dispatch Line 03
>
> **[Accept]**

---

# 26. Scanner Assignment Logic

The system should use the scanner's **Current Work Location** to determine which operational tasks it can receive.

The same physical scanner can therefore be reassigned to different areas without requiring a new device.

For example:

**Scanner ID: SC001**

**Current Work Location: Storage**

→ Receives Storage tasks.

If an authorized user changes it to:

**Current Work Location: Loading Bay**

→ It can now receive Loading Bay tasks, including:

**Storage → Loading Bay**

and:

**Loading Bay → Dispatch**

The operator does not need to manually select the work location during normal operation.

The configured location determines the scanner's behaviour.

---

# 27. Overall Warehouse Workflow

The revised end-to-end process should therefore be:

### Production

**Production Line → Scan Line + Product + Pallet → System Records Pallet → System Recommends Storage Location**

↓

### Manual Transfer

**Hand Picker → Manually Moves Pallet from Production to Storage**

↓

### Storage

**Forklift Picker → Scans Pallet → System Displays Recommended Location → Move Pallet → Scan Rack → System Validates Location**

↓

### HOD Stock Request

**HOD Requests Stock → System Creates Tasks → Available Oil & Refinery Pickers Receive Tasks**

↓

### Storage → Loading Bay

**Forklift Picker → Scan Rack + Pallet → Remove Correct Pallet → Move to Loading Bay Receiving Point**

↓

### Manual Transfer

**Hand Picker → Manually Moves/Hands Over Product Through Loading Bay**

↓

### Loading Bay

**Forklift Picker → Scan Pallet → System Records Loading Bay Receipt**

↓

### Loading Bay → Dispatch

**Same Forklift Picker/Scanner → Receive Task → Scan Pallet → Move to Assigned Dispatch Line → Scan Destination → System Validates**

↓

### Dispatch

**Loader → Dispatch Planning → Select Dispatch Line → Select Products/Quantities → Assign Available Oil & Refinery Pickers → Release Products**

↓

### Picking

**Pickers Receive Tasks → Pick Products → Move Products to Assigned Dispatch Line**

↓

### Vehicle

**Register Vehicle Number Plate + Driver → Confirm Physical Vehicle → Register Vehicle**

↓

### Completion

**Generate/Print Vehicle Barcode + Manifest**

---

# 28. Core System Principles

The revised system should follow these principles:

1. Only **Oil & Refinery** is in scope for the current phase.
2. Products in scope are **Kasuku 1 kg, Rina 1 L and Prestige 500 g**.
3. Storage locations must be identifiable down to **bin, shelf and rack**.
4. The system should automatically recommend storage destinations.
5. The **loader decides** which available dispatch line to use.
6. The system should recommend all currently unoccupied dispatch lines.
7. The system must prevent a loader from selecting an occupied dispatch line.
8. Incorrect storage and dispatch destinations must be rejected.
9. Production scanners must record production output **and recommend the pallet's storage destination**.
10. Production scanners must not receive forklift movement tasks.
11. Every scanner should have a unique **Scanner ID**.
12. Every scanner should have a configurable **Current Work Location**.
13. Scanner work-location changes should require authorized access.
14. Scanner configuration should be stored and managed by the warehouse system.
15. Operational scanner behaviour should be determined by the scanner's current work location.
16. **Loading Bay is one operating location**, even though it has separate Storage → Loading Bay and Loading Bay → Dispatch movement points.
17. The same forklift operators and scanners can handle both Loading Bay movements.
18. Pickers should be assigned based on **Oil & Refinery department and current task availability**.
19. Dispatch planning should be consolidated into one page.
20. Dispatch line allocation is mandatory before product release.
21. Product release should not wait for vehicle registration.
22. Partial releases should automatically leave remaining quantities in Pending Orders.
23. Vehicle registration is completed after product release.
24. The vehicle barcode and manifest are generated after vehicle registration, unless SAP already provides the vehicle information.
25. The manifest should represent quantities in both **pallets and units**.
26. Every movement should be traceable from **production → storage → loading bay → dispatch → vehicle**.
