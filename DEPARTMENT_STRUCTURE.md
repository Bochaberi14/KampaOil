# Kapa Oil WMS — Department & Role Structure

## Overview

The Kapa Oil WMS is structured around **4 core departments** and **9 operational roles** with clear separation of concerns and department-scoped data access.

## Departments

All warehouse operations are organized by product department:

### 🛢️ Oil & Refinery
- **Products**: Edible Oils, Margarine & Shortening
- **Storage Zones**: 
  - BIN-A: Edible Oils (non-refrigerated)
  - BIN-B: Margarine & Shortening (refrigerated)
- **Key Feature**: Refrigeration required for BIN-B

### 🥘 Edibles
- **Products**: Specialty edible items
- **Storage Zones**:
  - BIN-D: Specialty Products (non-refrigerated)

### 🧼 Soap
- **Products**: Detergents & Soaps
- **Storage Zones**:
  - BIN-C: Detergents & Soaps (non-refrigerated)

### 📦 Other
- **Products**: Miscellaneous warehouse items
- **Storage Zones**: BIN-D overlap with Edibles

## Roles & Responsibilities

### 1. Director (Winnie Bochaberi)
- **Access**: Full system access including security monitoring
- **Permissions**: All approvals, recalls, returns, security dashboard
- **Departments**: Cross-department oversight
- **Special**: Only role with access to Security Dashboard and Security Demo

### 2. Manager (Jordan Wanjiru)
- **Access**: Operations management across all departments
- **Permissions**: Approve holds, recalls, direct dispatch requests
- **Departments**: Cross-department coordination
- **Scope**: Production, storage, loading bay, dispatch oversight

### 3. HOD (Department Head of Department)
- **Count**: 3 HODs (one per major department)
- **Roles**:
  - Priya Kimani — Oil & Refinery HOD
  - David Mutua — Edibles HOD
  - Lucy Wambui — Soap HOD
- **Permissions**: 
  - Approve holds and recalls for their department
  - View returns for their department only
  - Production, storage, and dispatch operations
- **Scope**: Department-scoped inventory and operations

### 4. Picker (Scanner-Based Access)
- **Count**: 2 Pickers
  - Alex Mwangi — Oil & Refinery Picker
  - Sam Otieno — Soap Picker
- **Access**: Barcode scanner only (Zebra TC53/TC58)
  - No login required
  - Directly access warehouse operations via scanner
- **Permissions**: 
  - Execute pick tasks (production, storage, bay, dispatch)
  - Scan pallets and products
  - View warehouse locations and zones
  - Execute recall scanner operations
- **Note**: Pickers bypass login and use mobile barcode scanners for all warehouse interactions

### 5. Clerk (Grace Achieng)
- **Access**: Inventory and quality reporting
- **Permissions**:
  - Report discrepancies in inventory
  - Flag products for hold (requests approval from Manager/HOD/Director)
  - View inventory audit trails
  - Scan barcodes for verification
- **Scope**: Quality assurance and inventory integrity

### 6. Loader (Brian Kiptoo)
- **Access**: Dispatch coordination and vehicle management
- **Permissions**:
  - Release sales orders to warehouse execution
  - Assign pickers to tasks with quantity splits
  - Register customer vehicles
  - Verify vehicle dispatch and sign handover
  - Plan dispatch allocations
- **Scope**: End-to-end dispatch workflow

### 7. QA (Quality Assurance - Fatuma Noor)
- **Access**: Quality and compliance oversight
- **Permissions**:
  - View and approve/reject holds
  - View and manage recalls
  - Audit trail access
  - Scan barcodes for verification
- **Scope**: Quality assurance across all products
- **Note**: Replaces "QA HOD" title; still has same functional scope

### 8. Customer Return Clerk (Wanjiku Njeri)
- **Access**: Customer returns processing
- **Permissions**:
  - Log customer returns (product, quantity, defects, photos)
  - Report return incidents
  - Scan barcodes for product verification
- **Scope**: Return intake and initial processing

### 9. Sales Manager (Esther Njoroge)
- **Access**: Sales order visibility and returns
- **Permissions**:
  - View all returns across all departments
  - Dashboard and sales order oversight
- **Scope**: Sales-side visibility into returns for customer/order reconciliation

## Login Access

### Web Login Required
All roles except Picker require web-based login with MFA:
1. Select user from login screen (shows role + department)
2. Enter password: `demo`
3. Enter 6-digit MFA code from authenticator
4. Access warehouse management dashboard

**Users with Web Access**:
- Director (Winnie Bochaberi)
- Manager (Jordan Wanjiru)
- HODs (3 department heads)
- Clerk (Grace Achieng)
- Loader (Brian Kiptoo)
- QA (Fatuma Noor)
- Customer Return Clerk (Wanjiku Njeri)
- Sales Manager (Esther Njoroge)

### Barcode Scanner Access (No Login)
Pickers use mobile barcode scanners:
- Device: Zebra TC53 or TC58
- Access: Direct warehouse operations without login
- Authentication: Device-based (not user-based in this prototype)
- Operations: All warehouse picking and scanning tasks

## Department-Scoped Data Access

### Department HOD Visibility
- **Oil & Refinery HOD**: Can only view/manage operations in Oil & Refinery zones (BIN-A, BIN-B)
- **Edibles HOD**: Can only view/manage operations in Edibles zones (BIN-D for Edibles)
- **Soap HOD**: Can only view/manage operations in Soap zones (BIN-C)

### Returns Visibility
- **Department HOD**: Only sees returns from their own department
- **Director/Manager**: Cross-department visibility
- **QA**: All returns across all departments
- **Sales Manager**: All returns across all departments

## Key Features by Role

| Role | Dashboard | Production | Storage | Dispatch | Holds | Recalls | Audit | Returns | Barcodes |
|------|-----------|------------|---------|----------|-------|---------|-------|---------|----------|
| Director | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| HOD | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ |
| Picker | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Clerk | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Loader | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| QA | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Customer Return Clerk | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Sales Manager | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |

*HOD sees only their department's returns

## Testing the System

### Test with Different Roles

**As Director (Full Access)**:
1. Login: Winnie Bochaberi
2. Password: demo
3. MFA: Enter the displayed 6-digit code
4. Access: Security Dashboard, all warehouse operations

**As HOD (Department-Scoped)**:
1. Login: Priya Kimani (Oil & Refinery HOD)
2. Password: demo
3. MFA: Enter the displayed 6-digit code
4. View: Only Oil & Refinery zones (BIN-A, BIN-B)
5. Approve: Only holds/recalls for Oil & Refinery products

**As Picker (No Login)**:
1. Use Zebra TC53/TC58 barcode scanner
2. Scan pallet/product barcodes directly
3. Access warehouse operations without authentication
4. Complete picking and scanning tasks

**As Clerk (Quality Reporting)**:
1. Login: Grace Achieng
2. Access: Inventory audit, can flag items for hold
3. Note: Cannot approve holds (requires Manager/HOD/Director approval)

## Zone Structure

### Storage Zones (4 total)
```
BIN-A: Edible Oils (Oil & Refinery) — Non-refrigerated
  - 3 racks per shelf, 6 pallets per rack = 18 pallet capacity

BIN-B: Margarine & Shortening (Oil & Refinery) — REFRIGERATED
  - 3 racks per shelf, 6 pallets per rack = 18 pallet capacity

BIN-C: Detergents & Soaps (Soap) — Non-refrigerated
  - 3 racks per shelf, 6 pallets per rack = 18 pallet capacity

BIN-D: Specialty Products (Other/Edibles) — Non-refrigerated
  - 3 racks per shelf, 6 pallets per rack = 18 pallet capacity
```

### Loading Bay Zones (5 total)
```
BIN-A-BAY: Edible Oils (Oil & Refinery) — 3 racks × 6 pallets = 18 capacity
BIN-B-BAY: Margarine & Shortening (Oil & Refinery) — REFRIGERATED — 18 capacity
BIN-C-BAY: Detergents & Soaps (Soap) — 3 racks × 6 pallets = 18 capacity
BIN-D-BAY: Specialty Products (Other) — 3 racks × 6 pallets = 18 capacity
BIN-E-BAY: Returns Processing — 2 racks × 6 pallets = 12 capacity
```

## Migration from Old Role Names

**Removed Roles**:
- ❌ Factory Manager — Duplicate of Manager function (removed)
- ❌ QA HOD — Renamed to QA for simplicity

**Updated**:
- 🔄 QA HOD → QA (same permissions, simplified naming)

## Security & Access Control

- **MFA**: All web users require TOTP-based 2FA
- **Account Lockout**: 5 failed attempts → 30-minute lockout
- **Session Expiration**: 8-hour token expiration
- **Audit Logging**: All security events tracked with IP/timestamp
- **Role-Based Permissions**: Enforced at component and route level
- **Department Scoping**: HODs only see their department's data

## Demo Credentials

```
Director:   Winnie Bochaberi  | Password: demo
Manager:    Jordan Wanjiru     | Password: demo
HOD (Oil):  Priya Kimani       | Password: demo
HOD (Edibles): David Mutua     | Password: demo
HOD (Soap): Lucy Wambui        | Password: demo
Clerk:      Grace Achieng      | Password: demo
Loader:     Brian Kiptoo       | Password: demo
QA:         Fatuma Noor        | Password: demo
Return Clerk: Wanjiku Njeri    | Password: demo
Sales Mgr:  Esther Njoroge     | Password: demo

Pickers: Scanner-based access (no login)
- Alex Mwangi (Oil & Refinery)
- Sam Otieno (Soap)
```

## File Locations

- **Role definitions**: `src/rbac.ts`
- **User data**: `src/data/seed.ts`
- **Domain types**: `src/types/domain.ts`
- **Login page**: `src/pages/LoginPage.tsx` (department-aware)
- **Zone configuration**: `src/data/seed.ts` (STORAGE_ZONES, LOADING_BAY_ZONES)
