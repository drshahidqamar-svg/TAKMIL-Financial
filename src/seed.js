// ───────────────────────────────────────────────────────────────
// seed.js — runs the schema migration, then creates the first admin
// and the shared workspace on first run. Idempotent.
// ───────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { q, migrate, pool } from './db.js';
import 'dotenv/config';

export async function ensureSeed() {
  await migrate();

  const { rows: countRows } = await q('SELECT COUNT(*)::int AS c FROM users');
  if (countRows[0].c === 0) {
    const email = (process.env.SEED_ADMIN_EMAIL || 'admin@takmil.org').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
    const name = process.env.SEED_ADMIN_NAME || 'Administrator';
    const initials = name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'AD';
    await q(
      'INSERT INTO users (email, name, password_hash, role, initials) VALUES ($1,$2,$3,$4,$5)',
      [email, name, bcrypt.hashSync(password, 10), 'admin', initials]
    );
    console.log(`  ✓ Seed admin created: ${email}  (change the password after first login)`);
  }

  const { rows: wsRows } = await q('SELECT id FROM workspaces WHERE id = 1');
  if (wsRows.length === 0) {
    await q("INSERT INTO workspaces (id, name, doc, rev) VALUES (1, $1, '{}'::jsonb, 0)", ['TAKMIL Model']);
    // Keep the SERIAL sequence ahead of the manually-inserted id=1.
    await q("SELECT setval(pg_get_serial_sequence('workspaces','id'), GREATEST((SELECT MAX(id) FROM workspaces),1))");
    console.log('  ✓ Shared workspace created');
  }
}

// Allow running directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSeed().then(() => pool.end()).then(() => { console.log('  Seed complete.'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
