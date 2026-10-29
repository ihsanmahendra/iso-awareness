// Daftar modul untuk versi statis (GitHub Pages / buka langsung index.html).
// Ubah, tambah, atau hapus modul di file ini lalu simpan. Tidak perlu server.
//
// Kolom setiap modul:
//   id            pengenal unik di alamat halaman (huruf kecil, angka, tanda -)
//   judul, standar, deskripsi
//   kodeAkses     opsional. Jika diisi, peserta wajib memasukkan kode ini sebelum belajar.
//                 Catatan: kode tetap bisa dilihat siapa pun yang membuka file ini,
//                 jadi pakai sebagai pembatas ringan, bukan pengaman.
//   nilaiLulus    nilai minimal lulus (0-100)
//   acakSoal      true = urutan soal diacak setiap pengerjaan
//   pembahasan    true = tampilkan kunci & pembahasan setelah kuis
//   sertifikat    { organisasi, kota, penandatangan, jabatan }
//   materi        teks biasa: baris kosong = paragraf baru, "- " = poin, "## " = sub-judul
//   soal          [pertanyaan, pilihan A, B, C, D, jawaban ('A'-'D'), pembahasan]
window.ISO_MODUL = [
  {
    id: 'iso-27001',
    judul: 'Awareness Keamanan Informasi',
    standar: 'ISO/IEC 27001:2022',
    deskripsi: 'Pengenalan Sistem Manajemen Keamanan Informasi (SMKI) dan peran setiap karyawan dalam menjaga informasi.',
    kodeAkses: 'SMKI2026',
    nilaiLulus: 70,
    acakSoal: true,
    pembahasan: true,
    sertifikat: { organisasi: 'PT Contoh Sejahtera', kota: 'Jakarta', penandatangan: 'Andi Wijaya', jabatan: 'Information Security Officer' },
    materi: `## Apa itu ISO/IEC 27001?
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
    soal: [
      ['Apa yang dimaksud dengan "Confidentiality" dalam prinsip CIA?', 'Informasi selalu tersedia kapan saja', 'Informasi hanya dapat diakses oleh pihak yang berwenang', 'Informasi tidak boleh diubah', 'Informasi disimpan di cloud', 'B', 'Kerahasiaan berarti hanya pihak berwenang yang boleh mengakses informasi.'],
      ['Anda menerima email dari "bank" yang meminta verifikasi password melalui tautan. Tindakan yang tepat adalah...', 'Klik tautan dan isi password', 'Teruskan ke rekan kerja', 'Jangan klik tautan dan laporkan sebagai phishing', 'Balas email untuk menanyakan kebenarannya', 'C', 'Itu ciri khas phishing. Laporkan ke tim keamanan informasi.'],
      ['Saat meninggalkan meja kerja sebentar, Anda sebaiknya...', 'Membiarkan komputer menyala tanpa dikunci', 'Mengunci layar komputer', 'Mematikan monitor saja', 'Meminta rekan menjaga komputer', 'B', 'Kebijakan clear screen: selalu kunci layar (Windows + L).'],
      ['Standar ISO/IEC 27001 mengatur tentang...', 'Sistem Manajemen Mutu', 'Sistem Manajemen Lingkungan', 'Sistem Manajemen Keamanan Informasi', 'Sistem Manajemen K3', 'C', ''],
      ['Jika Anda mengetahui terjadi kebocoran data, langkah pertama adalah...', 'Diam saja agar tidak repot', 'Mengunggah info ke media sosial', 'Segera melaporkan insiden ke tim terkait', 'Menghapus semua data', 'C', 'Pelaporan cepat membantu meminimalkan dampak insiden.'],
    ],
  },
  {
    id: 'iso-9001',
    judul: 'Pengenalan Sistem Manajemen Mutu',
    standar: 'ISO 9001:2015',
    deskripsi: 'Dasar-dasar ISO 9001: prinsip manajemen mutu, siklus PDCA, dan fokus pada pelanggan.',
    kodeAkses: '',
    nilaiLulus: 70,
    acakSoal: false,
    pembahasan: true,
    sertifikat: { organisasi: 'PT Contoh Sejahtera', kota: 'Jakarta', penandatangan: 'Rina Kusuma', jabatan: 'Management Representative' },
    materi: `## Apa itu ISO 9001?
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
    soal: [
      ['ISO 9001 adalah standar untuk...', 'Sistem Manajemen Mutu', 'Sistem Manajemen Energi', 'Sistem Manajemen Anti Penyuapan', 'Sistem Manajemen Keamanan Pangan', 'A', ''],
      ['Kepanjangan PDCA adalah...', 'Plan - Do - Check - Act', 'Prepare - Do - Control - Audit', 'Plan - Develop - Check - Approve', 'Process - Data - Control - Action', 'A', 'PDCA adalah siklus perbaikan berkelanjutan.'],
      ['Berikut yang BUKAN termasuk prinsip manajemen mutu ISO 9001 adalah...', 'Fokus pada pelanggan', 'Kepemimpinan', 'Maksimalisasi keuntungan', 'Pendekatan proses', 'C', ''],
      ['Tahap "Check" dalam PDCA berarti...', 'Menetapkan sasaran', 'Memantau dan mengukur hasil', 'Melaksanakan rencana', 'Membuat SOP baru', 'B', ''],
    ],
  },
];
