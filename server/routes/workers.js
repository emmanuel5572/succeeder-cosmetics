const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool, logAction } = require('../db');
const { hashPassword, DEFAULT_PERMISSIONS, ALL_PERMISSIONS } = require('../auth');
const { requireAuth, requireOwner } = require('../middleware/authorize');

router.use(requireAuth, requireOwner);

function sanitize(user) {
  const { password_hash, ...rest } = user;
  return { ...rest, permissions: JSON.parse(rest.permissions || '[]') };
}

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE role != 'owner' ORDER BY created_at DESC"
    );
    res.json(result.rows.map(sanitize));
  } catch (e) { next(e); }
});

router.get('/permissions', (req, res) => {
  res.json({ all: ALL_PERMISSIONS, defaults: DEFAULT_PERMISSIONS });
});

router.post('/', async (req, res, next) => {
  try {
    const { name, username, email, role, permissions, password } = req.body || {};
    if (!name || !username || !role) {
      return res.status(400).json({ error: 'Name, username and role are required.' });
    }
    if (!['manager', 'cashier'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'manager' or 'cashier'." });
    }

    const finalPassword = password && password.length >= 8
      ? password
      : crypto.randomBytes(6).toString('base64url');

    const perms = Array.isArray(permissions)
      ? permissions.filter(p => ALL_PERMISSIONS.includes(p))
      : DEFAULT_PERMISSIONS[role];

    const result = await pool.query(
      `INSERT INTO users (name, username, email, password_hash, role, permissions, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 1) RETURNING *`,
      [name, username.trim().toLowerCase(), email || null, hashPassword(finalPassword), role, JSON.stringify(perms)]
    );
    const worker = result.rows[0];
    await logAction(req.user.id, 'worker_created', { workerId: worker.id, role });
    res.status(201).json({ ...sanitize(worker), temporaryPassword: finalPassword });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username is already taken.' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const wRes = await pool.query("SELECT * FROM users WHERE id = $1 AND role != 'owner'", [req.params.id]);
    const worker = wRes.rows[0];
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const { name, email, role, permissions, active } = req.body || {};
    const newRole = role && ['manager', 'cashier'].includes(role) ? role : worker.role;
    const newPerms = Array.isArray(permissions)
      ? permissions.filter(p => ALL_PERMISSIONS.includes(p))
      : JSON.parse(worker.permissions);

    const result = await pool.query(
      `UPDATE users SET name=$1, email=$2, role=$3, permissions=$4, active=$5 WHERE id=$6 RETURNING *`,
      [
        name || worker.name,
        email !== undefined ? email : worker.email,
        newRole,
        JSON.stringify(newPerms),
        active !== undefined ? (active ? 1 : 0) : worker.active,
        worker.id
      ]
    );
    await logAction(req.user.id, 'worker_updated', { workerId: worker.id });
    res.json(sanitize(result.rows[0]));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const wRes = await pool.query("SELECT * FROM users WHERE id = $1 AND role != 'owner'", [req.params.id]);
    if (!wRes.rows[0]) return res.status(404).json({ error: 'Worker not found.' });
    await pool.query('UPDATE users SET active = 0 WHERE id = $1', [req.params.id]);
    await logAction(req.user.id, 'worker_deactivated', { workerId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const wRes = await pool.query("SELECT * FROM users WHERE id = $1 AND role != 'owner'", [req.params.id]);
    if (!wRes.rows[0]) return res.status(404).json({ error: 'Worker not found.' });
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = 1 WHERE id = $2',
      [hashPassword(tempPassword), req.params.id]
    );
    await logAction(req.user.id, 'worker_password_reset', { workerId: req.params.id });
    res.json({ ok: true, temporaryPassword: tempPassword });
  } catch (e) { next(e); }
});

module.exports = router;
