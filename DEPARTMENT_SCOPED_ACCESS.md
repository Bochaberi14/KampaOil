# Department-Scoped Access Control for HODs

## Overview

Department Heads of Department (HODs) now have department-scoped access - they can **only view and manage inventory and operations within their assigned department**. This prevents cross-department visibility and maintains data isolation as required by the business structure.

## How It Works

### HOD Access Restrictions

Each HOD is assigned to a specific department and can only access:

**Oil & Refinery HOD (Priya Kimani)**
- Storage Zones:
  - BIN-A: Edible Oils (non-refrigerated)
  - BIN-B: Margarine & Shortening (refrigerated)
- Loading Bay Zones:
  - BIN-A-BAY: Edible Oils
  - BIN-B-BAY: Margarine & Shortening (refrigerated)
- Only see racks, pallets, and operations for these zones
- Only see returns from Oil & Refinery department
- Can approve/reject holds for Oil & Refinery products

**Edibles HOD (David Mutua)**
- Storage Zones:
  - BIN-D: Specialty Products
- Loading Bay Zones:
  - BIN-D-BAY: Specialty Products
- Only see racks, pallets, and operations for these zones
- Only see returns from Edibles department
- Can approve/reject holds for Edibles products

**Soap HOD (Lucy Wambui)**
- Storage Zones:
  - BIN-C: Detergents & Soaps
- Loading Bay Zones:
  - BIN-C-BAY: Detergents & Soaps
- Only see racks, pallets, and operations for these zones
- Only see returns from Soap department
- Can approve/reject holds for Soap products

### Cross-Role Access

**Director, Manager**
- Can see all departments
- Can manage operations across all zones
- Can approve holds for all products

**Pickers**
- Can see all departments (need to access different zones for picking)
- Can scan and move pallets across all zones

**Other Roles** (Clerk, Loader, QA, Return Clerk)
- Can see all departments
- Role-specific permissions apply regardless of department

### Returns Zone Access

The Returns Zone (BIN-E-BAY) is **visible to all HODs** regardless of department, since:
- Returned products are processed through this zone
- All HODs may need to manage returns destined for their department
- Cross-department visibility needed for returns processing

## Implementation Details

### Technical Implementation

**New RBAC Function**: `canAccessDepartment()`
```typescript
export function canAccessDepartment(
  user: User | undefined | null, 
  targetDepartment: string | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'HOD') {
    return user.department === targetDepartment;
  }
  return true; // Non-HOD roles see all departments
}
```

### Pages Updated

**StoragePage**
- Filters STORAGE_ZONES by HOD department
- Shows department indicator: "Storage (Oil & Refinery)" when HOD logged in
- Only displays racks from accessible zones
- Scanning restricted to accessible racks

**LoadingBayPage**
- Filters LOADING_BAY_ZONES by HOD department
- Always shows Returns zone (BIN-E-BAY) for all roles
- Shows department indicator for HOD users
- Only displays bay racks from accessible zones

### Future Implementation

The following pages should also implement department scoping:

**ProductionPage**
- Filter production lines by product department
- HOD sees only their department's products in production

**HoldPage**
- Filter holds by department
- HOD sees only holds for their department's products

**RecallPage**
- Filter recalls by department
- HOD sees only recalls for their department's products

**DispatchPage**
- Filter dispatch orders by product department
- HOD sees only dispatch for their department's products

**ReturnsPage**
- Already has department filtering via `canViewReturn()`
- HOD sees only their department's returns

**DashboardPage**
- Filter statistics and metrics by department
- HOD sees department-scoped KPIs and inventory stats

## Testing Department Access

### Test as Oil & Refinery HOD
1. Log in as **Priya Kimani**
2. Go to **Storage** page
3. **Verify**: Only BIN-A and BIN-B zones visible
4. **Verify**: Cannot see BIN-C (Soap) or BIN-D (Other)
5. Go to **Loading Bay** page
6. **Verify**: Only BIN-A-BAY and BIN-B-BAY visible
7. **Verify**: Returns zone (BIN-E-BAY) is visible

### Test as Soap HOD
1. Log in as **Lucy Wambui**
2. Go to **Storage** page
3. **Verify**: Only BIN-C zone visible
4. **Verify**: Cannot see BIN-A, BIN-B (Oil & Refinery) or BIN-D
5. Go to **Loading Bay** page
6. **Verify**: Only BIN-C-BAY visible
7. **Verify**: Returns zone (BIN-E-BAY) is visible

### Test as Director
1. Log in as **Winnie Bochaberi**
2. Go to **Storage** page
3. **Verify**: All zones visible (BIN-A, BIN-B, BIN-C, BIN-D)
4. Go to **Loading Bay** page
5. **Verify**: All zones visible

## Data Isolation Benefits

✅ **Security**: HODs cannot access other departments' inventory
✅ **Compliance**: Department data remains isolated
✅ **Organization**: Clear operational boundaries between departments
✅ **Auditability**: All operations logged per department
✅ **Scalability**: Easy to add new departments with isolated access

## Department Information

| Department | HOD | Storage Zones | Bay Zones | Products |
|-----------|-----|---------------|-----------|----------|
| Oil & Refinery | Priya Kimani | BIN-A, BIN-B | BIN-A-BAY, BIN-B-BAY | Edible Oils, Margarine & Shortening |
| Edibles | David Mutua | BIN-D | BIN-D-BAY | Specialty Products |
| Soap | Lucy Wambui | BIN-C | BIN-C-BAY | Detergents & Soaps |
| Returns | All HODs | N/A | BIN-E-BAY | Returned items (cross-department) |

## Configuration

Department mappings are defined in `src/data/seed.ts`:
- `STORAGE_ZONES`: Zone → Department mapping
- `LOADING_BAY_ZONES`: Zone → Department mapping
- `USERS`: User → Department assignment

To add a new HOD with department scoping:
1. Add user to USERS array with role: 'HOD' and department: '<DepartmentName>'
2. Create new zones with that department
3. No code changes needed - access control is automatic via `canAccessDepartment()`
