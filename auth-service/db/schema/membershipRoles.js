// db/schema/membershipRoles.js
// A membership can hold multiple roles (e.g. HR Manager + Payroll Admin).
// This table has no tenant_id column of its own — it's scoped indirectly
// through tenant_memberships, so its RLS policy joins out to that table.

export const sql = `
  CREATE TABLE IF NOT EXISTS membership_roles (
    membership_id  UUID NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (membership_id, role_id)
  );

  ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_membership_roles ON membership_roles;
  CREATE POLICY tenant_isolation_membership_roles ON membership_roles
    USING (
      membership_id IN (
        SELECT id FROM tenant_memberships
        WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID
      )
    );
`;