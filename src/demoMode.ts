// Demo mode lets a single session showcase every feature — production
// through dispatch — without the normal role/location restrictions that
// split those tasks across separate real-world users. It's a plain module
// flag (not zustand state) so rbac.ts can read it without importing the
// store and creating a circular dependency.
const STORAGE_KEY = 'kapaoil-demo-mode';

let active = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true';

export function isDemoMode(): boolean {
  return active;
}

export function setDemoMode(value: boolean): void {
  active = value;
  if (typeof window === 'undefined') return;
  if (value) window.localStorage.setItem(STORAGE_KEY, 'true');
  else window.localStorage.removeItem(STORAGE_KEY);
}
