# Private Vault

Aplikasi web penyimpanan media pribadi yang bekerja lokal di browser.

## Menjalankan

1. Install Node.js versi LTS.
2. Ekstrak folder project.
3. Buka terminal di folder `private-vault`.
4. Jalankan:

   ```bash
   npm install
   npm run dev
   ```

5. Buka alamat lokal yang ditampilkan Vite, biasanya `http://localhost:5173`.

Untuk membuat build produksi:

```bash
npm run build
npm run preview
```

## Keamanan dan batasan

- File dienkripsi di browser menggunakan Web Crypto API: AES-256-GCM.
- Kunci diturunkan dari password menggunakan PBKDF2-HMAC-SHA-256 (310.000 iterasi).
- File terenkripsi disimpan di IndexedDB. Password tidak disimpan.
- Data hanya tersedia pada browser dan origin yang sama di perangkat tersebut.
- Jangan hapus data situs/browser sebelum membuat salinan cadangan.
- Lupa password berarti file tidak dapat didekripsi.
- Ini bukan pengganti backup. Buat backup perangkat secara teratur.
- Browser dapat menerapkan kuota penyimpanan; file sangat besar bisa gagal tersimpan.
- Untuk perlindungan lebih baik, gunakan akun perangkat/OS yang terlindungi dan kunci layar.
- Jangan menganggap aplikasi ini sebagai brankas forensik atau penyimpanan tanpa risiko.

## Catatan

Google Fonts pada stylesheet hanya untuk tampilan. Aplikasi inti dan penyimpanan tidak memerlukan server atau akun cloud setelah dependensi terpasang dan aplikasi dijalankan lokal.


## Backup dan restore
- Setelah membuka vault, tekan tombol **Backup** untuk mengunduh file `.pvault`.
- File backup berisi data yang sudah terenkripsi AES-GCM dan metadata autentikasi; file media tidak disimpan sebagai plaintext di dalam backup.
- Untuk memulihkan, buka halaman login dan pilih **Pulihkan dari backup**, lalu pilih file `.pvault`.
- Restore akan mengganti isi vault browser saat ini. Setelah restore, masuk menggunakan password yang digunakan ketika backup dibuat.
- Simpan salinan backup di flash drive atau penyimpanan lain yang aman. Jangan hanya menyimpannya di folder Downloads perangkat yang sama.
- Jika password backup terlupa, isi backup tetap tidak dapat didekripsi.
