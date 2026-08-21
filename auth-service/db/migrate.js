// db/migrate.js
// Applies each schema/*.js file in dependency order. Each file is
// self-contained (table + its own indexes + its own RLS policy), so
// adding a new table later just means adding one new file here.

import 'dotenv/config';

import { Pool } from 'pg';

import { sql as extensions } from './schema/extensions.js';
import { sql as tenants } from './schema/tenants.js';
import { sql as users } from './schema/users.js';
import { sql as roles } from './schema/roles.js';
import { sql as tenantMemberships } from './schema/tenantMemberships.js';
import { sql as membershipRoles } from './schema/membershipRoles.js';
import { sql as refreshTokens } from './schema/refreshTokens.js';
import { sql as staffAccounts } from './schema/staffAccounts.js';

// Order matters — parents before children (foreign key dependencies).
const migrations = [
  { name: 'extensions', sql: extensions },
  { name: 'tenants', sql: tenants },
  { name: 'users', sql: users },
  { name: 'roles', sql: roles }, // references tenants
  { name: 'tenant_memberships', sql: tenantMemberships }, // references users, tenants
  { name: 'membership_roles', sql: membershipRoles }, // references tenant_memberships, roles
  { name: 'refresh_tokens', sql: refreshTokens }, // references users, tenants
  { name: 'staff_accounts', sql: staffAccounts }, // references tenants, roles, users
];

async function runMigrations() {
  console.log('[migrate] DATABASE_URL:', process.env.DATABASE_URL ? '(set)' : '(NOT SET)');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client;

  try {
    client = await pool.connect();

    for (const migration of migrations) {
      console.log(`[migrate] applying: ${migration.name}`);
      await client.query(migration.sql);
    }
    console.log('[migrate] all migrations applied successfully');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    throw err;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] exiting due to error:', err.message);
  process.exit(1);
});