// ───────────────────────────────────────────────────────────────
// auth.js — token signing/verification + role-based access gates.
// Roles:  admin  → manage users + everything editors can do
//         editor → read + write the financial model
//         viewer → read only
// ───────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const SECRET = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
const TTL = process.env.TOKEN_TTL || '7d';
const SECURE = String(process.env.SECURE_COOKIES).toLowerCase() === 'true';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, initials: user.initials },
    SECRET,
    { expiresIn: TTL }
  );
}

export function setAuthCookie(res, token) {
  res.cookie('takmil_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('takmil_token');
}

// Accept the token from cookie OR Authorization: Bearer header.
function readToken(req) {
  if (req.cookies?.takmil_token) return req.cookies.takmil_token;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// Require a valid logged-in user.
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}

// Require one of the given roles. Usage: requireRole('admin'), requireRole('admin','editor')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// Editors and admins can write; viewers cannot.
export const canWrite = requireRole('admin', 'editor');
export const adminOnly = requireRole('admin');
