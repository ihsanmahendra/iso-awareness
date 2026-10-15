// Helper yang dipakai bersama oleh halaman-halaman admin.
const { db } = require('../db');
const { html, layout } = require('../views');

const LETTERS = ['A', 'B', 'C', 'D'];

const flash = (req, type, msg) => { req.session.flash = { type, msg }; };
const page = (req, title, body) => layout(req, { title, body, area: 'admin' });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Modul hanya bisa diakses oleh admin pemiliknya.
function ownModule(req, res, next) {
  const mod = db.prepare('SELECT * FROM modules WHERE id = ? AND admin_id = ?').get(+req.params.id, req.admin.id);
  if (!mod) return res.status(404).send(page(req, 'Tidak ditemukan', html`<h1>Modul tidak ditemukan</h1><p><a href="/admin">Kembali</a></p>`));
  req.mod = mod;
  next();
}

function moduleShell(req, tab, body) {
  const m = req.mod;
  const tabs = [['', 'Ringkasan'], ['questions', 'Soal'], ['tokens', 'Token Peserta'], ['results', 'Peserta & Rekap']];
  return page(req, m.title, html`
    <p class="small"><a href="/admin">← Modul Saya</a></p>
    <div class="head-row">
      <div>
        <h1>${m.title}</h1>
        <div class="muted small">${m.iso_standard} ·
          ${m.access === 'token' ? 'Wajib token' : 'Terbuka'} · ${m.published ? 'Publik' : 'Draft'}</div>
      </div>
      <div>
        ${m.published ? html`<a class="btn" href="/m/${m.id}" target="_blank">Lihat sebagai peserta ↗</a>` : ''}
        <a class="btn" href="/admin/modules/${m.id}/edit">Edit Modul</a>
      </div>
    </div>
    <div class="tabs">${tabs.map(([k, label]) => html`<a class="${tab === k ? 'active' : ''}" href="/admin/modules/${m.id}${k ? '/' + k : ''}">${label}</a>`)}</div>
    ${body}`);
}

module.exports = { LETTERS, flash, page, str, ownModule, moduleShell };
