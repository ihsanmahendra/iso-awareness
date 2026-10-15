// Admin: daftar peserta per modul, rekap seluruh modul, detail jawaban, dan sertifikat.
const express = require('express');
const { db } = require('../db');
const { html } = require('../views');
const { csv } = require('../util');
const { LETTERS, flash, page, ownModule, moduleShell } = require('./admin-common');
const S = require('../stats');
const { sendCertificates } = require('../certificate');

const router = express.Router();

const STATUS_LABEL = { lulus: 'Lulus', tidak: 'Belum lulus', belum: 'Belum mengerjakan' };

function readFilters(q) {
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  return {
    q: String(q.q || '').trim().slice(0, 100),
    status: STATUS_LABEL[q.status] ? q.status : '',
    from: date(q.from),
    to: date(q.to),
  };
}

const qs = (f, extra = {}) => new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v)).toString();

function filterForm(action, f, { withStatus = true, withSearch = true } = {}) {
  return html`
    <form method="get" action="${action}" class="filters">
      ${withSearch ? html`<label>Cari nama / departemen / token <input name="q" value="${f.q}" placeholder="Ketik untuk mencari..."></label>` : ''}
      ${withStatus ? html`<label>Status
        <select name="status">
          <option value="">Semua</option>
          ${Object.entries(STATUS_LABEL).map(([k, v]) => html`<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`)}
        </select></label>` : ''}
      <label>Dari tanggal <input type="date" name="from" value="${f.from}"></label>
      <label>Sampai tanggal <input type="date" name="to" value="${f.to}"></label>
      <div class="filter-actions"><button class="primary">Terapkan</button> <a class="btn" href="${action}">Reset</a></div>
    </form>`;
}

function matches(f, ...fields) {
  if (!f.q) return true;
  const needle = f.q.toLowerCase();
  return fields.some((v) => String(v || '').toLowerCase().includes(needle));
}

// Data peserta satu modul, sudah difilter.
function moduleData(mod, f) {
  const attempts = S.moduleAttempts(mod.id, f);
  const all = S.groupParticipants(attempts);
  const allPending = f.from || f.to ? [] : S.pendingTokens(mod.id);
  const summary = S.summarize(all, allPending);

  let participants = all.filter((p) => matches(f, p.name, p.department, ...p.tokens));
  let pending = allPending.filter((t) => matches(f, t.participant_name, t.code));
  if (f.status === 'lulus') participants = participants.filter((p) => p.passed);
  if (f.status === 'tidak') participants = participants.filter((p) => !p.passed);
  if (f.status === 'belum') participants = [];
  if (f.status && f.status !== 'belum') pending = [];
  return { attempts, all, participants, pending, summary };
}

function statCards(s) {
  return html`
    <div class="stats">
      <div class="stat"><div class="n">${s.participants}</div><div>Peserta mengerjakan</div></div>
      <div class="stat ok"><div class="n">${s.passed}</div><div>Lulus</div></div>
      <div class="stat bad"><div class="n">${s.failed}</div><div>Belum lulus</div></div>
      ${s.pending !== undefined ? html`<div class="stat"><div class="n">${s.pending}</div><div>Belum mengerjakan</div></div>` : ''}
      <div class="stat"><div class="n">${s.avg ?? '-'}</div><div>Rata-rata nilai</div></div>
      <div class="stat"><div class="n">${s.passRate === null ? '-' : s.passRate + '%'}</div><div>Tingkat kelulusan</div></div>
    </div>`;
}

const statusBadge = (passed) => (passed ? html`<span class="badge open">Lulus</span>` : html`<span class="badge lock">Belum lulus</span>`);
const bar = (pct) => html`<div class="bar" title="${pct ?? 0}%"><span style="width:${pct ?? 0}%"></span></div>`;

// ---------- Peserta & rekap per modul ----------
router.get('/modules/:id/results', ownModule, (req, res) => {
  const m = req.mod;
  const f = readFilters(req.query);
  const { attempts, participants, pending, summary, all } = moduleData(m, f);
  const depts = S.departmentRecap(all);
  const analysis = S.questionAnalysis(m.id, attempts);
  const certCount = participants.filter((p) => p.certAttempt).length;
  const base = `/admin/modules/${m.id}`;

  res.send(moduleShell(req, 'results', html`
    ${statCards(summary)}
    <div class="panel">${filterForm(`${base}/results`, f)}</div>

    <div class="panel">
      <div class="head-row">
        <h2>Daftar Peserta (${participants.length})</h2>
        <div>
          <a class="btn small" href="${base}/results.csv?${qs(f, { type: 'participants' })}">Unduh Rekap Peserta (CSV)</a>
          <a class="btn small" href="${base}/results.csv?${qs(f, { type: 'attempts' })}">Unduh Riwayat (CSV)</a>
          ${certCount ? html`<a class="btn small primary" href="${base}/certificates.pdf?${qs(f)}">Unduh ${certCount} Sertifikat (PDF)</a>` : ''}
        </div>
      </div>
      ${participants.length === 0 ? html`<p class="muted">Tidak ada peserta yang cocok.</p>` : html`
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Nama</th><th>Departemen</th><th>Token</th><th>Percobaan</th><th>Nilai terbaik</th><th>Status</th><th>Terakhir mengerjakan</th><th></th></tr></thead>
        <tbody>${participants.map((p, i) => html`<tr>
          <td>${i + 1}</td>
          <td><b>${p.name}</b></td>
          <td>${p.department || '-'}</td>
          <td>${p.tokens.size ? [...p.tokens].map((t) => html`<code>${t}</code> `) : '-'}</td>
          <td>${p.attempts}</td>
          <td><b>${p.best}</b>${p.attempts > 1 && p.last.score !== p.best ? html`<div class="muted small">terakhir ${p.last.score}</div>` : ''}</td>
          <td>${statusBadge(p.passed)}</td>
          <td class="nowrap">${p.last.created_at}</td>
          <td class="nowrap">
            <a class="btn small" href="${base}/results/${p.last.id}">Detail</a>
            ${p.certAttempt ? html`<a class="btn small" href="${base}/results/${p.certAttempt.id}/certificate.pdf">Sertifikat</a>` : ''}
          </td>
        </tr>`)}</tbody>
      </table></div>`}
    </div>

    ${pending.length || (m.access === 'token' && !f.status) ? html`
    <div class="panel">
      <h2>Belum Mengerjakan (${pending.length})</h2>
      <p class="muted small">Token yang sudah dibuat tetapi belum pernah dipakai untuk mengerjakan kuis.</p>
      ${pending.length === 0 ? html`<p class="muted">Semua pemegang token sudah mengerjakan. 👍</p>` : html`
      <div class="table-wrap"><table>
        <thead><tr><th>Peserta</th><th>Token</th><th>Berlaku s/d</th><th>Status token</th></tr></thead>
        <tbody>${pending.map((t) => html`<tr>
          <td>${t.participant_name || html`<span class="muted">(token tanpa nama)</span>`}</td>
          <td><code class="token">${t.code}</code></td><td>${t.expires_at || '-'}</td><td>${t.state}</td>
        </tr>`)}</tbody>
      </table></div>`}
    </div>` : ''}

    <div class="grid2 top">
      <div class="panel">
        <h2>Rekap per Departemen</h2>
        ${depts.length === 0 ? html`<p class="muted">Belum ada data.</p>` : html`
        <div class="table-wrap"><table>
          <thead><tr><th>Departemen</th><th>Peserta</th><th>Lulus</th><th>Rata-rata</th><th>% Lulus</th></tr></thead>
          <tbody>${depts.map((d) => html`<tr><td>${d.department}</td><td>${d.participants}</td><td>${d.passed}</td><td>${d.avg}</td>
            <td class="nowrap">${bar(d.passRate)} ${d.passRate}%</td></tr>`)}</tbody>
        </table></div>`}
      </div>
      <div class="panel">
        <h2>Analisis Soal</h2>
        <p class="muted small">Persentase peserta yang menjawab benar. Soal dengan nilai rendah mungkin perlu dijelaskan ulang di materi.</p>
        ${analysis.length === 0 ? html`<p class="muted">Belum ada soal.</p>` : html`
        <div class="table-wrap"><table>
          <thead><tr><th>No</th><th>Soal</th><th>% Benar</th></tr></thead>
          <tbody>${analysis.map((a) => html`<tr class="${a.rate !== null && a.rate < 50 ? 'warn-row' : ''}">
            <td>${a.no}</td>
            <td>${a.q.text}${a.topWrong ? html`<div class="muted small">Jawaban salah terbanyak: ${a.topWrong.toLowerCase()} (${a.picks[a.topWrong]} peserta)</div>` : ''}</td>
            <td class="nowrap">${a.rate === null ? '-' : html`${bar(a.rate)} ${a.rate}%`}</td>
          </tr>`)}</tbody>
        </table></div>`}
      </div>
    </div>

    <details class="panel">
      <summary><b>Riwayat Semua Pengerjaan (${attempts.length})</b></summary>
      ${attempts.length === 0 ? html`<p class="muted">Belum ada.</p>` : html`
      <div class="table-wrap"><table>
        <thead><tr><th>Waktu</th><th>Nama</th><th>Departemen</th><th>Token</th><th>Benar</th><th>Nilai</th><th>Status</th><th></th></tr></thead>
        <tbody>${[...attempts].reverse().map((r) => html`<tr>
          <td class="nowrap">${r.created_at}</td><td>${r.participant_name}</td><td>${r.department || '-'}</td>
          <td>${r.token_code ? html`<code>${r.token_code}</code>` : '-'}</td>
          <td>${r.correct_count}/${r.total}</td><td><b>${r.score}</b></td><td>${statusBadge(r.passed)}</td>
          <td class="nowrap"><a class="btn small" href="${base}/results/${r.id}">Detail</a>
            <form method="post" action="${base}/results/${r.id}/delete" class="inline" onsubmit="return confirm('Hapus hasil ini?')"><button class="btn small danger">Hapus</button></form></td>
        </tr>`)}</tbody>
      </table></div>`}
    </details>`));
});

router.get('/modules/:id/results.csv', ownModule, (req, res) => {
  const m = req.mod;
  const f = readFilters(req.query);
  const { attempts, participants, pending } = moduleData(m, f);
  const date = new Date().toISOString().slice(0, 10);

  if (req.query.type === 'attempts') {
    const rows = attempts.filter((a) => matches(f, a.participant_name, a.department, a.token_code));
    return res.type('text/csv').attachment(`riwayat-modul-${m.id}-${date}.csv`).send(csv([
      ['Waktu', 'Nama', 'Departemen', 'Token', 'Benar', 'Total', 'Nilai', 'Status', 'No. Sertifikat'],
      ...rows.map((r) => [r.created_at, r.participant_name, r.department, r.token_code || '', r.correct_count, r.total, r.score,
        r.passed ? 'Lulus' : 'Belum lulus', r.cert_code || '']),
    ]));
  }
  res.type('text/csv').attachment(`rekap-peserta-modul-${m.id}-${date}.csv`).send(csv([
    [`Modul: ${m.title}`], [`Standar: ${m.iso_standard}`], [`Nilai lulus: ${m.pass_score}`], [],
    ['No', 'Nama', 'Departemen', 'Token', 'Jumlah Percobaan', 'Nilai Terbaik', 'Nilai Terakhir', 'Status', 'Terakhir Mengerjakan', 'No. Sertifikat'],
    ...participants.map((p, i) => [i + 1, p.name, p.department, [...p.tokens].join(' '), p.attempts, p.best, p.last.score,
      p.passed ? 'Lulus' : 'Belum lulus', p.last.created_at, p.certAttempt ? p.certAttempt.cert_code : '']),
    ...pending.map((t, i) => [participants.length + i + 1, t.participant_name || '(token tanpa nama)', '', t.code, 0, '', '', 'Belum mengerjakan', '', '']),
  ]));
});

// ---------- Detail satu pengerjaan ----------
function ownAttempt(req, res, next) {
  const at = db.prepare('SELECT a.*, t.code AS token_code FROM attempts a LEFT JOIN tokens t ON t.id = a.token_id WHERE a.id = ? AND a.module_id = ?')
    .get(+req.params.rid, req.mod.id);
  if (!at) return res.redirect(`/admin/modules/${req.mod.id}/results`);
  req.attempt = at;
  next();
}

router.get('/modules/:id/results/:rid', ownModule, ownAttempt, (req, res) => {
  const m = req.mod;
  const at = req.attempt;
  const qmap = new Map(db.prepare('SELECT * FROM questions WHERE module_id = ?').all(m.id).map((q) => [q.id, q]));
  const answers = JSON.parse(at.answers);

  res.send(moduleShell(req, 'results', html`
    <p class="small"><a href="/admin/modules/${m.id}/results">← Kembali ke daftar peserta</a></p>
    <div class="panel">
      <div class="head-row">
        <div>
          <h2>${at.participant_name}</h2>
          <div class="muted small">${at.department || 'Tanpa departemen'} · ${at.token_code ? html`Token <code>${at.token_code}</code> · ` : ''}${at.created_at}</div>
        </div>
        <div>${at.passed ? html`<a class="btn primary" href="/admin/modules/${m.id}/results/${at.id}/certificate.pdf">Unduh Sertifikat</a>` : ''}</div>
      </div>
      <div class="stats">
        <div class="stat ${at.passed ? 'ok' : 'bad'}"><div class="n">${at.score}</div><div>Nilai</div></div>
        <div class="stat"><div class="n">${at.correct_count}/${at.total}</div><div>Jawaban benar</div></div>
        <div class="stat"><div class="n">${at.passed ? 'Lulus' : 'Belum'}</div><div>Status (min. ${m.pass_score})</div></div>
        ${at.cert_code ? html`<div class="stat"><div class="n small-n">${at.cert_code}</div><div>No. sertifikat</div></div>` : ''}
      </div>
      <h3>Jawaban peserta</h3>
      ${answers.map((a, i) => {
        const q = qmap.get(a.qid);
        if (!q) return html`<div class="review"><b>${i + 1}.</b> <span class="muted">(soal sudah dihapus)</span></div>`;
        return html`
          <div class="review ${a.given === a.correct ? 'ok' : 'bad'}">
            <div><b>${i + 1}. ${q.text}</b></div>
            ${LETTERS.map((L) => html`
              <div class="opt ${L === a.correct ? 'correct' : ''} ${L === a.given && L !== a.correct ? 'wrong' : ''}">
                ${L.toLowerCase()}. ${q['option_' + L.toLowerCase()]}${L === a.correct ? ' ✔' : ''}${L === a.given ? ' ← dipilih' : ''}
              </div>`)}
            ${!a.given ? html`<div class="muted small">Tidak dijawab</div>` : ''}
          </div>`;
      })}
    </div>`));
});

router.post('/modules/:id/results/:rid/delete', ownModule, ownAttempt, (req, res) => {
  db.prepare('DELETE FROM attempts WHERE id = ?').run(req.attempt.id);
  flash(req, 'success', 'Hasil dihapus. Sertifikat dengan nomor tersebut tidak lagi valid.');
  res.redirect(`/admin/modules/${req.mod.id}/results`);
});

// ---------- Sertifikat ----------
const ownerName = (req) => req.admin.display_name;

router.get('/modules/:id/results/:rid/certificate.pdf', ownModule, ownAttempt, async (req, res) => {
  if (!req.attempt.passed) return res.redirect(`/admin/modules/${req.mod.id}/results/${req.attempt.id}`);
  await sendCertificates(req, res, [{ attempt: req.attempt, module: req.mod, ownerName: ownerName(req) }],
    `Sertifikat-${req.attempt.participant_name}-${req.attempt.cert_code}.pdf`);
});

router.get('/modules/:id/certificates.pdf', ownModule, async (req, res) => {
  const f = readFilters(req.query);
  const items = moduleData(req.mod, f).participants.filter((p) => p.certAttempt)
    .map((p) => ({ attempt: p.certAttempt, module: req.mod, ownerName: ownerName(req) }));
  if (!items.length) { flash(req, 'warn', 'Belum ada peserta lulus untuk dibuatkan sertifikat.'); return res.redirect(`/admin/modules/${req.mod.id}/results`); }
  await sendCertificates(req, res, items, `Sertifikat-${req.mod.title}.pdf`);
});

router.get('/modules/:id/certificate-preview.pdf', ownModule, async (req, res) => {
  const sample = {
    participant_name: 'Nama Peserta Contoh', department: 'Departemen Contoh', score: 90, correct_count: 9, total: 10,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), cert_code: 'ISO-0000-CONTOH00',
  };
  await sendCertificates(req, res, [{ attempt: sample, module: req.mod, ownerName: ownerName(req) }], 'Pratinjau-Sertifikat.pdf');
});

// ---------- Rekap seluruh modul ----------
function recapData(adminId, f) {
  const modules = db.prepare('SELECT * FROM modules WHERE admin_id = ? ORDER BY title').all(adminId);
  const people = new Map();
  const rows = modules.map((m) => {
    const all = S.groupParticipants(S.moduleAttempts(m.id, f));
    const pending = f.from || f.to ? [] : S.pendingTokens(m.id);
    for (const p of all) {
      const person = people.get(p.key) || { name: p.name, department: '', cells: {}, passedCount: 0 };
      if (p.department) person.department = p.department;
      person.cells[m.id] = { best: p.best, passed: p.passed };
      if (p.passed) person.passedCount++;
      people.set(p.key, person);
    }
    return { m, ...S.summarize(all, pending) };
  });
  const persons = [...people.values()]
    .filter((p) => matches(f, p.name, p.department))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const cols = rows.filter((r) => r.participants > 0).map((r) => r.m);
  const total = {
    modules: modules.length,
    people: people.size,
    attempts: rows.reduce((s, r) => s + r.participants, 0),
    passed: rows.reduce((s, r) => s + r.passed, 0),
    pending: rows.reduce((s, r) => s + r.pending, 0),
  };
  return { rows, persons, cols, total };
}

router.get('/recap', (req, res) => {
  const f = readFilters(req.query);
  const { rows, persons, cols, total } = recapData(req.admin.id, f);

  res.send(page(req, 'Rekap', html`
    <h1>Rekap Pelatihan</h1>
    <p class="muted">Ringkasan seluruh modul milik ${req.admin.display_name}.${f.from || f.to ? ` Periode ${f.from || '…'} s/d ${f.to || '…'}.` : ''}</p>
    <div class="stats">
      <div class="stat"><div class="n">${total.modules}</div><div>Modul</div></div>
      <div class="stat"><div class="n">${total.people}</div><div>Orang mengikuti</div></div>
      <div class="stat ok"><div class="n">${total.passed}</div><div>Kelulusan (peserta × modul)</div></div>
      <div class="stat bad"><div class="n">${total.attempts - total.passed}</div><div>Belum lulus</div></div>
      <div class="stat"><div class="n">${total.pending}</div><div>Token belum dipakai</div></div>
    </div>
    <div class="panel">${filterForm('/admin/recap', f, { withStatus: false })}</div>

    <div class="panel">
      <div class="head-row">
        <h2>Rekap per Modul</h2>
        <a class="btn small" href="/admin/recap.csv?${qs(f, { type: 'modules' })}">Unduh CSV</a>
      </div>
      ${rows.length === 0 ? html`<p class="muted">Belum ada modul.</p>` : html`
      <div class="table-wrap"><table>
        <thead><tr><th>Modul</th><th>Peserta</th><th>Lulus</th><th>Belum lulus</th><th>Belum mengerjakan</th><th>Rata-rata</th><th>% Lulus</th><th></th></tr></thead>
        <tbody>${rows.map((r) => html`<tr>
          <td><b>${r.m.title}</b><div class="muted small">${r.m.iso_standard}</div></td>
          <td>${r.participants}</td><td>${r.passed}</td><td>${r.failed}</td><td>${r.pending}</td><td>${r.avg ?? '-'}</td>
          <td class="nowrap">${r.passRate === null ? '-' : html`${bar(r.passRate)} ${r.passRate}%`}</td>
          <td><a class="btn small" href="/admin/modules/${r.m.id}/results?${qs({ from: f.from, to: f.to })}">Lihat peserta</a></td>
        </tr>`)}</tbody>
      </table></div>`}
    </div>

    <div class="panel">
      <div class="head-row">
        <h2>Rekap per Peserta (${persons.length})</h2>
        <a class="btn small" href="/admin/recap.csv?${qs(f, { type: 'participants' })}">Unduh CSV</a>
      </div>
      <p class="muted small">Nilai terbaik setiap peserta di tiap modul. ✔ = lulus, ✘ = belum lulus, - = belum mengerjakan.</p>
      ${persons.length === 0 ? html`<p class="muted">Belum ada peserta.</p>` : html`
      <div class="table-wrap"><table class="matrix">
        <thead><tr><th>Nama</th><th>Departemen</th>${cols.map((m) => html`<th title="${m.title}">${m.title}</th>`)}<th>Modul lulus</th></tr></thead>
        <tbody>${persons.map((p) => html`<tr>
          <td><b>${p.name}</b></td><td>${p.department || '-'}</td>
          ${cols.map((m) => {
            const c = p.cells[m.id];
            return c ? html`<td class="${c.passed ? 'cell-ok' : 'cell-bad'}">${c.best} ${c.passed ? '✔' : '✘'}</td>` : html`<td class="muted">-</td>`;
          })}
          <td><b>${p.passedCount}</b> / ${cols.length}</td>
        </tr>`)}</tbody>
      </table></div>`}
    </div>`));
});

router.get('/recap.csv', (req, res) => {
  const f = readFilters(req.query);
  const { rows, persons, cols } = recapData(req.admin.id, f);
  const date = new Date().toISOString().slice(0, 10);
  const period = f.from || f.to ? [`Periode: ${f.from || '-'} s/d ${f.to || '-'}`] : [];

  if (req.query.type === 'participants') {
    return res.type('text/csv').attachment(`rekap-peserta-${date}.csv`).send(csv([
      ...(period.length ? [period, []] : []),
      ['Nama', 'Departemen', ...cols.map((m) => m.title), 'Modul Lulus'],
      ...persons.map((p) => [p.name, p.department, ...cols.map((m) => {
        const c = p.cells[m.id];
        return c ? `${c.best} (${c.passed ? 'Lulus' : 'Belum lulus'})` : '-';
      }), `${p.passedCount}/${cols.length}`]),
    ]));
  }
  res.type('text/csv').attachment(`rekap-modul-${date}.csv`).send(csv([
    ...(period.length ? [period, []] : []),
    ['Modul', 'Standar ISO', 'Akses', 'Peserta', 'Lulus', 'Belum Lulus', 'Belum Mengerjakan', 'Rata-rata Nilai', '% Lulus'],
    ...rows.map((r) => [r.m.title, r.m.iso_standard, r.m.access === 'token' ? 'Token' : 'Terbuka', r.participants, r.passed, r.failed,
      r.pending, r.avg ?? '', r.passRate === null ? '' : `${r.passRate}%`]),
  ]));
});

module.exports = router;
