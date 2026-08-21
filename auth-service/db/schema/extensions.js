// db/schema/extensions.js
// Postgres extensions required before any table is created.

export const sql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
  CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email column
`;