// Pembuat sertifikat PDF (A4 landscape) dengan QR code verifikasi.
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const NAVY = '#1e3a8a';
const GOLD = '#b08d3c';
const INK = '#1f2937';
const GRAY = '#6b7280';

function formatDate(sqlDate) {
  const d = new Date(String(sqlDate).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(sqlDate) : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(d);
}

function baseUrl(req) {
  return (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// Font standar PDF hanya mendukung huruf Latin; ganti karakter lain agar tidak rusak.
function latin(s) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E -ÿ]/g, '');
}

function centered(doc, text, y, { font, size, color, spacing = 0, width, x }) {
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(latin(text), x, y, { width, align: 'center', characterSpacing: spacing, lineBreak: true });
  return doc.y;
}

function fitSize(doc, text, font, maxSize, minSize, maxWidth) {
  let size = maxSize;
  doc.font(font);
  while (size > minSize && doc.fontSize(size).widthOfString(text) > maxWidth) size -= 1;
  return size;
}

async function drawPage(doc, { attempt, module, ownerName }, base) {
  const W = doc.page.width;
  const H = doc.page.height;
  const verifyUrl = `${base}/verify/${attempt.cert_code}`;

  // Latar & bingkai
  doc.rect(0, 0, W, H).fill('#fcfbf7');
  doc.lineWidth(3).strokeColor(NAVY).rect(20, 20, W - 40, H - 40).stroke();
  doc.lineWidth(0.8).strokeColor(GOLD).rect(30, 30, W - 60, H - 60).stroke();
  for (const [cx, cy] of [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]]) {
    doc.save().translate(cx, cy).rotate(45).rect(-6, -6, 12, 12).fill(GOLD).restore();
  }
  doc.rect(W / 2 - 60, 30, 120, 6).fill(NAVY);

  const inner = { x: 70, width: W - 140 };
  const org = module.cert_org || ownerName || '';
  if (org) centered(doc, org.toUpperCase(), 62, { ...inner, font: 'Helvetica-Bold', size: 12, color: NAVY, spacing: 2 });

  centered(doc, 'SERTIFIKAT', 88, { ...inner, font: 'Times-Bold', size: 48, color: NAVY, spacing: 8 });
  centered(doc, 'ISO AWARENESS TRAINING', 146, { ...inner, font: 'Helvetica', size: 11, color: GOLD, spacing: 4 });
  centered(doc, `Nomor: ${attempt.cert_code}`, 166, { ...inner, font: 'Helvetica', size: 9, color: GRAY });

  centered(doc, 'Diberikan kepada:', 205, { ...inner, font: 'Helvetica', size: 12, color: GRAY });
  const name = latin(attempt.participant_name);
  const nameSize = fitSize(doc, name, 'Times-BoldItalic', 38, 18, W - 200);
  centered(doc, name, 226, { ...inner, font: 'Times-BoldItalic', size: nameSize, color: INK });
  doc.lineWidth(1).strokeColor(GOLD).moveTo(W / 2 - 230, 274).lineTo(W / 2 + 230, 274).stroke();

  let y = 280;
  if (attempt.department) y = centered(doc, attempt.department, y, { ...inner, font: 'Helvetica', size: 10, color: GRAY });

  y = centered(doc, 'atas keberhasilannya menyelesaikan dan lulus evaluasi pelatihan', Math.max(y + 10, 300),
    { ...inner, font: 'Helvetica', size: 12, color: INK });
  y = centered(doc, module.title, y + 6, { x: 100, width: W - 200, font: 'Helvetica-Bold', size: 18, color: NAVY });
  if (module.iso_standard) y = centered(doc, module.iso_standard, y + 2, { ...inner, font: 'Helvetica-Bold', size: 12, color: GOLD });
  centered(doc, `dengan nilai ${attempt.score} (benar ${attempt.correct_count} dari ${attempt.total} soal) pada ${formatDate(attempt.created_at)}`,
    y + 8, { ...inner, font: 'Helvetica', size: 11, color: GRAY });

  // QR verifikasi (kiri bawah)
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240, errorCorrectionLevel: 'M', color: { dark: '#1e3a8aff', light: '#fcfbf7ff' } });
  const qrY = H - 135;
  doc.image(qr, 70, qrY, { width: 72 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Verifikasi keaslian', 150, qrY + 14, { width: 220 });
  doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text('Pindai QR code atau buka:', 150, qrY + 27, { width: 220 });
  doc.font('Helvetica').fontSize(7.5).fillColor(NAVY).text(latin(verifyUrl), 150, qrY + 38, { width: 220 });

  // Tanda tangan (kanan bawah)
  const sx = W - 300;
  const sw = 220;
  const place = module.cert_city ? `${module.cert_city}, ` : '';
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(latin(`${place}${formatDate(attempt.created_at)}`), sx, qrY - 10, { width: sw, align: 'center' });
  doc.lineWidth(0.8).strokeColor(INK).moveTo(sx + 20, qrY + 52).lineTo(sx + sw - 20, qrY + 52).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(latin(module.cert_signer_name || ownerName || ''), sx, qrY + 58, { width: sw, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(latin(module.cert_signer_title || 'Penyelenggara'), sx, doc.y + 1, { width: sw, align: 'center' });
}

// items: [{ attempt, module, ownerName }]
async function sendCertificates(req, res, items, filename) {
  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false,
    info: { Title: items.length === 1 ? `Sertifikat ${latin(items[0].attempt.participant_name)}` : 'Sertifikat ISO Awareness', Creator: 'ISO Awareness' },
  });
  const base = baseUrl(req);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  for (const it of items) {
    doc.addPage();
    await drawPage(doc, it, base);
  }
  doc.end();
  await done;
  res.type('application/pdf');
  res.set('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`);
  res.send(Buffer.concat(chunks));
}

module.exports = { sendCertificates, formatDate, baseUrl };
