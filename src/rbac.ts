import type { CustomerReturn, Role, User } from './types/domain';

export type Permission =
  | 'view:dashboard'
  | 'view:production'
  | 'view:storage'
  | 'view:loading-bay'
  | 'view:dispatch'
  | 'view:hold'
  | 'view:recall'
  | 'view:audit'
  | 'view:loader'
  | 'view:returns'
  | 'view:barcodes'
  | 'view:security'
  | 'execute:scan'
  | 'execute:pickTask'
  | 'approve:hold'
  | 'approve:recall'
  | 'approve:directDispatch'
  | 'sign:dispatch'
  | 'report:discrepancy'
  | 'flag:hold'
  | 'plan:dispatch'
  | 'report:return';

const SUPERVISOR_PERMISSIONS: Permission[] = [
  'view:dashboard',
  'view:production',
  'view:storage',
  'view:loading-bay',
  'view:dispatch',
  'view:hold',
  'view:recall',
  'view:audit',
  'view:barcodes',
  'approve:hold',
  'approve:recall',
  'approve:directDispatch',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Director and HOD get everything Manager does, plus returns visibility —
  // Manager is deliberately NOT a returns recipient (only Department HOD,
  // Factory Manager, Sales Manager, and Director are).
  Director: [...SUPERVISOR_PERMISSIONS, 'view:returns', 'view:security'],
  Manager: SUPERVISOR_PERMISSIONS,
  HOD: [...SUPERVISOR_PERMISSIONS, 'view:returns'],
  Picker: [
    'view:dashboard',
    'view:production',
    'view:storage',
    'view:loading-bay',
    'view:dispatch',
    // Pickers don't approve holds/recalls, but they physically scan a
    // recalled pallet to whatever destination Manager/HOD/Director decided —
    // so they need to reach the Recall page to perform that scan.
    'view:recall',
    'view:barcodes',
    'execute:scan',
    'execute:pickTask',
  ],
  // Clerk can flag any product with a problem for a hold (view:hold +
  // flag:hold) on top of the rack-mismatch discrepancy path — but flagging
  // only requests a hold; Manager/HOD/Director still approve or reject it.
  Clerk: ['view:dashboard', 'view:audit', 'view:hold', 'report:discrepancy', 'flag:hold', 'view:barcodes'],
  // Loader owns the whole dispatch coordination: releases sales orders,
  // assigns pickers, registers the collecting vehicle when it arrives,
  // verifies it against the handover printout, and signs alongside the
  // driver — there's no separate Clerk step in this flow.
  Loader: ['view:dashboard', 'view:loader', 'plan:dispatch', 'sign:dispatch', 'view:barcodes'],
  // Narrower than the full Manager/HOD/Director supervisor bundle — QA HOD
  // owns Hold & Recall approvals specifically, not direct-dispatch approval
  // or supervisor sign-off.
  'QA HOD': [
    'view:dashboard',
    'view:hold',
    'view:recall',
    'view:audit',
    'approve:hold',
    'approve:recall',
    'view:barcodes',
  ],
  'Customer Return Clerk': ['view:dashboard', 'view:returns', 'report:return', 'view:barcodes'],
  // Cross-department visibility into returns — see canViewReturn below —
  // but no other warehouse permissions; these roles exist purely for that
  // oversight, not to run any part of the floor.
  'Factory Manager': ['view:dashboard', 'view:returns'],
  'Sales Manager': ['view:dashboard', 'view:returns'],
};

export const ROLE_BLURB: Record<Role, string> = {
  Director: 'Full access — admin, approvals, recalls, all reports',
  Manager: 'Manage operations — approve holds, recalls & direct dispatch',
  HOD: 'Supervise warehouse — approve picking, holds & recalls',
  Picker: 'Scan & move pallets — production, storage, loading bay, dispatch',
  Clerk: 'Inventory reports & discrepancy reporting — can flag a product for hold, not approve one',
  Loader: 'Coordinates dispatch end-to-end — releases orders, assigns pickers, registers & verifies the vehicle, signs the handover',
  'QA HOD': 'Owns Hold & Recall — approve/reject holds, decide recall outcomes',
  'Customer Return Clerk': 'Log customer returns — product, quantity, defect photo & remarks',
  'Factory Manager': 'Factory-wide visibility into returned goods across every department',
  'Sales Manager': 'Sales-side visibility into returns for customer/order reconciliation',
};

export const ROUTE_PERMISSION: Record<string, Permission> = {
  '/dashboard': 'view:dashboard',
  '/production': 'view:production',
  '/storage': 'view:storage',
  '/loading-bay': 'view:loading-bay',
  '/dispatch': 'view:dispatch',
  '/hold': 'view:hold',
  '/recall': 'view:recall',
  '/audit': 'view:audit',
  '/loader': 'view:loader',
  '/returns': 'view:returns',
  '/barcodes': 'view:barcodes',
  '/security': 'view:security',
  '/picker-tasks': 'execute:pickTask',
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Department-scoped routing for returns — a Department HOD only sees their
// own department's returns; Factory Manager, Sales Manager, Director, and
// the Customer Return Clerk who logs them see every department.
export function canViewReturn(user: User | undefined, customerReturn: CustomerReturn): boolean {
  if (!user || !can(user.role, 'view:returns')) return false;
  if (user.role === 'HOD') return user.department === customerReturn.department;
  return true;
}
