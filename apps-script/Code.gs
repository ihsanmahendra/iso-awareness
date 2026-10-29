// Backend kirim email untuk ISO Awareness versi statis (GitHub Pages).
// Dipasang sebagai Web App Google Apps Script; email terkirim dari akun Gmail pemasang.
// Jika script dibuat dari Google Sheet (Ekstensi -> Apps Script), setiap hasil juga
// dicatat sebagai baris baru di sheet "Rekap".

const NAMA_PENGIRIM = 'ISO Awareness';
const MAKS_PER_ALAMAT_PER_JAM = 5;
const MAKS_UKURAN_PDF = 5 * 1024 * 1024;

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const to = String(d.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) return balas({ ok: false, error: 'Alamat email tidak valid.' });

    // Batasi jumlah kiriman ke satu alamat agar endpoint tidak disalahgunakan untuk spam.
    const cache = CacheService.getScriptCache();
    const key = 'n:' + to.toLowerCase();
    const n = Number(cache.get(key) || 0);
    if (n >= MAKS_PER_ALAMAT_PER_JAM) return balas({ ok: false, error: 'Terlalu banyak pengiriman ke alamat ini. Coba lagi nanti.' });
    cache.put(key, String(n + 1), 3600);

    const t = (v, max) => String(v == null ? '' : v).slice(0, max || 200);
    const nama = t(d.nama, 100);
    const modul = t(d.modul);
    const lulus = d.lulus === true;
    const nilai = Number(d.nilai) || 0;

    const opts = { name: NAMA_PENGIRIM, htmlBody: isiHtml(d, { nama, modul, lulus, nilai }) };
    if (lulus && d.pdf) {
      const bytes = Utilities.base64Decode(String(d.pdf));
      // Hanya terima lampiran PDF (diawali "%PDF") dengan ukuran wajar.
      const isPdf = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (!isPdf || bytes.length > MAKS_UKURAN_PDF) return balas({ ok: false, error: 'Lampiran sertifikat tidak valid.' });
      const file = t(d.namaFile, 120).replace(/[^\w.-]+/g, '_') || 'Sertifikat.pdf';
      opts.attachments = [Utilities.newBlob(bytes, 'application/pdf', /\.pdf$/i.test(file) ? file : file + '.pdf')];
    }

    const subjek = lulus ? `Sertifikat ${modul}` : `Hasil kuis ${modul}`;
    MailApp.sendEmail(to, subjek, isiTeks({ nama, modul, lulus, nilai }), opts);
    catat([new Date(), nama, t(d.departemen, 100), to, modul, t(d.standar), nilai, lulus ? 'Lulus' : 'Belum lulus', t(d.noSertifikat, 40)]);
    return balas({ ok: true });
  } catch (err) {
    return balas({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return balas({ ok: true, info: 'Endpoint email ISO Awareness aktif.' });
}

function balas(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function isiTeks({ nama, modul, lulus, nilai }) {
  return `Halo ${nama},\n\nTerima kasih telah mengikuti pelatihan "${modul}". Nilai Anda: ${nilai}.\n`
    + (lulus ? 'Selamat, Anda LULUS. Sertifikat terlampir dalam format PDF.\n' : 'Anda belum lulus. Silakan pelajari kembali materi dan coba lagi.\n')
    + `\nSalam,\n${NAMA_PENGIRIM}`;
}

function isiHtml(d, { nama, modul, lulus, nilai }) {
  const warna = lulus ? '#15803d' : '#b42318';
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">
    <p>Halo <b>${esc(nama)}</b>,</p>
    <p>Terima kasih telah mengikuti pelatihan <b>${esc(modul)}</b>${d.standar ? ` (${esc(d.standar)})` : ''}.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nilai</td><td><b style="font-size:20px;color:${warna}">${nilai}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Jawaban benar</td><td>${Number(d.benar) || 0} dari ${Number(d.total) || 0}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Status</td><td style="color:${warna}"><b>${lulus ? 'LULUS' : 'Belum lulus'}</b></td></tr>
      ${lulus && d.noSertifikat ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">No. sertifikat</td><td>${esc(d.noSertifikat)}</td></tr>` : ''}
    </table>
    <p>${lulus ? 'Selamat! Sertifikat Anda terlampir dalam format PDF.' : 'Silakan pelajari kembali materi dan coba lagi.'}</p>
    <p style="color:#6b7280">Salam,<br>${esc(NAMA_PENGIRIM)}</p>
  </div>`;
}

// Catat ke sheet "Rekap" jika script terikat ke sebuah Google Sheet.
function catat(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  let sh = ss.getSheetByName('Rekap');
  if (!sh) {
    sh = ss.insertSheet('Rekap');
    sh.appendRow(['Waktu', 'Nama', 'Departemen', 'Email', 'Modul', 'Standar', 'Nilai', 'Status', 'No. Sertifikat']);
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
}
