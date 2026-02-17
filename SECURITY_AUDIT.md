# Security Audit: Gift-Scheduler

**Date:** 2026-02-15
**Auditor:** Security Audit (Claude, independent review)
**Scope:** Full application — server (Express/SQLite), client (React/Vite), Docker/Railway deployment, CI/CD, dependencies
**Codebase:** Current `master` branch (post-remediation of prior SECURITY_REVIEW.md findings)
**Method:** Static code analysis. No dynamic testing or penetration testing performed.

---

## 1. High-Level Summary

The Gift-Scheduler application has undergone significant security improvements since the initial security review (`SECURITY_REVIEW.md`). Authentication (JWT + bcrypt), CORS restrictions, Content Security Policy, rate limiting, audit log PII sanitization, backup access controls, and SQL injection mitigations have all been implemented. The most critical findings from the previous review — no authentication, open CORS, disabled CSP, and the SQL injection in backup restore — have been addressed.

However, the current codebase still contains **several medium-severity issues** and **multiple low-severity gaps** that should be resolved before production use with real PII or real purchasing integrations. The most significant remaining risks are: (1) JWT tokens are not invalidated on password change, creating a window where compromised tokens remain valid; (2) the `approved_by` field in the approval workflow accepts arbitrary user-supplied strings rather than using the authenticated user's identity; (3) the JWT secret is unnecessarily exported as a module property; (4) the Docker image runs as root; and (5) there are no horizontal authorization checks (IDOR) — any authenticated user can access any other user's data if multi-user support is used.

**No backdoors, RAT behavior, download-and-execute chains, persistence mechanisms, obfuscation, or malicious payloads were found.** The application does not contain any suspicious or covert network activity. All dependencies resolve to the npmjs registry. The two packages with install scripts (`better-sqlite3`, `esbuild`) are well-known, legitimate native modules.

---

## 2. Critical and High-Severity Issues

No critical or high-severity issues remain. All critical/high findings from the prior review have been remediated:

| Prior Finding | Status |
|---|---|
| No authentication (Critical) | **Fixed** — JWT auth via `requireAuth` middleware on all `/api` routes except `/api/auth` and `/api/health` (`server/src/index.js:112`) |
| SQL injection via backup restore (Critical) | **Fixed** — Column allowlist in `ALLOWED_COLUMNS` (`server/src/routes/backup.js:39-52`) |
| Unrestricted CORS (High) | **Fixed** — CORS restricted to explicit origin (`server/src/index.js:50-55`) |
| CSP disabled (High) | **Fixed** — CSP enabled with proper directives (`server/src/index.js:34-47`) |
| Backup download without access control (High) | **Fixed** — Requires admin role + confirmation header + (restore requires password re-auth) (`server/src/routes/backup.js:55,74,95`) |

---

## 3. Medium-Severity Issues

### M1 — JWT Tokens Not Invalidated on Password Change

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | `server/src/routes/auth.js:117-143`, `server/src/middleware.js:22-24` |

**Description:** When a user changes their password (`PUT /api/auth/password`), the existing JWT tokens remain valid until they naturally expire after 24 hours (`TOKEN_EXPIRY = '24h'`). The `requireAuth` middleware verifies the token signature and confirms the user exists, but does not check whether the password has changed since the token was issued.

**Impact:** If a user's token is compromised, changing the password does not revoke the attacker's access. The attacker can continue using the stolen token for up to 24 hours.

**Remediation:**
- Add a `token_version` or `password_changed_at` column to the `users` table.
- Include this value in the JWT payload during token generation.
- In `requireAuth`, verify that the token's version/timestamp matches the current database value.
- When the password changes, increment the version or update the timestamp, automatically invalidating all prior tokens.

---

### M2 — Approval `approved_by` Accepts Arbitrary Strings (Identity Spoofing)

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | `server/src/routes/approvals.js:24`, `server/src/routes/approvals.js:70` |

**Description:** The `approved_by` field in the approval endpoint is taken directly from the request body, not from the authenticated user (`req.user`):

```js
const { event_id, gift_recommendation_id, card_message_id, approved_by, status, notes } = req.body;
```

Any authenticated user can claim the approval was made by anyone (e.g., `"approved_by": "CEO"` or `"approved_by": "admin"`).

**Impact:** Audit trail integrity is compromised. In a multi-user scenario, a regular user could spoof approvals as if they were made by an admin. The EventDetail client component also hardcodes `approved_by: 'owner'` (`client/src/pages/EventDetail.jsx:69`), which provides no real identity verification.

**Remediation:**
- Ignore the `approved_by` field from the request body.
- Use the authenticated user's identity: `const approved_by = req.user.username;`

---

### M3 — AUTH_SECRET Exported as Module Property

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | `server/src/middleware.js:62` |

**Description:** The JWT signing secret (`AUTH_SECRET`) is exported as part of the module's public API:

```js
module.exports = { generateToken, verifyToken, requireAuth, requireAdmin, AUTH_SECRET };
```

**Impact:** Any module that imports from `middleware.js` can access the raw signing secret. If a dependency or future code path inadvertently leaks this value (through logging, error messages, or a compromised dependency reading module exports), the secret would be exposed, allowing an attacker to forge arbitrary JWTs.

**Remediation:**
- Remove `AUTH_SECRET` from the module exports. No other module currently uses it.
- Keep the secret as a private variable within the middleware module.

---

### M4 — No Horizontal Authorization Checks (IDOR in Multi-User Scenario)

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | All route handlers (contacts, events, orders, etc.) |

**Description:** The application supports multiple users (`POST /api/auth/users` for admin-created users) with a `users` table that has role-based access (`admin`/`user`). However, data (contacts, events, orders, etc.) is not scoped to individual users. Any authenticated user can read, modify, or delete any other user's contacts, events, and orders. There is no `user_id` foreign key on the `contacts` table or any ownership check in route handlers.

**Impact:** In a multi-user deployment, this is an Insecure Direct Object Reference (IDOR) vulnerability. User A can read all of User B's contacts, PII, gift history, and orders by enumerating UUIDs (or simply calling `GET /api/contacts`).

**Remediation:**
- If the application is intended for single-user use, document this clearly and restrict user creation.
- If multi-user use is intended, add a `user_id` column to the `contacts` table (and cascade to events), and filter all queries by `req.user.id`.

---

### M5 — Restore Operation Wipes Audit Log

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | `server/src/routes/backup.js:138-140` |

**Description:** The restore endpoint deletes ALL data from ALL tables, including the `audit_log`:

```js
for (const table of clearOrder) {
  db.prepare(`DELETE FROM ${table}`).run();
}
```

The `EXPORT_TABLES` array includes `'audit_log'` (`backup.js:34`), so a restore operation destroys the entire audit trail and replaces it with whatever the backup contains.

**Impact:** An admin (or attacker who has obtained admin credentials) can erase evidence of their actions by restoring a backup that omits or modifies audit entries. This defeats the purpose of audit logging for accountability and forensics.

**Remediation:**
- Exclude `audit_log` from the restore deletion.
- Append restored audit entries rather than replacing them.
- Log the restore operation itself in the audit log *after* the restore completes (this is already done at `backup.js:176`, but the log entry is created after the old audit trail is deleted).

---

### M6 — Predictable Order References

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Location** | `server/src/routes/orders.js:40` |

**Description:** Order references are generated from `Date.now()` encoded as base-36:

```js
const orderRef = `GS-${Date.now().toString(36).toUpperCase()}`;
```

These are sequential, predictable, and time-correlating. An observer who sees one reference can calculate adjacent ones.

**Remediation:**
```js
const crypto = require('crypto');
const orderRef = `GS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
```

---

## 4. Low-Severity Issues and Code Smells

### L1 — Docker Container Runs as Root

**Location:** `Dockerfile`

The Dockerfile does not create or switch to a non-root user. The Node.js process runs as root inside the container, increasing the impact of any container escape or RCE vulnerability.

**Fix:** Add before the `CMD`:
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app /data
USER appuser
```

---

### L2 — API Key Masking Shows First 4 + Last 4 Characters

**Location:** `server/src/routes/integrations.js:99-102`

The `maskSecret()` function reveals 8 characters (first 4 + last 4) of each API key. For shorter keys, this is a non-trivial fraction of the total entropy.

**Fix:** Show only the last 4 characters:
```js
function maskSecret(value) {
  if (!value) return null;
  return '••••••••' + value.slice(-4);
}
```

---

### L3 — No Input Validation for Date Formats

**Location:** `server/src/routes/contacts.js:80-114`, `server/src/routes/events.js:82-107`

Date fields (birthday, anniversary, other_date, event date) accept free-form text with no format validation. Invalid dates cause `NaN` in delivery calculations (`gifts.js:105-107`).

**Fix:** Validate `YYYY-MM-DD` format before accepting:
```js
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (date && !dateRegex.test(date)) {
  return res.status(400).json({ error: 'Date must be YYYY-MM-DD format' });
}
```

---

### L4 — `parseInt` Without Radix and NaN Check

**Location:** `server/src/routes/events.js:35`, `server/src/routes/notifications.js:20`

`parseInt()` on query parameters without radix 10 and without NaN checking:
```js
params.push(parseInt(req.query.limit));  // NaN if not a number
```

In SQLite via better-sqlite3, passing `NaN` as a parameter is coerced to `null`, which causes `LIMIT NULL` (no limit). This is a minor DoS vector — an attacker can bypass pagination by passing `limit=abc`.

**Fix:**
```js
const limit = parseInt(req.query.limit, 10);
if (Number.isFinite(limit) && limit > 0) {
  query += ' LIMIT ?';
  params.push(Math.min(limit, 1000)); // cap at reasonable max
}
```

---

### L5 — JWT Token Stored in localStorage (XSS Risk)

**Location:** `client/src/api.js:6-15`

The JWT token is stored in `localStorage`, which is accessible to any JavaScript running on the page. If an XSS vulnerability is ever introduced, the attacker can trivially exfiltrate the token and gain full API access.

**Fix:** For defense-in-depth, consider using an `HttpOnly` cookie for token transport. This would require server-side changes to set the cookie in the login response and read it from the cookie header in the middleware. Alternatively, accept the risk given that CSP is now enabled, which significantly reduces XSS attack surface.

---

### L6 — Password Minimum Complexity

**Location:** `server/src/routes/auth.js:64-66`

Only an 8-character minimum length is enforced. No requirements for uppercase, numbers, or special characters.

This is a low risk for a personal-use application but should be noted. Consider adding a check for at least one letter and one number, or use a library like `zxcvbn` for strength estimation.

---

### L7 — No Maximum Password Length

**Location:** `server/src/routes/auth.js:64-66`, `server/src/routes/auth.js:124-126`

No maximum length is enforced on passwords. While bcrypt internally truncates input at 72 bytes, an attacker could send extremely large password strings (e.g., 10MB) to consume server memory before the bcrypt call. The 10MB JSON body limit (`express.json({ limit: '10mb' })`) bounds the total request size, but a dedicated password length check would be more explicit.

**Fix:** Add `if (password.length > 128) return res.status(400).json({ error: 'Password too long' });`

---

### L8 — PII Stored Without Encryption at Rest

**Location:** `server/src/database.js` (contacts table)

Contact PII (names, emails, phones, birthdays, anniversaries) is stored in plaintext in the SQLite database file. The database file is not encrypted.

For a personal-use application deployed on Railway with a mounted volume, this is acceptable risk. For any deployment handling others' PII or subject to compliance requirements, SQLCipher or application-layer encryption should be considered.

---

### L9 — `tracking_url` Rendered as Clickable Link Without Validation

**Location:** `client/src/pages/Orders.jsx:92-93`, `server/src/routes/orders.js:125-126`

The `tracking_url` field is user-supplied (via the order status update endpoint) and rendered as an `<a href>` in the React client. React does sanitize most XSS vectors in `href` attributes, and the `rel="noopener noreferrer"` attribute is present. However, the server does not validate that the URL uses `https://` or `http://` protocol.

**Fix:** Validate URL format on the server side:
```js
if (tracking_url && !/^https?:\/\//i.test(tracking_url)) {
  return res.status(400).json({ error: 'tracking_url must be a valid HTTP(S) URL' });
}
```

---

### L10 — Backup Restore Does Not Validate Row Data Types

**Location:** `server/src/routes/backup.js:160`

While column names are validated against the allowlist, the *values* in each row are not type-checked. A crafted restore payload could insert incorrect types (e.g., a string where a number is expected, or a malformed JSON blob in a JSON column like `preferences`). SQLite's flexible typing means this data would be stored but could cause runtime errors when parsed with `JSON.parse()`.

---

## 5. Suspicious or Potentially Malicious Behavior

**No suspicious behavior was found.** Specifically:

- **No unexpected network activity:** The server only makes outbound connections if external API keys are configured (retailer, florist, LLM integrations). The current code uses only a mock catalog — no actual HTTP calls to external services are made.
- **No download-and-execute patterns:** No code fetches remote scripts, binaries, or dynamically evaluated code.
- **No persistence mechanisms:** No cron jobs, systemd services, shell profile modifications, or registry changes.
- **No privilege escalation:** No use of `sudo`, `setuid`, or capability elevation. The Docker `HEALTHCHECK` uses `wget` which is appropriate.
- **No obfuscation or hidden payloads:** No base64 blobs decoded at runtime, no minified code without source, no high-entropy strings in execution paths, no embedded binaries.
- **No data exfiltration channels:** The backup export/download endpoints are controlled by admin auth + confirmation headers — they serve a legitimate purpose.

### Dependencies

All dependencies resolve to the official npm registry. The two packages with postinstall scripts are expected:

| Package | Install Script Reason | Risk |
|---|---|---|
| `better-sqlite3` | Compiles native SQLite addon via `node-gyp` | Normal — well-maintained, 7K+ GitHub stars |
| `esbuild` | Downloads platform-specific binary | Normal — official Vite/esbuild distribution |
| `fsevents` | macOS file system events (optional) | Normal — not used on Linux/Railway |

No git URL dependencies, no precompiled binaries without source, no unusual or typosquat package names.

---

## 6. Secure Development Recommendations

### 6.1 — Token Lifecycle Management
Implement JWT token versioning or blacklisting. At minimum, embed a `password_changed_at` timestamp in the JWT payload and validate it on each request. This is the most impactful improvement to make.

### 6.2 — Use Authenticated Identity for Audit Trails
Replace all instances of user-supplied identity fields (like `approved_by` in approvals) with `req.user.username` from the authenticated JWT payload. This ensures audit trail integrity.

### 6.3 — Remove AUTH_SECRET from Module Exports
The JWT signing secret should be a private variable, not part of the module's public API. Remove it from `module.exports` in `middleware.js`.

### 6.4 — Add Integration/API Security Tests
The current test suite (`server/src/__tests__/api.test.js`) tests database operations directly but not the HTTP API layer. Add tests that verify:
- Unauthenticated requests return 401
- Non-admin users get 403 on admin-only endpoints
- Rate limits function correctly
- Backup operations require confirmation headers
- Invalid input is rejected with proper error codes

### 6.5 — Implement Data Scoping for Multi-User
If the application will support multiple users, add `user_id` ownership to data tables and filter all queries accordingly. Until then, consider restricting user creation or documenting the single-user assumption.

### 6.6 — Run Docker Container as Non-Root
Add a non-root user to the Dockerfile and switch to it before the `CMD`.

### 6.7 — Add Server-Side Input Validation
Add consistent input validation for:
- Date format (YYYY-MM-DD)
- URL format (https:// only for `tracking_url`)
- Numeric parameters (parseInt with radix and bounds checking)
- String length limits on text fields

### 6.8 — Consider CSRF Mitigation
The current JWT-in-Authorization-header approach is inherently resistant to CSRF attacks, since custom headers cannot be set by cross-origin form submissions or simple requests. This is adequate for the current architecture. If the app migrates to cookie-based auth, CSRF tokens will become necessary.

### 6.9 — Dependency Monitoring
Set up automated dependency vulnerability scanning (e.g., `npm audit` in CI, Dependabot, or Snyk). The CI pipeline currently runs tests and builds but does not check for known vulnerabilities in dependencies.

### 6.10 — Audit Log Immutability
Protect the audit log from modification during restore operations. Consider making audit entries append-only and excluding them from restore overwrite.

---

## Summary Table

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| M1 | JWT tokens not invalidated on password change | Medium | **Fixed** — `token_version` column added to users table; included in JWT payload; validated in `requireAuth`; incremented on password change (`middleware.js`, `auth.js`) |
| M2 | Approval `approved_by` accepts arbitrary strings | Medium | **Fixed** — `approved_by` now derived from `req.user.username` instead of request body (`approvals.js:27`); client no longer sends the field (`EventDetail.jsx`) |
| M3 | AUTH_SECRET exported as module property | Medium | **Fixed** — `AUTH_SECRET` removed from `module.exports` in `middleware.js:67` |
| M4 | No horizontal authorization (IDOR in multi-user) | Medium | **Fixed** — `user_id` column added to contacts table; set on creation; ownership checks in GET/PUT/DELETE for contacts and events; non-admin users scoped to own data (`contacts.js`, `events.js`, `database.js`) |
| M5 | Restore operation wipes audit log | Medium | **Fixed** — `audit_log` excluded from deletion during restore; restored audit entries appended via `INSERT OR IGNORE` (`backup.js:38,166-167,187`) |
| M6 | Predictable order references | Medium | **Fixed** — Order references now use `crypto.randomBytes(6)` instead of `Date.now().toString(36)` (`orders.js:41`) |
| L1 | Docker container runs as root | Low | **Fixed** — Non-root `appuser` created and `USER appuser` set before `CMD` (`Dockerfile`) |
| L2 | API key masking shows too many characters | Low | **Fixed** — `maskSecret()` now shows only last 4 characters (`integrations.js:100`) |
| L3 | No date format validation | Low | **Fixed** — YYYY-MM-DD regex validation added to contacts and events routes (`contacts.js`, `events.js`) |
| L4 | parseInt without radix/NaN check | Low | **Fixed** — `parseInt` calls use radix 10 with `Number.isFinite` check and max cap of 1000 (`events.js:42-46`, `notifications.js:19-23`) |
| L5 | JWT in localStorage (XSS exposure) | Low | Accepted — CSP mitigates XSS risk; architectural change to cookie-based auth deferred |
| L6 | Minimal password complexity requirements | Low | **Fixed** — Passwords now require at least one letter and one number (`auth.js:15-28`) |
| L7 | No maximum password length | Low | **Fixed** — 128-character maximum enforced (`auth.js:19-21`) |
| L8 | PII stored without encryption at rest | Low | Accepted — Acceptable risk for personal-use deployment per audit recommendation |
| L9 | tracking_url not validated as HTTP(S) | Low | **Fixed** — Server validates `https?://` protocol before accepting (`orders.js:121-123`) |
| L10 | Backup restore doesn't validate value types | Low | **Fixed** — Numeric columns validated against expected types; rows with type errors skipped (`backup.js:57-79,192-201`) |

---

## Positive Observations

The following security practices are in place and represent good engineering:

- **JWT authentication** with bcrypt (12 rounds) password hashing and role-based access control
- **requireAuth middleware** applied to all API routes except public auth endpoints
- **requireAdmin middleware** applied to sensitive operations (settings, emergency stop, orders, backup)
- **Helmet.js** with full CSP including `frame-ancestors: 'none'`
- **CORS** restricted to explicit allowed origin
- **Rate limiting** with tiered limits (general: 200/15min, auth: 15/15min, sensitive: 10/15min)
- **Parameterized queries** throughout (better-sqlite3 `?` placeholders)
- **UUID v4** for all primary keys (prevents enumeration)
- **Audit logging** with PII sanitization (email, phone, birthday redacted)
- **Backup operations** gated behind admin + confirmation header + re-authentication for restore
- **SQL injection fix** via column allowlist in backup restore
- **Settings key allowlist** prevents arbitrary key injection
- **Approval required for orders** (`approval_id` is mandatory)
- **Import batch limit** (500 contacts max)
- **Emergency stop** mechanism with order cancellation cascade
- **Foreign keys with CASCADE** for data integrity
- **WAL mode** for SQLite concurrent access
- **Multi-stage Docker build** minimizes production image surface
- **Graceful shutdown** handlers prevent data corruption
- **No `dangerouslySetInnerHTML`** or `eval()` in React code
- **`.gitignore`** correctly excludes `.env`, database files, and `node_modules`
- **Generic error messages** in global error handler and restore endpoint

---

## Methodology and Caveats

- This is a static code analysis review. No dynamic testing, fuzzing, or penetration testing was performed.
- External API integrations (Amazon, Etsy, Walmart, florists, LLM providers) currently use mock data only. When real API calls are implemented, those code paths will need a separate review for SSRF, response validation, and credential handling.
- The LLM integration for card message generation (using Claude/OpenAI/Gemini) is documented but not yet implemented. When added, prompt injection risks should be assessed — user-controlled data (contact names, preferences) will be interpolated into LLM prompts.
- Express 4.x is used. Express 5.x is now available and includes security improvements. Consider upgrading when it reaches stable status.
