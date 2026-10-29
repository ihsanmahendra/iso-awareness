# Kirim email hasil & sertifikat (Google Apps Script)

GitHub Pages hanya menyajikan file statis, jadi pengiriman email memakai Google Apps Script yang gratis
dan berjalan dengan akun Google Anda. Email terkirim dari Gmail Anda, dan setiap hasil peserta tercatat di Google Sheet.

## Pemasangan (sekali saja, ±5 menit)

1. Buka https://sheets.new untuk membuat Google Sheet baru, beri nama mis. **Rekap ISO Awareness**.
2. Menu **Ekstensi → Apps Script**.
3. Hapus isi `Code.gs` di editor, lalu tempel seluruh isi [`Code.gs`](Code.gs) dari folder ini. Klik **Simpan** (ikon disket).
4. Klik **Terapkan (Deploy) → Deployment baru**.
   - Klik ikon roda gigi di samping *Pilih jenis*, lalu pilih **Aplikasi web (Web app)**.
   - *Jalankan sebagai (Execute as)*: **Saya (Me)**.
   - *Yang memiliki akses (Who has access)*: **Siapa saja (Anyone)**.
   - Klik **Terapkan**, lalu **Izinkan akses**. Pilih akun Google Anda. Jika muncul "Google belum memverifikasi aplikasi ini",
     klik **Lanjutan → Buka (tidak aman)**. Ini wajar karena script buatan Anda sendiri.
5. Salin **URL aplikasi web** (berakhiran `/exec`).
6. Buka [`docs/data/pengaturan.js`](../docs/data/pengaturan.js), tempel URL itu di `emailEndpoint`:
   ```js
   emailEndpoint: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
   Simpan, commit, dan push (atau edit langsung di GitHub lewat ikon pensil).

Setelah itu formulir peserta meminta alamat email. Saat kuis selesai, hasil langsung dikirim ke email tersebut,
dan sertifikat PDF ikut terlampir jika peserta lulus. Peserta juga bisa mengirim ulang dari halaman hasil atau sertifikat.

## Catatan

- Kuota Gmail: sekitar **100 email/hari** untuk akun Gmail biasa, 1.500/hari untuk Google Workspace.
- Satu alamat email dibatasi 5 kiriman per jam, dan lampiran hanya boleh berupa PDF, supaya URL tidak disalahgunakan untuk spam.
- Rekap tersimpan di sheet **Rekap** pada Google Sheet tadi.
- Jika Anda mengubah `Code.gs`, terapkan ulang lewat **Terapkan → Kelola deployment → Edit → Versi baru** agar URL tetap sama.
