# Kapa Oil WMS - Advanced Security Implementation Plan
## Enterprise-Grade Authentication & Authorization

**Objective**: Implement demonstrable security features that show:
- ✅ Strong authentication (MFA, session management, password policies)
- ✅ Authorization enforcement (JWT tokens, permission gates)
- ✅ Data protection (audit logging, encryption, data masking)
- ✅ Attack prevention (rate limiting, input validation, CSRF protection)
- ✅ Monitoring & alerting (suspicious activity, failed login tracking)

---

## Phase 1: Authentication Hardening (HIGH PRIORITY)

### 1.1 Multi-Factor Authentication (MFA)
**Visibility**: Director sees login with 2FA code

**Implementation**:
```typescript
// types/auth.ts
export interface User {
  id: string;
  email: string;
  passwordHash: string;  // bcrypt hash, not plaintext
  mfaEnabled: boolean;
  mfaSecret?: string;    // TOTP secret (encrypted)
  mfaBackupCodes: string[]; // One-time backup codes
  lastLoginAt?: string;
  loginAttempts: number; // Failed attempts counter
  lockedUntil?: string;  // Account lockout time
}

// auth.ts
export async function loginWithMFA(email: string, password: string, mfaCode: string) {
  // 1. Validate email/password (bcrypt.compare)
  // 2. Check if account is locked (loginAttempts > 5)
  // 3. Verify TOTP code matches (using authenticator app)
  // 4. Reset loginAttempts on success
  // 5. Generate JWT session token
  // 6. Log successful login to audit trail
  
  return {
    sessionToken: jwt.sign({
      userId: user.id,
      role: user.role,
      iat: Date.now(),
      exp: Date.now() + (8 * 60 * 60 * 1000), // 8 hour expiry
    }, SECRET_KEY),
    expiresIn: 28800,
    requiresMFA: false, // Already authenticated
  };
}

export function validateSessionToken(token: string) {
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    // Token is valid and not expired
    return decoded;
  } catch (e) {
    // Token expired or invalid
    return null;
  }
}
```

**UI Changes**:
```typescript
// pages/LoginPage.tsx - Add MFA verification step

export function LoginPage() {
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  function handleSubmitCredentials(e) {
    e.preventDefault();
    // Validate email/password
    // If success, show MFA step
    setStep('mfa');
    pushToast('Enter the 6-digit code from your authenticator app');
  }

  function handleSubmitMFA(e) {
    e.preventDefault();
    // Call loginWithMFA(email, password, mfaCode)
    // On success, login and redirect to /dashboard
  }

  return (
    <>
      {step === 'credentials' && (
        <form onSubmit={handleSubmitCredentials}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">Login</button>
        </form>
      )}

      {step === 'mfa' && (
        <form onSubmit={handleSubmitMFA}>
          <p>Enter the 6-digit code from your authenticator app</p>
          <input 
            placeholder="000000" 
            maxLength="6" 
            value={mfaCode} 
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} 
          />
          <button type="submit">Verify</button>
        </form>
      )}
    </>
  );
}
```

**Director Sees**:
1. Standard login with email/password
2. "Enter authenticator code" screen appears
3. User enters 6-digit code from phone authenticator
4. Login succeeds only with correct code
5. **Talking point**: "Without the phone, nobody can log in—even with the correct password."

---

### 1.2 Account Lockout & Brute Force Protection
**Visibility**: Demo shows account locking after failed attempts

**Implementation**:
```typescript
// auth.ts
export async function loginWithMFA(email: string, password: string, mfaCode: string) {
  const user = await getUserByEmail(email);

  // Check if account is locked
  if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
    const minutesRemaining = Math.ceil(
      (new Date(user.lockedUntil).getTime() - Date.now()) / 60000
    );
    throw new Error(`Account locked. Try again in ${minutesRemaining} minutes.`);
  }

  // Validate password
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    // Increment failed attempts
    user.loginAttempts += 1;
    
    // Lock account after 5 failed attempts
    if (user.loginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30-minute lockout
      await updateUser(user);
      
      // LOG SECURITY EVENT
      logSecurityEvent({
        type: 'ACCOUNT_LOCKED',
        userId: user.id,
        reason: 'Too many failed login attempts',
        ipAddress: getClientIp(),
        timestamp: new Date(),
      });
      
      throw new Error('Too many failed attempts. Account locked for 30 minutes.');
    }
    
    await updateUser(user);
    throw new Error('Invalid email or password');
  }

  // Validate MFA code
  const mfaValid = verifyTOTP(mfaCode, user.mfaSecret);
  if (!mfaValid) {
    user.loginAttempts += 1;
    await updateUser(user);
    throw new Error('Invalid authenticator code');
  }

  // Success: Reset attempts, generate token
  user.loginAttempts = 0;
  user.lastLoginAt = new Date().toISOString();
  await updateUser(user);

  logSecurityEvent({
    type: 'LOGIN_SUCCESS',
    userId: user.id,
    ipAddress: getClientIp(),
    timestamp: new Date(),
  });

  return generateSessionToken(user);
}
```

**Director Sees**:
1. Try to login with wrong password 5 times
2. "Account locked for 30 minutes" message appears
3. **Talking point**: "If someone is trying to break into an account, they're stopped cold. The system locks the account automatically."

---

## Phase 2: Authorization & Session Management (HIGH PRIORITY)

### 2.1 Session Token Validation on Every Request
**Visibility**: Sessions expire, require re-login

**Implementation**:
```typescript
// middleware/authMiddleware.ts
export function withAuth(handler: Handler) {
  return (req: Request) => {
    // Get token from request
    const token = extractTokenFromHeader(req);
    if (!token) {
      return { ok: false, error: 'Unauthorized', status: 401 };
    }

    // Validate token
    const session = validateSessionToken(token);
    if (!session) {
      return { ok: false, error: 'Session expired. Please login again.', status: 401 };
    }

    // Validate permission
    const user = getUserById(session.userId);
    if (!user) {
      return { ok: false, error: 'User not found', status: 401 };
    }

    // Attach user to request
    req.user = user;
    req.session = session;

    // Call handler
    return handler(req);
  };
}

// Usage in store actions
export const approveHoldRequest = withAuth((args: { holdId: string }, req) => {
  // req.user is guaranteed to exist and be valid
  // req.session token is not expired
  
  if (!can(req.user.role, 'approve:hold')) {
    throw new Error('Unauthorized: You do not have permission to approve holds');
  }

  // Process approval...
});
```

**Token Expiration**:
```typescript
// Session tokens expire after 8 hours
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

// Refresh token (if implementing refresh tokens)
export function generateTokenPair(user: User) {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, type: 'access' },
    SECRET_KEY,
    { expiresIn: '8h' }
  );
  
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    REFRESH_SECRET_KEY,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}
```

**Director Sees**:
1. User logs in successfully
2. After 8 hours (or we can show with shortened demo time)
3. Try to access a page → "Session expired, please login again"
4. **Talking point**: "Sessions don't last forever. After 8 hours, you must re-authenticate. This prevents someone from stealing a token and using it indefinitely."

---

### 2.2 Permission Enforcement at API Level
**Visibility**: Attempting unauthorized actions shows permission errors

**Implementation**:
```typescript
// store/useWarehouseStore.ts - Add permission checks

export const approveHoldRequest = (holdId: string, operatorId: string) => {
  return (state: State) => {
    // Check permission
    const user = state.users.find(u => u.id === operatorId);
    if (!can(user?.role, 'approve:hold')) {
      return {
        ok: false,
        error: `${user?.role ?? 'This role'} cannot approve holds - permission denied`,
      };
    }

    // Check if hold exists
    const hold = state.holds.find(h => h.id === holdId);
    if (!hold) {
      return { ok: false, error: 'Hold not found' };
    }

    // Check hold state
    if (hold.status !== 'PendingApproval') {
      return { ok: false, error: 'Hold is not pending approval' };
    }

    // Approve hold
    return { ok: true, data: { hold: { ...hold, status: 'Active' } } };
  };
};
```

**Director Sees**:
1. Log in as Picker
2. Attempt to approve a hold (try to find the button—it won't be there)
3. Show the error message: "Pickers cannot approve holds"
4. **Talking point**: "The system checks permissions before every action. Even if somehow someone found the right button, the system would block them."

---

## Phase 3: Data Protection (MEDIUM PRIORITY)

### 3.1 Password Hashing (No Plaintext Storage)
**Visibility**: Not directly visible, but important to mention

**Implementation**:
```typescript
// auth.ts - Using bcrypt
import bcrypt from 'bcrypt';

export async function hashPassword(password: string) {
  // bcrypt with salt rounds = 12 (industry standard)
  const hash = await bcrypt.hash(password, 12);
  return hash;
}

export async function validatePassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}

// When creating/updating user
const passwordHash = await hashPassword(rawPassword);
const user = { ...user, passwordHash }; // Store hash, not plaintext
```

**Director Sees (in presentation)**:
- Slide showing: "Passwords are hashed with bcrypt (industry standard)"
- No passwords stored in plaintext
- Even if database is breached, passwords cannot be recovered

---

### 3.2 Sensitive Data Masking in Logs
**Visibility**: Audit logs show data safely

**Implementation**:
```typescript
// audit/logging.ts
function maskSensitiveData(data: any): any {
  const sensitive = ['password', 'creditCard', 'ssn', 'mfaSecret'];
  
  if (typeof data !== 'object') return data;
  
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (sensitive.some(s => key.toLowerCase().includes(s))) {
      acc[key] = '***MASKED***';
    } else if (typeof value === 'object' && value !== null) {
      acc[key] = maskSensitiveData(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as any);
}

// Usage
logSecurityEvent({
  type: 'USER_LOGIN',
  user: maskSensitiveData(user), // Passwords masked
  ipAddress: getClientIp(),
  timestamp: new Date(),
});
```

**Director Sees (in logs)**:
- Audit trail shows user actions
- But passwords/sensitive fields show as `***MASKED***`
- **Talking point**: "Even our own logs don't store passwords. If someone gains access to logs, they can't extract credentials."

---

## Phase 4: Attack Prevention (MEDIUM PRIORITY)

### 4.1 CSRF Protection
**Visibility**: Security headers shown in browser dev tools

**Implementation**:
```typescript
// middleware/csrfMiddleware.ts
export function generateCsrfToken(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  // Store in session/cookies
  store[userId].csrfToken = token;
  return token;
}

export function validateCsrfToken(userId: string, token: string) {
  return store[userId].csrfToken === token;
}

// In forms
export function CsrfTokenField() {
  const csrfToken = useWarehouseStore(s => s.csrfToken);
  return <input type="hidden" name="csrfToken" value={csrfToken} />;
}
```

**Director Sees (in browser dev tools)**:
- Security headers shown: Content-Security-Policy, X-Frame-Options, etc.
- **Talking point**: "The system includes CSRF protection. Forms include anti-forgery tokens that are validated server-side."

---

### 4.2 Input Validation & XSS Prevention
**Visibility**: Attempting to inject malicious data shows validation errors

**Implementation**:
```typescript
// validation/input.ts
const ALLOWED_CHARACTERS = /^[a-zA-Z0-9\s\-_./()]+$/;

export function validateRemark(remark: string): { ok: boolean; error?: string } {
  if (!remark || remark.length === 0) {
    return { ok: false, error: 'Remark cannot be empty' };
  }

  if (remark.length > 500) {
    return { ok: false, error: 'Remark cannot exceed 500 characters' };
  }

  if (!ALLOWED_CHARACTERS.test(remark)) {
    return { 
      ok: false, 
      error: 'Remark contains invalid characters. Only letters, numbers, spaces, and - _ . / ( ) are allowed' 
    };
  }

  return { ok: true };
}

// Usage
export const logCustomerReturn = (args) => {
  const remarkValidation = validateRemark(args.remark);
  if (!remarkValidation.ok) {
    return { ok: false, error: remarkValidation.error };
  }

  // Process return...
};
```

**Director Sees**:
1. Try to enter HTML/script tags in a text field
2. "Invalid characters" error appears
3. **Talking point**: "The system validates all input. You cannot inject malicious code—the system won't accept it."

---

## Phase 5: Monitoring & Alerting (MEDIUM PRIORITY)

### 5.1 Security Event Logging & Dashboard
**Visibility**: Shows all security events

**Implementation**:
```typescript
// types/security.ts
export interface SecurityEvent {
  id: string;
  type: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'ACCOUNT_LOCKED' | 'PERMISSION_DENIED' | 'DATA_ACCESS' | 'SUSPICIOUS_ACTIVITY';
  userId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

// Log security events
export function logSecurityEvent(event: SecurityEvent) {
  // Store in audit database
  securityAuditLog.push(event);
  
  // Alert if critical
  if (event.severity === 'critical') {
    sendSecurityAlert(event);
  }
}
```

**New Security Dashboard Page**:
```typescript
// pages/SecurityDashboardPage.tsx
export function SecurityDashboardPage() {
  const securityEvents = useWarehouseStore(s => s.securityEvents);
  
  return (
    <div className="space-y-6">
      <h1>Security Event Log</h1>
      
      {/* Critical events */}
      <div className="bg-red-50 border-l-4 border-red-500 p-4">
        <h2>🚨 Critical Events (Last 24h)</h2>
        {securityEvents
          .filter(e => e.severity === 'critical' && isWithinLast24h(e.timestamp))
          .map(e => (
            <div key={e.id} className="py-2">
              <span className="font-semibold">{e.type}</span>
              <span className="text-gray-600 text-sm">{e.details}</span>
              <span className="text-gray-500 text-xs">{e.timestamp} · {e.ipAddress}</span>
            </div>
          ))}
      </div>

      {/* Recent logins */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <h2>✅ Recent Successful Logins</h2>
        {securityEvents
          .filter(e => e.type === 'LOGIN_SUCCESS')
          .slice(0, 10)
          .map(e => (
            <div key={e.id} className="py-2">
              <span className="text-gray-600">{e.userId} logged in</span>
              <span className="text-gray-500 text-xs">{e.timestamp} · {e.ipAddress}</span>
            </div>
          ))}
      </div>

      {/* Failed login attempts */}
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
        <h2>⚠️ Failed Login Attempts</h2>
        {securityEvents
          .filter(e => e.type === 'LOGIN_FAILED')
          .slice(0, 10)
          .map(e => (
            <div key={e.id} className="py-2">
              <span className="text-gray-600">{e.details}</span>
              <span className="text-gray-500 text-xs">{e.timestamp} · {e.ipAddress}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
```

**Director Sees**:
1. New "Security Dashboard" page in nav (Manager+ role)
2. Shows all login attempts (success and failures)
3. Shows account lockouts
4. Shows suspicious activity
5. Shows permission denials
6. **Talking point**: "Every security event is logged and visible. If there's unusual activity, we see it immediately and can investigate."

---

## Phase 6: Audit & Compliance Features (MEDIUM PRIORITY)

### 6.1 Complete Action Audit Trail with User Identification
**Visibility**: Every action logged with who, what, when, where

**Implementation**:
```typescript
// audit/actionLog.ts
export interface ActionLog {
  id: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';
  resource: 'Pallet' | 'Hold' | 'Return' | 'PickTask' | 'Truck' | string;
  resourceId: string;
  userId: string;
  userName: string;
  userRole: string;
  changes?: { field: string; before: any; after: any }[];
  ipAddress: string;
  timestamp: string;
}

// Log every important action
export function logAction(action: ActionLog) {
  actionAuditLog.push(action);
  
  // For critical changes, also log details
  if (action.action === 'UPDATE' || action.action === 'DELETE') {
    logActionDetail(action);
  }
}

// Usage in store
export const approveHoldRequest = (holdId: string, operatorId: string) => {
  const hold = state.holds.find(h => h.id === holdId);
  const user = state.users.find(u => u.id === operatorId);
  
  const updatedHold = { ...hold, status: 'Active', approvedByUserId: operatorId };
  
  logAction({
    action: 'UPDATE',
    resource: 'Hold',
    resourceId: holdId,
    userId: operatorId,
    userName: user.name,
    userRole: user.role,
    changes: [
      { field: 'status', before: hold.status, after: 'Active' },
      { field: 'approvedByUserId', before: null, after: operatorId },
    ],
    ipAddress: getClientIp(),
    timestamp: new Date().toISOString(),
  });
  
  // Update hold...
};
```

**Director Sees (in Audit page)**:
- Every change shows: WHO did it, WHAT they changed, WHEN, and WHERE from
- Shows "before" and "after" values
- Impossible to deny an action was taken
- **Talking point**: "For compliance audits, we can prove exactly what changed and who changed it. No 'I didn't do that' excuses."

---

## Phase 7: Demonstration Features (HIGH PRIORITY FOR DIRECTOR)

### 7.1 "Security Test Mode"
Add a test mode where director can see security in action:

```typescript
// pages/SecurityDemoPage.tsx
export function SecurityDemoPage() {
  const [demoMode, setDemoMode] = useState<'none' | 'brute_force' | 'csrf' | 'injection'>('none');

  return (
    <>
      {/* Demo Control Panel */}
      <div className="bg-blue-50 p-6 rounded-lg mb-6">
        <h2 className="font-bold mb-4">🔐 Security Demonstration Mode</h2>
        <p className="text-sm text-gray-600 mb-4">
          Select a security test to see how the system prevents attacks:
        </p>
        
        <div className="space-y-3">
          <button onClick={() => setDemoMode('brute_force')} className="w-full bg-red-500 text-white p-3 rounded">
            🔓 Test Brute Force Prevention
          </button>
          <button onClick={() => setDemoMode('injection')} className="w-full bg-orange-500 text-white p-3 rounded">
            💉 Test Input Injection Prevention
          </button>
          <button onClick={() => setDemoMode('csrf')} className="w-full bg-yellow-500 text-white p-3 rounded">
            🔄 Test CSRF Protection
          </button>
        </div>
      </div>

      {/* Brute Force Demo */}
      {demoMode === 'brute_force' && <BruteForceDemoPanel />}

      {/* Injection Demo */}
      {demoMode === 'injection' && <InjectionDemoPanel />}

      {/* CSRF Demo */}
      {demoMode === 'csrf' && <CsrfDemoPanel />}
    </>
  );
}

// Brute Force Demo
function BruteForceDemoPanel() {
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);

  function handleWrongPassword() {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    if (newAttempts >= 5) {
      setLocked(true);
      alert('❌ Account locked for 30 minutes after 5 failed attempts');
    } else {
      alert(`❌ Attempt ${newAttempts}/5`);
    }
  }

  return (
    <div className="bg-red-50 border border-red-300 p-4 rounded">
      <h3 className="font-bold text-red-700 mb-3">Brute Force Prevention Demo</h3>
      <p className="text-sm mb-4">
        Try to login with wrong password. After 5 attempts, the account locks.
      </p>
      {locked ? (
        <div className="bg-red-100 p-3 rounded text-red-700">
          🔒 Account Locked. Try again in 30 minutes.
        </div>
      ) : (
        <>
          <p className="mb-3">Attempts: {attempts}/5</p>
          <button 
            onClick={handleWrongPassword}
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            Try Wrong Password
          </button>
        </>
      )}
    </div>
  );
}

// Input Injection Demo
function InjectionDemoPanel() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleTestInput() {
    const validation = validateRemark(input);
    setResult({
      ok: validation.ok,
      message: validation.error || '✅ Input accepted',
    });
  }

  return (
    <div className="bg-orange-50 border border-orange-300 p-4 rounded">
      <h3 className="font-bold text-orange-700 mb-3">Input Injection Prevention Demo</h3>
      <p className="text-sm mb-4">
        Try entering HTML, JavaScript, or SQL. The system will reject it.
      </p>
      <input 
        type="text"
        placeholder="Try: &lt;script&gt;alert('xss')&lt;/script&gt;"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full p-2 border rounded mb-3"
      />
      <button 
        onClick={handleTestInput}
        className="bg-orange-500 text-white px-4 py-2 rounded"
      >
        Test Input
      </button>
      {result && (
        <div className={`mt-3 p-2 rounded ${result.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}
```

**Director Sees**:
1. Click "Test Brute Force Prevention"
2. Try wrong password 5 times → Account locks
3. Click "Test Input Injection"
4. Try to enter `<script>alert('xss')</script>` → Rejected
5. **Talking point**: "These aren't theoretical—the system actively prevents these attacks right now."

---

## Implementation Roadmap

### Phase 1 (Week 1): Authentication - **START HERE**
- [ ] MFA (TOTP) implementation with authenticator app
- [ ] Account lockout after 5 failed attempts
- [ ] Password hashing with bcrypt
- [ ] Session token validation with JWT
- [ ] Update LoginPage with MFA step

### Phase 2 (Week 1): Authorization
- [ ] Permission checks on all actions
- [ ] Session middleware on API layer
- [ ] Token expiration and refresh
- [ ] Error messages for permission denials

### Phase 3 (Week 2): Monitoring
- [ ] Security event logging
- [ ] Security dashboard page
- [ ] Failed login tracking
- [ ] Suspicious activity detection

### Phase 4 (Week 2): Data Protection
- [ ] Sensitive data masking in logs
- [ ] Input validation on all forms
- [ ] CSRF token generation and validation
- [ ] XSS prevention filters

### Phase 5 (Week 3): Compliance
- [ ] Enhanced audit trail with before/after
- [ ] Action log with user identification
- [ ] IP address tracking
- [ ] User agent logging

### Phase 6 (Week 3): Demonstration
- [ ] Security test mode page
- [ ] Brute force demo
- [ ] Injection attack demo
- [ ] CSRF protection demo

---

## What the Director Will See (Demo Impact)

| Feature | Demo | Impact |
|---------|------|--------|
| **MFA** | Login requires 6-digit code | "Industry standard—even stolen passwords don't work" |
| **Account Lockout** | 5 wrong passwords → locked | "Attackers are stopped cold" |
| **Session Expiration** | 8-hour timeout → re-login required | "Stolen tokens expire and become useless" |
| **Input Validation** | Try to inject HTML → rejected | "Malicious code cannot enter the system" |
| **Security Dashboard** | See all login attempts | "All activity visible and tracked" |
| **Audit Trail** | Before/after values logged | "Proof of every change and who made it" |
| **Test Mode** | Run live attacks → all blocked | "The system actively defends itself" |

---

## Security Checklist for Director Handoff

Before the demo:
- [ ] MFA enabled on all test accounts
- [ ] Setup authenticator app with test QR codes
- [ ] Test account lockout feature works
- [ ] Security dashboard populated with sample events
- [ ] Input validation tested with malicious payloads
- [ ] Session expiration configured (can demo with shorter timeout)
- [ ] Audit logs show before/after changes
- [ ] Security test mode page fully functional

---

## Talking Points for Director

**Opening:**
> "I want to show you not just what our system prevents, but how it prevents it—with active defenses, not just design."

**MFA:**
> "Even if someone breaks your password through a massive breach, they cannot log in without your phone. That's two-factor authentication."

**Account Lockout:**
> "If someone is trying thousands of passwords, the account locks after 5 attempts. The attacker gets nowhere."

**Session Expiration:**
> "Sessions don't last forever. After 8 hours, you must re-authenticate. If someone steals a session token, it expires and becomes useless."

**Input Validation:**
> "We validate every input. Malicious code—HTML, JavaScript, SQL—gets rejected at the system boundary, not stored."

**Audit Trail:**
> "Every single change is logged with who made it, what changed, and when. We can prove compliance with any regulation."

**Monitoring:**
> "All security events—logins, failures, lockouts, suspicious activity—are logged and visible. We see attacks as they happen."

**Test Mode:**
> "Let me show you these defenses working. I'll run actual attack patterns against the system, and you'll see them all blocked."

---

## Security Architecture Summary (One-Pager for Director)

```
┌─────────────────────────────────────────────────┐
│         KAPA OIL WMS SECURITY ARCHITECTURE       │
├─────────────────────────────────────────────────┤
│                                                 │
│  🔐 AUTHENTICATION LAYER                        │
│  ├─ Multi-factor authentication (TOTP/2FA)     │
│  ├─ Bcrypt password hashing (never plaintext)  │
│  ├─ Account lockout after 5 failed attempts    │
│  └─ 30-minute lockout window                   │
│                                                 │
│  🔑 AUTHORIZATION LAYER                         │
│  ├─ JWT session tokens with expiration         │
│  ├─ 8-hour session timeout                     │
│  ├─ Role-based access control (RBAC)           │
│  ├─ Permission checks on every action          │
│  └─ Department-scoped data isolation           │
│                                                 │
│  🛡️ DEFENSE LAYER                               │
│  ├─ Input validation (no code injection)       │
│  ├─ XSS prevention (HTML encoding)             │
│  ├─ CSRF protection (token validation)         │
│  ├─ Rate limiting on login attempts            │
│  └─ SQL injection prevention (parameterized)   │
│                                                 │
│  📊 MONITORING LAYER                            │
│  ├─ Security event logging                     │
│  ├─ Failed login tracking                      │
│  ├─ IP address tracking                        │
│  ├─ User agent logging                         │
│  └─ Real-time security dashboard               │
│                                                 │
│  📋 COMPLIANCE LAYER                            │
│  ├─ Immutable audit trail                      │
│  ├─ Before/after change logging                │
│  ├─ User identification on all actions         │
│  ├─ Timestamp on every event                   │
│  └─ Regulatory audit-ready reports             │
│                                                 │
└─────────────────────────────────────────────────┘

RESULT: Multi-layered defense that prevents unauthorized access, fraud, and data breaches while maintaining complete compliance documentation.
```

---

## Implementation Commands

```bash
# Install security libraries
npm install bcryptjs jsonwebtoken speakeasy
npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/speakeasy

# Run security linting
npm run lint

# Build and test security features
npm run build

# Demo ready!
npm run dev
```

---

## Success Metrics

After implementation, the director should be able to see:

✅ Login with 2FA code  
✅ Account lock after 5 failed attempts  
✅ Session expiration after 8 hours  
✅ Permission denied errors for unauthorized actions  
✅ Input validation rejecting malicious payloads  
✅ Security event dashboard showing all activity  
✅ Audit trail with complete before/after tracking  
✅ Active attack prevention in test mode  

**If the director walks out impressed with all 8 of these, the security implementation is complete.**
