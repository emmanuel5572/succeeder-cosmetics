const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { pool, logAction } = require('../db');
const {
  verifyPassword, hashPassword, signToken,
  setSessionCookie, clearSessionCookie
} = require('../auth');
const { requireAuth } = require('../middleware/authorize');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Dummy hash used so bcrypt always runs regardless of whether the user exists,
// preventing timing-based username enumeration.
const DUMMY_HASH = '$2a$12$invalidhashusedtoblindtimingattacks000000000000000000000';

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND active = 1',
      [username.trim().toLowerCase()]
    );
    const user = result.rows[0] || null;

    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordOk = verifyPassword(password, hashToCheck);

    if (!user || !passwordOk) {
      await logAction(user ? user.id : null, 'login_failed', { username });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = signToken(user);
    setSessionCookie(res, token);
    await logAction(user.id, 'login_success', {});

    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      permissions: JSON.parse(user.permissions || '[]'),
      mustChangePassword: !!user.must_change_password
    });
  } catch (e) { next(e); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await logAction(req.user.id, 'logout', {});
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    username: req.user.username,
    role: req.user.role,
    permissions: req.userPermissions,
    mustChangePassword: !!req.user.must_change_password
  });
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (!verifyPassword(currentPassword || '', req.user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = 0 WHERE id = $2',
      [hashPassword(newPassword), req.user.id]
    );
    await logAction(req.user.id, 'password_changed', {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
