// Halaman desain sertifikat: atur tampilan, lihat pratinjau, lalu unduh
// file desain-sertifikat.js untuk diunggah ke repo.
(function () {
  'use strict';

  const KEY_DRAF = 'isoAwareness.desainDraf';
  const MODUL = window.ISO_MODUL || [];
  const terpasang = { ...Sertifikat.DEFAULT, ...(window.ISO_DESAIN || {}) };
  const form = document.getElementById('desain');
  const canvas = document.getElementById('preview');
  const pilihModul = document.getElementById('modulPreview');

  // Batas ukuran gambar agar file desain tetap ringan.
  const GAMBAR = {
    logo: { max: 1000, type: 'image/png' },
    latar: { max: 2400, type: 'image/jpeg' },
    tandaTangan: { max: 900, type: 'image/png' },
  };

  function loadDraf() {
    try {
      const v = localStorage.getItem(KEY_DRAF);
      return v ? { ...terpasang, ...JSON.parse(v) } : { ...terpasang };
    } catch { return { ...terpasang }; }
  }
  let desain = loadDraf();

  function simpanDraf() {
    try { localStorage.setItem(KEY_DRAF, JSON.stringify(desain)); } catch { /* draf hanya di memori */ }
  }

  function isiForm() {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = !!desain[el.name];
      else el.value = desain[el.name] ?? '';
    }
    for (const box of form.querySelectorAll('.img-field')) {
      const src = desain[box.dataset.key];
      const img = box.querySelector('img');
      box.querySelector('.img-row').hidden = !src;
      if (src) img.src = src; else img.removeAttribute('src');
    }
  }

  function dataContoh() {
    const m = MODUL.find((x) => x.id === pilihModul.value) || MODUL[0] || { judul: 'Judul Modul', standar: 'ISO 9001:2015', soal: [] };
    const s = m.sertifikat || {};
    return {
      nama: 'Nama Peserta', departemen: 'Departemen', noSertifikat: 'ISO-20260101-CONTOH',
      nilai: 100, benar: m.soal.length || 5, total: m.soal.length || 5, tanggal: new Date().toISOString(),
      judulModul: m.judul, standar: m.standar,
      organisasi: s.organisasi, kota: s.kota, penandatangan: s.penandatangan, jabatan: s.jabatan,
    };
  }

  let antre = null;
  function pratinjau() {
    // Gabungkan perubahan beruntun (mis. saat menggeser pemilih warna).
    cancelAnimationFrame(antre);
    antre = requestAnimationFrame(() => Sertifikat.gambar(canvas, dataContoh(), desain));
  }

  function perkecil(file, { max, type }) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL(type, 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca.')); };
      img.src = url;
    });
  }

  function ubah() {
    for (const el of form.elements) {
      if (!el.name) continue;
      desain[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    simpanDraf();
    pratinjau();
  }

  form.addEventListener('input', (e) => { if (e.target.type !== 'file') ubah(); });
  form.addEventListener('change', (e) => { if (e.target.type !== 'file') ubah(); });

  for (const box of form.querySelectorAll('.img-field')) {
    const key = box.dataset.key;
    box.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        desain[key] = await perkecil(file, GAMBAR[key]);
      } catch (err) {
        alert(err.message);
        return;
      }
      e.target.value = '';
      simpanDraf();
      isiForm();
      pratinjau();
    });
    box.querySelector('button').addEventListener('click', () => {
      desain[key] = '';
      simpanDraf();
      isiForm();
      pratinjau();
    });
  }

  document.getElementById('reset').addEventListener('click', () => {
    if (!confirm('Buang draf dan kembali ke desain yang sedang terpasang di situs?')) return;
    try { localStorage.removeItem(KEY_DRAF); } catch { /* abaikan */ }
    desain = { ...terpasang };
    isiForm();
    pratinjau();
  });

  document.getElementById('export').addEventListener('click', () => {
    const isi = '// Desain sertifikat. Dibuat lewat halaman admin.html; unggah ulang file ini ke docs/data/ untuk mengganti desain.\n'
      + 'window.ISO_DESAIN = ' + JSON.stringify(desain, null, 2) + ';\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([isi], { type: 'text/javascript' }));
    a.download = 'desain-sertifikat.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('contoh').addEventListener('click', async () => {
    const data = dataContoh();
    await Sertifikat.gambar(canvas, data, desain);
    Sertifikat.unduh(canvas, data);
  });

  pilihModul.innerHTML = MODUL.map((m) => `<option value="${m.id}">${m.judul.replace(/</g, '&lt;')}</option>`).join('');
  pilihModul.addEventListener('change', pratinjau);

  // Tautan unggah ke repo jika situs berjalan di GitHub Pages (<user>.github.io/<repo>/).
  const link = document.getElementById('uploadLink');
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m && repo && repo !== 'admin.html') link.href = `https://github.com/${m[1]}/${repo}/upload/main/docs/data`;
  else link.href = 'https://github.com';

  isiForm();
  pratinjau();
})();
