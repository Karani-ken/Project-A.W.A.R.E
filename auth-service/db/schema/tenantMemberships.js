// db/schema/tenantMemberships.js
// Join table: which users belong to which tenants. This is what lets
// one user (one row in `users`) belong to multiple tenants.

export const sql = `
  CREATE TABLE IF NOT EXISTS tenant_memberships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'active', -- invited | active | suspended
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tenant_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user   ON tenant_memberships (user_id);

  ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_memberships ON tenant_memberships;
  CREATE POLICY tenant_isolation_memberships ON tenant_memberships
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
`;