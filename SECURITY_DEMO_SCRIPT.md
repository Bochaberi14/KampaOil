# Kapa Oil WMS - Security Demo Script
## Step-by-Step Execution Guide

**Duration**: 20 minutes  
**Audience**: Director  
**Setup Time**: 5 minutes before meeting

---

## Pre-Demo Setup (5 minutes before)

```bash
# 1. Start the development server
npm run dev

# 2. Open browser and go to http://localhost:5173
# 3. Check that login page loads
# 4. Verify test users are accessible
```

**Users for Demo**:
- Picker: `op1` (Alex Mwangi)
- HOD Oil: `hod1` (Priya Kimani)
- Manager: `mgr1` (Jordan Wanjiru)
- Loader: `load1` (Brian Kiptoo)
- Clerk: `clerk1` (Grace Achieng)

All users use the same password (set in demo).

---

## DEMO SCRIPT (Narration + Actions)

### [0:00-2:00] Introduction (2 minutes)

**What to Say:**
> "Good morning. I want to show you how the Kapa Oil WMS implements enterprise-grade security. We have 7 key security features that work together to prevent unauthorized access, fraud, and errors. Let me walk you through each one."

**On Screen**: Show the WMS login page

---

### [2:00-3:30] Demo #1: Role-Based Access Control (1.5 minutes)

**What to Say:**
> "First, Role-Based Access Control. Different users should only see what's relevant to their job. Let me show you."

**Step 1: Log in as Picker (op1)**
```
1. Click email field
2. Enter: op1
3. Click Login
4. You're now logged in as "Alex Mwangi, Picker"
```

**Step 2: Show restricted access**
```
1. Look at the navigation bar
2. Point to visible pages: "My Tasks", "Storage", "Loading Bay", etc.
3. Say: "Notice there's NO 'Loader' menu, NO 'Hold' page, NO 'Recall' page"
4. Point to `/hold` in browser URL bar
5. Try to navigate to: http://localhost:5173/hold
6. **BLOCKED**: "You don't have permission to view this page"
```

**What to Highlight:**
> "Alex is a Picker. She can execute assigned tasks, but she CANNOT approve holds, request dispatch, or manage recalls. The system itself enforces this—she couldn't access the Loader page even if she tried."

**Step 3: Logout and log in as Manager**
```
1. Click user menu (top right)
2. Click "Logout"
3. At login page: enter mgr1
4. Now look at navigation bar
5. Point to: "Hold", "Recall", "Returns" pages visible
6. Say: "As Manager, Jordan can see Hold, Recall, Returns—pages Alex couldn't see"
```

**[3:30] Move to next feature**

---

### [3:30-5:00] Demo #2: Department Scoping (1.5 minutes)

**What to Say:**
> "Second, Department-Scoped Access. HODs only see their own department's data. Let's see it."

**Current User**: Manager (mgr1)

**Step 1: Go to `/returns`**
```
1. Click "Returns" in nav
2. Show the returns list
3. Say: "As Manager, Jordan sees ALL departments' returns"
4. Point to returns from different departments
```

**Step 2: Logout and log in as HOD (hod1)**
```
1. Logout
2. Login as: hod1
3. User is now: "Priya Kimani, HOD (Oil & Refinery)"
4. Go to `/returns`
```

**Step 3: Show department isolation**
```
1. Say: "Priya is HOD for Oil & Refinery. Look—she only sees Oil & Refinery returns"
2. Point to department column: "All show Oil & Refinery"
3. Say: "She CANNOT see Soap or Edibles returns. The system filters data by her department"
4. Try to manually navigate to a different department's return (if URL were available)
5. Emphasize: "Even if she knew a return ID, the system would check her department and block access"
```

**What to Highlight:**
> "Sensitive product and customer data is isolated by department. A HOD cannot—and should not be able to—see other departments' information. The system enforces this at the code level."

**[5:00] Move to next feature**

---

### [5:00-8:00] Demo #3: Immutable Audit Trail (3 minutes)

**What to Say:**
> "Third, Immutable Audit Trail. Every action in the system is logged with a timestamp and operator. Watch."

**Current User**: HOD (hod1)

**Step 1: Go to `/audit`**
```
1. Click "Audit" in nav (or "7 · Audit")
2. Say: "This is the Audit page—our compliance dashboard"
```

**Step 2: Find pallet journey section**
```
1. Scroll to "Pallet journey — full traceability" section
2. Say: "To see the complete journey of a pallet, I just scan its ID"
3. Click the input field
4. Show suggestions: "Here's a list of recent pallets"
5. Click on a pallet (e.g., PLT-001)
```

**Step 3: Show the journey timeline**
```
1. Once scanned, show the "Movement timeline" section
2. Point to each entry:
   - FreePool → Line (L001)        [2026-08-18 09:15 · Alex Mwangi]
   - Line (L001) → Storage         [2026-08-18 09:22 · Alex Mwangi]
   - Storage → Loading Bay         [2026-08-18 10:45 · Sam Otieno]
   
3. For EACH line, point to:
   a) "FROM" location (Storage: BIN-A-OILS-S-01-R-01)
   b) "TO" location (Bay: BIN-A-BAY-OILS-S-01-R-01)
   c) Exact timestamp (2026-08-18 10:45)
   d) Operator name (Sam Otieno)
```

**Step 4: Explain immutability**
```
1. Say: "Every single movement is locked in this record"
2. Say: "We can prove where this pallet was, when, and who moved it"
3. Say: "If there's ever a dispute, loss, or quality issue, we have proof"
4. Say: "These records cannot be deleted or modified—they're immutable"
```

**What to Highlight:**
> "If a pallet goes missing, we know exactly who touched it and when. If a customer disputes a shipment, we show the complete chain of custody. For regulatory audits, we have proof that the right product was handled correctly. This is compliance gold."

**[8:00] Move to next feature**

---

### [8:00-10:30] Demo #4: Hold Mechanism (2.5 minutes)

**What to Say:**
> "Fourth, Hold Mechanism. If there's a quality issue, ANY Clerk can immediately halt a pallet. Let me show."

**Current User**: HOD (hod1) - we'll use Clerk after

**Step 1: Show inventory verification section**
```
1. Scroll down to "Inventory verification" section
2. Say: "A Clerk can report discrepancies right here"
3. Show the input: "Scan the pallet you found"
```

**Step 2: Manually show what happens when pallet is held**
```
1. Instead of scanning, navigate to `/storage`
2. Log out and log in as op1 (Picker)
3. Say: "I'm now a Picker looking at storage"
4. Show the racks and pallets available
5. Try to request stock from storage
6. Say: "If a pallet were on hold, the Picker would see 'Pallet X is held—cannot pick'"
7. Highlight: "The system prevents dispatch of held pallets"
```

**Step 3: Show Hold page (as HOD)**
```
1. Logout, login as hod1
2. Go to `/hold`
3. If there are holds, show them:
   - Hold ID
   - Pallet ID
   - Reason
   - Status (PendingApproval, Active, etc.)
   - Placed by: [Clerk name]
4. Say: "As HOD, I can review this hold"
5. Point to buttons: "Approve Hold Request" or "Reject Hold Request"
6. Say: "If I approve it, the pallet goes to Recall management"
7. Say: "If I reject it, the pallet is released with documentation of why"
```

**What to Highlight:**
> "One Clerk seeing a problem doesn't mean the pallet is quietly damaged goods. The hold is immediate, visible to management, and requires approval before release. A held pallet cannot sneak through the system."

**[10:30] Move to next feature**

---

### [10:30-13:00] Demo #5: Multi-Stage Approvals (2.5 minutes)

**What to Say:**
> "Fifth, Multi-Stage Approval. Critical operations like dispatch require multiple people to verify. Let me show."

**Current User**: HOD (hod1) → switch to Loader (load1)

**Step 1: Logout and login as Loader**
```
1. Logout
2. Login as: load1
3. User: "Brian Kiptoo, Loader"
4. Go to `/loader`
5. Say: "As Loader, Brian plans dispatch operations"
```

**Step 2: Show dispatch planning**
```
1. Look for "Dispatch Planning" or "Dispatch Allocation" section
2. Point to a sales order
3. Say: "To dispatch this order, I need to:"
   a) Plan it (allocate to a truck)
   b) Request pickers (assign tasks)
   c) Verify picking is complete
   d) Scan dispatch line (with truck)
   e) Get Clerk signature
4. Say: "There's no shortcut—all steps are required"
```

**Step 3: Show the gate that prevents early dispatch**
```
1. If there's a dispatch order ready to scan:
2. Go to `/dispatch`
3. Show a sales order with picking tasks
4. Point to: "Picking progress - 0/5 items completed"
5. Point to the "Scan Dispatch Line" button
6. Say: "This button is DISABLED until all picks are complete"
7. Point to greyed-out button or error message
8. Say: "Even the Loader cannot dispatch without completed picks"
```

**Step 4: Explain the signature requirement**
```
1. Say: "Once picking is complete and verified:"
2. Say: "The system generates a Dispatch Verification form"
3. Say: "A Clerk MUST sign this form before goods leave"
4. Say: "The Clerk attaches the driver's name"
5. Say: "Both the Loader and Clerk are documented"
```

**What to Highlight:**
> "You cannot dispatch a single pallet without Loader verification, Clerk signature, AND completed picks. Multiple people verify multiple things. One person's mistake gets caught by the next checkpoint. Fraud becomes exponentially harder."

**[13:00] Move to next feature**

---

### [13:00-14:30] Demo #6: Returns Management (1.5 minutes)

**What to Say:**
> "Sixth, Customer Returns. These are sensitive. Watch how they're routed and tracked."

**Current User**: Loader (load1)

**Step 1: Go to Returns and show routing**
```
1. Logout and login as clerk1 (Clerk)
2. Go to `/returns`
3. Show "Log a customer return" form
4. Say: "A Clerk logs the return with product, quantity, reason, photo"
5. Say: "Once logged, the system automatically routes it to the right HOD based on department"
```

**Step 2: Show HOD receives it**
```
1. Logout and login as hod1 (HOD)
2. Go to `/returns`
3. Show the return in "Logged returns" section with AMBER badge "Logged"
4. Say: "The return is now visible to Priya (HOD for Oil & Refinery)"
5. Click "Review & Decide"
6. Point to buttons: Scrap, Restock, Replace
7. Say: "Priya decides what to do with this returned product"
8. Say: "Her decision is recorded with timestamp: [decision time]"
```

**Step 3: Show execution tracking**
```
1. Logout and login as op1 (Picker)
2. Go to `/loading-bay` → "Returns Zone" section
3. If a return is approved, show:
   - Product name
   - Quantity
   - Decision (Scrap/Restock/Replace)
   - "Execute" button
4. Say: "Alex (Picker) executes the decision"
5. Point to status change: From "Approved" (indigo) → "Actioned" (green)
6. Point to timestamp and operator name
```

**What to Highlight:**
> "Customer returns don't disappear into a black box. They're logged, routed to the right manager, a decision is made and recorded, and execution is tracked. If a customer later claims they never heard back, we can prove when and how their return was handled."

**[14:30] Move to next feature**

---

### [14:30-16:00] Demo #7: Zone-Based Integrity (1.5 minutes)

**What to Say:**
> "Finally, Zone-Based Inventory Integrity. Products are automatically routed to the correct storage zones to prevent mix-ups."

**Current User**: Picker (op1)

**Step 1: Show production → zone assignment**
```
1. Go to `/production`
2. Show a product (e.g., "Rina 1L" - Oil & Refinery)
3. When in the "pallet" step, show:
   - "🎯 Destination Zone: BIN-A (Edible Oils)"
4. Say: "The system knows this is an oil product, so it will route to BIN-A"
5. Create a pallet
```

**Step 2: Show zone inventory dashboard**
```
1. Go to `/zones`
2. Say: "This is the Zone Inventory Dashboard—real-time view of all zones"
3. Show "BIN-A (Edible Oils)" zone card
4. Point to: Utilization %, Pallet count, Contents (shows Rina 1L)
5. Point to visual rack grid showing pallets
6. Say: "We can see exactly what's in each zone, how full it is, and when capacity is reached"
```

**Step 3: Show zone isolation**
```
1. Show "BIN-C (Detergents & Soaps)" zone
2. Say: "This is a completely separate zone"
3. Show contents: Different products (soaps)
4. Point to: "❄ Refrigerated" badge on BIN-B
5. Say: "Refrigerated products are isolated in their own zone"
6. Say: "Oil products cannot mix with soaps. Ambient products cannot mix with refrigerated."
```

**Step 4: Show how this prevents errors**
```
1. Say: "If a Picker tries to put an Oil product in the Soap zone, the system guides them to the correct zone"
2. Say: "Zone violations are caught at scan time, not discovered later when products are damaged"
```

**What to Highlight:**
> "Inventory integrity is enforced automatically. Products go to the right zone by design, not by hope or prayer. If oil products somehow ended up in the soap zone, we'd see it immediately on the zone dashboard, and the audit trail shows who did it and when."

**[16:00] Summary**

---

## Summary (2 minutes)

**What to Say:**
> "Let me recap. This system has 7 layers of security:
> 
> 1. Role-Based Access Control — Users only see their job
> 2. Department-Scoped Access — HODs see only their department
> 3. Immutable Audit Trail — Every action logged, timestamped, operator-attributed
> 4. Hold Mechanism — Quality issues can halt dispatch immediately
> 5. Multi-Stage Approvals — Dispatch requires Loader + Clerk + completed picks
> 6. Returns Management — Sensitive data routed to right approver, tracked to execution
> 7. Zone-Based Integrity — Products automatically routed to correct zones
> 
> Together, these prevent both accidental errors and intentional fraud. We have complete visibility, multiple checkpoints, and an unbreakable audit trail. For compliance audits, we can prove every pallet was handled correctly."

**Final Talking Point:**
> "If the director asks 'What if someone tries to cheat the system?'—the answer is: 'The audit trail captures it. We see who, what, when, and where. The state machine prevents shortcuts. Multiple people verify each step. Even if someone breaches one control, three others catch them.'"

---

## Q&A Prep

**Q: Can a Manager bypass the Hold mechanism?**  
A: No. A Manager can APPROVE a hold (escalate to Recall), but they cannot RELEASE a pallet without going through the proper channels. The system code prevents it.

**Q: What if the Loader and Clerk collude?**  
A: The audit trail records both. A Clerk cannot sign without a Loader's prior dispatch scan, and both are documented with timestamps. Any pattern of unusual approvals would be visible in the audit log.

**Q: How do we prevent someone from logging in as another user?**  
A: The system uses strong user identification (not shown in demo, but implemented in auth system). Login attempts are logged. In production, multi-factor authentication would add another layer.

**Q: What about database-level hacks?**  
A: That's infrastructure security (encryption, backups, access control). This demo shows application-level security. Both are needed.

---

## Troubleshooting During Demo

| Problem | Solution |
|---------|----------|
| User can't login | Check username is correct (op1, hod1, mgr1, etc.) |
| Navigation blocked | Correct—user doesn't have permission. Show the error message as proof. |
| Can't find `/zones` page | It's in the nav. If not visible, user may not have audit permission. Try a Manager role. |
| Pallet not in audit trail | Create a new pallet (go to `/production`), move it to storage, then check audit. |
| No returns to show | The demo has sample returns seeded. If missing, show the `/returns` form instead. |
| Button appears disabled | Perfect—highlight this as the security gate preventing early dispatch. |

---

## Post-Demo Slide Deck (Optional)

If showing slides after demo:

**Slide 1**: Kapa Oil WMS Security Architecture (7 features)  
**Slide 2**: Role-Based Access Control (diagram showing user roles)  
**Slide 3**: Audit Trail Example (pallet journey timeline)  
**Slide 4**: Hold & Recall Flow (process diagram)  
**Slide 5**: Dispatch Multi-Stage Gate (Loader → Clerk → signed)  
**Slide 6**: Returns Lifecycle (Logged → Approved → Actioned)  
**Slide 7**: Zone Integrity (visual showing zone separation)  
**Slide 8**: Compliance Readiness (bullet points on audit/regulatory)  

---

## Success Indicators

Director understands:
- ✅ Each user has limited, appropriate access
- ✅ Every action is logged and attributable
- ✅ Critical operations require multiple verifications
- ✅ Sensitive data (returns) routes to appropriate approvers
- ✅ System prevents both errors and fraud
- ✅ Compliance audits have complete documentation

**If director leaves the meeting confident in all 6 points above, the security demo succeeded.**
