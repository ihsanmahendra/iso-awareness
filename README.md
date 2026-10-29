# ISO Awareness – Aplikasi Pelatihan & Kuis Berbasis Web

Aplikasi web untuk pelatihan *awareness* standar ISO (9001, 14001, 45001, 27001, dll.).
Peserta membaca materi lalu mengerjakan kuis pilihan ganda (a, b, c, d). Admin membuat modul, soal, dan token peserta.

## Fitur

**Peserta**
- Beranda berisi daftar modul yang dipublikasikan, ditandai 🔒 *Butuh Token* atau *Terbuka*.
- Kotak "Punya token peserta?" di beranda langsung membuka modul milik token tersebut.
- Modul wajib token tidak bisa dibuka tanpa token yang valid. Token dicek setiap kali halaman materi atau kuis dibuka: aktif, belum kedaluwarsa, dan kuota pengerjaan belum habis.
- Kuis pilihan ganda a–d dinilai di server. Setelah kuis, peserta melihat nilai, status lulus/tidak, dan pembahasan (bisa dimatikan per modul).

**Admin (ruang kerja terpisah)**
- Setiap admin login dengan akunnya sendiri dan **hanya melihat dan mengelola modul miliknya**: soal, token, dan hasil peserta. Akses ke modul admin lain menghasilkan 404.
- Modul: judul, standar ISO, deskripsi, materi, jenis akses (wajib token / terbuka), nilai lulus, acak soal, tampilkan pembahasan, draft/publik.
- Soal: tambah, edit, hapus, ubah urutan, **import massal** (satu baris per soal):
  `Pertanyaan | pilihan a | pilihan b | pilihan c | pilihan d | jawaban (a/b/c/d) | pembahasan`
- Token peserta: dibuat **atas nama** peserta (satu nama per baris) atau tanpa nama sejumlah tertentu. Bisa diatur maksimal kesempatan mengerjakan dan tanggal berlaku. Token bisa dinonaktifkan, di-reset, dihapus, dan diunduh sebagai CSV.
- **Peserta & Rekap** (per modul): daftar siapa saja yang sudah mengerjakan (nilai terbaik, jumlah percobaan, status lulus),
  daftar pemegang token yang **belum mengerjakan**, rekap per departemen, analisis soal (% jawaban benar per soal),
  riwayat semua pengerjaan, dan detail jawaban tiap peserta. Bisa dicari dan difilter per status atau rentang tanggal.
  Bisa diunduh sebagai CSV (rekap peserta / riwayat).
- **Rekap** (menu atas): ringkasan semua modul milik admin, rekap per modul dan matriks peserta × modul, bisa difilter
  per tanggal dan diunduh sebagai CSV.

**Sertifikat**
- Peserta yang lulus mendapat sertifikat PDF (A4 landscape) dengan nomor unik dan QR code verifikasi.
- Peserta mengunduhnya dari halaman hasil kuis, atau kapan saja lewat menu **Sertifikat** dengan token atau nomor sertifikat.
- Halaman `/verify/<nomor>` (tujuan QR code) menampilkan keabsahan sertifikat.
- Admin mengatur nama organisasi, kota, nama dan jabatan penanda tangan per modul (Edit Modul), melihat pratinjau,
  mengunduh sertifikat per peserta, atau mengunduh semua sertifikat sekaligus dalam satu PDF.
- Menghapus hasil peserta otomatis membatalkan sertifikatnya.

**Super Admin**
- Menambah dan menghapus akun admin serta mereset password admin (menu *Kelola Admin*).

## Versi statis (tanpa instalasi / GitHub Pages)

Folder [`docs/`](docs) berisi versi ringan yang berjalan sepenuhnya di browser, tanpa Node.js dan tanpa database.

- **Buka langsung:** klik dua kali `docs/index.html`.
- **Online lewat GitHub Pages:** di halaman repo GitHub buka **Settings → Pages**, pada *Build and deployment* pilih
  *Source: Deploy from a branch*, *Branch: `main`*, folder **`/docs`**, lalu **Save**. Setelah 1–2 menit situs tersedia di
  `https://<username>.github.io/iso-awareness/`.

Isi modul (materi, soal, kunci, nilai lulus, kode akses, data sertifikat) diatur di [`docs/data/modul.js`](docs/data/modul.js).
Edit file itu, simpan, dan push; GitHub Pages ikut ter-update. Kode akses modul demo ISO 27001: `SMKI2026`.

Peserta mengisi nama, membaca materi, mengerjakan kuis, lalu melihat nilai dan pembahasan. Jika lulus, sertifikat bisa
diunduh sebagai PDF.

**Desain sertifikat (admin):** buka `admin.html` (tautan *Admin* di bagian bawah situs). Di sana Anda bisa mengunggah logo,
gambar latar, dan tanda tangan, mengatur warna dan teks, serta melihat pratinjau langsung. Klik **Unduh file desain**, lalu
unggah `desain-sertifikat.js` hasil unduhan ke folder `docs/data/` di GitHub (menimpa file lama).

**Kirim ke email peserta:** pasang backend Google Apps Script sesuai [`apps-script/README.md`](apps-script/README.md), lalu isi
`emailEndpoint` di [`docs/data/pengaturan.js`](docs/data/pengaturan.js). Setelah aktif, peserta wajib mengisi email. Hasil kuis
langsung dikirim ke email tersebut, dengan sertifikat PDF terlampir jika peserta lulus. Setiap hasil juga tercatat di Google Sheet.

Perbedaan dengan versi server:
- Tidak ada token per peserta atau verifikasi QR. Rekap terpusat hanya tersedia lewat Google Sheet jika kirim email diaktifkan.
- Kunci jawaban dan kode akses ada di `modul.js`, jadi bisa dilihat siapa pun yang membuka kode sumber. Pakai versi server
  jika nilai harus terkumpul atau kuis dipakai sebagai ujian resmi.

## Cara menjalankan (untuk pemula)

**Langkah 1 – Pasang Node.js (sekali saja)**
Buka https://nodejs.org, unduh versi **LTS**, lalu pasang dengan klik *Next* sampai selesai.

**Langkah 2 – Unduh aplikasi**
Di halaman GitHub repo ini, klik tombol hijau **Code** → **Download ZIP**, lalu ekstrak (klik kanan → *Extract All*).

**Langkah 3 – Jalankan**
- **Windows:** buka folder hasil ekstrak, klik dua kali **`jalankan-windows.bat`**.
- **Mac / Linux:** buka Terminal di folder tersebut, ketik `./jalankan-mac-linux.sh`.

Pertama kali dijalankan butuh internet (1–2 menit) untuk memasang komponen. Setelah itu browser terbuka otomatis ke http://localhost:3000.
**Jangan tutup jendela hitam (Command Prompt)** selama aplikasi dipakai. Menutupnya = aplikasi berhenti.

**Langkah 4 – Login admin**
Buka http://localhost:3000/admin, login dengan `admin` / `admin12345`, lalu segera ganti password lewat menu *Ganti Password*.

**Agar peserta lain bisa mengakses** (satu jaringan Wi‑Fi/LAN kantor): cari IP komputer ini
(Windows: buka Command Prompt, ketik `ipconfig`, lihat *IPv4 Address*, mis. `192.168.1.20`),
lalu peserta membuka `http://192.168.1.20:3000` di browser mereka. Jika tidak bisa dibuka, izinkan Node.js di Windows Firewall.

## Menjalankan (lewat terminal)

Butuh **Node.js 22.13 atau lebih baru** (memakai SQLite bawaan Node, tanpa instalasi database).

```bash
npm install
npm start
```

Buka http://localhost:3000 (peserta) dan http://localhost:3000/admin (admin).

Saat pertama kali dijalankan, aplikasi membuat:
- Super admin: `admin` / `admin12345`. **Segera ganti password.**
- Data demo: admin `it.security` / `demo12345` (modul ISO 27001, wajib token) dan `qhse` / `demo12345` (modul ISO 9001, terbuka). Token demo ditampilkan di log konsol.

## Konfigurasi (environment variable)

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin12345` | Super admin awal (hanya dipakai saat database masih kosong) |
| `SEED_DEMO` | `1` | Isi `0` untuk tidak membuat data demo |
| `DATA_DIR` | `./data` | Lokasi database SQLite |
| `SESSION_SECRET` | dibuat otomatis | Secret cookie sesi |
| `COOKIE_SECURE` | `0` | Isi `1` jika memakai HTTPS |
| `TRUST_PROXY` | `0` | Isi `1` jika di belakang reverse proxy (nginx, dll.) |
| `BASE_URL` | otomatis | Alamat publik aplikasi untuk link/QR verifikasi di sertifikat, mis. `https://training.perusahaan.co.id` |

Contoh produksi:
```bash
ADMIN_PASS='PasswordKuat!2026' SEED_DEMO=0 COOKIE_SECURE=1 TRUST_PROXY=1 npm start
```

Untuk reset total, hentikan server lalu hapus folder `data/`.

## Struktur

```
server.js              entry point, sesi, keamanan dasar
src/db.js              skema SQLite (admins, modules, questions, tokens, attempts)
src/routes/public.js   halaman peserta: beranda, token, materi, kuis, hasil
src/routes/admin.js    panel admin: modul, soal, token, kelola admin
src/routes/admin-results.js  peserta, rekap, detail jawaban, sertifikat (admin)
src/stats.js           perhitungan rekap
src/certificate.js     pembuat sertifikat PDF + QR code
src/views.js           template HTML (auto-escape)
src/seed.js            data demo
public/style.css       tampilan (mendukung mode gelap)
```

## Keamanan

- Password di-hash dengan scrypt. Login dan input token dibatasi jumlah percobaannya.
- Kunci jawaban tidak pernah dikirim ke browser sebelum kuis dikirim.
- Kuota token dikurangi secara atomik, jadi token tidak bisa dipakai melebihi batas.
- Cookie sesi `httpOnly` + `SameSite=Strict`, POST lintas origin ditolak, semua output di-escape.
- Sesi disimpan di memori (*MemoryStore*): peserta yang sedang mengerjakan perlu masuk ulang jika server di-restart. Untuk beban besar atau beberapa instance, ganti dengan session store berbasis database/Redis.

## Lisensi

Dirilis di bawah [Lisensi MIT](LICENSE) © 2026 Muhammad Ihsan Mahendra.
