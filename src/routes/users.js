// ───────────────────────────────────────────────────────────────
// routes/users.js — team management (admin only).
// ───────────────────────────────────────────────────────────────
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { requireAuth, adminOnly } from '../middleware/auth.js';

const router = Router();
const ROLES = ['admin', 'editor', 'viewer'];

function initialsFrom(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

router.use(requireAuth, adminOnly);

router.get('/', async (req, res) => {
  const { rows } = await q('SELECT id, email, name, role, initials, active, created_at, last_login FROM users ORDER BY created_at');
  res.json({ users: rows });
});

router.post('/', async (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const r = ROLES.includes(role) ? role : 'viewer';
  const e = String(email).toLowerCase().trim();

  const exists = await q('SELECT id FROM users WHERE email = $1', [e]);
  if (exists.rows.length) return res.status(409).json({ error: 'A user with that email already exists' });

  const { rows } = await q(
    'INSERT INTO users (email, name, password_hash, role, initials) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [e, name.trim(), bcrypt.hashSync(password, 10), r, initialsFrom(name)]
  );
  res.status(201).json({ id: rows[0].id, email: e, name: name.trim(), role: r });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { role, name, active } = req.body || {};
  // Guard: never remove the last active admin.
  if ((role && role !== 'admin') || active === false || active === 0) {
    if (user.role === 'admin') {
      const { rows: a } = await q("SELECT COUNT(*)::int AS c FROM users WHERE role='admin' AND active=TRUE AND id <> $1", [id]);
      if (a[0].c === 0) return res.status(400).json({ error: 'Cannot remove the last active admin' });
    }
  }

  const newRole = ROLES.includes(role) ? role : user.role;
  const newName = name?.trim() || user.name;
  const newActive = active === undefined ? user.active : !!active;
  await q('UPDATE users SET role = $1, name = $2, initials = $3, active = $4 WHERE id = $5',
    [newRole, newName, initialsFrom(newName), newActive, id]);
  res.json({ ok: true });
});

router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const { rows } = await q('SELECT id FROM users WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), id]);
  res.json({ ok: true });
});

export default router;
