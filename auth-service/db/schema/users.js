// db/schema/users.js
// Global identity — NOT tenant-scoped. This is what makes SSO possible:
// one row here, usable across every tenant a person belongs to.
// No RLS here on purpose — access to a specific user's row is controlled
// by the application (only the user themselves, or an authenticated
// service), not by a tenant boundary.

export const sql = `
  CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          CITEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'active', -- active | disabled
    mfa_enabled    BOOLEAN NOT NULL DEFAULT false,
    mfa_secret     TEXT, -- encrypted at rest by the app layer, not plain here
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;