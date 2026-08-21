// db/schema/staffAccounts.js
// Sub-auth: PIN-based, tenant-scoped only, deliberately separate from
// `users` (no cross-tenant membership needed). `linked_user_id` allows
// promoting a staff account into a full SSO user later without a
// redesign. The (tenant_id, status) index keeps PIN lookups scoped to
// one business — a brute-force attempt against one tenant never scans
// another tenant's accounts.

export const sql = `
  CREATE TABLE IF NOT EXISTS staff_accounts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_name     TEXT NOT NULL,
    pin_hash         TEXT NOT NULL,
    role_id          UUID REFERENCES roles(id),
    linked_user_id   UUID REFERENCES users(id),
    status           TEXT NOT NULL DEFAULT 'active', -- active | disabled
    failed_attempts  INT NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_staff_accounts_tenant ON staff_accounts (tenant_id, status);

  ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_staff_accounts ON staff_accounts;
  CREATE POLICY tenant_isolation_staff_accounts ON staff_accounts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
`;