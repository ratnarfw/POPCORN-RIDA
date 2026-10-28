# Perpustakaan Digital NTT — Versi Statis

Tidak butuh Node, PHP, atau database. Isi folder `situs/` cukup diunggah ke hosting biasa.

## Upload ke InfinityFree
1. Panel hosting → **File Manager** (atau FTP seperti FileZilla).
2. Buka folder `htdocs/`. Hapus berkas bawaan (mis. `index2.html`).
3. Unggah **isi** folder `situs/` (bukan foldernya) ke `htdocs/`, sehingga `index.html` ada di `htdocs/index.html`.
4. Buka domain Anda.

## Mengelola koleksi (pengganti dashboard admin)
Data ada di folder `data/`:
- `koleksi.json` — daftar koleksi
- `kategori.json` — daftar kategori
- `konfigurasi.json` — alamat, telepon, email instansi

Untuk menambah koleksi: salin satu blok `{ ... }` di `koleksi.json`, ubah isinya, unggah ulang berkas itu.

| Kolom | Nilai | Efek |
|---|---|---|
| `Status_Publikasi` | `Terbit` | tampil di situs (selain itu tersembunyi) |
| `Status_Akses` | `Publik` | PDF bisa dibaca & diunduh |
| | `Internal` | tampil di daftar, tombol "Ajukan Permohonan Akses" (email) |
| | `Privat` | tidak tampil di daftar |
| `URL_Dokumen` | `assets/dokumen/namafile.pdf` | wajib bila `Publik`; unggah PDF-nya ke `assets/dokumen/` |
| `Unggulan` | `Y` | tampil di "Sorotan Riset" beranda |

Penting: di hosting statis, semua file di `assets/dokumen/` bisa diakses siapa saja yang tahu alamatnya. Unggah hanya PDF berstatus Publik. Pastikan JSON valid (jsonlint.com) sebelum mengunggah.

## Yang dihapus dari versi server
Login/daftar anggota, rak favorit, riwayat baca, dashboard admin, dan penyimpanan pesan kontak (butuh server). Formulir kontak kini membuka aplikasi email pengunjung ke email instansi.

## Folder `arsip-tidak-diunggah/`
Jangan diunggah. Berisi 11 PDF yang belum berstatus publik dan salinan data asli.
