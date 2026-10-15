// Perhitungan rekap peserta & hasil.
const { db } = require('./db');

const LETTERS = ['A', 'B', 'C', 'D'];
const nameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Filter tanggal (YYYY-MM-DD) untuk kolom created_at.
function dateFilter({ from, to } = {}, col = 'a.created_at') {
  const where = [];
  const params = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { where.push(`date(${col}) >= ?`); params.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { where.push(`date(${col}) <= ?`); params.push(to); }
  return { sql: where.length ? ' AND ' + where.join(' AND ') : '', params };
}

function moduleAttempts(moduleId, range) {
  const f = dateFilter(range);
  return db.prepare(`SELECT a.*, t.code AS token_code FROM attempts a LEFT JOIN tokens t ON t.id = a.token_id
    WHERE a.module_id = ?${f.sql} ORDER BY a.id`).all(moduleId, ...f.params);
}

// Kelompokkan pengerjaan per peserta (berdasarkan nama).
function groupParticipants(attempts) {
  const map = new Map();
  for (const a of attempts) {
    const k = nameKey(a.participant_name);
    let p = map.get(k);
    if (!p) {
      p = { key: k, name: a.participant_name, department: '', tokens: new Set(), attempts: 0, best: -1, bestAttempt: null, last: null, passed: false, certAttempt: null };
      map.set(k, p);
    }
    p.attempts++;
    p.name = a.participant_name;
    if (a.department) p.department = a.department;
    if (a.token_code) p.tokens.add(a.token_code);
    if (a.score > p.best) { p.best = a.score; p.bestAttempt = a; }
    p.last = a;
    if (a.passed) {
      p.passed = true;
      if (!p.certAttempt || a.score > p.certAttempt.score) p.certAttempt = a;
    }
  }
  return [...map.values()].sort((x, y) => y.last.id - x.last.id);
}

// Token yang belum pernah dipakai = peserta yang belum mengerjakan.
function pendingTokens(moduleId) {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare('SELECT * FROM tokens WHERE module_id = ? AND used_count = 0 ORDER BY participant_name = \'\', participant_name, id')
    .all(moduleId)
    .map((t) => ({ ...t, state: !t.active ? 'Nonaktif' : t.expires_at && t.expires_at < today ? 'Kedaluwarsa' : 'Aktif' }));
}

function summarize(participants, pending = []) {
  const n = participants.length;
  const passed = participants.filter((p) => p.passed).length;
  const avg = n ? Math.round(participants.reduce((s, p) => s + p.best, 0) / n) : null;
  return {
    participants: n,
    passed,
    failed: n - passed,
    pending: pending.length,
    avg,
    passRate: n ? Math.round((passed / n) * 100) : null,
  };
}

function departmentRecap(participants) {
  const map = new Map();
  for (const p of participants) {
    const d = p.department || '(tanpa departemen)';
    const r = map.get(d) || { department: d, participants: 0, passed: 0, total: 0 };
    r.participants++;
    if (p.passed) r.passed++;
    r.total += p.best;
    map.set(d, r);
  }
  return [...map.values()]
    .map((r) => ({ ...r, avg: Math.round(r.total / r.participants), passRate: Math.round((r.passed / r.participants) * 100) }))
    .sort((a, b) => b.participants - a.participants);
}

// Persentase jawaban benar per soal + pilihan salah yang paling sering dipilih.
function questionAnalysis(moduleId, attempts) {
  const qs = db.prepare('SELECT * FROM questions WHERE module_id = ? ORDER BY sort_order, id').all(moduleId);
  const stat = new Map(qs.map((q) => [q.id, { answered: 0, correct: 0, picks: { A: 0, B: 0, C: 0, D: 0 } }]));
  for (const a of attempts) {
    for (const ans of JSON.parse(a.answers)) {
      const s = stat.get(ans.qid);
      if (!s) continue;
      s.answered++;
      if (ans.given && s.picks[ans.given] !== undefined) s.picks[ans.given]++;
      if (ans.given === ans.correct) s.correct++;
    }
  }
  return qs.map((q, i) => {
    const s = stat.get(q.id);
    const wrong = LETTERS.filter((L) => L !== q.correct).sort((x, y) => s.picks[y] - s.picks[x])[0];
    return {
      no: i + 1, q, answered: s.answered, correct: s.correct, picks: s.picks,
      rate: s.answered ? Math.round((s.correct / s.answered) * 100) : null,
      topWrong: s.picks[wrong] > 0 ? wrong : null,
    };
  });
}

module.exports = { nameKey, dateFilter, moduleAttempts, groupParticipants, pendingTokens, summarize, departmentRecap, questionAnalysis };
