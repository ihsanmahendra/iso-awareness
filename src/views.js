// Template HTML dengan auto-escape: semua nilai yang disisipkan di-escape
// kecuali nilai yang dihasilkan oleh html`` atau raw().
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

// Materi: teks biasa, baris kosong = paragraf baru, baris diawali "- " = poin,
// baris diawali "## " = sub-judul.
function richText(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
  return raw(blocks.map((b) => {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return '';
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (lines.length === 1 && /^##\s+/.test(lines[0])) return `<h3>${esc(lines[0].replace(/^##\s+/, ''))}</h3>`;
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  }).join('\n'));
}

function layout(req, { title, body, area = 'public' }) {
  const flash = req.session.flash;
  delete req.session.flash;
  const admin = req.admin;
  const nav = area === 'admin' && admin
    ? html`<nav>
        <a href="/admin">Modul Saya</a>
        <a href="/admin/recap">Rekap</a>
        ${admin.role === 'super' ? html`<a href="/admin/users">Kelola Admin</a>` : ''}
        <a href="/admin/password">Ganti Password</a>
        <form method="post" action="/admin/logout" class="inline"><button class="link">Keluar (${admin.username})</button></form>
      </nav>`
    : html`<nav><a href="/">Beranda</a><a href="/sertifikat">Sertifikat</a><a href="/admin">Admin</a></nav>`;

  return '<!doctype html>' + html`
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? title + ' · ' : ''}ISO Awareness</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="${area}">
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="${area === 'admin' ? '/admin' : '/'}"><span class="logo">ISO</span> Awareness${area === 'admin' ? ' · Admin' : ''}</a>
    ${nav}
  </div>
</header>
<main class="wrap">
  ${flash ? html`<div class="flash ${flash.type}">${flash.msg}</div>` : ''}
  ${body}
</main>
<footer class="wrap muted small">ISO Awareness Training</footer>
</body>
</html>`.s;
}

module.exports = { html, raw, esc, richText, layout };
