import type { Role } from './types/domain';

export type Permission =
  | 'view:dashboard'
  | 'view:production'
  | 'view:storage'
  | 'view:loading-bay'
  | 'view:dispatch'
  | 'view:hold'
  | 'view:recall'
  | 'view:audit'
  | 'execute:scan'
  | 'execute:pickTask'
  | 'approve:hold'
  | 'approve:recall'
  | 'approve:directDispatch'
  | 'sign:supervisor'
  | 'report:discrepancy'
  | 'flag:hold';

const SUPERVISOR_PERMISSIONS: Permission[] = [
  'view:dashboard',
  'view:production',
  'view:storage',
  'view:loading-bay',
  'view:dispatch',
  'view:hold',
  'view:recall',
  'view:audit',
  'approve:hold',
  'approve:recall',
  'approve:directDispatch',
  'sign:supervisor',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Director: SUPERVISOR_PERMISSIONS,
  Manager: SUPERVISOR_PERMISSIONS,
  HOD: SUPERVISOR_PERMISSIONS,
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
    'execute:scan',
    'execute:pickTask',
  ],
  // Clerk can flag any product with a problem for a hold (view:hold +
  // flag:hold) on top of the rack-mismatch discrepancy path — but flagging
  // only requests a hold; Manager/HOD/Director still approve or reject it.
  Clerk: ['view:dashboard', 'view:audit', 'view:hold', 'report:discrepancy', 'flag:hold'],
};

export const ROLE_BLURB: Record<Role, string> = {
  Director: 'Full access — admin, approvals, recalls, all reports',
  Manager: 'Manage operations — approve holds, recalls & direct dispatch',
  HOD: 'Supervise warehouse — approve picking, holds & recalls',
  Picker: 'Scan & move pallets — production, storage, loading bay, dispatch',
  Clerk: 'Inventory reports & discrepancy reporting — can flag a product for hold, not approve one',
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
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
