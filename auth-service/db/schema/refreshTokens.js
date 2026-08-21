// db/schema/refreshTokens.js
// Server-side, revocable, tenant-scoped sessions. Stored hashed —
// never the raw token. `replaced_by` supports refresh token rotation
// (Step 6 of the implementation plan).

export const sql = `
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    replaced_by   UUID REFERENCES refresh_tokens(id),
    user_agent    TEXT,
    ip_address    INET
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens (tenant_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens (user_id);

  ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS tenant_isolation_refresh_tokens ON refresh_tokens;
  CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::UUID);
`;