// Penggambar sertifikat (A4 lanskap) di <canvas>. Dipakai oleh halaman peserta
// dan halaman desain admin, jadi pratinjau dan PDF selalu sama persis.
(function () {
  'use strict';

  const DEFAULT = {
    judul: 'SERTIFIKAT',
    subjudul: 'ISO AWARENESS TRAINING',
    teksPengantar: 'atas keberhasilannya menyelesaikan dan lulus evaluasi pelatihan',
    warnaUtama: '#1e3a8a',
    warnaAksen: '#b08d3c',
    warnaTeks: '#1f2937',
    warnaLatar: '#fcfbf7',
    bingkai: true,
    tampilNilai: true,
    posisiLogo: 'tengah', // tengah | kiri | kanan
    logo: '',
    latar: '',
    tandaTangan: '',
  };

  // 200 dpi: cukup tajam untuk dicetak, ukuran PDF tetap kecil.
  const W = 2339;
  const H = 1654;
  const MM = W / 297;
  const SERIF = '"Times New Roman", Times, Georgia, serif';
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const GRAY = '#6b7280';

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(d);
  }

  function setFont(ctx, { size, font = SANS, weight = 'normal', style = 'normal', spacing = 0 }) {
    ctx.font = `${style} ${weight} ${size * MM}px ${font}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * MM}px`;
  }

  // Tulis teks rata tengah (atau kiri/kanan), dibungkus jika melebihi lebar.
  // Mengembalikan posisi y (mm) di bawah teks.
  function text(ctx, str, x, y, opts) {
    const { size, color, align = 'center', maxWidth = 230, lineHeight = 1.25, fit } = opts;
    str = String(str ?? '');
    if (!str) return y;
    let s = size;
    setFont(ctx, { ...opts, size: s });
    if (fit) {
      while (s > fit && ctx.measureText(str).width > maxWidth * MM) { s -= 0.25; setFont(ctx, { ...opts, size: s }); }
    }
    const words = str.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxWidth * MM) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x * MM, (y + i * s * lineHeight) * MM));
    return y + lines.length * s * lineHeight;
  }

  // Gambar di dalam kotak (mm) tanpa mengubah proporsi.
  function drawContain(ctx, img, x, y, w, h, align = 'center') {
    const r = Math.min((w * MM) / img.width, (h * MM) / img.height);
    const dw = img.width * r;
    const dh = img.height * r;
    const dx = align === 'left' ? x * MM : align === 'right' ? (x + w) * MM - dw : x * MM + (w * MM - dw) / 2;
    ctx.drawImage(img, dx, y * MM + (h * MM - dh) / 2, dw, dh);
    return dh / MM;
  }

  function drawCover(ctx, img) {
    const r = Math.max(W / img.width, H / img.height);
    const dw = img.width * r;
    const dh = img.height * r;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  // data: { nama, departemen, noSertifikat, nilai, benar, total, tanggal,
  //         judulModul, standar, organisasi, kota, penandatangan, jabatan }
  async function gambar(canvas, data, desain) {
    const d = { ...DEFAULT, ...(desain || {}) };
    const [logo, latar, ttd] = await Promise.all([loadImage(d.logo), loadImage(d.latar), loadImage(d.tandaTangan)]);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.save();

    ctx.fillStyle = d.warnaLatar;
    ctx.fillRect(0, 0, W, H);
    if (latar) drawCover(ctx, latar);

    if (d.bingkai) {
      ctx.strokeStyle = d.warnaUtama;
      ctx.lineWidth = 1.1 * MM;
      ctx.strokeRect(7 * MM, 7 * MM, W - 14 * MM, H - 14 * MM);
      ctx.strokeStyle = d.warnaAksen;
      ctx.lineWidth = 0.3 * MM;
      ctx.strokeRect(10.5 * MM, 10.5 * MM, W - 21 * MM, H - 21 * MM);
      ctx.fillStyle = d.warnaAksen;
      for (const [cx, cy] of [[10.5, 10.5], [286.5, 10.5], [10.5, 199.5], [286.5, 199.5]]) {
        ctx.save();
        ctx.translate(cx * MM, cy * MM);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2.1 * MM, -2.1 * MM, 4.2 * MM, 4.2 * MM);
        ctx.restore();
      }
      ctx.fillStyle = d.warnaUtama;
      ctx.fillRect((148.5 - 21) * MM, 10.5 * MM, 42 * MM, 2 * MM);
    }

    // Logo: di tengah atas menggeser isi ke bawah; di kiri/kanan berada di pojok.
    let y = 20;
    if (logo) {
      if (d.posisiLogo === 'kiri') drawContain(ctx, logo, 18, 16, 50, 18, 'left');
      else if (d.posisiLogo === 'kanan') drawContain(ctx, logo, 229, 16, 50, 18, 'right');
      else y += drawContain(ctx, logo, 98.5, 16, 100, 15) + 2;
    }

    const C = 148.5;
    if (data.organisasi) y = text(ctx, data.organisasi.toUpperCase(), C, y, { size: 4.2, weight: 'bold', color: d.warnaUtama, spacing: 0.7 }) + 1.5;
    y = text(ctx, d.judul, C, y, { size: 16, font: SERIF, weight: 'bold', color: d.warnaUtama, spacing: 2.6, fit: 9, maxWidth: 250 }) + 0.5;
    y = text(ctx, d.subjudul, C, y, { size: 3.9, color: d.warnaAksen, spacing: 1.4 }) + 1;
    y = text(ctx, `Nomor: ${data.noSertifikat || ''}`, C, y, { size: 3.1, color: GRAY }) + 7;

    y = text(ctx, 'Diberikan kepada:', C, y, { size: 4.2, color: GRAY }) + 1.5;
    y = text(ctx, data.nama, C, y, { size: 13, font: SERIF, weight: 'bold', style: 'italic', color: d.warnaTeks, fit: 7, maxWidth: 220 });
    ctx.strokeStyle = d.warnaAksen;
    ctx.lineWidth = 0.35 * MM;
    ctx.beginPath();
    ctx.moveTo((C - 81) * MM, (y + 1) * MM);
    ctx.lineTo((C + 81) * MM, (y + 1) * MM);
    ctx.stroke();
    y += 3;
    if (data.departemen) y = text(ctx, data.departemen, C, y, { size: 3.5, color: GRAY });

    y = text(ctx, d.teksPengantar, C, y + 5, { size: 4.2, color: d.warnaTeks }) + 1.5;
    y = text(ctx, data.judulModul, C, y, { size: 6.3, weight: 'bold', color: d.warnaUtama, maxWidth: 200 }) + 0.5;
    if (data.standar) y = text(ctx, data.standar, C, y, { size: 4.2, weight: 'bold', color: d.warnaAksen });
    if (d.tampilNilai) {
      text(ctx, `dengan nilai ${data.nilai} (benar ${data.benar} dari ${data.total} soal) pada ${formatDate(data.tanggal)}`,
        C, y + 3, { size: 3.9, color: GRAY });
    }

    // Tanda tangan (kanan bawah)
    const sx = 240;
    const sy = 160;
    text(ctx, `${data.kota ? data.kota + ', ' : ''}${formatDate(data.tanggal)}`, sx, sy, { size: 3.5, color: d.warnaTeks, maxWidth: 80 });
    if (ttd) drawContain(ctx, ttd, sx - 30, sy + 5, 60, 14);
    ctx.strokeStyle = d.warnaTeks;
    ctx.lineWidth = 0.28 * MM;
    ctx.beginPath();
    ctx.moveTo((sx - 32) * MM, (sy + 20) * MM);
    ctx.lineTo((sx + 32) * MM, (sy + 20) * MM);
    ctx.stroke();
    const ny = text(ctx, data.penandatangan || '', sx, sy + 21.5, { size: 3.9, weight: 'bold', color: d.warnaTeks, maxWidth: 80 });
    text(ctx, data.jabatan || 'Penyelenggara', sx, ny + 0.3, { size: 3.2, color: GRAY, maxWidth: 80 });

    ctx.restore();
    return canvas;
  }

  function namaFile(data) {
    return `Sertifikat-${String(data.nama || 'peserta').replace(/[^\w-]+/g, '_')}-${data.noSertifikat || ''}`;
  }

  // Dokumen PDF dari canvas. null jika pustaka PDF gagal dimuat (mis. offline).
  function pdfDoc(canvas) {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) return null;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 297, 210);
    return doc;
  }

  // Base64 PDF (tanpa awalan data:) untuk dikirim lewat email.
  function pdfBase64(canvas) {
    const doc = pdfDoc(canvas);
    return doc ? doc.output('datauristring').split(',')[1] : null;
  }

  // Unduh sebagai PDF, atau PNG jika pustaka PDF tidak tersedia.
  function unduh(canvas, data) {
    const doc = pdfDoc(canvas);
    if (doc) return doc.save(namaFile(data) + '.pdf');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = namaFile(data) + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  window.Sertifikat = { DEFAULT, gambar, pdfBase64, unduh, namaFile, formatDate };
})();
