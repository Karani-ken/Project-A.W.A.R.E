# AWARE Auth Service

Design summary and implementation plan for the Authentication & Authorization
service of **A.A.W.A.R.E** (AI-Powered Algorithmic Workforce Analytics Retail
E-commerce) — the first module built, since every other service (HR, Payroll,
Hiring, Inventory, Analytics, Checkout) depends on it for identity.

---

## 1. Summary of design decisions

### 1.1 Platform shape
- AWARE is **multi-tenant**: one deployment serves many independent
  businesses ("tenants").
- Built as **microservices**, communicating over a shared **RabbitMQ**
  message bus (`@aware/mq-core` — see [Message queue foundation](#2-message-queue-foundation-already-built)).
- Auth is the **first service built**, and the first event *source* other
  services react to (a new employee needs a user account/role before
  Payroll, HR, or Inventory workflows make sense of them).

### 1.2 Tenant isolation
- **Shared tables** across all tenants, isolated by a `tenant_id` column.
- Enforced at the database level with **Postgres Row-Level Security (RLS)**,
  not just application-level `WHERE` filters — so a missed filter in
  application code doesn't leak data across tenants.

### 1.3 Identity model
Identity and access are modeled as **separate concerns**:

| Concept | Table | Notes |
|---|---|---|
| Who someone is | `users` | Global, not tied to a tenant. One email = one identity platform-wide. |
| Which businesses they belong to | `tenant_memberships` | Join table — lets one user belong to **multiple tenants** (e.g. a consultant working with several businesses). |
| What business exists | `tenants` | One row per business. |
| What roles exist | `roles` | Scoped to a `tenant_id` — "HR Manager" at Business A is a different row than at Business B. |
| Which roles a membership holds | `membership_roles` | A membership can hold multiple roles. |
| Server-side session control | `refresh_tokens` | Hashed, tenant-scoped, revocable. |
| On-site/shift staff logins | `staff_accounts` | Separate from `users` entirely — PIN-based, tenant-scoped, no cross-tenant membership needed. Optional `linked_user_id` to later promote a staff account into a full SSO user. |

### 1.4 SSO / JWT design
- AWARE behaves like an **SSO**: one `users` account can access every
  AWARE service the person has membership/roles for.
- A JWT represents **"user X, currently acting inside tenant Y"** — not a
  token listing every tenant/role a user has. This keeps tokens small and
  keeps every other microservice's authorization check simple (it only
  ever sees one tenant context per request).
- **Login flow:**
  1. `POST /auth/login` (email + password) → Auth checks credentials,
     looks up `tenant_memberships`.
  2. **Exactly one active membership** → JWT minted immediately, scoped to
     that tenant.
  3. **Multiple memberships** → a short-lived pre-auth token is returned
     with the list of tenants; client shows a "choose your business"
     screen.
  4. `POST /auth/select-tenant` (pre-auth token + chosen `tenant_id`) →
     real JWT minted, scoped to that tenant.
  5. `POST /auth/switch-tenant` — same mechanism, callable mid-session to
     re-scope to a different tenant without a full re-login.
- **Mechanism:** short-lived **access token (JWT)** + long-lived
  **refresh token** (stored server-side, hashed, revocable) — chosen over
  server-side sessions so every downstream microservice can verify a
  request locally (signature check) without calling back to Auth on every
  request.

### 1.5 Staff (sub-auth) accounts
For workers who don't need full SSO — e.g. a retail employee at a
till/POS — recognizing that PINs alone are weak outside a physically
trusted device:

- **Not** a `users` row. A dedicated `staff_accounts` table: PIN/badge
  hash, tenant-scoped, one role, no cross-tenant membership.
- **Business identification is required as part of login** (a PIN alone
  isn't unique across tenants). Chosen approach: a **per-tenant slug in
  the login URL** — `aware.app/<slug>/staff-login` — rather than a phone
  lookup (account-enumeration risk) or business name search (tenant
  reconnaissance risk). QR codes at physical devices simply link to this
  URL.
- **Remote workers use the regular SSO path instead of PIN accounts.**
  PIN security assumes a physically trusted, on-premise device; that
  assumption doesn't hold for a home laptop. Remote workers authenticate
  via `users` + `tenant_memberships` like any other SSO user.
- **Two separate routes**, not one combined login page:
  - `aware.app/<slug>/login` — regular SSO (email + password, MFA) for
    tenant members and remote workers.
  - `aware.app/<slug>/staff-login` — PIN entry for on-site/shift staff.
- **Security measures for staff PIN accounts:**
  - PIN hashed (bcrypt/argon2), never logged in plaintext.
  - Failed-attempt lockout **per staff account** (`failed_attempts`,
    `locked_until`).
  - Rate limiting **per tenant** on the staff-login endpoint, in addition
    to per-account lockout.
  - Shorter-lived tokens than regular users (shift-length, not
    access+refresh) since staff devices are often shared/kiosk-style.
  - Audit log of staff logins (tenant, account, device if available,
    timestamp).

### 1.6 Event topology (for when Auth starts publishing)
- Single topic exchange: `aware.events`.
- Routing key convention: `<domain>.<entity>.<event>` (e.g.
  `auth.user.created`, `auth.role.assigned`, `hr.employee.terminated`).
- Standard message envelope: `eventId`, `eventType`, `occurredAt`,
  `source`, `version`, `data`.
- Auth is expected to be the platform's earliest event source — other
  services (HR, Payroll) react to `auth.user.created` /
  `auth.role.assigned` without Auth needing to know they exist.

---

## 2. Message queue foundation (already built)

Before Auth, the RabbitMQ foundation was built and proven out
step-by-step, and is being generalized into a shared `@aware/mq-core`
package (ESM) every service — including Auth — will import:

- ✅ Basic pub/sub (durable queue, persistent messages, manual ack)
- ✅ Connection resilience (auto-reconnect on close/error, retry-loop
  `connect()`)
- ✅ Dead-letter queues (per-queue DLQ, `<queue>.dlq`)
- ✅ Retry-with-delay (TTL-based `<queue>.retry`, `x-retry-count` header,
  max retries before permanent dead-letter)
- ✅ Exchanges & routing (fanout proven, topic exchange proven with
  wildcard routing keys)
- ✅ Idempotency (`messageId` per event, Postgres
  `INSERT ... ON CONFLICT DO NOTHING` pattern for atomic dedup — the
  correct production version vs. an in-memory `Set`)
- ✅ Observability (structured JSON logging via `pino`, RabbitMQ
  management API polling for queue depth/consumer count, threshold
  alerting)
- ⏳ Clustering/HA — not yet built (last step of the original roadmap)
- 🔧 Currently being restructured into `@aware/mq-core`:
  `connection.js`, `publisher.js`, `consumer.js`, `dlq.js`, `topology.js`,
  with `index.js` as the public export surface.

Auth will be the first service to consume this package for real.

---

## 3. Implementation plan

Slow, step-by-step — matching how the message queue was built. Each step
should be working and tested before moving to the next.

### Step 1 — Database schema (Postgres)
1. Create the database and enable required extensions (`pgcrypto` or
   `uuid-ossp` for UUID generation).
2. Create tables in this order (respecting foreign keys):
   `tenants` → `users` → `roles` → `tenant_memberships` →
   `membership_roles` → `refresh_tokens` → `staff_accounts`.
3. Add indexes: unique on `users.email`, unique on `tenants.slug`, unique
   composite on `(tenant_id, user_id)` for `tenant_memberships`, index on
   `refresh_tokens.token_hash`, index on `(tenant_id, pin_hash)` lookup
   path for `staff_accounts` (lookup is `tenant_id` first, so this stays
   scoped).
4. Enable **Row-Level Security** on every tenant-scoped table
   (`tenant_memberships`, `roles`, `membership_roles`, `refresh_tokens`,
   `staff_accounts`) and write policies keyed off a session variable
   (e.g. `current_setting('app.tenant_id')`) that the app sets per
   request/connection.
5. Verify RLS actually blocks cross-tenant reads with a manual test
   before writing any application code against it.

### Step 2 — Service scaffolding (ESM)
1. Initialize the `auth-service` package (`"type": "module"` in
   `package.json`).
2. Set up the Postgres client/connection pool (e.g. `pg`), with a helper
   that sets the RLS session variable per request.
3. Wire in `@aware/mq-core` as a local file dependency, confirm the
   service can connect to RabbitMQ using the shared package.
4. Basic project structure: `src/routes/`, `src/services/`,
   `src/db/`, `src/middleware/`, `src/events/`.

### Step 3 — Core SSO auth (regular users)
1. `POST /auth/register` — create a `users` row (hash password), create
   or join a `tenants` row + `tenant_memberships` row.
2. `POST /auth/login` — validate credentials, branch on membership count
   (single tenant → JWT immediately; multiple → pre-auth token + tenant
   list).
3. `POST /auth/select-tenant` and `POST /auth/switch-tenant` — mint a
   tenant-scoped JWT from a valid pre-auth/existing token.
4. JWT signing/verification middleware — shared across all AWARE
   services eventually, so build it to be reusable.
5. `POST /auth/refresh` — exchange a valid refresh token for a new access
   token; check against `refresh_tokens` (hash comparison, expiry,
   revocation status).
6. `POST /auth/logout` — revoke the specific refresh token
   (single-device logout).

### Step 4 — Staff (sub-auth) accounts
1. `staff_accounts` CRUD (tenant admin creates staff PIN accounts scoped
   to their own tenant).
2. `GET /:slug/staff-login` — resolve slug → tenant, return tenant
   display info (name/logo) for the login screen.
3. `POST /:slug/staff-login` — validate PIN against `staff_accounts`
   within that tenant only, apply lockout/rate-limit logic, mint a
   shorter-lived staff JWT (`"type": "staff"`).
4. Audit logging for staff login attempts (success and failure).

### Step 5 — Roles & permissions
1. `roles` CRUD, scoped per tenant.
2. `membership_roles` assignment endpoints.
3. Authorization middleware other AWARE services can reuse: decode JWT,
   check `roles` claim against a required permission for the route.

### Step 6 — Security hardening
1. Rate limiting on `/auth/login` and `/:slug/staff-login` (per-account
   and per-tenant).
2. MFA for regular `users` accounts (at least TOTP).
3. Password policy + breach-list check on registration/password change.
4. Refresh token rotation (issue a new refresh token on each use, revoke
   the old one, to detect token theft/replay).

### Step 7 — Events
1. Publish `auth.user.created`, `auth.user.login_failed`,
   `auth.role.assigned`, `auth.staff.created` via `@aware/mq-core`,
   following the standard envelope.
2. Confirm at least one other stub consumer (even a placeholder HR
   service) can receive and log these events end-to-end.

### Step 8 — Observability & ops
1. Structured logging (`pino`) across all Auth endpoints, matching the
   pattern already proven in the message queue work.
2. Health check endpoint (`/health`) covering DB + RabbitMQ connectivity.
3. Queue-monitor style alerting reused/extended from the mq-core work for
   Auth's own queues (e.g. its DLQ).

---

## 4. Open items / not yet decided

- Whether platform-level roles (e.g. "AWARE Support") need
  `tenant_id = null` as a special case in `roles`.
- Whether staff-login pages show the tenant name/logo before PIN entry
  (better UX) or stay generic until a valid PIN is submitted (less
  information exposure via the URL alone).
- Clustering/HA for RabbitMQ itself — deferred until after Auth's core
  flows are working.
