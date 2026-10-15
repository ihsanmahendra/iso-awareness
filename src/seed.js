// Data contoh: dua admin terpisah, masing-masing dengan modulnya sendiri.
const { db, tx } = require('./db');
const { hashPassword, randomToken } = require('./util');

const MODULES = [
  {
    admin: { username: 'it.security', display_name: 'Tim Keamanan Informasi', password: 'demo12345' },
    module: {
      title: 'Awareness Keamanan Informasi',
      iso_standard: 'ISO/IEC 27001:2022',
      description: 'Pengenalan Sistem Manajemen Keamanan Informasi (SMKI) dan peran setiap karyawan dalam menjaga informasi.',
      access: 'token',
      content: `## Apa itu ISO/IEC 27001?
ISO/IEC 27001 adalah standar internasional untuk Sistem Manajemen Keamanan Informasi (SMKI / ISMS). Standar ini membantu organisasi melindungi informasi secara sistematis melalui penilaian risiko dan penerapan kontrol.

## Tiga prinsip utama (CIA)
- Confidentiality (kerahasiaan): informasi hanya dapat diakses oleh pihak yang berwenang.
- Integrity (integritas): informasi akurat, lengkap, dan tidak diubah tanpa izin.
- Availability (ketersediaan): informasi tersedia saat dibutuhkan oleh pihak yang berwenang.

## Kewajiban setiap karyawan
- Menjaga kerahasiaan password dan tidak membagikannya kepada siapa pun.
- Mengunci layar komputer saat meninggalkan meja (clear screen) dan merapikan dokumen (clear desk).
- Waspada terhadap email phishing: periksa pengirim, jangan klik tautan mencurigakan.
- Segera melaporkan insiden keamanan informasi kepada tim terkait.`,
    },
    questions: [
      ['Apa yang dimaksud dengan "Confidentiality" dalam prinsip CIA?', 'Informasi selalu tersedia kapan saja', 'Informasi hanya dapat diakses oleh pihak yang berwenang', 'Informasi tidak boleh diubah', 'Informasi disimpan di cloud', 'B', 'Kerahasiaan berarti hanya pihak berwenang yang boleh mengakses informasi.'],
      ['Anda menerima email dari "bank" yang meminta verifikasi password melalui tautan. Tindakan yang tepat adalah...', 'Klik tautan dan isi password', 'Teruskan ke rekan kerja', 'Jangan klik tautan dan laporkan sebagai phishing', 'Balas email untuk menanyakan kebenarannya', 'C', 'Itu ciri khas phishing. Laporkan ke tim keamanan informasi.'],
      ['Saat meninggalkan meja kerja sebentar, Anda sebaiknya...', 'Membiarkan komputer menyala tanpa dikunci', 'Mengunci layar komputer', 'Mematikan monitor saja', 'Meminta rekan menjaga komputer', 'B', 'Kebijakan clear screen: selalu kunci layar (Windows + L).'],
      ['Standar ISO/IEC 27001 mengatur tentang...', 'Sistem Manajemen Mutu', 'Sistem Manajemen Lingkungan', 'Sistem Manajemen Keamanan Informasi', 'Sistem Manajemen K3', 'C', ''],
      ['Jika Anda mengetahui terjadi kebocoran data, langkah pertama adalah...', 'Diam saja agar tidak repot', 'Mengunggah info ke media sosial', 'Segera melaporkan insiden ke tim terkait', 'Menghapus semua data', 'C', 'Pelaporan cepat membantu meminimalkan dampak insiden.'],
    ],
    tokens: ['Budi Santoso', 'Siti Aminah', ''],
  },
  {
    admin: { username: 'qhse', display_name: 'Tim QHSE', password: 'demo12345' },
    module: {
      title: 'Pengenalan Sistem Manajemen Mutu',
      iso_standard: 'ISO 9001:2015',
      description: 'Dasar-dasar ISO 9001: prinsip manajemen mutu, siklus PDCA, dan fokus pada pelanggan.',
      access: 'public',
      content: `## Apa itu ISO 9001?
ISO 9001 adalah standar internasional untuk Sistem Manajemen Mutu (SMM). Tujuannya memastikan organisasi secara konsisten menghasilkan produk/jasa yang memenuhi persyaratan pelanggan dan regulasi.

## Siklus PDCA
- Plan: menetapkan sasaran dan proses.
- Do: melaksanakan apa yang direncanakan.
- Check: memantau dan mengukur hasil.
- Act: melakukan perbaikan berkelanjutan.

## Tujuh prinsip manajemen mutu
- Fokus pada pelanggan
- Kepemimpinan
- Keterlibatan orang
- Pendekatan proses
- Peningkatan
- Pengambilan keputusan berbasis bukti
- Manajemen hubungan`,
    },
    questions: [
      ['ISO 9001 adalah standar untuk...', 'Sistem Manajemen Mutu', 'Sistem Manajemen Energi', 'Sistem Manajemen Anti Penyuapan', 'Sistem Manajemen Keamanan Pangan', 'A', ''],
      ['Kepanjangan PDCA adalah...', 'Plan - Do - Check - Act', 'Prepare - Do - Control - Audit', 'Plan - Develop - Check - Approve', 'Process - Data - Control - Action', 'A', 'PDCA adalah siklus perbaikan berkelanjutan.'],
      ['Berikut yang BUKAN termasuk prinsip manajemen mutu ISO 9001 adalah...', 'Fokus pada pelanggan', 'Kepemimpinan', 'Maksimalisasi keuntungan', 'Pendekatan proses', 'C', ''],
      ['Tahap "Check" dalam PDCA berarti...', 'Menetapkan sasaran', 'Memantau dan mengukur hasil', 'Melaksanakan rencana', 'Membuat SOP baru', 'B', ''],
    ],
    tokens: [],
  },
];

module.exports = function seed() {
  tx(() => {
    for (const s of MODULES) {
      const adminId = db.prepare('INSERT INTO admins (username, display_name, password_hash) VALUES (?,?,?)')
        .run(s.admin.username, s.admin.display_name, hashPassword(s.admin.password)).lastInsertRowid;
      const m = s.module;
      const moduleId = db.prepare(`INSERT INTO modules (admin_id, title, iso_standard, description, content, access, published)
        VALUES (?,?,?,?,?,?,1)`).run(adminId, m.title, m.iso_standard, m.description, m.content, m.access).lastInsertRowid;
      s.questions.forEach((q, i) => db.prepare(`INSERT INTO questions (module_id, text, option_a, option_b, option_c, option_d, correct, explanation, sort_order)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(moduleId, ...q, i + 1));
      const codes = s.tokens.map((name) => {
        const code = randomToken();
        db.prepare('INSERT INTO tokens (module_id, code, participant_name) VALUES (?,?,?)').run(moduleId, code, name);
        return `${code}${name ? ` (${name})` : ' (tanpa nama)'}`;
      });
      console.log(`[demo] Admin "${s.admin.username}" / ${s.admin.password} -> modul "${m.title}"${codes.length ? `, token: ${codes.join(', ')}` : ''}`);
    }
  });
};
