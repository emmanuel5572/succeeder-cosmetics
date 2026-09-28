const { pool } = require('../db');
const { COOKIE_NAME, verifyToken } = require('../auth');

async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Session expired. Please log in again.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1 AND active = 1', [payload.id]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Account not found or deactivated.' });

    req.user = user;
    req.userPermissions = JSON.parse(user.permissions || '[]');
    next();
  } catch (e) {
    next(e);
  }
}

function requireOwner(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required.' });
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === 'owner') return next();
    if (req.userPermissions.includes(permission)) return next();
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  };
}

module.exports = { requireAuth, requireOwner, requirePermission };
