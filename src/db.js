// ───────────────────────────────────────────────────────────────
// db.js — PostgreSQL connection pool + schema migration.
//
// Connects via DATABASE_URL (Railway standard). The whole financial
// model is stored as a single JSONB document per workspace, mirroring
// exactly what the frontend serializes (serializeD / restoreD), so the
// backend stays a drop-in replacement for the old localStorage layer.
// ───────────────────────────────────────────────────────────────
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('  ✗ DATABASE_URL is not set. On Railway, add the Postgres plugin and it is injected automatically.');
}

// Railway's managed Postgres uses TLS. Allow self-signed in that context.
const needsSSL = /railway|render|heroku|amazonaws|supabase/i.test(process.env.DATABASE_URL || '')
  || String(process.env.PGSSL).toLowerCase() === 'true';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('  Postgres pool error:', err.message));

// Thin query helper.
export const q = (text, params) => pool.query(text, params);

export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      initials      TEXT,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login    TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      doc         JSONB NOT NULL DEFAULT '{}'::jsonb,
      rev         INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by  INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER REFERENCES workspaces(id),
      user_id      INTEGER REFERENCES users(id),
      action       TEXT NOT NULL,
      detail       TEXT,
      rev          INTEGER,
      ts           TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER REFERENCES workspaces(id),
      label        TEXT NOT NULL,
      description  TEXT,
      doc          JSONB NOT NULL,
      created_by   INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_log(workspace_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_snap_ws  ON snapshots(workspace_id, created_at DESC);
  `);
  console.log('  ✓ Schema ready (Postgres)');
}

// Allow:  npm run migrate
if (process.argv.includes('--migrate')) {
  migrate().then(() => pool.end()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
