// ───────────────────────────────────────────────────────────────
// routes/model.js — cloud sync for the financial model.
//
// The frontend serializes its entire state (the D object) via
// serializeD() into one JSON blob, stored here as workspaces.doc (JSONB).
//   GET  /api/model        → load doc + revision
//   PUT  /api/model        → save (editor/admin). Atomic optimistic lock
//                            on `rev` so simultaneous edits can't clobber.
//   GET  /api/model/audit  → server-side audit trail
//   snapshots: list / create / fetch / restore  (the "Versions" feature)
// ───────────────────────────────────────────────────────────────
import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth, canWrite } from '../middleware/auth.js';

const router = Router();
const WS_ID = 1; // single shared workspace for the team

async function getWorkspace() {
  let { rows } = await q('SELECT * FROM workspaces WHERE id = $1', [WS_ID]);
  if (!rows[0]) {
    await q("INSERT INTO workspaces (id, name, doc, rev) VALUES ($1, $2, '{}'::jsonb, 0)", [WS_ID, 'TAKMIL Model']);
    ({ rows } = await q('SELECT * FROM workspaces WHERE id = $1', [WS_ID]));
  }
  return rows[0];
}

async function logAudit(userId, action, detail, rev) {
  await q('INSERT INTO audit_log (workspace_id, user_id, action, detail, rev) VALUES ($1,$2,$3,$4,$5)',
    [WS_ID, userId, action, detail || null, rev ?? null]);
}

router.use(requireAuth);

// ── Load ──
router.get('/', async (req, res) => {
  const ws = await getWorkspace();
  res.json({
    doc: ws.doc || {},                 // JSONB already comes back as an object
    rev: ws.rev,
    updated_at: ws.updated_at,
    updated_by: ws.updated_by,
    canWrite: ['admin', 'editor'].includes(req.user.role),
  });
});

// ── Save ── (atomic compare-and-set on rev)
router.put('/', canWrite, async (req, res) => {
  const { doc, baseRev } = req.body || {};
  if (doc === undefined || doc === null || typeof doc !== 'object') {
    return res.status(400).json({ error: 'A model document is required' });
  }

  const summary = `${doc.schools ?? '?'} schools · ${doc.students ?? '?'} students`;

  // When baseRev is provided, only update if the row is still at that rev.
  if (baseRev !== undefined && baseRev !== null) {
    const { rows } = await q(
      `UPDATE workspaces SET doc = $1::jsonb, rev = rev + 1, updated_at = now(), updated_by = $2
       WHERE id = $3 AND rev = $4 RETURNING rev, updated_at`,
      [JSON.stringify(doc), req.user.id, WS_ID, Number(baseRev)]
    );
    if (!rows[0]) {
      const ws = await getWorkspace();
      return res.status(409).json({
        error: 'The model was updated by someone else. Reload to get the latest version before saving.',
        currentRev: ws.rev, updated_by: ws.updated_by, updated_at: ws.updated_at,
      });
    }
    await logAudit(req.user.id, 'save', summary, rows[0].rev);
    return res.json({ ok: true, rev: rows[0].rev, updated_at: rows[0].updated_at });
  }

  // No baseRev → unconditional save (e.g. very first seed).
  const { rows } = await q(
    `UPDATE workspaces SET doc = $1::jsonb, rev = rev + 1, updated_at = now(), updated_by = $2
     WHERE id = $3 RETURNING rev, updated_at`,
    [JSON.stringify(doc), req.user.id, WS_ID]
  );
  await logAudit(req.user.id, 'save', summary, rows[0].rev);
  res.json({ ok: true, rev: rows[0].rev, updated_at: rows[0].updated_at });
});

// ── Audit trail ──
router.get('/audit', async (req, res) => {
  const { rows } = await q(`
    SELECT a.id, a.action, a.detail, a.rev, a.ts, u.name AS user_name, u.initials
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.workspace_id = $1 ORDER BY a.ts DESC LIMIT 200`, [WS_ID]);
  res.json({ audit: rows });
});

// ── Snapshots / Versions ──
router.get('/snapshots', async (req, res) => {
  const { rows } = await q(`
    SELECT s.id, s.label, s.description, s.created_at, u.name AS created_by_name
    FROM snapshots s LEFT JOIN users u ON u.id = s.created_by
    WHERE s.workspace_id = $1 ORDER BY s.created_at DESC`, [WS_ID]);
  res.json({ snapshots: rows });
});

router.post('/snapshots', canWrite, async (req, res) => {
  const { label, description, doc } = req.body || {};
  if (!label) return res.status(400).json({ error: 'A version label is required' });
  let payload;
  if (doc && typeof doc === 'object') payload = JSON.stringify(doc);
  else payload = JSON.stringify((await getWorkspace()).doc || {});
  const { rows } = await q(
    'INSERT INTO snapshots (workspace_id, label, description, doc, created_by) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id',
    [WS_ID, label, description || '', payload, req.user.id]
  );
  await logAudit(req.user.id, 'snapshot', label, null);
  res.status(201).json({ id: rows[0].id });
});

router.get('/snapshots/:id', async (req, res) => {
  const { rows } = await q('SELECT id, label, description, doc FROM snapshots WHERE id = $1 AND workspace_id = $2',
    [Number(req.params.id), WS_ID]);
  if (!rows[0]) return res.status(404).json({ error: 'Snapshot not found' });
  res.json({ id: rows[0].id, label: rows[0].label, description: rows[0].description, doc: rows[0].doc });
});

router.post('/snapshots/:id/restore', canWrite, async (req, res) => {
  const snap = await q('SELECT * FROM snapshots WHERE id = $1 AND workspace_id = $2', [Number(req.params.id), WS_ID]);
  if (!snap.rows[0]) return res.status(404).json({ error: 'Snapshot not found' });
  const { rows } = await q(
    `UPDATE workspaces SET doc = $1::jsonb, rev = rev + 1, updated_at = now(), updated_by = $2
     WHERE id = $3 RETURNING rev`,
    [JSON.stringify(snap.rows[0].doc), req.user.id, WS_ID]
  );
  await logAudit(req.user.id, 'restore', `Restored version "${snap.rows[0].label}"`, rows[0].rev);
  res.json({ ok: true, rev: rows[0].rev, doc: snap.rows[0].doc });
});

export default router;
