require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const crypto = require('crypto');

const { initSchema } = require('./db');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(morgan('tiny'));
app.use(express.json());
app.use(cookieParser());

// ── CSRF protection ──────────────────────────────────────────────────────────
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

app.use((req, res, next) => {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE];
  }

  if (!CSRF_SAFE_METHODS.has(req.method) && req.path.startsWith('/api/')) {
    const headerToken = req.headers[CSRF_HEADER];
    if (!headerToken || headerToken !== req.csrfToken) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    }
  }
  next();
});

// API routes
app.use('/api/setup',     require('./routes/setup'));
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/workers',   require('./routes/workers'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/expenses',  require('./routes/expenses'));
app.use('/api/reports',   require('./routes/reports'));

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

// Initialise DB schema then start listening
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SUCCEEDER COSMETICS server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialise database schema:', err);
    process.exit(1);
  });
