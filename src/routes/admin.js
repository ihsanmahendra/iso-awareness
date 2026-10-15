const express = require('express');
const { db, tx } = require('../db');
const { html } = require('../views');
const { hashPassword, verifyPassword, randomToken, rateLimiter, csv, toInt } = require('../util');
const { LETTERS, flash, page, str, ownModule, moduleShell } = require('./admin-common');

const router = express.Router();
const loginLimit = rateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

// ---------- Auth ----------
router.use((req, res, next) => {
  if (req.session.adminId) {
    req.admin = db.prepare('SELECT id, username, display_name, role FROM admins WHERE id = ?').get(req.session.adminId);
    if (!req.admin) delete req.session.adminId;
  }
  next();
});

router.get('/login', (req, res) => {
  if (req.admin) return res.redirect('/admin');
  res.send(page(req, 'Login Admin', html`
    <div class="panel narrow">
      <h1>Login Admin</h1>
      <form method="post" action="/admin/login" class="stack">
        <label>Username <input name="username" required autofocus autocomplete="username"></label>
        <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
        <button class="primary">Masuk</button>
      </form>
    </div>`));
});

router.post('/login', (req, res) => {
  if (!loginLimit(req.ip)) { flash(req, 'error', 'Terlalu banyak percobaan login. Coba lagi nanti.'); return res.redirect('/admin/login'); }
  const a = db.prepare('SELECT * FROM admins WHERE username = ?').get(str(req.body.username, 50));
  if (!a || !verifyPassword(String(req.body.password || ''), a.password_hash)) {
    flash(req, 'error', 'Username atau password salah.');
    return res.redirect('/admin/login');
  }
  req.session.regenerate(() => {
    req.session.adminId = a.id;
    res.redirect('/admin');
  });
});

router.post('/logout', (req, res) => {
  delete req.session.adminId;
  res.redirect('/admin/login');
});

router.use((req, res, next) => (req.admin ? next() : res.redirect('/admin/login')));

function requireSuper(req, res, next) {
  if (req.admin.role !== 'super') return res.status(403).send(page(req, 'Akses ditolak', html`<h1>Akses ditolak</h1>`));
  next();
}

function ownQuestion(req, res, next) {
  const q = db.prepare(`SELECT q.* FROM questions q JOIN modules m ON m.id = q.module_id
    WHERE q.id = ? AND m.admin_id = ?`).get(+req.params.qid, req.admin.id);
  if (!q) return res.redirect('/admin');
  req.q = q;
  next();
}

function ownToken(req, res, next) {
  const t = db.prepare(`SELECT t.* FROM tokens t JOIN modules m ON m.id = t.module_id
    WHERE t.id = ? AND m.admin_id = ?`).get(+req.params.tid, req.admin.id);
  if (!t) return res.redirect('/admin');
  req.token = t;
  next();
}

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const modules = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM questions WHERE module_id = m.id) AS qcount,
      (SELECT COUNT(*) FROM tokens WHERE module_id = m.id) AS tcount,
      (SELECT COUNT(*) FROM attempts WHERE module_id = m.id) AS acount,
      (SELECT ROUND(AVG(score)) FROM attempts WHERE module_id = m.id) AS avg_score
    FROM modules m WHERE m.admin_id = ? ORDER BY m.updated_at DESC`).all(req.admin.id);

  res.send(page(req, 'Modul Saya', html`
    <div class="head-row">
      <div>
        <h1>Modul Saya</h1>
        <p class="muted">Halo, ${req.admin.display_name}. Modul di bawah hanya terlihat dan dapat dikelola oleh akun Anda.</p>
      </div>
      <a class="btn primary" href="/admin/modules/new">+ Modul Baru</a>
    </div>
    ${modules.length === 0
      ? html`<div class="panel center"><p>Anda belum memiliki modul.</p><a class="btn primary" href="/admin/modules/new">Buat modul pertama</a></div>`
      : html`
      <div class="table-wrap"><table>
        <thead><tr><th>Modul</th><th>Akses</th><th>Status</th><th>Soal</th><th>Token</th><th>Peserta</th><th>Rata-rata</th><th></th></tr></thead>
        <tbody>
        ${modules.map((m) => html`<tr>
          <td><a href="/admin/modules/${m.id}"><b>${m.title}</b></a><div class="muted small">${m.iso_standard}</div></td>
          <td>${m.access === 'token' ? html`<span class="badge lock">Token</span>` : html`<span class="badge open">Terbuka</span>`}</td>
          <td>${m.published ? html`<span class="badge open">Publik</span>` : html`<span class="badge">Draft</span>`}</td>
          <td>${m.qcount}</td><td>${m.tcount}</td><td>${m.acount}</td><td>${m.avg_score ?? '-'}</td>
          <td><a class="btn small" href="/admin/modules/${m.id}">Kelola</a></td>
        </tr>`)}
        </tbody>
      </table></div>`}`));
});

// ---------- Modul: buat / edit ----------
function moduleForm(req, m, action) {
  return html`
    <form method="post" action="${action}" class="stack">
      <div class="grid2">
        <label>Judul modul <input name="title" value="${m.title || ''}" required maxlength="150"></label>
        <label>Standar ISO
          <input name="iso_standard" value="${m.iso_standard || ''}" list="iso-list" maxlength="60" placeholder="mis. ISO 9001:2015">
          <datalist id="iso-list">
            <option value="ISO 9001:2015"><option value="ISO 14001:2015"><option value="ISO 45001:2018">
            <option value="ISO/IEC 27001:2022"><option value="ISO 22000:2018"><option value="ISO 37001:2016"><option value="ISO 50001:2018">
          </datalist>
        </label>
      </div>
      <label>Deskripsi singkat <textarea name="description" rows="2" maxlength="500">${m.description || ''}</textarea></label>
      <label>Materi pembelajaran
        <span class="muted small">Baris kosong = paragraf baru · awali baris dengan "## " untuk sub-judul · awali dengan "- " untuk poin.</span>
        <textarea name="content" rows="14" maxlength="100000">${m.content || ''}</textarea>
      </label>
      <div class="grid2">
        <label>Akses modul
          <select name="access">
            <option value="token" ${m.access !== 'public' ? 'selected' : ''}>🔒 Wajib token peserta</option>
            <option value="public" ${m.access === 'public' ? 'selected' : ''}>Terbuka (cukup isi nama)</option>
          </select>
        </label>
        <label>Nilai minimal lulus (0–100) <input type="number" name="pass_score" min="0" max="100" value="${m.pass_score ?? 70}"></label>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" name="published" value="1" ${m.published ? 'checked' : ''}> Publikasikan (tampil di beranda)</label>
        <label class="check"><input type="checkbox" name="show_answers" value="1" ${m.show_answers ?? 1 ? 'checked' : ''}> Tampilkan pembahasan setelah kuis</label>
        <label class="check"><input type="checkbox" name="shuffle" value="1" ${m.shuffle ? 'checked' : ''}> Acak urutan soal</label>
      </div>
      <fieldset class="group">
        <legend>Sertifikat</legend>
        <label class="check"><input type="checkbox" name="cert_enabled" value="1" ${m.cert_enabled ?? 1 ? 'checked' : ''}> Berikan sertifikat (PDF) kepada peserta yang lulus</label>
        <div class="grid2">
          <label>Nama organisasi / penyelenggara <input name="cert_org" value="${m.cert_org || ''}" maxlength="120" placeholder="${req.admin.display_name}"></label>
          <label>Kota penerbitan <span class="muted small">(opsional)</span><input name="cert_city" value="${m.cert_city || ''}" maxlength="60" placeholder="mis. Jakarta"></label>
          <label>Nama penanda tangan <input name="cert_signer_name" value="${m.cert_signer_name || ''}" maxlength="100" placeholder="mis. Ir. Budi Hartono"></label>
          <label>Jabatan penanda tangan <input name="cert_signer_title" value="${m.cert_signer_title || ''}" maxlength="100" placeholder="mis. Management Representative"></label>
        </div>
      </fieldset>
      <div class="actions"><button class="primary">Simpan</button> <a class="btn" href="${m.id ? `/admin/modules/${m.id}` : '/admin'}">Batal</a></div>
    </form>`;
}

function readModuleBody(body) {
  return {
    title: str(body.title, 150),
    iso_standard: str(body.iso_standard, 60),
    description: str(body.description, 500),
    content: String(body.content || '').slice(0, 100000),
    access: body.access === 'public' ? 'public' : 'token',
    pass_score: toInt(body.pass_score, 70, 0, 100),
    published: body.published ? 1 : 0,
    show_answers: body.show_answers ? 1 : 0,
    shuffle: body.shuffle ? 1 : 0,
    cert_enabled: body.cert_enabled ? 1 : 0,
    cert_org: str(body.cert_org, 120),
    cert_city: str(body.cert_city, 60),
    cert_signer_name: str(body.cert_signer_name, 100),
    cert_signer_title: str(body.cert_signer_title, 100),
  };
}

const MODULE_FIELDS = ['title', 'iso_standard', 'description', 'content', 'access', 'pass_score', 'published', 'show_answers', 'shuffle',
  'cert_enabled', 'cert_org', 'cert_city', 'cert_signer_name', 'cert_signer_title'];

router.get('/modules/new', (req, res) => {
  res.send(page(req, 'Modul Baru', html`<div class="panel"><h1>Modul Baru</h1>${moduleForm(req, {}, '/admin/modules')}</div>`));
});

router.post('/modules', (req, res) => {
  const m = readModuleBody(req.body);
  if (!m.title) { flash(req, 'error', 'Judul wajib diisi.'); return res.redirect('/admin/modules/new'); }
  const id = db.prepare(`INSERT INTO modules (admin_id, ${MODULE_FIELDS.join(', ')}) VALUES (?${', ?'.repeat(MODULE_FIELDS.length)})`)
    .run(req.admin.id, ...MODULE_FIELDS.map((f) => m[f])).lastInsertRowid;
  flash(req, 'success', 'Modul dibuat. Sekarang tambahkan soal.');
  res.redirect(`/admin/modules/${id}/questions`);
});

router.get('/modules/:id/edit', ownModule, (req, res) => {
  res.send(page(req, 'Edit Modul', html`<div class="panel"><h1>Edit Modul</h1>${moduleForm(req, req.mod, `/admin/modules/${req.mod.id}/edit`)}</div>`));
});

router.post('/modules/:id/edit', ownModule, (req, res) => {
  const m = readModuleBody(req.body);
  if (!m.title) { flash(req, 'error', 'Judul wajib diisi.'); return res.redirect(`/admin/modules/${req.mod.id}/edit`); }
  db.prepare(`UPDATE modules SET ${MODULE_FIELDS.map((f) => `${f}=?`).join(', ')}, updated_at=datetime('now','localtime') WHERE id=? AND admin_id=?`)
    .run(...MODULE_FIELDS.map((f) => m[f]), req.mod.id, req.admin.id);
  flash(req, 'success', 'Modul disimpan.');
  res.redirect(`/admin/modules/${req.mod.id}`);
});

router.post('/modules/:id/delete', ownModule, (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ? AND admin_id = ?').run(req.mod.id, req.admin.id);
  flash(req, 'success', `Modul "${req.mod.title}" dihapus.`);
  res.redirect('/admin');
});

// ---------- Detail modul (tab) ----------
router.get('/modules/:id', ownModule, (req, res) => {
  const m = req.mod;
  const stats = db.prepare(`SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg, SUM(passed) AS passed FROM attempts WHERE module_id = ?`).get(m.id);
  const qcount = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE module_id = ?').get(m.id).n;
  const tok = db.prepare('SELECT COUNT(*) AS n, SUM(used_count >= max_attempts) AS used FROM tokens WHERE module_id = ?').get(m.id);
  const warn = [];
  if (!qcount) warn.push('Modul belum memiliki soal.');
  if (m.access === 'token' && !tok.n) warn.push('Modul wajib token tetapi belum ada token peserta yang dibuat.');
  if (!m.published) warn.push('Modul masih Draft dan belum tampil untuk peserta.');

  res.send(moduleShell(req, '', html`
    ${warn.map((w) => html`<div class="flash warn">${w}</div>`)}
    <div class="stats">
      <div class="stat"><div class="n">${qcount}</div><div>Soal</div></div>
      <div class="stat"><div class="n">${tok.n}</div><div>Token (${tok.used || 0} terpakai)</div></div>
      <div class="stat"><div class="n">${stats.n}</div><div>Pengerjaan</div></div>
      <div class="stat"><div class="n">${stats.avg ?? '-'}</div><div>Rata-rata nilai</div></div>
      <div class="stat"><div class="n">${stats.n ? Math.round(((stats.passed || 0) / stats.n) * 100) + '%' : '-'}</div><div>Tingkat lulus</div></div>
    </div>
    <div class="panel">
      <h3>Deskripsi</h3><p>${m.description || html`<span class="muted">-</span>`}</p>
      <p class="muted small">Nilai lulus: ${m.pass_score} · Pembahasan: ${m.show_answers ? 'ditampilkan' : 'disembunyikan'} · Urutan soal: ${m.shuffle ? 'acak' : 'tetap'} · Diperbarui: ${m.updated_at}</p>
    </div>
    <div class="panel">
      <h3>Sertifikat</h3>
      ${m.cert_enabled
        ? html`<p>Peserta yang lulus mendapat sertifikat PDF dengan QR code verifikasi.
            Penanda tangan: <b>${m.cert_signer_name || req.admin.display_name}</b>${m.cert_signer_title ? ` (${m.cert_signer_title})` : ''}.</p>`
        : html`<p class="muted">Sertifikat untuk peserta dimatikan. Aktifkan lewat Edit Modul.</p>`}
      <a class="btn small" href="/admin/modules/${m.id}/certificate-preview.pdf">Pratinjau Sertifikat (PDF)</a>
      <a class="btn small" href="/admin/modules/${m.id}/edit">Atur Sertifikat</a>
    </div>
    <div class="panel danger-zone">
      <h3>Hapus modul</h3>
      <p class="muted small">Menghapus modul juga menghapus semua soal, token, dan hasil peserta.</p>
      <form method="post" action="/admin/modules/${m.id}/delete" onsubmit="return confirm('Hapus modul ini beserta semua soal, token, dan hasilnya?')">
        <button class="danger">Hapus Modul</button>
      </form>
    </div>`));
});

// ---------- Soal ----------
function questionFields(q = {}) {
  return html`
    <label>Pertanyaan <textarea name="text" rows="2" required maxlength="2000">${q.text || ''}</textarea></label>
    <div class="grid2">
      ${LETTERS.map((L) => html`<label>Pilihan ${L.toLowerCase()}. <input name="option_${L.toLowerCase()}" value="${q['option_' + L.toLowerCase()] || ''}" required maxlength="500"></label>`)}
    </div>
    <div class="grid2">
      <label>Jawaban benar
        <select name="correct">${LETTERS.map((L) => html`<option value="${L}" ${q.correct === L ? 'selected' : ''}>${L.toLowerCase()}</option>`)}</select>
      </label>
      <label>Pembahasan <span class="muted small">(opsional)</span><input name="explanation" value="${q.explanation || ''}" maxlength="1000"></label>
    </div>`;
}

function readQuestion(body) {
  const q = {
    text: str(body.text, 2000),
    option_a: str(body.option_a, 500), option_b: str(body.option_b, 500),
    option_c: str(body.option_c, 500), option_d: str(body.option_d, 500),
    correct: String(body.correct || '').toUpperCase(),
    explanation: str(body.explanation, 1000),
  };
  const ok = q.text && q.option_a && q.option_b && q.option_c && q.option_d && LETTERS.includes(q.correct);
  return ok ? q : null;
}

const insertQuestion = (moduleId, q) => db.prepare(`INSERT INTO questions (module_id, text, option_a, option_b, option_c, option_d, correct, explanation, sort_order)
  VALUES (?,?,?,?,?,?,?,?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM questions WHERE module_id = ?))`)
  .run(moduleId, q.text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct, q.explanation, moduleId);

const touch = (id) => db.prepare(`UPDATE modules SET updated_at = datetime('now','localtime') WHERE id = ?`).run(id);

router.get('/modules/:id/questions', ownModule, (req, res) => {
  const m = req.mod;
  const qs = db.prepare('SELECT * FROM questions WHERE module_id = ? ORDER BY sort_order, id').all(m.id);
  res.send(moduleShell(req, 'questions', html`
    <div class="panel">
      <h2>Daftar Soal (${qs.length})</h2>
      ${qs.length === 0 ? html`<p class="muted">Belum ada soal.</p>` : ''}
      ${qs.map((q, i) => html`
        <div class="qitem">
          <div class="qhead">
            <b>${i + 1}. ${q.text}</b>
            <div class="qtools">
              <form method="post" action="/admin/questions/${q.id}/move" class="inline"><input type="hidden" name="dir" value="up"><button class="btn small" title="Naik" ${i === 0 ? 'disabled' : ''}>↑</button></form>
              <form method="post" action="/admin/questions/${q.id}/move" class="inline"><input type="hidden" name="dir" value="down"><button class="btn small" title="Turun" ${i === qs.length - 1 ? 'disabled' : ''}>↓</button></form>
              <a class="btn small" href="/admin/questions/${q.id}/edit">Edit</a>
              <form method="post" action="/admin/questions/${q.id}/delete" class="inline" onsubmit="return confirm('Hapus soal ini?')"><button class="btn small danger">Hapus</button></form>
            </div>
          </div>
          <ol type="a" class="opts">
            ${LETTERS.map((L) => html`<li class="${q.correct === L ? 'correct' : ''}">${q['option_' + L.toLowerCase()]}${q.correct === L ? ' ✔' : ''}</li>`)}
          </ol>
          ${q.explanation ? html`<div class="muted small">💡 ${q.explanation}</div>` : ''}
        </div>`)}
    </div>
    <div class="panel">
      <h2>Tambah Soal</h2>
      <form method="post" action="/admin/modules/${m.id}/questions" class="stack">
        ${questionFields()}
        <div class="actions"><button class="primary">Tambah Soal</button></div>
      </form>
    </div>
    <div class="panel">
      <h2>Import Banyak Soal</h2>
      <p class="muted small">Satu soal per baris dengan format:<br>
        <code>Pertanyaan | pilihan a | pilihan b | pilihan c | pilihan d | jawaban (a/b/c/d) | pembahasan (opsional)</code></p>
      <form method="post" action="/admin/modules/${m.id}/questions/import" class="stack">
        <textarea name="bulk" rows="6" placeholder="Apa kepanjangan ISO? | International Organization for Standardization | International Standard Office | Internal System Organization | Indonesian Standard Organization | a | ISO adalah badan standar internasional."></textarea>
        <div class="actions"><button>Import</button></div>
      </form>
    </div>`));
});

router.post('/modules/:id/questions', ownModule, (req, res) => {
  const q = readQuestion(req.body);
  if (!q) flash(req, 'error', 'Pertanyaan, keempat pilihan (a–d), dan jawaban benar wajib diisi.');
  else { insertQuestion(req.mod.id, q); touch(req.mod.id); flash(req, 'success', 'Soal ditambahkan.'); }
  res.redirect(`/admin/modules/${req.mod.id}/questions`);
});

router.post('/modules/:id/questions/import', ownModule, (req, res) => {
  const lines = String(req.body.bulk || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
  const good = [];
  const bad = [];
  lines.forEach((line, i) => {
    const p = line.split('|').map((s) => s.trim());
    const q = readQuestion({ text: p[0], option_a: p[1], option_b: p[2], option_c: p[3], option_d: p[4], correct: p[5], explanation: p[6] });
    q ? good.push(q) : bad.push(i + 1);
  });
  tx(() => good.forEach((q) => insertQuestion(req.mod.id, q)));
  if (good.length) touch(req.mod.id);
  flash(req, bad.length ? 'warn' : 'success',
    `${good.length} soal berhasil diimport.` + (bad.length ? ` Baris dengan format salah: ${bad.join(', ')}.` : ''));
  res.redirect(`/admin/modules/${req.mod.id}/questions`);
});

router.get('/questions/:qid/edit', ownQuestion, (req, res) => {
  res.send(page(req, 'Edit Soal', html`
    <p class="small"><a href="/admin/modules/${req.q.module_id}/questions">← Kembali ke daftar soal</a></p>
    <div class="panel"><h1>Edit Soal</h1>
      <form method="post" action="/admin/questions/${req.q.id}/edit" class="stack">
        ${questionFields(req.q)}
        <div class="actions"><button class="primary">Simpan</button></div>
      </form>
    </div>`));
});

router.post('/questions/:qid/edit', ownQuestion, (req, res) => {
  const q = readQuestion(req.body);
  if (!q) { flash(req, 'error', 'Semua kolom soal wajib diisi.'); return res.redirect(`/admin/questions/${req.q.id}/edit`); }
  db.prepare('UPDATE questions SET text=?, option_a=?, option_b=?, option_c=?, option_d=?, correct=?, explanation=? WHERE id=?')
    .run(q.text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct, q.explanation, req.q.id);
  touch(req.q.module_id);
  flash(req, 'success', 'Soal disimpan.');
  res.redirect(`/admin/modules/${req.q.module_id}/questions`);
});

router.post('/questions/:qid/delete', ownQuestion, (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.q.id);
  flash(req, 'success', 'Soal dihapus.');
  res.redirect(`/admin/modules/${req.q.module_id}/questions`);
});

router.post('/questions/:qid/move', ownQuestion, (req, res) => {
  const qs = db.prepare('SELECT id FROM questions WHERE module_id = ? ORDER BY sort_order, id').all(req.q.module_id).map((r) => r.id);
  const i = qs.indexOf(req.q.id);
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < qs.length) {
    [qs[i], qs[j]] = [qs[j], qs[i]];
    const upd = db.prepare('UPDATE questions SET sort_order = ? WHERE id = ?');
    tx(() => qs.forEach((id, k) => upd.run(k + 1, id)));
  }
  res.redirect(`/admin/modules/${req.q.module_id}/questions`);
});

// ---------- Token peserta ----------
router.get('/modules/:id/tokens', ownModule, (req, res) => {
  const m = req.mod;
  const tokens = db.prepare('SELECT * FROM tokens WHERE module_id = ? ORDER BY id DESC').all(m.id);
  const today = new Date().toISOString().slice(0, 10);
  const status = (t) => {
    if (!t.active) return html`<span class="badge">Nonaktif</span>`;
    if (t.expires_at && t.expires_at < today) return html`<span class="badge">Kedaluwarsa</span>`;
    if (t.used_count >= t.max_attempts) return html`<span class="badge lock">Habis</span>`;
    return html`<span class="badge open">Aktif</span>`;
  };

  res.send(moduleShell(req, 'tokens', html`
    ${m.access !== 'token' ? html`<div class="flash warn">Modul ini berstatus <b>Terbuka</b>, sehingga token tidak wajib. Ubah akses ke "Wajib token" di Edit Modul bila ingin membatasi peserta.</div>` : ''}
    <div class="panel">
      <h2>Buat Token</h2>
      <p class="muted small">Isi nama peserta (satu nama per baris) untuk membuat token atas nama masing-masing peserta,
        atau kosongkan dan isi jumlah untuk membuat token tanpa nama (peserta mengisi nama sendiri).</p>
      <form method="post" action="/admin/modules/${m.id}/tokens" class="stack">
        <label>Nama peserta <textarea name="names" rows="5" placeholder="Budi Santoso&#10;Siti Aminah&#10;..."></textarea></label>
        <div class="grid3">
          <label>Jumlah token tanpa nama <input type="number" name="count" min="0" max="500" value="0"></label>
          <label>Maks. kesempatan mengerjakan <input type="number" name="max_attempts" min="1" max="100" value="1"></label>
          <label>Berlaku sampai <span class="muted small">(opsional)</span><input type="date" name="expires_at"></label>
        </div>
        <div class="actions"><button class="primary">Buat Token</button></div>
      </form>
    </div>
    <div class="panel">
      <div class="head-row">
        <h2>Daftar Token (${tokens.length})</h2>
        ${tokens.length ? html`<a class="btn small" href="/admin/modules/${m.id}/tokens.csv">Unduh CSV</a>` : ''}
      </div>
      ${tokens.length === 0 ? html`<p class="muted">Belum ada token.</p>` : html`
      <div class="table-wrap"><table>
        <thead><tr><th>Token</th><th>Peserta</th><th>Dipakai</th><th>Berlaku s/d</th><th>Status</th><th></th></tr></thead>
        <tbody>${tokens.map((t) => html`<tr>
          <td><code class="token">${t.code}</code></td>
          <td>${t.participant_name || html`<span class="muted">(bebas)</span>`}</td>
          <td>${t.used_count} / ${t.max_attempts}</td>
          <td>${t.expires_at || '-'}</td>
          <td>${status(t)}</td>
          <td class="nowrap">
            <form method="post" action="/admin/tokens/${t.id}/toggle" class="inline"><button class="btn small">${t.active ? 'Nonaktifkan' : 'Aktifkan'}</button></form>
            <form method="post" action="/admin/tokens/${t.id}/reset" class="inline" onsubmit="return confirm('Reset jumlah pemakaian token ini ke 0?')"><button class="btn small">Reset</button></form>
            <form method="post" action="/admin/tokens/${t.id}/delete" class="inline" onsubmit="return confirm('Hapus token ini?')"><button class="btn small danger">Hapus</button></form>
          </td>
        </tr>`)}</tbody>
      </table></div>`}
    </div>`));
});

router.post('/modules/:id/tokens', ownModule, (req, res) => {
  const names = String(req.body.names || '').split(/\r?\n/).map((s) => s.trim().slice(0, 100)).filter(Boolean).slice(0, 500);
  const count = toInt(req.body.count, 0, 0, 500);
  const maxAttempts = toInt(req.body.max_attempts, 1, 1, 100);
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(req.body.expires_at || '') ? req.body.expires_at : null;
  const list = [...names, ...Array(count).fill('')];
  if (!list.length) { flash(req, 'error', 'Isi nama peserta atau jumlah token.'); return res.redirect(`/admin/modules/${req.mod.id}/tokens`); }

  const exists = db.prepare('SELECT 1 FROM tokens WHERE code = ?');
  const ins = db.prepare('INSERT INTO tokens (module_id, code, participant_name, max_attempts, expires_at) VALUES (?,?,?,?,?)');
  tx(() => list.forEach((name) => {
    let code;
    do { code = randomToken(); } while (exists.get(code));
    ins.run(req.mod.id, code, name, maxAttempts, exp);
  }));
  flash(req, 'success', `${list.length} token berhasil dibuat. Bagikan token kepada peserta.`);
  res.redirect(`/admin/modules/${req.mod.id}/tokens`);
});

router.get('/modules/:id/tokens.csv', ownModule, (req, res) => {
  const tokens = db.prepare('SELECT * FROM tokens WHERE module_id = ? ORDER BY id').all(req.mod.id);
  const url = `${req.protocol}://${req.get('host')}/m/${req.mod.id}`;
  res.type('text/csv').attachment(`token-modul-${req.mod.id}.csv`).send(csv([
    ['Token', 'Nama Peserta', 'Dipakai', 'Maks', 'Berlaku s/d', 'Aktif', 'Link Modul'],
    ...tokens.map((t) => [t.code, t.participant_name, t.used_count, t.max_attempts, t.expires_at || '', t.active ? 'Ya' : 'Tidak', url]),
  ]));
});

router.post('/tokens/:tid/toggle', ownToken, (req, res) => {
  db.prepare('UPDATE tokens SET active = 1 - active WHERE id = ?').run(req.token.id);
  res.redirect(`/admin/modules/${req.token.module_id}/tokens`);
});

router.post('/tokens/:tid/reset', ownToken, (req, res) => {
  db.prepare('UPDATE tokens SET used_count = 0 WHERE id = ?').run(req.token.id);
  flash(req, 'success', `Pemakaian token ${req.token.code} direset.`);
  res.redirect(`/admin/modules/${req.token.module_id}/tokens`);
});

router.post('/tokens/:tid/delete', ownToken, (req, res) => {
  db.prepare('DELETE FROM tokens WHERE id = ?').run(req.token.id);
  flash(req, 'success', `Token ${req.token.code} dihapus.`);
  res.redirect(`/admin/modules/${req.token.module_id}/tokens`);
});

// ---------- Peserta, rekap & sertifikat ----------
router.use(require('./admin-results'));

// ---------- Ganti password ----------
router.get('/password', (req, res) => {
  res.send(page(req, 'Ganti Password', html`
    <div class="panel narrow"><h1>Ganti Password</h1>
      <form method="post" action="/admin/password" class="stack">
        <label>Password lama <input type="password" name="old" required autocomplete="current-password"></label>
        <label>Password baru (min. 8 karakter) <input type="password" name="new1" required minlength="8" autocomplete="new-password"></label>
        <label>Ulangi password baru <input type="password" name="new2" required minlength="8" autocomplete="new-password"></label>
        <button class="primary">Simpan</button>
      </form>
    </div>`));
});

router.post('/password', (req, res) => {
  const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  const { old, new1, new2 } = req.body;
  if (!verifyPassword(String(old || ''), a.password_hash)) flash(req, 'error', 'Password lama salah.');
  else if (String(new1 || '').length < 8) flash(req, 'error', 'Password baru minimal 8 karakter.');
  else if (new1 !== new2) flash(req, 'error', 'Konfirmasi password tidak sama.');
  else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(new1), a.id);
    flash(req, 'success', 'Password berhasil diganti.');
    return res.redirect('/admin');
  }
  res.redirect('/admin/password');
});

// ---------- Kelola admin (super admin) ----------
router.get('/users', requireSuper, (req, res) => {
  const admins = db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM modules WHERE admin_id = a.id) AS mcount FROM admins a ORDER BY a.id`).all();
  res.send(page(req, 'Kelola Admin', html`
    <h1>Kelola Admin</h1>
    <p class="muted">Setiap admin memiliki ruang kerja terpisah: hanya dapat melihat dan mengelola modul, soal, token, dan hasil miliknya sendiri.</p>
    <div class="panel">
      <div class="table-wrap"><table>
        <thead><tr><th>Username</th><th>Nama / Unit</th><th>Peran</th><th>Modul</th><th>Dibuat</th><th></th></tr></thead>
        <tbody>${admins.map((a) => html`<tr>
          <td><b>${a.username}</b></td><td>${a.display_name}</td>
          <td>${a.role === 'super' ? 'Super Admin' : 'Admin'}</td><td>${a.mcount}</td><td class="nowrap">${a.created_at}</td>
          <td class="nowrap">
            <form method="post" action="/admin/users/${a.id}/reset" class="inline" onsubmit="var p=prompt('Password baru (min. 8 karakter) untuk ${a.username}:'); if(!p) return false; this.password.value=p;">
              <input type="hidden" name="password"><button class="btn small">Reset Password</button>
            </form>
            ${a.id !== req.admin.id ? html`
            <form method="post" action="/admin/users/${a.id}/delete" class="inline" onsubmit="return confirm('Hapus admin ${a.username} beserta ${a.mcount} modul miliknya?')">
              <button class="btn small danger">Hapus</button>
            </form>` : ''}
          </td>
        </tr>`)}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <h2>Tambah Admin</h2>
      <form method="post" action="/admin/users" class="stack">
        <div class="grid2">
          <label>Username <input name="username" required pattern="[A-Za-z0-9._-]{3,30}" title="3–30 karakter: huruf, angka, titik, garis bawah, strip"></label>
          <label>Nama / Unit <input name="display_name" required maxlength="100" placeholder="mis. Tim QHSE"></label>
          <label>Password (min. 8 karakter) <input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
          <label>Peran
            <select name="role"><option value="admin">Admin (kelola modul sendiri)</option><option value="super">Super Admin (+ kelola admin)</option></select>
          </label>
        </div>
        <div class="actions"><button class="primary">Tambah Admin</button></div>
      </form>
    </div>`));
});

router.post('/users', requireSuper, (req, res) => {
  const username = str(req.body.username, 30);
  const display = str(req.body.display_name, 100);
  const password = String(req.body.password || '');
  const role = req.body.role === 'super' ? 'super' : 'admin';
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username) || !display || password.length < 8) {
    flash(req, 'error', 'Data admin tidak valid. Periksa username, nama, dan password (min. 8 karakter).');
  } else if (db.prepare('SELECT 1 FROM admins WHERE username = ?').get(username)) {
    flash(req, 'error', 'Username sudah dipakai.');
  } else {
    db.prepare('INSERT INTO admins (username, display_name, password_hash, role) VALUES (?,?,?,?)').run(username, display, hashPassword(password), role);
    flash(req, 'success', `Admin ${username} ditambahkan.`);
  }
  res.redirect('/admin/users');
});

router.post('/users/:uid/reset', requireSuper, (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 8) flash(req, 'error', 'Password minimal 8 karakter.');
  else {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(pw), +req.params.uid);
    flash(req, 'success', 'Password admin direset.');
  }
  res.redirect('/admin/users');
});

router.post('/users/:uid/delete', requireSuper, (req, res) => {
  const id = +req.params.uid;
  if (id === req.admin.id) flash(req, 'error', 'Tidak dapat menghapus akun sendiri.');
  else { db.prepare('DELETE FROM admins WHERE id = ?').run(id); flash(req, 'success', 'Admin dihapus.'); }
  res.redirect('/admin/users');
});

module.exports = router;
