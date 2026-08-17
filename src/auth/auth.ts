import type { User, SessionToken, SecurityEvent, SecurityEventType } from '../types/domain';

// Simple TOTP generation for demo (in production, use speakeasy package)
export function generateTOTPCode(): string {
  // For demo: generate a 6-digit code
  // In production: use time-based TOTP algorithm
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
}

// Validate TOTP code (simplified for demo)
export function validateTOTPCode(code: string, expectedCode: string): boolean {
  // In production: validate against time-based algorithm
  // For demo: accept the generated code
  return code === expectedCode;
}

// Generate JWT-like session token
export function generateSessionToken(user: User): string {
  const payload = {
    userId: user.id,
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  };

  // Simple base64 encoding for demo (in production: use jsonwebtoken package)
  return btoa(JSON.stringify(payload));
}

// Validate session token
export function validateSessionToken(token: string): SessionToken | null {
  try {
    const payload = JSON.parse(atob(token));

    // Check if token is expired
    if (payload.exp < Date.now()) {
      return null; // Token expired
    }

    return payload;
  } catch {
    return null; // Invalid token
  }
}

// Get client IP (simplified - would come from request in real app)
export function getClientIp(): string {
  // In production: extract from request headers
  return '192.168.1.1';
}

// Log security event
export function createSecurityEvent(
  type: SecurityEventType,
  userId: string | undefined,
  userName: string | undefined,
  details: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
): SecurityEvent {
  return {
    id: `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    userId,
    userName,
    severity,
    details,
    ipAddress: getClientIp(),
    timestamp: new Date().toISOString(),
  };
}

// Check if account is locked
export function isAccountLocked(user: User): boolean {
  if (!user.lockedUntil) return false;
  return new Date(user.lockedUntil) > new Date();
}

// Get remaining lockout time in minutes
export function getRemainingLockoutTime(user: User): number {
  if (!user.lockedUntil) return 0;
  const remaining = new Date(user.lockedUntil).getTime() - Date.now();
  return Math.ceil(remaining / 60000);
}
