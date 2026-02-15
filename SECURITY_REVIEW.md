# Security Review: Gift-Scheduler

**Date:** 2026-02-15
**Reviewer:** Automated Security Review (Claude)
**Scope:** Full application — server (Express/SQLite), client (React/Vite), Docker/Railway deployment
**Codebase Snapshot:** `master` branch

---

## Executive Summary

The Gift-Scheduler application has several **critical and high-severity security issues** that must be addressed before any production deployment. The most urgent are the complete absence of authentication/authorization, unrestricted CORS, disabled Content Security Policy, and a SQL injection vector in the backup/restore module. The application handles PII (names, emails, phone numbers, birthdays, anniversaries) and interfaces with purchasing/financial workflows, making these gaps especially consequential.

---

## Findings

### FINDING 1 — No Authentication or Authorization

| Field | Value |
|-------|-------|
| **Severity** | **Critical** |
| **Location** | `server/src/index.js` (entire application) |

**Risk:** Every API endpoint is publicly accessible with zero authentication. Anyone who can reach the server can read all contacts (PII), create/delete records, place orders, trigger emergency stops, export the entire database, or restore from a malicious backup.

**Exploitation Scenario:** An attacker discovers the server address (e.g., via port scan, misconfigured firewall, or public Railway deployment). They call `GET /api/backup/download` and exfiltrate the entire SQLite database containing all PII and order history. Or they call `POST /api/backup/restore` with a crafted payload to overwrite all data.

**Recommended Fix:**
- Implement an authentication layer (session-based, JWT, or OAuth) as middleware applied to all `/api/*` routes.
- Add role-based authorization for sensitive operations (backup/restore, emergency stop, settings changes, order creation).
- At minimum, add a shared secret/API key for single-user deployments: `Authorization: Bearer <token>` checked in middleware.

---

### FINDING 2 — SQL Injection via Backup Restore

| Field | Value |
|-------|-------|
| **Severity** | **Critical** |
| **Location** | `server/src/routes/backup.js:99-108` |

**Risk:** The restore endpoint constructs SQL INSERT statements using column names directly from the user-supplied JSON payload without any validation or allowlisting.

```js
const columns = Object.keys(rows[0]);  // attacker-controlled
const placeholders = columns.map(() => '?').join(', ');
const stmt = db.prepare(
  `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
);
```

The `table` variable also comes from the `EXPORT_TABLES` constant (which is safe), but the `columns` are fully attacker-controlled. An attacker can craft column names containing SQL syntax (e.g., `"id, name) VALUES ('x','x'); DROP TABLE contacts; --"`) to inject arbitrary SQL.

**Exploitation Scenario:** Attacker sends `POST /api/backup/restore` with a JSON body where a table's first row has keys containing SQL injection payloads. Since `db.prepare()` in better-sqlite3 compiles the full statement, a carefully crafted column name can break out of the intended query structure. Even if `db.prepare` rejects multi-statement payloads, column names like `id) VALUES (1); --` can corrupt the query logic.

**Recommended Fix:**
- Validate that every column name in the restore payload matches the known schema columns for each table. Reject or strip any column that doesn't exist in the expected schema.
- Use a schema definition map (table name -> allowed columns) and verify against it before constructing any SQL.

```js
const ALLOWED_COLUMNS = {
  contacts: ['id', 'name', 'email', 'phone', 'relationship', ...],
  events: ['id', 'contact_id', 'type', 'name', 'date', ...],
  // ...
};

const columns = Object.keys(rows[0]).filter(
  col => ALLOWED_COLUMNS[table]?.includes(col)
);
```

---

### FINDING 3 — Unrestricted CORS Configuration

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Location** | `server/src/index.js:25` |

**Risk:** `app.use(cors())` with no options enables CORS for **all origins**. Any website on the internet can make cross-origin requests to this API and read the responses, including all PII and sensitive data.

```js
app.use(cors());  // allows Access-Control-Allow-Origin: *
```

**Exploitation Scenario:** An attacker hosts a malicious page. When a victim visits it, JavaScript on that page calls `fetch('https://gift-scheduler.example.com/api/contacts')` and exfiltrates all contact data. If authentication were added later but CORS remained open, authenticated cross-origin requests from attacker sites would still work.

**Recommended Fix:**
- Restrict CORS to the application's own origin:
```js
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
```

---

### FINDING 4 — Content Security Policy Disabled

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Location** | `server/src/index.js:24` |

**Risk:** Helmet is used but CSP is explicitly disabled: `helmet({ contentSecurityPolicy: false })`. This removes a critical defense-in-depth layer against XSS attacks.

**Exploitation Scenario:** If any XSS vector is introduced (e.g., through a future feature rendering user-supplied card messages in HTML, or through a dependency vulnerability), there is no CSP to prevent execution of injected scripts.

**Recommended Fix:**
- Enable CSP with appropriate directives:
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // needed for Tailwind
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));
```

---

### FINDING 5 — Backup Download Exposes Full Database Without Access Control

| Field | Value |
|-------|-------|
| **Severity** | **High** |
| **Location** | `server/src/routes/backup.js:45-63` |

**Risk:** `GET /api/backup/download` streams the raw SQLite file to any requester. Combined with Finding 1 (no auth), this is a full data exfiltration endpoint. The export endpoint (`GET /api/backup/export`) similarly returns all data as JSON.

**Exploitation Scenario:** `curl https://target/api/backup/download -o stolen.db` — trivially exfiltrates the entire database.

**Recommended Fix:**
- Gate behind authentication (Finding 1).
- Add a confirmation mechanism (e.g., require a CSRF token or confirmation header).
- Consider requiring a re-authentication step for backup operations.

---

### FINDING 6 — Database Path Disclosure

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/backup.js:162-168` |

**Risk:** The `GET /api/backup/status` endpoint returns `db_path` — the full filesystem path to the SQLite database. This is information disclosure that aids further attacks (path traversal, direct file access if another vulnerability exists).

```js
res.json({
  db_path: DB_PATH,  // e.g., "/data/gift_scheduler.db"
  file_size_bytes: fileSize,
  ...
});
```

**Exploitation Scenario:** Attacker learns the exact path where sensitive data resides on the server filesystem, enabling targeted exploitation of any file-read vulnerability.

**Recommended Fix:**
- Remove `db_path` from the response. It provides no value to legitimate users and aids attackers.

---

### FINDING 7 — No Rate Limiting on Any Endpoint

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/index.js` (entire application) |

**Risk:** No rate limiting middleware exists. Every endpoint can be called unlimited times. This enables brute force attacks, resource exhaustion, and abuse of external API integrations (which have their own rate limits and may incur costs).

**Exploitation Scenario:**
- An attacker hammers `POST /api/gifts/recommend/:eventId` thousands of times, generating massive database writes.
- An attacker calls `POST /api/backup/restore` repeatedly to keep the database in a corrupted/unusable state.
- When external API integrations are enabled, unlimited requests exhaust third-party rate limits or generate unexpected API costs.

**Recommended Fix:**
- Add `express-rate-limit`:
```js
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
```
- Apply stricter limits to sensitive endpoints (backup, restore, settings, orders).

---

### FINDING 8 — Audit Log Records Sensitive Data in Plaintext

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/contacts.js:153`, `server/src/audit.js:10` |

**Risk:** The audit log stores the full request body (including PII) in plaintext:

```js
logAudit('update', 'contact', req.params.id, { changes: req.body });
```

This means emails, phone numbers, birthdays, and all personal preferences are written to the audit_log table in the `details` JSON column. The audit log is also exposed via an unauthenticated API endpoint (`GET /api/settings/audit`).

**Exploitation Scenario:** Even if contact records are deleted (honoring a GDPR "right to be forgotten" request), their PII persists in the audit log. An attacker (or even a legitimate user reviewing audit logs) can see all historical PII changes.

**Recommended Fix:**
- Sanitize audit log details to exclude sensitive fields (email, phone, birthday).
- Log only the field names that changed, not the values, for PII fields.
- Restrict audit log access to authenticated administrators.

---

### FINDING 9 — Approval Bypass: Orders Can Be Created Without Approval

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/orders.js:28-35` |

**Risk:** The order creation endpoint only validates the approval if `approval_id` is provided. It is not required:

```js
if (approval_id) {
  const approval = db.prepare(
    "SELECT * FROM approvals WHERE id = ? AND status = 'approved'"
  ).get(approval_id);
  if (!approval) {
    return res.status(400).json({ error: 'Valid approval required before ordering' });
  }
}
```

If `approval_id` is omitted from the request body, the check is skipped entirely, and an order is created without any approval.

**Exploitation Scenario:** An attacker or unauthorized user calls `POST /api/orders` with `{ gift_recommendation_id: "...", event_id: "..." }` (no `approval_id`). The order is created, bypassing the entire approval workflow.

**Recommended Fix:**
- Make `approval_id` required, not optional:
```js
if (!gift_recommendation_id || !event_id || !approval_id) {
  return res.status(400).json({ error: 'gift_recommendation_id, event_id, and approval_id are required' });
}
```
- Always validate that the approval is in `'approved'` status before proceeding.

---

### FINDING 10 — Global Settings Key Injection

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/settings.js:18-32` |

**Risk:** The `PUT /api/settings/:key` endpoint accepts arbitrary key names from the URL parameter and inserts/updates them in `global_settings` with no allowlist validation:

```js
router.put('/:key', (req, res) => {
  db.prepare(`
    INSERT INTO global_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(req.params.key, String(value), String(value));
});
```

**Exploitation Scenario:** An attacker can create arbitrary settings keys, potentially overwriting critical settings like `emergency_stop` or `autonomy_global_level`, or polluting the settings table with unexpected keys that could cause application logic issues.

**Recommended Fix:**
- Validate `req.params.key` against an allowlist of known settings:
```js
const ALLOWED_KEYS = ['emergency_stop', 'default_lead_time_days', 'autonomy_global_level'];
if (!ALLOWED_KEYS.includes(req.params.key)) {
  return res.status(400).json({ error: 'Unknown setting key' });
}
```

---

### FINDING 11 — PII Stored Without Encryption at Rest

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/database.js` (contacts table) |

**Risk:** Contact PII (name, email, phone, birthday, anniversary, preferences) is stored in plaintext in the SQLite database file. The database file itself is not encrypted. Combined with Finding 5 (downloadable database), this means all PII is trivially extractable.

**Exploitation Scenario:** Server compromise, backup theft, or the unauthenticated download endpoint gives an attacker a plain SQLite file they can open with any SQLite client to read all PII.

**Recommended Fix:**
- Use SQLCipher or similar SQLite encryption extension for encryption at rest.
- At minimum, encrypt sensitive columns (email, phone) at the application layer before storage.
- Ensure database file permissions are restrictive (`chmod 600`).

---

### FINDING 12 — Error Message Information Leakage

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/backup.js:144`, `server/src/index.js:70` |

**Risk:** The restore endpoint returns raw error messages to the client:

```js
res.status(500).json({ error: 'Restore failed: ' + err.message });
```

SQLite error messages can reveal table structures, column names, constraint details, and internal implementation details.

The global error handler (`index.js:70`) correctly returns a generic message, but individual route-level catches like this one leak details.

**Exploitation Scenario:** An attacker sends malformed restore payloads and observes detailed SQLite error messages to map out the database schema and find injection vectors.

**Recommended Fix:**
- Return generic error messages to the client. Log detailed errors server-side only:
```js
catch (err) {
  console.error('Restore failed:', err);
  res.status(500).json({ error: 'Restore failed. Check server logs for details.' });
}
```

---

### FINDING 13 — No CSRF Protection

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/index.js` (entire application) |

**Risk:** No CSRF tokens or SameSite cookie protections are implemented. State-changing operations (POST/PUT/DELETE) are vulnerable to cross-site request forgery. The open CORS policy (Finding 3) makes this worse by allowing cross-origin requests.

**Exploitation Scenario:** A malicious website visited by the application's user triggers a `POST` to `/api/settings/emergency-stop` with `{ activate: true }`, canceling all pending orders. Or it calls `DELETE /api/contacts/:id` to delete contacts.

**Recommended Fix:**
- Implement CSRF tokens (e.g., via `csurf` or `csrf-csrf` middleware).
- Use `SameSite=Strict` or `SameSite=Lax` on session cookies when auth is added.
- The restrictive CORS policy from Finding 3's fix would partially mitigate this.

---

### FINDING 14 — Bulk Import Has No Size Limit

| Field | Value |
|-------|-------|
| **Severity** | **Medium** |
| **Location** | `server/src/routes/contacts.js:165-226` |

**Risk:** The bulk import endpoint (`POST /api/contacts/import`) processes an arbitrarily large array of contacts. While there's a 10MB JSON body limit (`express.json({ limit: '10mb' })`), this still allows thousands of contacts to be imported in a single request, creating a potential denial-of-service vector through database write amplification (each contact also triggers event creation).

**Exploitation Scenario:** An attacker sends a 10MB JSON payload containing tens of thousands of contacts, each with birthday, anniversary, and other_date fields. This creates ~3x that many events, flooding the database with hundreds of thousands of rows and causing performance degradation.

**Recommended Fix:**
- Add an explicit limit to the number of contacts per import batch:
```js
if (importData.length > 500) {
  return res.status(400).json({ error: 'Maximum 500 contacts per import' });
}
```

---

### FINDING 15 — Predictable Order References

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/routes/orders.js:41` |

**Risk:** Order references are generated from `Date.now()` encoded as base-36:

```js
const orderRef = `GS-${Date.now().toString(36).toUpperCase()}`;
```

These are sequential and predictable. An attacker who sees one order reference can easily calculate adjacent ones, enabling order enumeration.

**Exploitation Scenario:** Knowing order ref `GS-M7W1ABCD`, an attacker can compute nearby refs and probe for valid order IDs (though order lookup currently uses UUIDs, not refs, so the immediate risk is low).

**Recommended Fix:**
- Use `crypto.randomBytes` for order reference generation:
```js
const crypto = require('crypto');
const orderRef = `GS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
```

---

### FINDING 16 — Request Logging May Capture Sensitive Query Parameters

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/index.js:29-37` |

**Risk:** The request logger logs the full `req.path`, which could include query parameters with sensitive data in future iterations:

```js
console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
```

Currently `req.path` does not include query strings (Express separates them), but if this is changed to `req.originalUrl` in the future, parameters like contact IDs and filter values would be logged.

**Exploitation Scenario:** Low immediate risk. If logging is extended to include query strings, audit log queries with `entity_type` and `entity_id` parameters would appear in application logs.

**Recommended Fix:**
- Explicitly ensure only the path (not query string) is logged.
- Consider structured logging that allows redacting sensitive fields.

---

### FINDING 17 — No Input Validation for Date Formats

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/routes/contacts.js:80-114`, `server/src/routes/events.js:82-107` |

**Risk:** Date fields (birthday, anniversary, other_date, event date) are accepted as free-form text with no format validation. Invalid dates won't crash the application but will cause incorrect behavior in date calculations (e.g., delivery estimates, lead time calculations in `gifts.js:105-107`).

```js
const eventDate = new Date(event.date);  // garbage in, NaN out
const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));  // NaN
```

**Exploitation Scenario:** An attacker creates an event with `date: "not-a-date"`. The gift recommendation engine calculates `NaN` for delivery feasibility, potentially marking all gifts as deliverable or none.

**Recommended Fix:**
- Validate dates against ISO 8601 format (`YYYY-MM-DD`):
```js
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
if (!dateRegex.test(date)) {
  return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
}
```

---

### FINDING 18 — Missing `parseInt` Radix and Type Coercion Issues

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/routes/events.js:35`, `server/src/routes/notifications.js:20`, `server/src/routes/settings.js:149` |

**Risk:** `parseInt()` is used on query parameters without radix specification and without NaN checking:

```js
params.push(parseInt(req.query.limit));  // events.js:35
params.push(parseInt(req.query.limit));  // notifications.js:20
params.push(parseInt(req.query.limit) || 100);  // settings.js:149
```

The first two cases pass `NaN` to SQLite if `limit` is not a valid number, which could cause unexpected query behavior. The settings.js case handles it with `|| 100` fallback.

**Recommended Fix:**
- Always specify radix 10 and handle NaN:
```js
const limit = parseInt(req.query.limit, 10);
if (!Number.isFinite(limit) || limit < 1) {
  return res.status(400).json({ error: 'Invalid limit parameter' });
}
```

---

### FINDING 19 — Docker Image Runs as Root

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `Dockerfile` |

**Risk:** The Dockerfile does not create or switch to a non-root user. The Node.js process runs as root inside the container, which increases the blast radius of any container escape or code execution vulnerability.

**Recommended Fix:**
- Add a non-root user:
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app /data
USER appuser
```

---

### FINDING 20 — API Key Masking Shows First and Last 4 Characters

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/routes/integrations.js:99-102` |

**Risk:** The `maskSecret` function reveals 8 characters of each API key (first 4 + last 4):

```js
function maskSecret(value) {
  if (!value || value.length < 8) return value ? '••••••••' : null;
  return value.slice(0, 4) + '••••' + value.slice(-4);
}
```

For short API keys (e.g., 20 characters), revealing 8 characters (40%) significantly reduces the entropy an attacker needs to guess the rest. This endpoint is also unauthenticated (Finding 1), so anyone can view masked API keys.

**Exploitation Scenario:** An attacker calls `GET /api/integrations` and sees `sk-p••••bCdE` for an OpenAI key. With 8 known characters of a 51-character key, brute force is still impractical, but the exposure is unnecessary and violates the principle of least privilege.

**Recommended Fix:**
- Show only the last 4 characters, consistent with industry practice:
```js
function maskSecret(value) {
  if (!value) return null;
  return '••••••••' + value.slice(-4);
}
```
- Better yet: don't expose any portion of API keys via unauthenticated endpoints.

---

### FINDING 21 — Foreign Key Checks Disabled During Restore

| Field | Value |
|-------|-------|
| **Severity** | **Low** |
| **Location** | `server/src/routes/backup.js:90` |

**Risk:** The restore process disables foreign key checks:

```js
db.pragma('foreign_keys = OFF');
```

While this is re-enabled afterwards (`foreign_keys = ON`), if the restore fails partway through the transaction, the referential integrity of the database could be compromised. The transaction wrapper should handle rollback, but better-sqlite3's transaction rollback may not restore the pragma.

**Recommended Fix:**
- Verify that pragmas are restored even on error (pragmas are connection-level, not transactional in SQLite).
- Add a try/finally around the pragma changes:
```js
try {
  db.pragma('foreign_keys = OFF');
  // ... restore logic ...
} finally {
  db.pragma('foreign_keys = ON');
}
```

---

## Summary Table

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | No Authentication or Authorization | **Critical** | Auth |
| 2 | SQL Injection via Backup Restore | **Critical** | Injection |
| 3 | Unrestricted CORS Configuration | **High** | Network/API |
| 4 | Content Security Policy Disabled | **High** | Headers |
| 5 | Backup Download Without Access Control | **High** | Data Protection |
| 6 | Database Path Disclosure | Medium | Info Disclosure |
| 7 | No Rate Limiting | Medium | DoS/Abuse |
| 8 | Audit Log Records PII in Plaintext | Medium | Privacy |
| 9 | Approval Bypass on Order Creation | Medium | Authorization |
| 10 | Global Settings Key Injection | Medium | Input Validation |
| 11 | PII Stored Without Encryption at Rest | Medium | Data Protection |
| 12 | Error Message Information Leakage | Medium | Info Disclosure |
| 13 | No CSRF Protection | Medium | CSRF |
| 14 | Bulk Import Has No Size Limit | Medium | DoS |
| 15 | Predictable Order References | Low | Insecure Randomness |
| 16 | Request Logging May Capture Sensitive Data | Low | Logging |
| 17 | No Input Validation for Date Formats | Low | Input Validation |
| 18 | parseInt Without Radix/NaN Check | Low | Input Validation |
| 19 | Docker Image Runs as Root | Low | Configuration |
| 20 | API Key Masking Too Permissive | Low | Data Protection |
| 21 | Foreign Key Checks Disabled During Restore | Low | Data Integrity |

---

## Prioritized Remediation Roadmap

### Phase 1 — Immediate (Block deployment)
1. **Add authentication middleware** (Finding 1)
2. **Fix SQL injection in restore** (Finding 2)
3. **Restrict CORS** (Finding 3)
4. **Enable CSP** (Finding 4)

### Phase 2 — Short-term (Before handling real PII)
5. **Gate backup/download behind auth + confirmation** (Finding 5)
6. **Remove db_path from status response** (Finding 6)
7. **Add rate limiting** (Finding 7)
8. **Sanitize audit log PII** (Finding 8)
9. **Make approval_id required for orders** (Finding 9)
10. **Allowlist settings keys** (Finding 10)

### Phase 3 — Medium-term
11. **Encrypt PII at rest** (Finding 11)
12. **Sanitize error messages** (Finding 12)
13. **Add CSRF protection** (Finding 13)
14. **Limit bulk import size** (Finding 14)

### Phase 4 — Hardening
15. **Use cryptographic order references** (Finding 15)
16. **Review logging practices** (Finding 16)
17. **Validate date formats** (Finding 17)
18. **Fix parseInt usage** (Finding 18)
19. **Run Docker as non-root** (Finding 19)
20. **Improve API key masking** (Finding 20)
21. **Ensure FK pragma safety** (Finding 21)

---

## Positive Observations

The following security practices are already in place and should be maintained:

- **Helmet.js** is used for security headers (minus CSP)
- **Parameterized queries** are used consistently for all standard CRUD operations (better-sqlite3's `?` placeholders), preventing SQL injection in all routes except the dynamic restore
- **UUID v4** for primary keys prevents ID enumeration
- **Audit logging** provides accountability (though it needs PII sanitization)
- **Emergency stop** mechanism for purchasing is well-implemented
- **Foreign keys with CASCADE** maintain data integrity
- **WAL mode** for SQLite provides safe concurrent access
- **No `dangerouslySetInnerHTML`** or `eval()` found in React code
- **`.gitignore`** correctly excludes `.env` and database files
- **Multi-stage Docker build** minimizes production image attack surface
- **Graceful shutdown** handling prevents data corruption

---

## Assumptions and Caveats

- This review covers static code analysis only. No dynamic testing or penetration testing was performed.
- External API integrations (Amazon, Etsy, etc.) are currently mock/scaffold only. When real API calls are implemented, those code paths will need separate security review, particularly for SSRF risks when constructing URLs from user data.
- The LLM integration code paths (for card message generation using Claude/OpenAI/Gemini) are referenced in documentation but not yet implemented in the reviewed code. When added, prompt injection risks should be assessed.
- The `approved_by` field in approvals accepts arbitrary strings with no identity verification, which will become a concern once authentication is implemented.
