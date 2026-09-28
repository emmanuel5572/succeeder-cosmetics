const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change_this_to_a_long_random_string') {
  console.warn(
    '\n[WARNING] JWT_SECRET is not set to a real secret in your .env file.\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
  );
}

const COOKIE_NAME = 'succeeder_session';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    JWT_SECRET || 'insecure-dev-secret-change-me',
    { expiresIn: '12h' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET || 'insecure-dev-secret-change-me');
  } catch (e) {
    return null;
  }
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Default permission sets the Owner can start from when creating a worker.
// The Owner can add/remove individual permission strings per worker.
const DEFAULT_PERMISSIONS = {
  cashier: ['sales:create', 'sales:view_own', 'receipts:view', 'products:view'],
  manager: [
    'sales:create', 'sales:view_all', 'receipts:view',
    'products:view', 'products:manage',
    'inventory:manage', 'customers:manage',
    'expenses:manage', 'reports:view'
  ]
};

const ALL_PERMISSIONS = [
  'sales:create', 'sales:view_own', 'sales:view_all',
  'receipts:view',
  'products:view', 'products:manage',
  'inventory:manage',
  'customers:manage',
  'expenses:manage',
  'reports:view',
  'workers:manage'
];

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  DEFAULT_PERMISSIONS,
  ALL_PERMISSIONS
};
