// ISO Awareness versi statis: semua berjalan di browser, tanpa server.
// Halaman dipilih lewat hash (#/...), jadi bisa dibuka langsung dari file
// maupun di GitHub Pages. Hasil kuis disimpan di localStorage browser peserta.
(function () {
  'use strict';

  const MODUL = window.ISO_MODUL || [];
  const LETTERS = ['A', 'B', 'C', 'D'];
  const KEY_HASIL = 'isoAwareness.hasil';
  const KEY_PESERTA = 'isoAwareness.peserta';
  const EMAIL_URL = String((window.ISO_PENGATURAN || {}).emailEndpoint || '').trim();
  const app = document.getElementById('app');

  // ---------- Util ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  // Materi: baris kosong = paragraf baru, "- " = poin, "## " = sub-judul.
  function richText(text) {
    return String(text || '').replace(/\r/g, '').split(/\n{2,}/).map((b) => {
      const lines = b.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return '';
      const out = [];
      let list = [];
      const flush = () => { if (list.length) out.push('<ul>' + list.map((l) => `<li>${esc(l)}</li>`).join('') + '</ul>'); list = []; };
      let para = [];
      const flushPara = () => { if (para.length) out.push(`<p>${para.map(esc).join('<br>')}</p>`); para = []; };
      for (const l of lines) {
        if (/^\s*[-*]\s+/.test(l)) { flushPara(); list.push(l.replace(/^\s*[-*]\s+/, '')); }
        else if (/^##\s+/.test(l)) { flushPara(); flush(); out.push(`<h3>${esc(l.replace(/^##\s+/, ''))}</h3>`); }
        else { flush(); para.push(l); }
      }
      flushPara(); flush();
      return out.join('');
    }).join('\n');
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(d);
  }

  function certCode() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let r = '';
    for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return `ISO-${ymd}-${r}`;
  }

  // localStorage bisa diblokir (mode privat, dsb.); simpan di memori sebagai cadangan.
  const memory = {};
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return memory[key] ?? fallback; }
  }
  function save(key, value) {
    memory[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* pakai memori saja */ }
  }

  const findModul = (id) => MODUL.find((m) => m.id === id);
  const getPeserta = (id) => load(KEY_PESERTA, {})[id];
  function setPeserta(id, data) {
    const all = load(KEY_PESERTA, {});
    all[id] = data;
    save(KEY_PESERTA, all);
  }
  const allHasil = () => load(KEY_HASIL, []);
  const findHasil = (id) => allHasil().find((h) => h.id === id);
  function updateHasil(id, patch) {
    save(KEY_HASIL, allHasil().map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

  function dataSertifikat(h, m) {
    const s = m.sertifikat || {};
    return {
      nama: h.nama, departemen: h.departemen, noSertifikat: h.noSertifikat,
      nilai: h.nilai, benar: h.benar, total: h.total, tanggal: h.tanggal,
      judulModul: m.judul, standar: m.standar,
      organisasi: s.organisasi, kota: s.kota, penandatangan: s.penandatangan, jabatan: s.jabatan,
    };
  }

  // ---------- Kirim email (lewat Google Apps Script) ----------
  // Hasil kuis dikirim ke email peserta; jika lulus, sertifikat PDF ikut dilampirkan.
  async function kirimEmail(h, email) {
    const m = findModul(h.modulId);
    let pdf = null;
    if (h.lulus) {
      const canvas = await Sertifikat.gambar(document.createElement('canvas'), dataSertifikat(h, m), window.ISO_DESAIN);
      pdf = Sertifikat.pdfBase64(canvas);
    }
    // text/plain agar tidak memicu preflight CORS yang tidak didukung Apps Script.
    const res = await fetch(EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        email: email.trim(), nama: h.nama, departemen: h.departemen,
        modul: m.judul, standar: m.standar, nilai: h.nilai, benar: h.benar, total: h.total,
        nilaiLulus: m.nilaiLulus, lulus: h.lulus, noSertifikat: h.noSertifikat, tanggal: h.tanggal,
        pdf, namaFile: Sertifikat.namaFile(dataSertifikat(h, m)) + '.pdf',
      }),
    });
    const out = await res.json().catch(() => ({ ok: false, error: 'Balasan server tidak dikenali.' }));
    if (!out.ok) throw new Error(out.error || 'Gagal mengirim email.');
  }

  // Kotak "kirim ke email" di halaman hasil dan sertifikat.
  function sendBox(h) {
    if (!EMAIL_URL) return '';
    const st = h.emailStatus === 'terkirim' ? `<span class="send-status ok">✓ Terkirim ke ${esc(h.email)}</span>` : '';
    return `
      <form class="send-box" id="sendForm">
        <input type="email" name="email" required placeholder="nama@perusahaan.co.id" value="${esc(h.email || '')}">
        <button>${h.emailStatus === 'terkirim' ? 'Kirim ulang' : 'Kirim ke email'}</button>
        <span class="send-status" id="sendStatus">${st}</span>
      </form>`;
  }

  function bindSendBox(h, auto) {
    const form = document.getElementById('sendForm');
    if (!form) return;
    const status = document.getElementById('sendStatus');
    const btn = form.querySelector('button');
    async function kirim(email) {
      btn.disabled = true;
      // Ditandai lebih dulu agar tidak terkirim dua kali jika halaman dibuka ulang.
      updateHasil(h.id, { email, emailStatus: 'mengirim' });
      status.className = 'send-status';
      status.textContent = `Mengirim ke ${email}...`;
      try {
        await kirimEmail(h, email);
        updateHasil(h.id, { email, emailStatus: 'terkirim' });
        status.className = 'send-status ok';
        status.textContent = `✓ Terkirim ke ${email}`;
        btn.textContent = 'Kirim ulang';
      } catch (err) {
        updateHasil(h.id, { email, emailStatus: 'gagal' });
        status.className = 'send-status bad';
        status.textContent = `Gagal mengirim: ${err.message}`;
      }
      btn.disabled = false;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = String(new FormData(form).get('email')).trim();
      if (!validEmail(email)) { status.className = 'send-status bad'; status.textContent = 'Alamat email tidak valid.'; return; }
      kirim(email);
    });
    if (auto && h.email && !h.emailStatus) kirim(h.email);
  }

  let flashMsg = null;
  function flash(type, msg) { flashMsg = { type, msg }; }
  function go(path) { location.hash = '#' + path; }

  function render(title, body) {
    document.title = (title ? title + ' · ' : '') + 'ISO Awareness';
    const f = flashMsg ? `<div class="flash ${flashMsg.type}">${esc(flashMsg.msg)}</div>` : '';
    flashMsg = null;
    app.innerHTML = f + body;
    window.scrollTo(0, 0);
  }

  const notFound = () => render('Tidak ditemukan', '<h1>Halaman tidak ditemukan</h1><p><a href="#/">Kembali ke beranda</a></p>');

  // ---------- Beranda ----------
  function home() {
    render('Beranda', `
      <section class="hero">
        <h1>Pelatihan ISO Awareness</h1>
        <p>Pelajari materi standar ISO lalu uji pemahaman Anda melalui kuis pilihan ganda.</p>
      </section>
      <h2>Daftar Modul</h2>
      ${MODUL.length ? '' : '<p class="muted">Belum ada modul. Tambahkan di <code>data/modul.js</code>.</p>'}
      <div class="cards">
        ${MODUL.map((m) => `
          <a class="card" href="#/m/${encodeURIComponent(m.id)}">
            <div class="card-top">
              ${m.standar ? `<span class="tag">${esc(m.standar)}</span>` : ''}
              ${m.kodeAkses ? '<span class="badge lock">🔒 Butuh Kode</span>' : '<span class="badge open">Terbuka</span>'}
            </div>
            <h3>${esc(m.judul)}</h3>
            <p>${esc(m.deskripsi)}</p>
            <div class="muted small">${m.soal.length} soal · nilai lulus ${m.nilaiLulus}</div>
          </a>`).join('')}
      </div>`);
  }

  // ---------- Form masuk modul ----------
  function modulForm(m) {
    const p = getPeserta(m.id) || {};
    render(m.judul, `
      <div class="panel narrow">
        ${m.standar ? `<span class="tag">${esc(m.standar)}</span>` : ''}
        <h1>${esc(m.judul)}</h1>
        <p>${esc(m.deskripsi)}</p>
        <p class="muted small">${m.soal.length} soal pilihan ganda · nilai lulus ${m.nilaiLulus}</p>
        <form id="start" class="stack">
          ${m.kodeAkses ? `
            <div class="note">🔒 Modul ini membutuhkan kode akses dari penyelenggara pelatihan.</div>
            <label>Kode akses
              <input name="kode" autocomplete="off" required maxlength="40">
            </label>` : ''}
          <label>Nama lengkap
            <input name="nama" maxlength="100" required value="${esc(p.nama || '')}">
          </label>
          <label>Departemen / Unit <span class="muted small">(opsional)</span>
            <input name="departemen" maxlength="100" value="${esc(p.departemen || '')}">
          </label>
          ${EMAIL_URL ? `
            <label>Email <span class="muted small">(hasil kuis dan sertifikat dikirim ke sini)</span>
              <input name="email" type="email" maxlength="200" required value="${esc(p.email || '')}">
            </label>` : ''}
          <button class="primary">Mulai Belajar</button>
        </form>
      </div>`);

    document.getElementById('start').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (m.kodeAkses && String(fd.get('kode')).trim().toUpperCase() !== String(m.kodeAkses).trim().toUpperCase()) {
        flash('error', 'Kode akses salah.');
        return modulForm(m);
      }
      setPeserta(m.id, {
        nama: String(fd.get('nama')).trim().slice(0, 100),
        departemen: String(fd.get('departemen') || '').trim().slice(0, 100),
        email: String(fd.get('email') || '').trim().slice(0, 200),
      });
      go(`/m/${m.id}/materi`);
    });
  }

  // ---------- Materi ----------
  function materi(m) {
    const p = getPeserta(m.id);
    render(m.judul, `
      <div class="panel">
        ${m.standar ? `<span class="tag">${esc(m.standar)}</span>` : ''}
        <h1>${esc(m.judul)}</h1>
        <p class="muted small">Peserta: ${esc(p.nama)}${p.departemen ? ' · ' + esc(p.departemen) : ''}</p>
        <div class="content">${richText(m.materi)}</div>
      </div>
      <div class="actions">
        <a class="btn primary" href="#/m/${encodeURIComponent(m.id)}/kuis">Lanjut ke Kuis →</a>
        <a class="btn" href="#/m/${encodeURIComponent(m.id)}/ganti">Ganti peserta</a>
      </div>`);
  }

  // ---------- Kuis ----------
  function kuis(m) {
    const p = getPeserta(m.id);
    const order = m.soal.map((_, i) => i);
    const urut = m.acakSoal ? shuffle(order) : order;
    render('Kuis · ' + m.judul, `
      <h1>Kuis: ${esc(m.judul)}</h1>
      <p class="muted">Peserta: ${esc(p.nama)} · Jawab semua soal lalu klik <b>Kirim Jawaban</b>.</p>
      <form id="quiz">
        ${urut.map((qi, n) => {
          const q = m.soal[qi];
          return `
            <fieldset class="question">
              <legend><span class="qnum">${n + 1}</span> ${esc(q[0])}</legend>
              ${LETTERS.map((L, k) => `
                <label class="option">
                  <input type="radio" name="q${qi}" value="${L}" required>
                  <span class="letter">${L.toLowerCase()}.</span>
                  <span>${esc(q[k + 1])}</span>
                </label>`).join('')}
            </fieldset>`;
        }).join('')}
        <div class="actions">
          <button class="primary">Kirim Jawaban</button>
          <a href="#/m/${encodeURIComponent(m.id)}/materi">Kembali ke materi</a>
        </div>
      </form>`);

    document.getElementById('quiz').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const jawaban = urut.map((qi) => ({ i: qi, j: fd.get('q' + qi) || '' }));
      const benar = jawaban.filter((a) => a.j === String(m.soal[a.i][5]).toUpperCase()).length;
      const total = m.soal.length;
      const nilai = total ? Math.round((benar / total) * 100) : 0;
      const lulus = nilai >= m.nilaiLulus;
      const hasil = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        modulId: m.id,
        nama: p.nama,
        departemen: p.departemen,
        email: p.email || '',
        nilai, benar, total, lulus,
        tanggal: new Date().toISOString(),
        jawaban,
        noSertifikat: lulus ? certCode() : null,
      };
      save(KEY_HASIL, [hasil, ...allHasil()]);
      go(`/hasil/${hasil.id}`);
    });
  }

  // ---------- Hasil ----------
  function hasilPage(h) {
    const m = findModul(h.modulId);
    if (!m) return notFound();
    const review = m.pembahasan ? `
      <h2>Pembahasan</h2>
      ${h.jawaban.map((a, n) => {
        const q = m.soal[a.i];
        if (!q) return '';
        const kunci = String(q[5]).toUpperCase();
        const ok = a.j === kunci;
        return `
          <div class="review ${ok ? 'ok' : 'bad'}">
            <b>${n + 1}. ${esc(q[0])}</b>
            ${LETTERS.map((L, k) => `
              <div class="opt ${L === kunci ? 'correct' : L === a.j ? 'wrong' : ''}">${L.toLowerCase()}. ${esc(q[k + 1])}${L === kunci ? ' ✓' : ''}</div>`).join('')}
            ${q[6] ? `<div class="explain">${esc(q[6])}</div>` : ''}
          </div>`;
      }).join('')}` : '';

    render('Hasil · ' + m.judul, `
      <div class="panel narrow center">
        <p class="muted">${esc(m.judul)}</p>
        <div class="score ${h.lulus ? 'pass' : 'fail'}">${h.nilai}</div>
        <p>Benar ${h.benar} dari ${h.total} soal · nilai lulus ${m.nilaiLulus}</p>
        <h2>${h.lulus ? '🎉 Selamat, Anda LULUS' : 'Belum lulus'}</h2>
        ${h.lulus ? `
          <div class="cert-box">
            <div>Sertifikat Anda sudah siap.</div>
            <a class="btn primary" href="#/sertifikat/${h.id}">Lihat &amp; Unduh Sertifikat</a>
            <div class="muted small">Nomor: <code>${esc(h.noSertifikat)}</code></div>
          </div>` : `
          <div class="actions" style="justify-content:center">
            <a class="btn primary" href="#/m/${encodeURIComponent(m.id)}/materi">Pelajari lagi</a>
            <a class="btn" href="#/m/${encodeURIComponent(m.id)}/kuis">Coba lagi</a>
          </div>`}
        ${EMAIL_URL ? `<p class="muted small">${h.lulus ? 'Kirim hasil dan sertifikat PDF ke email:' : 'Kirim hasil kuis ke email:'}</p>${sendBox(h)}` : ''}
      </div>
      ${review ? `<div class="panel">${review}</div>` : ''}`);
    bindSendBox(h, true);
  }

  // ---------- Daftar sertifikat ----------
  function sertifikatList() {
    const list = allHasil().filter((h) => h.lulus && findModul(h.modulId));
    render('Sertifikat Saya', `
      <div class="panel narrow">
        <h1>Sertifikat Saya</h1>
        <p class="muted small">Sertifikat tersimpan di browser ini saja. Unduh sebagai PDF agar tidak hilang.</p>
        ${list.length ? list.map((h) => {
          const m = findModul(h.modulId);
          return `
            <div class="cert-item">
              <div>
                <b>${esc(m.judul)}</b>
                <div class="muted small">${esc(h.nama)} · nilai ${h.nilai} · ${formatDate(h.tanggal)}</div>
                <div class="muted small"><code>${esc(h.noSertifikat)}</code></div>
              </div>
              <a class="btn small" href="#/sertifikat/${h.id}">Buka</a>
            </div>`;
        }).join('') : '<p>Belum ada sertifikat. Selesaikan kuis dan lulus untuk mendapatkannya.</p>'}
      </div>`);
  }

  // ---------- Sertifikat ----------
  function sertifikat(h) {
    const m = findModul(h.modulId);
    if (!m || !h.lulus) return notFound();
    const data = dataSertifikat(h, m);
    render('Sertifikat ' + h.nama, `
      <div class="actions" style="margin:0 0 16px">
        <button class="primary" id="unduh" disabled>Unduh PDF</button>
        <a class="btn" href="#/sertifikat">Kembali</a>
      </div>
      <canvas id="cert" class="cert-canvas"></canvas>
      ${EMAIL_URL ? `<div class="panel" style="margin-top:16px"><b>Kirim sertifikat ke email</b>${sendBox(h)}</div>` : ''}`);
    const canvas = document.getElementById('cert');
    const btn = document.getElementById('unduh');
    Sertifikat.gambar(canvas, data, window.ISO_DESAIN).then(() => { btn.disabled = false; });
    btn.addEventListener('click', () => Sertifikat.unduh(canvas, data));
    bindSendBox(h, false);
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [a, b, c] = parts;
    if (!a) return home();
    if (a === 'm') {
      const m = findModul(b);
      if (!m) return notFound();
      if (c === 'ganti') { setPeserta(m.id, null); return go(`/m/${m.id}`); }
      // Materi dan kuis hanya bisa dibuka setelah mengisi nama (dan kode akses).
      if ((c === 'materi' || c === 'kuis') && !getPeserta(m.id)) return go(`/m/${m.id}`);
      if (c === 'materi') return materi(m);
      if (c === 'kuis') return kuis(m);
      if (!c) return getPeserta(m.id) ? go(`/m/${m.id}/materi`) : modulForm(m);
      return notFound();
    }
    if (a === 'hasil') { const h = findHasil(b); return h ? hasilPage(h) : notFound(); }
    if (a === 'sertifikat') {
      if (!b) return sertifikatList();
      const h = findHasil(b);
      return h ? sertifikat(h) : notFound();
    }
    notFound();
  }

  window.addEventListener('hashchange', route);
  route();
})();
