// ───────────────────────────────────────────────────────────────
// routes/auth.js — login / logout / who-am-I / change own password
// ───────────────────────────────────────────────────────────────
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await q('SELECT * FROM users WHERE email = $1 AND active = TRUE', [String(email).toLowerCase().trim()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await q('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, initials: user.initials } });
  } catch (e) { res.status(500).json({ error: 'Login failed' }); }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await q('SELECT id, email, name, role, initials, last_login FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: rows[0] });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 10), user.id]);
  res.json({ ok: true });
});

export default router;
