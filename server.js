const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db } = require('./src/db');
const { hashPassword } = require('./src/util');
const { layout, html } = require('./src/views');
const seed = require('./src/seed');

const PORT = process.env.PORT || 3000;

// Secret sesi disimpan di folder data agar tetap sama setelah restart.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), '.session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

// Buat super admin pertama jika belum ada admin sama sekali.
if (!db.prepare('SELECT COUNT(*) AS n FROM admins').get().n) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || 'admin12345';
  db.prepare("INSERT INTO admins (username, display_name, password_hash, role) VALUES (?,?,?,'super')")
    .run(username, 'Super Admin', hashPassword(password));
  console.log(`[setup] Super admin dibuat -> username: ${username} | password: ${password}  (segera ganti password!)`);
  if (process.env.SEED_DEMO !== '0') seed();
}

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(session({
  name: 'iso.sid',
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === '1', maxAge: 8 * 60 * 60 * 1000 },
}));

// Perlindungan CSRF sederhana: tolak POST dari origin lain.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const origin = req.get('origin') || req.get('referer');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).send('Permintaan ditolak (origin tidak valid).');
    } catch { return res.status(403).send('Permintaan ditolak.'); }
  }
  next();
});

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

app.use((req, res) => res.status(404).send(layout(req, { title: 'Tidak ditemukan', body: html`<h1>Halaman tidak ditemukan</h1><p><a href="/">Kembali ke beranda</a></p>` })));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(layout(req, { title: 'Error', body: html`<h1>Terjadi kesalahan</h1><p>Silakan coba lagi.</p>` }));
});

app.listen(PORT, () => console.log(`ISO Awareness berjalan di http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin)`));
