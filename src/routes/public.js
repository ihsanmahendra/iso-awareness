const express = require('express');
const { db, tx } = require('../db');
const { html, layout, richText } = require('../views');
const { normalizeToken, rateLimiter, shuffle } = require('../util');

const router = express.Router();
const tokenLimit = rateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
const LETTERS = ['A', 'B', 'C', 'D'];

const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

function getPublishedModule(id) {
  return db.prepare(`
    SELECT m.*, a.display_name AS owner_name
    FROM modules m JOIN admins a ON a.id = m.admin_id
    WHERE m.id = ? AND m.published = 1`).get(id);
}

// Cek token: mengembalikan { token } jika valid, atau { error } jika tidak.
function checkToken(code, moduleId) {
  const token = db.prepare('SELECT * FROM tokens WHERE code = ?').get(code);
  if (!token || (moduleId && token.module_id !== moduleId)) return { error: 'Token tidak ditemukan atau tidak berlaku untuk modul ini.' };
  if (!token.active) return { error: 'Token sudah dinonaktifkan oleh admin.' };
  if (token.expires_at && token.expires_at < new Date().toISOString().slice(0, 10)) return { error: 'Token sudah kedaluwarsa.' };
  if (token.used_count >= token.max_attempts) return { error: 'Kesempatan mengerjakan untuk token ini sudah habis.' };
  return { token };
}

function access(req, moduleId) {
  return req.session.access && req.session.access[moduleId];
}

function grantAccess(req, moduleId, data) {
  req.session.access = req.session.access || {};
  req.session.access[moduleId] = data;
}

// ---------- Beranda ----------
router.get('/', (req, res) => {
  const modules = db.prepare(`
    SELECT m.id, m.title, m.iso_standard, m.description, m.access, a.display_name AS owner_name,
      (SELECT COUNT(*) FROM questions q WHERE q.module_id = m.id) AS qcount
    FROM modules m JOIN admins a ON a.id = m.admin_id
    WHERE m.published = 1
    ORDER BY m.updated_at DESC`).all();

  res.send(layout(req, {
    title: 'Beranda',
    body: html`
      <section class="hero">
        <h1>Pelatihan ISO Awareness</h1>
        <p>Pelajari materi standar ISO lalu uji pemahaman Anda melalui kuis pilihan ganda.</p>
        <form method="post" action="/token" class="token-box">
          <label for="tok">Punya token peserta?</label>
          <div class="row">
            <input id="tok" name="token" placeholder="XXXX-XXXX" autocomplete="off" required maxlength="20">
            <button>Masuk</button>
          </div>
        </form>
      </section>
      <h2>Daftar Modul</h2>
      ${modules.length === 0 ? html`<p class="muted">Belum ada modul yang dipublikasikan.</p>` : ''}
      <div class="cards">
        ${modules.map((m) => html`
          <a class="card" href="/m/${m.id}">
            <div class="card-top">
              ${m.iso_standard ? html`<span class="tag">${m.iso_standard}</span>` : ''}
              ${m.access === 'token'
                ? html`<span class="badge lock">🔒 Butuh Token</span>`
                : html`<span class="badge open">Terbuka</span>`}
            </div>
            <h3>${m.title}</h3>
            <p>${m.description}</p>
            <div class="muted small">${m.qcount} soal · oleh ${m.owner_name}</div>
          </a>`)}
      </div>`,
  }));
});

// Masuk langsung dengan token dari beranda.
router.post('/token', (req, res) => {
  if (!tokenLimit(req.ip)) { flash(req, 'error', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'); return res.redirect('/'); }
  const code = normalizeToken(req.body.token);
  const { token, error } = checkToken(code);
  if (error) { flash(req, 'error', error); return res.redirect('/'); }
  const mod = getPublishedModule(token.module_id);
  if (!mod) { flash(req, 'error', 'Modul untuk token ini belum tersedia.'); return res.redirect('/'); }
  if (token.participant_name) {
    grantAccess(req, mod.id, { tokenId: token.id, name: token.participant_name, department: '' });
    return res.redirect(`/m/${mod.id}/learn`);
  }
  res.redirect(`/m/${mod.id}?token=${encodeURIComponent(code)}`);
});

// ---------- Halaman modul (form masuk) ----------
router.get('/m/:id', (req, res) => {
  const mod = getPublishedModule(+req.params.id);
  if (!mod) return res.status(404).send(layout(req, { title: 'Tidak ditemukan', body: html`<h1>Modul tidak ditemukan</h1>` }));
  if (access(req, mod.id)) return res.redirect(`/m/${mod.id}/learn`);
  const qcount = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE module_id = ?').get(mod.id).n;
  const needToken = mod.access === 'token';

  res.send(layout(req, {
    title: mod.title,
    body: html`
      <div class="panel narrow">
        ${mod.iso_standard ? html`<span class="tag">${mod.iso_standard}</span>` : ''}
        <h1>${mod.title}</h1>
        <p>${mod.description}</p>
        <p class="muted small">${qcount} soal pilihan ganda · nilai lulus ${mod.pass_score} · oleh ${mod.owner_name}</p>
        <form method="post" action="/m/${mod.id}/start" class="stack">
          ${needToken ? html`
            <div class="note">🔒 Modul ini hanya dapat diakses dengan token peserta yang diberikan oleh admin.</div>
            <label>Token peserta
              <input name="token" value="${req.query.token || ''}" placeholder="XXXX-XXXX" autocomplete="off" required maxlength="20">
            </label>` : ''}
          <label>Nama lengkap ${needToken ? html`<span class="muted small">(boleh dikosongkan jika token sudah atas nama Anda)</span>` : ''}
            <input name="name" maxlength="100" ${needToken ? '' : 'required'}>
          </label>
          <label>Departemen / Unit <span class="muted small">(opsional)</span>
            <input name="department" maxlength="100">
          </label>
          <button class="primary">Mulai Belajar</button>
        </form>
      </div>`,
  }));
});

router.post('/m/:id/start', (req, res) => {
  const mod = getPublishedModule(+req.params.id);
  if (!mod) return res.redirect('/');
  const name = String(req.body.name || '').trim().slice(0, 100);
  const department = String(req.body.department || '').trim().slice(0, 100);

  if (mod.access === 'token') {
    if (!tokenLimit(req.ip)) { flash(req, 'error', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'); return res.redirect(`/m/${mod.id}`); }
    const code = normalizeToken(req.body.token);
    const { token, error } = checkToken(code, mod.id);
    if (error) { flash(req, 'error', error); return res.redirect(`/m/${mod.id}`); }
    const finalName = token.participant_name || name;
    if (!finalName) { flash(req, 'error', 'Nama wajib diisi.'); return res.redirect(`/m/${mod.id}?token=${encodeURIComponent(code)}`); }
    grantAccess(req, mod.id, { tokenId: token.id, name: finalName, department });
  } else {
    if (!name) { flash(req, 'error', 'Nama wajib diisi.'); return res.redirect(`/m/${mod.id}`); }
    grantAccess(req, mod.id, { tokenId: null, name, department });
  }
  res.redirect(`/m/${mod.id}/learn`);
});

// Middleware: peserta harus sudah masuk ke modul ini.
function requireAccess(req, res, next) {
  const mod = getPublishedModule(+req.params.id);
  if (!mod) return res.redirect('/');
  const acc = access(req, mod.id);
  if (!acc) return res.redirect(`/m/${mod.id}`);
  if (acc.tokenId) {
    const t = db.prepare('SELECT code FROM tokens WHERE id = ?').get(acc.tokenId);
    const check = t ? checkToken(t.code, mod.id) : { error: 'Token tidak lagi berlaku.' };
    if (check.error) {
      delete req.session.access[mod.id];
      flash(req, 'error', check.error);
      return res.redirect(`/m/${mod.id}`);
    }
  }
  req.mod = mod;
  req.acc = acc;
  next();
}

// ---------- Materi ----------
router.get('/m/:id/learn', requireAccess, (req, res) => {
  const { mod, acc } = req;
  const qcount = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE module_id = ?').get(mod.id).n;
  res.send(layout(req, {
    title: mod.title,
    body: html`
      <div class="panel">
        <div class="muted small">Peserta: <b>${acc.name}</b>${acc.department ? ` · ${acc.department}` : ''}</div>
        ${mod.iso_standard ? html`<span class="tag">${mod.iso_standard}</span>` : ''}
        <h1>${mod.title}</h1>
        <article class="content">${mod.content ? richText(mod.content) : html`<p class="muted">Tidak ada materi tertulis untuk modul ini.</p>`}</article>
        <div class="actions">
          ${qcount > 0
            ? html`<a class="btn primary" href="/m/${mod.id}/quiz">Mulai Kuis (${qcount} soal) →</a>`
            : html`<span class="muted">Kuis untuk modul ini belum tersedia.</span>`}
        </div>
      </div>`,
  }));
});

// ---------- Kuis ----------
router.get('/m/:id/quiz', requireAccess, (req, res) => {
  const { mod, acc } = req;
  let questions = db.prepare('SELECT * FROM questions WHERE module_id = ? ORDER BY sort_order, id').all(mod.id);
  if (!questions.length) return res.redirect(`/m/${mod.id}/learn`);
  if (mod.shuffle) questions = shuffle(questions);
  acc.order = questions.map((q) => q.id);

  res.send(layout(req, {
    title: `Kuis · ${mod.title}`,
    body: html`
      <div class="panel">
        <h1>Kuis: ${mod.title}</h1>
        <p class="muted">Pilih satu jawaban yang paling tepat (A, B, C, atau D). Nilai minimal lulus: <b>${mod.pass_score}</b>.</p>
        <form method="post" action="/m/${mod.id}/quiz" id="quiz">
          ${questions.map((q, i) => html`
            <fieldset class="question">
              <legend><span class="qnum">${i + 1}</span> ${q.text}</legend>
              ${LETTERS.map((L) => html`
                <label class="option">
                  <input type="radio" name="q_${q.id}" value="${L}" required>
                  <span class="letter">${L.toLowerCase()}.</span>
                  <span>${q['option_' + L.toLowerCase()]}</span>
                </label>`)}
            </fieldset>`)}
          <div class="actions">
            <button class="primary" onclick="return confirm('Kirim jawaban sekarang? Jawaban tidak dapat diubah setelah dikirim.')">Kirim Jawaban</button>
          </div>
        </form>
      </div>`,
  }));
});

router.post('/m/:id/quiz', requireAccess, (req, res) => {
  const { mod, acc } = req;
  if (!acc.order) return res.redirect(`/m/${mod.id}/quiz`);

  const all = db.prepare('SELECT * FROM questions WHERE module_id = ?').all(mod.id);
  const byId = new Map(all.map((q) => [q.id, q]));
  const qs = acc.order.map((id) => byId.get(id)).filter(Boolean);
  if (!qs.length) return res.redirect(`/m/${mod.id}/learn`);

  const answers = qs.map((q) => {
    const given = String(req.body['q_' + q.id] || '').toUpperCase();
    return { qid: q.id, given: LETTERS.includes(given) ? given : null, correct: q.correct };
  });
  const correctCount = answers.filter((a) => a.given === a.correct).length;
  const score = Math.round((correctCount / qs.length) * 100);
  const passed = score >= mod.pass_score ? 1 : 0;

  let attemptId;
  try {
    attemptId = tx(() => {
      if (acc.tokenId) {
        // Pastikan kuota masih ada (atomik) sebelum menyimpan hasil.
        const r = db.prepare('UPDATE tokens SET used_count = used_count + 1 WHERE id = ? AND used_count < max_attempts AND active = 1').run(acc.tokenId);
        if (r.changes === 0) throw new Error('QUOTA');
      }
      return db.prepare(`INSERT INTO attempts (module_id, token_id, participant_name, department, correct_count, total, score, passed, answers)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(mod.id, acc.tokenId, acc.name, acc.department || '', correctCount, qs.length, score, passed, JSON.stringify(answers)).lastInsertRowid;
    });
  } catch (e) {
    if (e.message !== 'QUOTA') throw e;
    delete req.session.access[mod.id];
    flash(req, 'error', 'Kesempatan mengerjakan untuk token ini sudah habis.');
    return res.redirect(`/m/${mod.id}`);
  }

  delete req.session.access[mod.id];
  req.session.results = [...(req.session.results || []), Number(attemptId)].slice(-20);
  res.redirect(`/result/${attemptId}`);
});

// ---------- Hasil ----------
router.get('/result/:id', (req, res) => {
  const id = +req.params.id;
  if (!(req.session.results || []).includes(id)) return res.redirect('/');
  const at = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  const mod = at && db.prepare('SELECT * FROM modules WHERE id = ?').get(at.module_id);
  if (!mod) return res.redirect('/');
  const answers = JSON.parse(at.answers);
  const qmap = new Map(db.prepare('SELECT * FROM questions WHERE module_id = ?').all(mod.id).map((q) => [q.id, q]));

  res.send(layout(req, {
    title: 'Hasil Kuis',
    body: html`
      <div class="panel narrow center">
        <div class="muted">${mod.title}</div>
        <div class="score ${at.passed ? 'pass' : 'fail'}">${at.score}</div>
        <h2>${at.passed ? '🎉 Selamat, Anda LULUS!' : 'Belum Lulus'}</h2>
        <p>${at.participant_name} menjawab benar <b>${at.correct_count}</b> dari <b>${at.total}</b> soal. Nilai minimal lulus: ${mod.pass_score}.</p>
        <p class="muted small">Waktu: ${at.created_at}</p>
        <a class="btn" href="/">Kembali ke Beranda</a>
      </div>
      ${mod.show_answers ? html`
        <div class="panel">
          <h2>Pembahasan</h2>
          ${answers.map((a, i) => {
            const q = qmap.get(a.qid);
            if (!q) return '';
            return html`
              <div class="review ${a.given === a.correct ? 'ok' : 'bad'}">
                <div><b>${i + 1}. ${q.text}</b></div>
                ${LETTERS.map((L) => html`
                  <div class="opt ${L === q.correct ? 'correct' : ''} ${L === a.given && L !== q.correct ? 'wrong' : ''}">
                    ${L.toLowerCase()}. ${q['option_' + L.toLowerCase()]}
                    ${L === q.correct ? ' ✔' : ''}${L === a.given && L !== q.correct ? ' ✘ (jawaban Anda)' : ''}
                  </div>`)}
                ${!a.given ? html`<div class="muted small">Tidak dijawab</div>` : ''}
                ${q.explanation ? html`<div class="explain">💡 ${q.explanation}</div>` : ''}
              </div>`;
          })}
        </div>` : ''}`,
  }));
});

module.exports = router;
