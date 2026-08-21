// db/schema/roles.js
// Scoped per tenant — "HR Manager" at Business A and Business B are
// different rows, so each tenant can customize its own roles later.
// tenant_id NULL is reserved for future platform-level roles
// (e.g. "AWARE Support") — not used yet.

export const sql = `
  CREATE TABLE IF NOT EXISTS roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles (tenant_id);

  ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_roles ON roles;
  CREATE POLICY tenant_isolation_roles ON roles
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
`;