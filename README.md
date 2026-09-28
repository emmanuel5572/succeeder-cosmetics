# SUCCEEDER COSMETICS — Business Management System

A private, role-based business management web app (Owner / Manager / Cashier)
with sales (POS), inventory, customers, expenses, reports, and receipts.
Works on desktop, phone, and tablet, and can be installed as a PWA (home
screen app) directly from the browser — no app store needed.

## What's included

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`)
- **Auth:** bcrypt-hashed passwords, JWT sessions in an httpOnly cookie, rate-limited login
- **RBAC:** Owner (full access), Manager & Cashier (owner-defined permissions), enforced on every API route — not just hidden in the UI
- **Frontend:** plain HTML/CSS/JS (no build step), responsive, installable as a PWA
- **First-run flow:** the very first visit lets you create the Owner account; after that, public registration is permanently closed and the site only shows a login screen

## 1. Requirements

- [Node.js](https://nodejs.org) version 18 or later installed on the computer or server that will run the app.

## 2. Install & run (local / on your own server)

```bash
cd succeeder-cosmetics
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a real random string. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then start the app:

```bash
npm start
```

Visit `http://localhost:3000` (or the server's address) in a browser. The
first visit will show **"Create the Owner Account"** — fill that in once.
After that, every visitor only sees a login screen.

## 3. Installing it like an app (PWA)

On a phone/tablet, open the site in Chrome or Safari, then use
**"Add to Home Screen"** (Android/Chrome) or **Share → Add to Home Screen**
(iPhone/Safari). It will open full-screen like a normal app, without going
through the Play Store or App Store.

## 4. Day-to-day use

- **Owner** logs in → sees Dashboard, Sales, Products, Customers, Workers,
  Expenses, Reports, Receipts, Account.
- **Owner → Workers/Staff → Add Worker** creates Cashier or Manager
  accounts. A temporary password is shown once — share it with the worker
  and they'll be asked to set their own password on first login.
- Each worker's checkboxes control exactly what they can do (create sales,
  manage products, view all sales vs. only their own, manage expenses,
  view reports). A Cashier can never reach Owner-only pages or actions,
  even by typing a URL directly — every action is checked again on the
  server, not just hidden in the menu.
- **Sales/POS**: tap products to add to cart, adjust quantity, complete
  sale — inventory updates automatically and a receipt is generated.

## 5. Password recovery

There's no email service wired up by default (that requires an SMTP
provider), so:

- **Workers**: the Owner resets their password from
  **Workers → Reset Password** and shares the new temporary password.
- **Owner locked out**: on the server (not from the browser), run:
  ```bash
  npm run reset-owner-password
  ```
  This only works with direct access to the server itself, so a random
  website visitor can't use it.

If you want real "email me a reset link" functionality later, wire up an
SMTP provider (e.g. Postmark, SendGrid, or your own mail server) in
`server/routes/auth.js`.

## 6. Deploying so it's reachable outside your own computer

Running `npm start` on your laptop only serves the app on your local
network. To make it privately accessible from anywhere (for a real
business), deploy it to a small server or host such as Railway, Render,
Fly.io, or a VPS, then:

1. Set real environment variables there (`JWT_SECRET`, `NODE_ENV=production`).
2. Put the app behind HTTPS (most of the hosts above do this automatically) —
   this matters because the session cookie is marked `secure` in production
   and only sent over HTTPS.
3. The SQLite database file lives in `data/succeeder.db` — back it up
   regularly, or switch to a hosted Postgres/MySQL database later if the
   business grows and needs multiple servers.

## 7. Project structure

```
succeeder-cosmetics/
├── server/
│   ├── index.js          # Express app entry point
│   ├── db.js              # SQLite schema + helpers
│   ├── auth.js             # password hashing, JWT, permission defaults
│   ├── middleware/authorize.js
│   ├── routes/             # setup, auth, workers, products, sales,
│   │                        customers, expenses, reports
│   └── scripts/reset-owner-password.js
├── public/
│   ├── index.html          # login / first-run owner setup
│   ├── app.html             # authenticated dashboard shell
│   ├── css/styles.css
│   ├── js/ (api.js, login.js, app.js)
│   ├── manifest.json + sw.js  # PWA install support
│   └── icons/
├── package.json
└── .env.example
```

## 8. Extending it later

The system is built to grow with the business:

- Add more permission strings in `server/auth.js` (`ALL_PERMISSIONS`) and
  check them with `requirePermission('your:new:permission')` in a route.
- Add new sections by creating a route file, mounting it in
  `server/index.js`, adding a nav link in `app.html`, and a render function
  in `public/js/app.js`.
- Swap SQLite for Postgres/MySQL later without changing the API shape if
  the business needs multiple servers or very high transaction volume.

## Note on this build

This was scaffolded to be a solid, working starting point covering every
requirement you listed (private access, Owner/worker accounts, RBAC, POS,
inventory auto-update, monitoring dashboard, secure password hashing,
responsive design, PWA install). It has not been run against a live
Node.js install in this environment, so after `npm install` do a quick
end-to-end test (create the Owner account, add a product, make a sale) and
let me know if anything needs fixing — I can iterate on it with you.
