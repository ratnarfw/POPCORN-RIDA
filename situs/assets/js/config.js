/* =====================================================================
 * config.js — Konfigurasi global frontend Perpustakaan Digital NTT
 *
 * Backend: Google Apps Script Web App (lihat PANDUAN.md).
 * Tempel URL Web App (berakhiran /exec) pada API_URL di bawah.
 * ===================================================================== */

window.APP_CONFIG = {
  /* URL Web App Google Apps Script, contoh: https://script.google.com/macros/s/AKfy.../exec */
  API_URL: "https://script.google.com/macros/s/AKfycbw0lhCukb09uGVW482ira5d07-nOXt0stHOS2rhMBP7aJkM99JaicXzkZfsIHFtIwjxDw/exec",

  /* Versi API yang diharapkan frontend. Bila backend merespons dengan
     versi berbeda, frontend menampilkan peringatan kompatibilitas. */
  API_VERSION: "v1",

  /* Konfigurasi tampilan */
  ITEMS_PER_PAGE: 12,           // jumlah kartu per halaman daftar koleksi
  ADMIN_ITEMS_PER_PAGE: 10,     // jumlah baris per halaman tabel admin
  RECENT_KOLEKSI_COUNT: 8,      // jumlah koleksi terbaru di beranda
  FEATURED_COUNT: 5,            // jumlah publikasi pilihan di beranda

  /* Nama instansi & kontak */
  INSTANSI: {
    nama:        "POPCORN RIDA",
    slogan:      "Perpustakaan Daerah untuk Semua Warga",
    deskripsi:   "Ruang digital untuk menemukan, menelusuri, mempelajari, dan memanfaatkan pengetahuan hasil riset dan inovasi daerah Nusa Tenggara Timur.",
    instansi:    "BAPPERIDA Provinsi Nusa Tenggara Timur",
    alamat:      "Jl. Polisi Militer No. 2, Kupang, Nusa Tenggara Timur",
    telepon:     "(0380) 833462 / 832975",
    email:       "brida.bapperida.nttprov@gmail.com",
    copyright:   "Hak Cipta © " + new Date().getFullYear() + " POPCORN RIDA Pondok Pustaka Corner Riset dan Inovasi Daerah — BAPPERIDA Provinsi NTT.",
  },

  /* Sesi masuk. ADMIN selalu di sessionStorage (hilang saat tab ditutup).
     ANGGOTA yang mencentang "Ingat saya" disimpan di localStorage (14 hari).
     Jangan pernah menyimpan sesi admin di localStorage. */
  SESSION_KEY: "perpus_ntt_admin_session",

  /* Timeout fetch (ms). Hindari menunggu tanpa batas. */
  FETCH_TIMEOUT: 25000,

  /* Aksen warna untuk fallback gambar sampul (hex tanpa #) */
  COVER_FALLBACK_COLORS: ["2f5d50", "b4532f", "8a5a14", "3e6e82", "1f4237"],
};

/* Helper singkat untuk akses konfigurasi */
window.C = window.APP_CONFIG;
