/**
 * =====================================================================
 * Code.gs — SATU FILE untuk seluruh backend Perpustakaan Digital NTT
 * (gabungan: Code, Database, Auth, Koleksi, DriveService, Kontak, Utils, Setup)
 *
 * Cara pakai: hapus isi Code.gs di editor Apps Script, tempel seluruh file
 * ini, lalu jalankan fungsi  setupOtomatis.
 * =====================================================================
 */


/* ############################################################
 * BAGIAN: Code
 * ############################################################ */

/**
 * =====================================================================
 * Code.gs — File utama (entry point) Google Apps Script
 * Perpustakaan Digital Nusa Tenggara Timur
 *
 * Catatan deployment Apps Script:
 * Apps Script TIDAK mengizinkan multiple file saat dipasang via Web App,
 * namun editor Apps Script mendukung multiple .gs file yang akan otomatis
 * digabung saat runtime. Jadi cukup salin tiap file ke editor Apps Script
 * (lihat PANDUAN_DEPLOY.md langkah 3).
 *
 * File ini berisi:
 *   - doGet() / doPost()  : entry point Web App
 *   -Konfigurasi global (Spreadsheet ID, Folder ID)
 *   -Fungsi getWebAppUrl()
 * =====================================================================
 */

/* ===================== KONFIGURASI GLOBAL ===================== */

/**
 * Spreadsheet ID database perpustakaan.
 * Cara mendapatkan: buka Google Spreadsheet Anda, lihat URL:
 *   https://docs.google.com/spreadsheets/d/<ID_INI>/edit
 * Salin bagian <ID_INI> ke sini.
 * Atau set via PropertiesService (lebih aman) menggunakan fungsi
 * setConfig('SPREADSHEET_ID', '...') yang ada di Utils.gs.
 */
var CONFIG = {
  // Ganti dengan ID spreadsheet Anda
  SPREADSHEET_ID: "",

  // Ganti dengan ID folder Google Drive penyimpanan PDF
  DRIVE_FOLDER_ID: "",

  // Versi API (untuk kompatibilitas frontend)
  API_VERSION: "v1",

  // Nama-nama sheet di database
  SHEETS: {
    KOLEKSI: "KOLEKSI",
    KATEGORI: "KATEGORI",
    PENGGUNA: "PENGGUNA",
    LOG_AKTIVITAS: "LOG_AKTIVITAS",
    KONFIGURASI: "KONFIGURASI",
    PESAN_KONTAK: "PESAN_KONTAK",
    FAVORIT: "FAVORIT",
    RIWAYAT: "RIWAYAT",
  },

  // Role yang dianggap ADMINISTRATOR (daftar putih). Role lain — termasuk
  // "Anggota" — tidak bisa memanggil endpoint admin.
  ADMIN_ROLES: ["Super Admin", "Admin", "Editor", "Pustakawan"],
  ROLE_ANGGOTA: "Anggota",

  // Anggota yang mencentang "Ingat saya" tetap masuk selama 14 hari
  MEMBER_SESSION_MS: 14 * 24 * 60 * 60 * 1000,

  // Maksimum ukuran PDF base64 yang dapat diunggah via Apps Script (~25MB)
  MAX_PDF_SIZE_BYTES: 25 * 1024 * 1024,

  // Sesi admin berlaku 8 jam
  SESSION_DURATION_MS: 8 * 60 * 60 * 1000,
};

/* ===================== ENTRY POINTS ===================== */

/**
 * Handle GET request (untuk endpoint publik seperti getStatistikBeranda).
 * Apps Script mengizinkan GET via URL params, namun karena payload JSON
 * lebih aman via body, frontend utamanya memakai POST. GET tetap didukung
 * untuk kompatibilitas.
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "ping";
    var payloadStr = (e && e.parameter && e.parameter.payload) || "{}";
    var params;
    try { params = JSON.parse(payloadStr); }
    catch (err) { params = {}; }

    return routeAction(action, params, "GET");
  } catch (err) {
    return jsonResponse({ success: false, code: "INTERNAL", message: "Terjadi kesalahan internal: " + err.message });
  }
}

/**
 * Handle POST request (untuk semua endpoint admin & beberapa publik).
 * Frontend mengirim body Content-Type: text/plain (untuk hindari CORS preflight),
 * Apps Script membacanya via e.postData.contents.
 */
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || "{}";
    var data;
    try { data = JSON.parse(body); }
    catch (err) { return jsonResponse({ success: false, code: "BAD_REQUEST", message: "Body harus JSON valid." }); }

    var action = data.action || "";
    var params = data.params || {};
    return routeAction(action, params, "POST");
  } catch (err) {
    return jsonResponse({ success: false, code: "INTERNAL", message: "Terjadi kesalahan internal: " + err.message });
  }
}

/**
 * Routing action ke handler di file lain.
 * Struktur dipisah agar mudah dipelihara.
 */
function routeAction(action, params, method) {
  // Load konfigurasi dari PropertiesService bila ada (lebih aman dari hardcode)
  try { loadConfigFromProperties_(); } catch (e) {}

  // Whitelist action
  var publicActions = [
    "ping",
    "getStatistikBeranda",
    "getKoleksiTerbaru",
    "getKoleksiList",
    "getKoleksiDetail",
    "getKoleksiByKategori",
    "getKategoriList",
    "getKategoriPopuler",
    "getTahunList",
    "getPublikasiPilihan",
    "getInstansiConfig",
    "kirimPesanKontak",
    // Akun anggota (publik)
    "login",
    "logout",
    "daftarAnggota",
    "lupaPasswordMinta",
    "lupaPasswordReset",
  ];

  var adminActions = [
    "loginAdmin",
    "logoutAdmin",
    "adminGetDashboardStats",
    "adminGetKoleksiList",
    "adminGetKoleksiDetail",
    "adminSaveKoleksi",
    "adminBulkImportRatna",
    "adminDeleteKoleksi",
    "adminUploadPDF",
    "adminGetKategoriList",
    "adminGetKategoriDetail",
    "adminSaveKategori",
    "adminDeleteKategori",
    "adminGetPublikasiPilihan",
    "adminSetPublikasiPilihan",
    "adminGetLogList",
    "adminSaveInstansiConfig",
    "adminGetPesanList",
    "adminUpdatePesan",
    "adminGetAnggotaList",
    "adminUpdateAnggota",
    "adminResetPasswordAnggota",
    "adminTambahAdmin",
    // Fitur anggota (perlu token; admin juga boleh memakainya)
    "memberGetProfil",
    "memberUpdateProfil",
    "memberGantiPassword",
    "memberGetFavorit",
    "memberGetFavoritIds",
    "memberToggleFavorit",
    "memberCatatRiwayat",
    "memberGetRiwayat",
    "memberHapusRiwayat",
  ];

  if (publicActions.indexOf(action) === -1 && adminActions.indexOf(action) === -1) {
    return jsonResponse({ success: false, code: "UNKNOWN_ACTION", message: "Aksi '" + action + "' tidak dikenal." });
  }

  // Validasi config
  if (!CONFIG.SPREADSHEET_ID && action !== "ping") {
    return jsonResponse({ success: false, code: "NOT_CONFIGURED", message: "SPREADSHEET_ID belum diatur. Lihat PANDUAN_DEPLOY.md langkah 4." });
  }

  // Dispatch ke handler yang sesuai
  try {
    switch (action) {
      // Public
      case "ping": return jsonResponse({ success: true, data: { message: "pong", version: CONFIG.API_VERSION, time: new Date().toISOString() } });

      case "getStatistikBeranda": return jsonResponse({ success: true, data: getStatistikBeranda_(params) });
      case "getKoleksiTerbaru":   return jsonResponse({ success: true, data: getKoleksiTerbaru_(params) });
      case "getKoleksiList":     return jsonResponse({ success: true, data: getKoleksiList_(params) });
      case "getKoleksiDetail":   return jsonResponse({ success: true, data: getKoleksiDetail_(params) });
      case "getKoleksiByKategori": return jsonResponse({ success: true, data: getKoleksiByKategori_(params) });
      case "getKategoriList":    return jsonResponse({ success: true, data: getKategoriList_(params) });
      case "getKategoriPopuler": return jsonResponse({ success: true, data: getKategoriPopuler_(params) });
      case "getTahunList":       return jsonResponse({ success: true, data: getTahunList_(params) });
      case "getPublikasiPilihan": return jsonResponse({ success: true, data: getPublikasiPilihan_(params) });
      case "getInstansiConfig":  return jsonResponse({ success: true, data: getInstansiConfig_(params) });
      case "kirimPesanKontak":   return jsonResponse({ success: true, data: kirimPesanKontak_(params) });

      // Auth
      case "loginAdmin":  return jsonResponse({ success: true, data: loginAdmin_(params) });
      case "logoutAdmin": return jsonResponse({ success: true, data: logoutAdmin_(params) });

      // Admin koleksi
      case "adminGetDashboardStats": return jsonResponse({ success: true, data: adminGetDashboardStats_(params) });
      case "adminGetKoleksiList":   return jsonResponse({ success: true, data: adminGetKoleksiList_(params) });
      case "adminGetKoleksiDetail": return jsonResponse({ success: true, data: adminGetKoleksiDetail_(params) });
      case "adminSaveKoleksi":      return jsonResponse({ success: true, data: adminSaveKoleksi_(params) });
      case "adminBulkImportRatna":  return jsonResponse({ success: true, data: adminBulkImportRatna_(params) });
      case "adminDeleteKoleksi":    return jsonResponse({ success: true, data: adminDeleteKoleksi_(params) });
      case "adminUploadPDF":        return jsonResponse({ success: true, data: adminUploadPDF_(params) });

      // Admin kategori
      case "adminGetKategoriList":   return jsonResponse({ success: true, data: adminGetKategoriList_(params) });
      case "adminGetKategoriDetail":return jsonResponse({ success: true, data: adminGetKategoriDetail_(params) });
      case "adminSaveKategori":     return jsonResponse({ success: true, data: adminSaveKategori_(params) });
      case "adminDeleteKategori":   return jsonResponse({ success: true, data: adminDeleteKategori_(params) });

      // Admin publikasi pilihan
      case "adminGetPublikasiPilihan":  return jsonResponse({ success: true, data: adminGetPublikasiPilihan_(params) });
      case "adminSetPublikasiPilihan":   return jsonResponse({ success: true, data: adminSetPublikasiPilihan_(params) });

      // Admin log
      case "adminGetLogList": return jsonResponse({ success: true, data: adminGetLogList_(params) });

      // Admin instansi
      case "adminSaveInstansiConfig": return jsonResponse({ success: true, data: adminSaveInstansiConfig_(params) });

      // Admin pesan kontak
      case "adminGetPesanList": return jsonResponse({ success: true, data: adminGetPesanList_(params) });
      case "adminUpdatePesan":  return jsonResponse({ success: true, data: adminUpdatePesan_(params) });

      // Akun anggota
      case "login":              return jsonResponse({ success: true, data: login_(params) });
      case "logout":             return jsonResponse({ success: true, data: logoutAdmin_(params) });
      case "daftarAnggota":      return jsonResponse({ success: true, data: daftarAnggota_(params) });
      case "lupaPasswordMinta":  return jsonResponse({ success: true, data: lupaPasswordMinta_(params) });
      case "lupaPasswordReset":  return jsonResponse({ success: true, data: lupaPasswordReset_(params) });

      // Fitur anggota
      case "memberGetProfil":     return jsonResponse({ success: true, data: memberGetProfil_(params) });
      case "memberUpdateProfil":  return jsonResponse({ success: true, data: memberUpdateProfil_(params) });
      case "memberGantiPassword": return jsonResponse({ success: true, data: memberGantiPassword_(params) });
      case "memberGetFavorit":    return jsonResponse({ success: true, data: memberGetFavorit_(params) });
      case "memberGetFavoritIds": return jsonResponse({ success: true, data: memberGetFavoritIds_(params) });
      case "memberToggleFavorit": return jsonResponse({ success: true, data: memberToggleFavorit_(params) });
      case "memberCatatRiwayat":  return jsonResponse({ success: true, data: memberCatatRiwayat_(params) });
      case "memberGetRiwayat":    return jsonResponse({ success: true, data: memberGetRiwayat_(params) });
      case "memberHapusRiwayat":  return jsonResponse({ success: true, data: memberHapusRiwayat_(params) });

      // Admin: kelola anggota
      case "adminGetAnggotaList":       return jsonResponse({ success: true, data: adminGetAnggotaList_(params) });
      case "adminUpdateAnggota":        return jsonResponse({ success: true, data: adminUpdateAnggota_(params) });
      case "adminResetPasswordAnggota": return jsonResponse({ success: true, data: adminResetPasswordAnggota_(params) });
      case "adminTambahAdmin":          return jsonResponse({ success: true, data: adminTambahAdmin_(params) });

      default:
        return jsonResponse({ success: false, code: "UNIMPLEMENTED", message: "Aksi '" + action + "' belum diimplementasikan." });
    }
  } catch (err) {
    logError_(action, err);
    // Deteksi error sesi/auth untuk code yang tepat
    var code = "INTERNAL";
    var msg = err.message || "Kesalahan tak terduga.";
    if (msg.indexOf("tidak memiliki izin") !== -1) {
      code = "FORBIDDEN";
    } else if (msg.indexOf("Token tidak ditemukan") !== -1 || msg.indexOf("Sesi") !== -1 ||
        msg.indexOf("login kembali") !== -1 || msg.indexOf("kedaluwarsa") !== -1) {
      code = "UNAUTHORIZED";
    } else if (msg.indexOf("Terlalu banyak") !== -1 || msg.indexOf("terlalu sering") !== -1) {
      code = "RATE_LIMIT";
    } else if (msg.indexOf("tidak ditemukan") !== -1) {
      code = "NOT_FOUND";
    } else if (msg.indexOf("wajib") !== -1 || msg.indexOf("Format") !== -1 || msg.indexOf("minimal") !== -1 ||
               msg.indexOf("harus ") !== -1 || msg.indexOf("sudah terdaftar") !== -1 || msg.indexOf("Kode tidak valid") !== -1) {
      code = "VALIDATION";
    } else if (msg.indexOf("belum dikonfigurasi") !== -1 || msg.indexOf("belum diisi") !== -1) {
      code = "NOT_CONFIGURED";
    }
    return jsonResponse({ success: false, code: code, message: msg });
  }
}

/**
 * Ambil URL Web App saat ini (untuk referensi di frontend).
 */
function getWebAppUrl() {
  return ScriptApp.getServiceUrl();
}

/**
 * Helper: kembalikan ContentService JSON response.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Saat pertama kali dibuka editor, jalankan fungsi inisialisasi database.
 * Cara pakai: pilih fungsi "initializeDatabase" lalu klik Run.
 */


/* ############################################################
 * BAGIAN: Database
 * ############################################################ */

/**
 * =====================================================================
 * Database.gs — Manajemen Google Sheets
 *
 * Bertanggung jawab:
 *   - Inisialisasi sheet (header + sample data minimal)
 *   - Operasi baca/tulis dengan lock
 *   - Mendapatkan record by ID
 *   - Tidak menghapus data lama saat re-init
 * =====================================================================
 */

/* ===================== DEFINISI SKEMA ===================== */

var SCHEMA = {
  KOLEKSI: {
    name: "KOLEKSI",
    headers: [
      "ID_Koleksi", "Judul", "Penulis", "Tahun", "Penerbit",
      "Kategori_ID", "Jenis_Dokumen", "Abstrak", "Kata_Kunci",
      "ISBN_Nomor_Dokumen", "File_ID_Drive", "URL_Dokumen", "URL_Sampul",
      "Status_Publikasi", "Status_Akses", "Tanggal_Unggah",
      "Diubah_Pada", "Diubah_Oleh", "Unggulan", "Urutan_Unggulan"
    ],
    types: {
      Tahun: "number",
      Tanggal_Unggah: "date",
      Diubah_Pada: "date",
      Urutan_Unggulan: "number",
    }
  },
  KATEGORI: {
    name: "KATEGORI",
    headers: [
      "Kategori_ID", "Nama_Kategori", "Deskripsi", "Status",
      "Urutan", "Dibuat_Pada"
    ],
    types: { Urutan: "number", Dibuat_Pada: "date" }
  },
  PENGGUNA: {
    name: "PENGGUNA",
    headers: [
      "User_ID", "Nama", "Email", "Password_Hash", "Salt",
      "Role", "Status", "Dibuat_Pada", "Login_Terakhir", "Instansi"
    ],
    types: { Dibuat_Pada: "date", Login_Terakhir: "date" }
  },
  LOG_AKTIVITAS: {
    name: "LOG_AKTIVITAS",
    headers: [
      "Log_ID", "Waktu", "User_ID", "Nama_User",
      "Aktivitas", "Jenis_Data", "ID_Data", "Keterangan"
    ],
    types: { Waktu: "date" }
  },
  KONFIGURASI: {
    name: "KONFIGURASI",
    headers: ["Kunci", "Nilai", "Keterangan"]
  },
  // Pesan dari formulir Kontak di website — masuk otomatis ke sheet ini
  PESAN_KONTAK: {
    name: "PESAN_KONTAK",
    headers: [
      "Pesan_ID", "Waktu", "Nama", "Email", "Instansi", "Telepon",
      "Subjek", "Pesan", "Status", "Catatan_Admin"
    ],
    types: { Waktu: "date" }
  },
  // Rak favorit anggota (Fav_ID = <User_ID>_<ID_Koleksi>)
  FAVORIT: {
    name: "FAVORIT",
    headers: ["Fav_ID", "User_ID", "ID_Koleksi", "Waktu"],
    types: { Waktu: "date" }
  },
  // Riwayat dibuka anggota (Riwayat_ID = <User_ID>_<ID_Koleksi>)
  RIWAYAT: {
    name: "RIWAYAT",
    headers: ["Riwayat_ID", "User_ID", "ID_Koleksi", "Terakhir_Dibuka", "Jumlah_Dibuka"],
    types: { Terakhir_Dibuka: "date", Jumlah_Dibuka: "number" }
  },
};

/**
 * Merapikan setiap sheet database agar tampil dan berfungsi seperti tabel.
 * Aman dijalankan berulang kali: tidak menghapus isi sel atau data pengguna.
 */
function formatSheetAsTable_(sheet, expectedColumns) {
  var lastCol = Math.max(sheet.getLastColumn(), expectedColumns || 1);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.setFrozenRows(1);
  var header = sheet.getRange(1, 1, 1, lastCol);
  header.setBackground("#245b4a")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setVerticalAlignment("middle")
    .setWrap(true);
  sheet.setRowHeight(1, 34);
  try {
    // Hapus filter lama sebelum membuat filter yang mencakup seluruh tabel.
    var existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();
    sheet.getRange(1, 1, Math.max(lastRow, 2), lastCol).createFilter();
  } catch (filterError) {
    // Filter mungkin tidak dapat dibuat pada sheet yang dilindungi; format tetap diterapkan.
    console.log("Filter tidak diterapkan pada " + sheet.getName() + ": " + filterError.message);
  }
  try {
    var bandings = sheet.getBandings();
    bandings.forEach(function(banding) { banding.remove(); });
    if (lastRow >= 2) {
      sheet.getRange(1, 1, lastRow, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.GREEN, true, false);
    }
  } catch (bandingError) {
    console.log("Warna baris tidak diterapkan pada " + sheet.getName() + ": " + bandingError.message);
  }
  try { sheet.autoResizeColumns(1, lastCol); } catch (resizeError) {}
}

/* ===================== FUNGSI INISIALISASI ===================== */

/**
 * Inisialisasi database. Jalankan SATU KALI setelah spreadsheet dibuat.
 * - Membuat sheet bila belum ada
 * - Memeriksa header
 * - Tidak menghapus data lama
 * - Melaporkan perbedaan struktur sebelum perubahan
 *
 * Cara pakai:
 *   1. Pastikan CONFIG.SPREADSHEET_ID sudah diisi di Code.gs
 *   2. Pilih fungsi "initializeDatabase" di Apps Script editor
 *   3. Klik Run
 */
function initializeDatabase(opts) {
  var ss = getSpreadsheet_();
  var log = [];
  log.push("=== INISIALISASI DATABASE PERPUSTAKAAN DIGITAL NTT ===");
  log.push("Waktu: " + new Date().toISOString());
  log.push("Spreadsheet: " + ss.getUrl());

  // Backup otomatis sebelum perubahan struktur
  if (opts && opts.skipBackup) {
    log.push("Backup dilewati (spreadsheet baru).");
  } else {
    var backup = createBackup_(ss);
    log.push("Backup otomatis dibuat: " + backup);
  }

  Object.keys(SCHEMA).forEach(function(sheetKey) {
    var schema = SCHEMA[sheetKey];
    var sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
      sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
      sheet.setFrozenRows(1);
      // Format header
      var headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
      headerRange.setBackground("#2f5d50").setFontColor("#ffffff").setFontWeight("bold");
      sheet.autoResizeColumns(1, schema.headers.length);
      log.push("✓ Sheet baru dibuat: " + schema.name + " dengan " + schema.headers.length + " kolom.");
    } else {
      // Sheet sudah ada - tangani sheet kosong dengan aman, lalu periksa header.
      var lastCol = sheet.getLastColumn();
      if (lastCol === 0 || sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
        log.push("✓ Header dibuat pada sheet kosong: " + schema.name);
      } else {
        var existingHeader = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
        var missing = schema.headers.filter(function(h) { return existingHeader.indexOf(h) === -1; });
        var extra = existingHeader.filter(function(h) { return h && schema.headers.indexOf(h) === -1; });
        if (missing.length === 0 && extra.length === 0) {
          log.push("✓ Sheet " + schema.name + " sudah sesuai skema (" + schema.headers.length + " kolom).");
        } else {
          // Tambahkan kolom yang hilang tanpa menghapus data atau kolom lama.
          if (missing.length > 0) {
            var startCol = Math.max(sheet.getLastColumn(), 1) + 1;
            sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
            log.push("↻ Sheet " + schema.name + " diperbarui — menambah kolom: " + missing.join(", "));
          }
          if (extra.length > 0) {
            log.push("⚠ Sheet " + schema.name + " memiliki kolom tambahan (tidak dihapus): " + extra.join(", "));
          }
        }
      }
      sheet.setFrozenRows(1);
    }
    // Terapkan tampilan tabel (header, filter, warna baris, dan lebar kolom).
    formatSheetAsTable_(sheet, schema.headers.length);
  });

  // Tambah kategori default bila kosong
  seedDefaultKategori_(ss);

  // Buat admin default bila belum ada user
  seedDefaultAdmin_(ss);

  log.push("=== INISIALISASI SELESAI ===");
  Logger.log(log.join("\n"));
  return log.join("\n");
}

/**
 * Seed kategori default bila sheet KATEGORI kosong.
 */
function seedDefaultKategori_(ss) {
  var sheet = ss.getSheetByName(SCHEMA.KATEGORI.name);
  if (!sheet) return;
  if (sheet.getLastRow() > 1) return; // sudah ada data

  var defaults = [
    ["penelitian-pengembangan", "Penelitian dan Pengembangan", "Riset, kajian akademik, dan pengembangan daerah NTT", "Aktif", 1, new Date()],
    ["inovasi-daerah",         "Inovasi Daerah",              "Karya inovasi dan praktik baik pemerintahan daerah", "Aktif", 2, new Date()],
    ["sosial-budaya",          "Sosial dan Budaya",            "Kebudayaan, adat, dan dinamika sosial masyarakat NTT", "Aktif", 3, new Date()],
    ["ekonomi-pembangunan",   "Ekonomi dan Pembangunan",     "Studi ekonomi regional dan dokumen pembangunan", "Aktif", 4, new Date()],
    ["pendidikan",             "Pendidikan",                   "Penelitian pendidikan formal dan non-formal", "Aktif", 5, new Date()],
    ["pertanian-peternakan",   "Pertanian dan Peternakan",     "Hasil riset pertanian, peternakan, dan ketahanan pangan", "Aktif", 6, new Date()],
    ["kelautan-perikanan",     "Kelautan dan Perikanan",       "Riset pesisir, laut, dan perikanan NTT", "Aktif", 7, new Date()],
    ["pariwisata",             "Pariwisata",                   "Studi pariwisata dan pengembangan destinasi", "Aktif", 8, new Date()],
    ["lingkungan-kehutanan",   "Lingkungan dan Kehutanan",     "Pengelolaan lingkungan dan kehutanan daerah", "Aktif", 9, new Date()],
    ["kebijakan-publik",       "Kebijakan Publik",            "Dokumen kebijakan, RPJMD, RKPD, regulasi daerah", "Aktif", 10, new Date()],
    ["statistik-daerah",       "Statistik Daerah",            "Publikasi statistik resmi daerah NTT", "Aktif", 11, new Date()],
    ["buku-jurnal",            "Buku dan Jurnal",             "Buku referensi, jurnal ilmiah, dan prosiding", "Aktif", 12, new Date()],
  ];
  sheet.getRange(2, 1, defaults.length, 6).setValues(defaults);
}

/**
 * Seed admin default. Password default SEMENTARA.
 * Admin WAJIB menggantinya setelah login pertama.
 */
function seedDefaultAdmin_(ss) {
  var sheet = ss.getSheetByName(SCHEMA.PENGGUNA.name);
  if (!sheet) return;
  if (sheet.getLastRow() > 1) return;

  var adminEmail = Session.getActiveUser().getEmail() || "admin@nttprov.go.id";
  var salt = generateSalt_();
  var defaultPassword = "AdminNTT2024!"; // GANTI SETELAH LOGIN PERTAMA
  var hash = hashPassword_(defaultPassword, salt);

  var row = [
    "admin-001", "Administrator Bapperida", adminEmail, hash, salt,
    "Super Admin", "Aktif", new Date(), ""
  ];
  sheet.getRange(2, 1, 1, 9).setValues([row]);
  Logger.log("Admin default dibuat. Email: " + adminEmail + " — Password default: " + defaultPassword + " (GANTI SEGERA!)");
}

/* ===================== OPERASI SHEET DASAR ===================== */

/**
 * Dapatkan SpreadsheetApp. Error bila belum dikonfigurasi.
 */
function getSpreadsheet_() {
  var id = CONFIG.SPREADSHEET_ID;
  if (!id) throw new Error("CONFIG.SPREADSHEET_ID belum diisi. Lihat PANDUAN_DEPLOY.md langkah 4.");
  return SpreadsheetApp.openById(id);
}

/**
 * Ambil seluruh baris sebuah sheet sebagai array objek.
 * Hindari membaca berulang-ulang — gunakan cache di pemanggil.
 */
function getSheetRows_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan. Jalankan initializeDatabase terlebih dulu.");
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return values.map(function(row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  });
}

/**
 * Tambah satu record baru ke sheet.
 * Mengembalikan ID yang dibuat.
 */
function appendRow_(sheetName, data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { throw new Error("Server sibuk. Coba lagi dalam beberapa detik."); }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function(h) {
      return data[h] !== undefined ? data[h] : "";
    });
    sheet.appendRow(row);
    return true;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Update record berdasarkan kolom ID.
 */
function updateRowById_(sheetName, idColumn, idValue, updates) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { throw new Error("Server sibuk. Coba lagi dalam beberapa detik."); }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var idColIdx = headers.indexOf(idColumn);
    if (idColIdx === -1) throw new Error("Kolom ID '" + idColumn + "' tidak ditemukan.");
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    var ids = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(idValue)) {
        var rowIdx = i + 2; // +1 untuk header, +1 untuk 0-indexed
        // Baca seluruh baris, ubah hanya kolom yang diminta, tulis balik satu kali.
        // (Versi lama menulis blok kontigu mulai dari kolom pertama yang berubah,
        //  sehingga kolom yang tidak berurutan bisa menimpa kolom lain.)
        var rowRange = sheet.getRange(rowIdx, 1, 1, lastCol);
        var rowVals = rowRange.getValues()[0];
        var changed = false;
        for (var h = 0; h < headers.length; h++) {
          if (updates[headers[h]] !== undefined) {
            rowVals[h] = updates[headers[h]];
            changed = true;
          }
        }
        if (changed) rowRange.setValues([rowVals]);
        return true;
      }
    }
    return false;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Hapus record berdasarkan ID (soft-delete: tandai kolom Status bila ada,
 * atau hard-delete bila diminta). Default: hard-delete dengan konfirmasi
 * dari sisi admin (lihat admin.js deleteKoleksi).
 */
function deleteRowById_(sheetName, idColumn, idValue) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { throw new Error("Server sibuk."); }
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var idColIdx = headers.indexOf(idColumn);
    if (idColIdx === -1) throw new Error("Kolom ID '" + idColumn + "' tidak ditemukan.");
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    var ids = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(idValue)) {
        sheet.deleteRow(i + 2);
        return true;
      }
    }
    return false;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Cari record tunggal berdasarkan ID.
 */
function findRowById_(sheetName, idColumn, idValue) {
  var rows = getSheetRows_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idColumn]) === String(idValue)) return rows[i];
  }
  return null;
}

/**
 * Buat backup otomatis dengan duplikat spreadsheet.
 */
function createBackup_(ss) {
  try {
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmmss");
    var backupName = "BACKUP_" + ss.getName() + "_" + ts;
    var backup = DriveApp.getFileById(ss.getId()).makeCopy(backupName);
    return backup.getName() + " (ID: " + backup.getId() + ")";
  } catch (e) {
    return "Backup gagal: " + e.message;
  }
}

/**
 * Generate ID unik untuk sheet.
 */
function generateId_(prefix) {
  var ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  var rand = Math.random().toString(36).slice(2, 8);
  return (prefix || "ID") + "-" + ts + "-" + rand.toUpperCase();
}


/* ############################################################
 * BAGIAN: Auth
 * ############################################################ */

/**
 * =====================================================================
 * Auth.gs — Autentikasi administrator
 *
 * Mekanisme:
 *   - Password disimpan sebagai SHA-256 hash + random salt (JANGAN plain text)
 *   - Login menghasilkan random token (256-bit) yang disimpan di sheet
 *     KONFIGURASI dengan expiry 8 jam
 *   - Setiap request admin menyertakan token; backend memvalidasi
 *
 * Catatan keamanan:
 *   Apps Script tidak memiliki session storage proper. Pendekatan ini
 *   menggunakan sheet untuk menyimpan token aktif. Untuk skala besar,
 *   pertimbangkan OAuth2 atau Identity Platform. Lihat PANDUAN_DEPLOY.md.
 * ===================================================================== */

/**
 * Login admin — kembalikan token sesi.
 */
function loginAdmin_(params) {
  return loginCore_(params, true);
}

/**
 * Inti proses masuk — dipakai oleh login admin (wajibAdmin = true) dan
 * login umum (wajibAdmin = false → anggota maupun admin).
 */
function loginCore_(params, wajibAdmin) {
  if (!params.email || !params.password) {
    throw new Error("Email dan password wajib diisi.");
  }
  var email = String(params.email).toLowerCase().trim();
  var password = String(params.password);
  cekPercobaanLogin_(email);

  var users = getSheetRows_(SCHEMA.PENGGUNA.name);
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email && users[i].Status === "Aktif") {
      user = users[i];
      break;
    }
  }
  if (!user) {
    catatLoginGagal_(email);
    logActivity_({ User_ID: "GUEST", email: email, nama: "GUEST" }, "login gagal", "AUTH", "-", "Email tidak ditemukan: " + email);
    throw new Error("Email atau kata sandi salah, atau akun tidak aktif.");
  }

  // Verifikasi password
  var computedHash = hashPassword_(password, user.Salt);
  if (computedHash !== user.Password_Hash) {
    catatLoginGagal_(email);
    logActivity_({ User_ID: user.User_ID, email: user.Email, nama: user.Nama }, "login gagal", "AUTH", user.User_ID, "Password salah");
    throw new Error("Email atau kata sandi salah.");
  }
  resetLoginGagal_(email);

  var admin = isAdminRole_(user.Role);
  if (wajibAdmin && !admin) {
    throw new Error("Akun ini bukan akun administrator. Silakan masuk melalui halaman Masuk anggota.");
  }

  // Buat token baru. Anggota dengan "Ingat saya" mendapat sesi lebih panjang.
  var durasi = (!admin && params.ingat) ? CONFIG.MEMBER_SESSION_MS : CONFIG.SESSION_DURATION_MS;
  var token = generateToken_();
  var expiresAt = Date.now() + durasi;

  saveSession_(token, {
    User_ID: user.User_ID,
    Nama: user.Nama,
    Email: user.Email,
    Role: user.Role,
    ExpiresAt: expiresAt
  });

  // Update Login_Terakhir
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", user.User_ID, { Login_Terakhir: new Date() });

  // Hanya login admin yang dicatat di log (agar log tidak dibanjiri login anggota)
  if (admin) logActivity_({ User_ID: user.User_ID, email: user.Email, nama: user.Nama }, "login berhasil", "AUTH", user.User_ID, "Login via web");
  return {
    token: token,
    nama: user.Nama,
    email: user.Email,
    role: user.Role,
    is_admin: admin,
    expires_at: expiresAt
  };
}

/**
 * Logout — hapus token dari cache.
 */
function logoutAdmin_(params) {
  var token = params.token;
  if (token) {
    deleteSession_(token);
  }
  return { logged_out: true };
}

/**
 * Validasi token — kembalikan session data bila valid.
 * @param {object} params — payload dengan field .token
 * @returns {object} session info
 */
function requireSession_(params) {
  var token = params.token;
  if (!token) throw new Error("Token tidak ditemukan. Silakan login kembali.");
  var sess = getSession_(token);
  if (!sess) throw new Error("Sesi tidak ditemukan atau sudah kedaluwarsa. Silakan login kembali.");
  if (Date.now() > sess.ExpiresAt) {
    deleteSession_(token);
    throw new Error("Sesi kedaluwarsa. Silakan login kembali.");
  }
  // Pastikan akun masih aktif & role terbaru (dicache 60 detik)
  assertUserActive_(sess);
  return sess;
}

/** Wajib ADMINISTRATOR — dipakai semua endpoint admin. */
function requireAuth_(params) {
  var sess = requireSession_(params);
  if (!isAdminRole_(sess.Role)) {
    throw new Error("Anda tidak memiliki izin untuk fitur administrator.");
  }
  return sess;
}

/** Cukup akun yang sedang masuk (anggota maupun admin). */
function requireMember_(params) {
  return requireSession_(params);
}

/**
 * Hash password dengan salt menggunakan SHA-256.
 */
function hashPassword_(password, salt) {
  if (!password || !salt) return "";
  var raw = password + ":" + salt;
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  // Konversi byte array ke hex
  return hash.map(function(b) {
    var s = (b < 0 ? b + 256 : b).toString(16);
    return s.length === 1 ? "0" + s : s;
  }).join("");
}

/**
 * Generate random salt.
 * Apps Script TIDAK punya Utilities.getRandomValues — gunakan Math.random()
 * dan Utilities.getUuid() sebagai sumber entropi.
 */
function generateSalt_() {
  var uuid = Utilities.getUuid(); // 36 char with hyphens
  var extra = Math.random().toString(36).slice(2);
  return (uuid + extra).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
}

/**
 * Generate random token (gunakan UUID v4 sebagai basis).
 */
function generateToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

/**
 * Simpan sesi ke sheet KONFIGURASI.
 * Key: session_<token>, Value: JSON string.
 */
function saveSession_(token, sessionData) {
  var key = "session_" + token;
  var value = JSON.stringify(sessionData);
  // Simpan ke cache property (lebih cepat dari sheet) — fallback ke sheet
  try {
    CacheService.getScriptCache().put(key, value, Math.floor(CONFIG.SESSION_DURATION_MS / 1000));
  } catch (e) {}
  // Juga simpan ke sheet untuk persistensi (bila cache expired)
  var existing = findRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key);
  if (existing) {
    updateRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key, { Nilai: value, Keterangan: "Sesi aktif user " + sessionData.User_ID });
  } else {
    appendRow_(SCHEMA.KONFIGURASI.name, { Kunci: key, Nilai: value, Keterangan: "Sesi aktif user " + sessionData.User_ID });
  }
}

/**
 * Ambil sesi dari cache / sheet.
 */
function getSession_(token) {
  var key = "session_" + token;
  // Coba cache dulu
  var cached = null;
  try { cached = CacheService.getScriptCache().get(key); } catch (e) {}
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  // Fallback ke sheet
  var row = findRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key);
  if (row && row.Nilai) {
    try { return JSON.parse(row.Nilai); } catch (e) { return null; }
  }
  return null;
}

/**
 * Hapus sesi.
 */
function deleteSession_(token) {
  var key = "session_" + token;
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
  var row = findRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key);
  if (row) {
    deleteRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key);
  }
}

/**
 * Garbage collection — bersihkan sesi kedaluwarsa (jalankan via trigger harian).
 */
function cleanExpiredSessions_() {
  var rows = getSheetRows_(SCHEMA.KONFIGURASI.name);
  var now = Date.now();
  rows.forEach(function(r) {
    if (String(r.Kunci).indexOf("session_") === 0) {
      try {
        var sess = JSON.parse(r.Nilai || "{}");
        if (sess.ExpiresAt && now > sess.ExpiresAt) {
          deleteRowById_(SCHEMA.KONFIGURASI.name, "Kunci", r.Kunci);
        }
      } catch (e) {
        deleteRowById_(SCHEMA.KONFIGURASI.name, "Kunci", r.Kunci);
      }
    }
  });
}

/**
 * Reset password admin — jalankan dari editor Apps Script bila lupa.
 * function resetAdminPassword() {
 *   var newPassword = "PasswordBaru123!";
 *   var email = "admin@nttprov.go.id";
 *   var user = findRowById_("PENGGUNA", "Email", email);
 *   if (!user) { Logger.log("User tidak ditemukan"); return; }
 *   var newSalt = generateSalt_();
 *   var hash = hashPassword_(newPassword, newSalt);
 *   updateRowById_("PENGGUNA", "User_ID", user.User_ID,
 *     { Password_Hash: hash, Salt: newSalt, Login_Terakhir: "" });
 *   Logger.log("Password direset untuk " + email + " — password baru: " + newPassword);
 * }
 */

/**
 * Helper: tambahkan admin baru.
 * function addAdminUser(nama, email, role) {
 *   var salt = generateSalt_();
 *   var defaultPw = "AdminNTT" + Math.floor(Math.random()*1000) + "!";
 *   var hash = hashPassword_(defaultPw, salt);
 *   var uid = generateId_("USR");
 *   appendRow_("PENGGUNA", {
 *     User_ID: uid, Nama: nama, Email: email.toLowerCase(),
 *     Password_Hash: hash, Salt: salt, Role: role || "Admin",
 *     Status: "Aktif", Dibuat_Pada: new Date(), Login_Terakhir: ""
 *   });
 *   Logger.log("Admin dibuat. Email: " + email + " Password: " + defaultPw);
 * }
 */


/* ############################################################
 * BAGIAN: Koleksi
 * ############################################################ */

/**
 * =====================================================================
 * Koleksi.gs — Operasi CRUD koleksi & kategori (public + admin)
 *
 * Semua fungsi diakhiri underscore (_) sesuai konvensi Apps Script
 * (private function tidak muncul di autocomplete editor).
 * ===================================================================== */

/* ===================== PUBLIC ENDPOINTS ===================== */

/**
 * Statistik beranda: total koleksi, kategori, publikasi riset, dokumen publik.
 */
function getStatistikBeranda_(params) {
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);

  var totalKoleksi = 0;
  var totalPublik = 0;
  var totalPublikasi = 0;

  koleksi.forEach(function(k) {
    if (k.Status_Publikasi === "Terbit") {
      totalKoleksi++;
      // Publikasi riset biasanya jenis Laporan Penelitian / Jurnal
      if (k.Jenis_Dokumen === "Laporan Penelitian" || k.Jenis_Dokumen === "Jurnal") totalPublikasi++;
      if (k.Status_Akses === "Publik") totalPublik++;
    }
  });

  var totalKategori = kategori.filter(function(k) { return k.Status === "Aktif"; }).length;

  return {
    total_koleksi: totalKoleksi,
    total_kategori: totalKategori,
    total_publikasi: totalPublikasi,
    total_publik: totalPublik
  };
}

/**
 * Koleksi terbaru untuk beranda.
 */
function getKoleksiTerbaru_(params) {
  var limit = parseInt(params.limit, 10) || 8;
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k) { kategoriMap[k.Kategori_ID] = k.Nama_Kategori; });

  // Hanya yang Terbit
  var filtered = koleksi.filter(function(k) { return k.Status_Publikasi === "Terbit"; });
  // Sort: Tanggal_Unggah terbaru
  filtered.sort(function(a, b) {
    var ta = a.Tanggal_Unggah ? new Date(a.Tanggal_Unggah).getTime() : 0;
    var tb = b.Tanggal_Unggah ? new Date(b.Tanggal_Unggah).getTime() : 0;
    return tb - ta;
  });
  var sliced = filtered.slice(0, limit);
  var result = sliced.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, false); });
  return { koleksi: result };
}

/**
 * Daftar koleksi publik dengan filter + pagination + sort.
 */
function getKoleksiList_(params) {
  var page = parseInt(params.page, 10) || 1;
  var perPage = parseInt(params.per_page, 10) || 12;
  var q = (params.q || "").toString().toLowerCase().trim();
  var kategoriId = params.kategori_id || null;
  var jenis = params.jenis_dokumen || null;
  var tahun = params.tahun || null;
  var akses = params.akses || null;
  var sort = params.sort || "terbaru";

  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k) { kategoriMap[k.Kategori_ID] = k.Nama_Kategori; });

  // Hanya koleksi yang Terbit & tidak privat untuk publik
  var filtered = koleksi.filter(function(k) {
    if (k.Status_Publikasi !== "Terbit") return false;
    // Untuk publik, sembunyikan yang Privat murni (Publik dan Internal tetap tampil di daftar)
    if (k.Status_Akses === "Privat") return false;
    if (q) {
      var blob = [k.Judul, k.Penulis, k.Abstrak, k.Kata_Kunci, k.Penerbit]
        .map(function(s) { return (s || "").toString().toLowerCase(); }).join(" ");
      if (blob.indexOf(q) === -1) return false;
    }
    if (kategoriId && String(k.Kategori_ID) !== String(kategoriId)) return false;
    if (jenis && k.Jenis_Dokumen !== jenis) return false;
    if (tahun && String(k.Tahun) !== String(tahun)) return false;
    if (akses && k.Status_Akses !== akses) return false;
    return true;
  });

  // Sort
  filtered.sort(function(a, b) {
    switch (sort) {
      case "terlama":
        return dateOf(a.Tanggal_Unggah) - dateOf(b.Tanggal_Unggah);
      case "judul_az":
        return (a.Judul || "").localeCompare(b.Judul || "");
      case "judul_za":
        return (b.Judul || "").localeCompare(a.Judul || "");
      case "tahun_terbaru":
        return parseInt(b.Tahun, 10) - parseInt(a.Tahun, 10);
      case "tahun_terlama":
        return parseInt(a.Tahun, 10) - parseInt(b.Tahun, 10);
      case "terbaru":
      default:
        return dateOf(b.Tanggal_Unggah) - dateOf(a.Tanggal_Unggah);
    }
  });

  var total = filtered.length;
  var start = (page - 1) * perPage;
  var sliced = filtered.slice(start, start + perPage);
  var items = sliced.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, false); });
  return { koleksi: items, total: total, page: page, per_page: perPage };
}

/**
 * Detail koleksi publik.
 */
function getKoleksiDetail_(params) {
  var id = params.id;
  if (!id) throw new Error("Parameter id wajib diisi.");
  var k = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  if (!k) throw new Error("Koleksi tidak ditemukan atau telah dihapus.");
  if (k.Status_Publikasi !== "Terbit") throw new Error("Koleksi tidak tersedia untuk publik.");

  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k2) { kategoriMap[k2.Kategori_ID] = k2.Nama_Kategori; });
  return sanitizeKoleksi_(k, kategoriMap, false);
}

/**
 * Koleksi berdasarkan kategori (untuk halaman kategori.html?k=...).
 */
function getKoleksiByKategori_(params) {
  var kategoriId = params.kategori_id;
  var page = parseInt(params.page, 10) || 1;
  var perPage = parseInt(params.per_page, 10) || 24;
  if (!kategoriId) throw new Error("Parameter kategori_id wajib diisi.");

  var kategori = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", kategoriId);
  if (!kategori) throw new Error("Kategori tidak ditemukan.");
  if (kategori.Status !== "Aktif") throw new Error("Kategori tidak aktif.");

  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var filtered = koleksi.filter(function(k) {
    return k.Status_Publikasi === "Terbit" && k.Status_Akses !== "Privat" && String(k.Kategori_ID) === String(kategoriId);
  });
  filtered.sort(function(a, b) { return dateOf(b.Tanggal_Unggah) - dateOf(a.Tanggal_Unggah); });
  var total = filtered.length;
  var start = (page - 1) * perPage;
  var sliced = filtered.slice(start, start + perPage);
  var kategoriMap = {}; kategoriMap[kategori.Kategori_ID] = kategori.Nama_Kategori;
  var items = sliced.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, false); });
  return {
    kategori: kategori,
    koleksi: items,
    total: total,
    page: page,
    per_page: perPage
  };
}

/**
 * Daftar kategori publik.
 */
function getKategoriList_(params) {
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  kategori = kategori.filter(function(k) { return k.Status === "Aktif"; });
  // Hitung jumlah koleksi per kategori
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var counts = {};
  koleksi.forEach(function(k) {
    if (k.Status_Publikasi === "Terbit" && k.Status_Akses !== "Privat") {
      counts[k.Kategori_ID] = (counts[k.Kategori_ID] || 0) + 1;
    }
  });
  var result = kategori.map(function(k) {
    return {
      Kategori_ID: k.Kategori_ID,
      Nama_Kategori: k.Nama_Kategori,
      Deskripsi: k.Deskripsi,
      Urutan: k.Urutan,
      jumlah: counts[k.Kategori_ID] || 0
    };
  });
  result.sort(function(a, b) { return (a.Urutan || 0) - (b.Urutan || 0); });
  return { kategori: result };
}

/**
 * Kategori populer untuk beranda (urut berdasarkan jumlah koleksi).
 */
function getKategoriPopuler_(params) {
  var data = getKategoriList_(params);
  var list = data.kategori || [];
  list.sort(function(a, b) { return (b.jumlah || 0) - (a.jumlah || 0); });
  return { kategori: list.slice(0, 6) };
}

/**
 * Daftar tahun publikasi untuk dropdown filter.
 */
function getTahunList_(params) {
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var set = {};
  koleksi.forEach(function(k) {
    if (k.Tahun) set[String(k.Tahun)] = true;
  });
  var arr = Object.keys(set).filter(Boolean).sort(function(a, b) { return parseInt(b, 10) - parseInt(a, 10); });
  return { tahun: arr };
}

/**
 * Publikasi pilihan untuk beranda.
 */
function getPublikasiPilihan_(params) {
  var limit = parseInt(params.limit, 10) || 5;
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k) { kategoriMap[k.Kategori_ID] = k.Nama_Kategori; });

  var filtered = koleksi.filter(function(k) {
    return k.Status_Publikasi === "Terbit" && k.Status_Akses !== "Privat" && (k.Unggulan === "Y" || k.Unggulan === true);
  });
  filtered.sort(function(a, b) {
    return (parseInt(a.Urutan_Unggulan, 10) || 999) - (parseInt(b.Urutan_Unggulan, 10) || 999);
  });
  var sliced = filtered.slice(0, limit);
  var items = sliced.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, false); });
  return { koleksi: items };
}

/**
 * Konfigurasi instansi publik (info kontak dll).
 */
function getInstansiConfig_(params) {
  var rows = getSheetRows_(SCHEMA.KONFIGURASI.name);
  var cfg = {};
  rows.forEach(function(r) { if (r.Kunci) cfg[r.Kunci] = r.Nilai; });
  return { konfigurasi: cfg };
}

/* ===================== ADMIN ENDPOINTS ===================== */

function adminGetDashboardStats_(params) {
  requireAuth_(params);
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var totalKoleksi = koleksi.length;
  var totalPublik = koleksi.filter(function(k) { return k.Status_Akses === "Publik" && k.Status_Publikasi === "Terbit"; }).length;
  var totalDraft = koleksi.filter(function(k) { return k.Status_Publikasi === "Draft"; }).length;
  return {
    total_koleksi: totalKoleksi,
    total_kategori: kategori.filter(function(k) { return k.Status === "Aktif"; }).length,
    total_publik: totalPublik,
    total_draft: totalDraft,
    total_anggota: hitungAnggota_()
  };
}

function adminGetKoleksiList_(params) {
  var sess = requireAuth_(params);
  var page = parseInt(params.page, 10) || 1;
  var perPage = parseInt(params.per_page, 10) || 10;
  var q = (params.q || "").toString().toLowerCase().trim();
  var kategoriId = params.kategori_id || null;
  var status = params.status || null;
  var sort = params.sort || "terbaru";

  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k) { kategoriMap[k.Kategori_ID] = k.Nama_Kategori; });

  var filtered = koleksi.filter(function(k) {
    if (q) {
      var blob = [k.Judul, k.Penulis, k.ID_Koleksi, k.ISBN_Nomor_Dokumen]
        .map(function(s) { return (s || "").toString().toLowerCase(); }).join(" ");
      if (blob.indexOf(q) === -1) return false;
    }
    if (kategoriId && String(k.Kategori_ID) !== String(kategoriId)) return false;
    if (status && k.Status_Publikasi !== status) return false;
    return true;
  });
  filtered.sort(function(a, b) {
    if (sort === "terbaru") return dateOf(b.Diubah_Pada || b.Tanggal_Unggah) - dateOf(a.Diubah_Pada || a.Tanggal_Unggah);
    if (sort === "terlama") return dateOf(a.Diubah_Pada || a.Tanggal_Unggah) - dateOf(b.Diubah_Pada || b.Tanggal_Unggah);
    if (sort === "judul_az") return (a.Judul || "").localeCompare(b.Judul || "");
    return dateOf(b.Diubah_Pada || b.Tanggal_Unggah) - dateOf(a.Diubah_Pada || a.Tanggal_Unggah);
  });
  var total = filtered.length;
  var start = (page - 1) * perPage;
  var sliced = filtered.slice(start, start + perPage);
  var items = sliced.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, true); });
  return { koleksi: items, total: total, page: page, per_page: perPage };
}

function adminGetKoleksiDetail_(params) {
  requireAuth_(params);
  var k = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", params.id);
  if (!k) throw new Error("Koleksi tidak ditemukan.");
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(kk) { kategoriMap[kk.Kategori_ID] = kk.Nama_Kategori; });
  return { koleksi: sanitizeKoleksi_(k, kategoriMap, true) };
}

function adminSaveKoleksi_(params) {
  var sess = requireAuth_(params);
  // Validasi wajib
  var required = ["Judul", "Penulis", "Kategori_ID", "Tahun", "Jenis_Dokumen"];
  for (var i = 0; i < required.length; i++) {
    if (!params[required[i]] || !String(params[required[i]]).trim()) {
      throw new Error("Field wajib '" + required[i] + "' tidak boleh kosong.");
    }
  }
  // Sanitasi input (XSS) — anti penyisipan HTML/script
  var sanitized = {
    Judul: sanitizeText_(params.Judul),
    Penulis: sanitizeText_(params.Penulis),
    Penerbit: sanitizeText_(params.Penerbit || ""),
    Kategori_ID: sanitizeText_(params.Kategori_ID),
    Tahun: parseInt(params.Tahun, 10) || new Date().getFullYear(),
    Jenis_Dokumen: sanitizeText_(params.Jenis_Dokumen),
    Abstrak: sanitizeText_(params.Abstrak || ""),
    Kata_Kunci: sanitizeText_(params.Kata_Kunci || ""),
    ISBN_Nomor_Dokumen: sanitizeText_(params.ISBN_Nomor_Dokumen || ""),
    URL_Sampul: sanitizeText_(params.URL_Sampul || ""),
    Status_Publikasi: sanitizeText_(params.Status_Publikasi || "Draft"),
    Status_Akses: sanitizeText_(params.Status_Akses || "Publik"),
  };

  var now = new Date();
  var isNew = !params.ID_Koleksi;
  var kategoriExists = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", sanitized.Kategori_ID);
  if (!kategoriExists) throw new Error("Kategori tidak ditemukan. Tambahkan kategori dulu.");

  if (isNew) {
    var newId = generateId_("KOL");
    var data = {
      ID_Koleksi: newId,
      Judul: sanitized.Judul,
      Penulis: sanitized.Penulis,
      Tahun: sanitized.Tahun,
      Penerbit: sanitized.Penerbit,
      Kategori_ID: sanitized.Kategori_ID,
      Jenis_Dokumen: sanitized.Jenis_Dokumen,
      Abstrak: sanitized.Abstrak,
      Kata_Kunci: sanitized.Kata_Kunci,
      ISBN_Nomor_Dokumen: sanitized.ISBN_Nomor_Dokumen,
      File_ID_Drive: params.File_ID_Drive || "",
      URL_Dokumen: params.URL_Dokumen || (params.URL_Dokumen_existing || ""),
      URL_Sampul: sanitized.URL_Sampul,
      Status_Publikasi: sanitized.Status_Publikasi,
      Status_Akses: sanitized.Status_Akses,
      Tanggal_Unggah: now,
      Diubah_Pada: now,
      Diubah_Oleh: sess.email,
      Unggulan: "N",
      Urutan_Unggulan: 0
    };
    appendRow_(SCHEMA.KOLEKSI.name, data);
    // Sinkronisasi sharing Drive sesuai Status_Akses
    if (data.File_ID_Drive) {
      try { setFileSharing_(data.File_ID_Drive, sanitized.Status_Akses); } catch (e) { Logger.log("WARN setFileSharing: " + e.message); }
    }
    logActivity_(sess, "menambahkan koleksi", "KOLEKSI", newId, "Judul: " + sanitized.Judul);
    return { ID_Koleksi: newId, action: "created" };
  } else {
    var existing = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", params.ID_Koleksi);
    if (!existing) throw new Error("Koleksi tidak ditemukan.");
    var updates = {
      Judul: sanitized.Judul,
      Penulis: sanitized.Penulis,
      Tahun: sanitized.Tahun,
      Penerbit: sanitized.Penerbit,
      Kategori_ID: sanitized.Kategori_ID,
      Jenis_Dokumen: sanitized.Jenis_Dokumen,
      Abstrak: sanitized.Abstrak,
      Kata_Kunci: sanitized.Kata_Kunci,
      ISBN_Nomor_Dokumen: sanitized.ISBN_Nomor_Dokumen,
      URL_Sampul: sanitized.URL_Sampul,
      Status_Publikasi: sanitized.Status_Publikasi,
      Status_Akses: sanitized.Status_Akses,
      Diubah_Pada: now,
      Diubah_Oleh: sess.email
    };
    if (params.File_ID_Drive) updates.File_ID_Drive = params.File_ID_Drive;
    if (params.URL_Dokumen) updates.URL_Dokumen = params.URL_Dokumen;
    else if (params.URL_Dokumen_existing) updates.URL_Dokumen = params.URL_Dokumen_existing;
    updateRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", params.ID_Koleksi, updates);
    // Sinkronisasi sharing Drive bila ada file & status berubah
    var fileId = updates.File_ID_Drive || existing.File_ID_Drive;
    if (fileId) {
      try { setFileSharing_(fileId, sanitized.Status_Akses); } catch (e) { Logger.log("WARN setFileSharing: " + e.message); }
    }
    logActivity_(sess, "mengubah koleksi", "KOLEKSI", params.ID_Koleksi, "Judul: " + sanitized.Judul);
    return { ID_Koleksi: params.ID_Koleksi, action: "updated" };
  }
}

/**
 * Impor batch metadata dari migrasi Website Ratna/POPCORN RIDA.
 * Hanya administrator aktif; maksimal 20 record per request. Record yang
 * ID-nya sudah ada dilewati sehingga impor dapat dijalankan ulang dengan aman.
 * Dokumen PDF berada di folder aset statis assets/dokumen/ pada paket website.
 */
function adminBulkImportRatna_(params) {
  var sess = requireAuth_(params);
  var records = params.records;
  if (!Array.isArray(records) || !records.length) throw new Error("records harus berupa array yang tidak kosong.");
  if (records.length > 20) throw new Error("Maksimal 20 record per batch.");
  var kategoriRows = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategoriRows.forEach(function(k) { kategoriMap[String(k.Kategori_ID)] = k; });
  var created = 0, skipped = 0;
  records.forEach(function(r) {
    if (!r || !r.ID_Koleksi || !r.Judul) throw new Error("Setiap record wajib memiliki ID_Koleksi dan Judul.");
    var id = sanitizeText_(r.ID_Koleksi).substring(0, 80);
    if (findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id)) { skipped++; return; }
    var kategoriId = sanitizeText_(r.Kategori_ID || "penelitian-pengembangan");
    if (!kategoriMap[kategoriId]) throw new Error("Kategori_ID tidak ditemukan: " + kategoriId + ". Jalankan setupOtomatis() terlebih dahulu.");
    var urlDoc = String(r.URL_Dokumen || "");
    // Batasi ke aset relatif lokal, cegah impor URL eksternal tak tervalidasi.
    if (urlDoc && !/^assets\/dokumen\/[A-Za-z0-9._-]+\.pdf$/i.test(urlDoc)) throw new Error("URL_Dokumen tidak valid untuk " + id);
    var now = new Date();
    appendRow_(SCHEMA.KOLEKSI.name, {
      ID_Koleksi: id,
      Judul: sanitizeText_(r.Judul).substring(0, 500),
      Penulis: sanitizeText_(r.Penulis || "Bapperida Provinsi NTT").substring(0, 1000),
      Tahun: parseInt(r.Tahun, 10) || now.getFullYear(),
      Penerbit: sanitizeText_(r.Penerbit || "Bapperida Provinsi NTT").substring(0, 500),
      Kategori_ID: kategoriId,
      Jenis_Dokumen: sanitizeText_(r.Jenis_Dokumen || "Laporan Penelitian").substring(0, 100),
      Abstrak: sanitizeText_(r.Abstrak || "").substring(0, 10000),
      Kata_Kunci: sanitizeText_(r.Kata_Kunci || "").substring(0, 2000),
      ISBN_Nomor_Dokumen: sanitizeText_(r.ISBN_Nomor_Dokumen || "").substring(0, 200),
      File_ID_Drive: "",
      URL_Dokumen: urlDoc,
      URL_Sampul: "",
      Status_Publikasi: "Draft",
      Status_Akses: "Internal",
      Tanggal_Unggah: now,
      Diubah_Pada: now,
      Diubah_Oleh: sess.email,
      Unggulan: "N",
      Urutan_Unggulan: 0
    });
    created++;
  });
  logActivity_(sess, "impor koleksi Ratna", "KOLEKSI", "BATCH", "Ditambahkan: " + created + "; dilewati karena sudah ada: " + skipped);
  return { created: created, skipped: skipped, total_batch: records.length };
}

function adminDeleteKoleksi_(params) {
  var sess = requireAuth_(params);
  var id = params.id;
  if (!id) throw new Error("Parameter id wajib diisi.");
  var existing = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  if (!existing) throw new Error("Koleksi tidak ditemukan.");

  // Catat metadata sebelum hapus (untuk log)
  var judul = existing.Judul;

  // Hapus baris — file Drive TIDAK otomatis dihapus (lihat PANDUAN_DEPLOY)
  deleteRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  logActivity_(sess, "menghapus koleksi", "KOLEKSI", id, "Judul: " + judul + " — file Drive (ID: " + existing.File_ID_Drive + ") tetap ada dan harus dihapus manual bila perlu.");

  return { deleted: true, drive_file_id: existing.File_ID_Drive || null, drive_warning: "File Google Drive tidak otomatis dihapus." };
}

function adminUploadPDF_(params) {
  var sess = requireAuth_(params);
  if (!params.filename || !params.data) throw new Error("filename dan data wajib diisi.");
  var size = Math.ceil((params.data.length * 3) / 4); // approx base64 -> bytes
  if (size > CONFIG.MAX_PDF_SIZE_BYTES) {
    throw new Error("Ukuran file melebihi " + (CONFIG.MAX_PDF_SIZE_BYTES / 1024 / 1024) + "MB. Gunakan unggah manual ke Drive.");
  }
  var result = uploadPDF_(params.filename, params.data, params.mime || "application/pdf", sess.email);
  logActivity_(sess, "mengunggah PDF", "FILE", result.file_id, "File: " + params.filename);
  return result;
}

function adminGetKategoriList_(params) {
  requireAuth_(params);
  var rows = getSheetRows_(SCHEMA.KATEGORI.name);
  rows.sort(function(a, b) { return (a.Urutan || 0) - (b.Urutan || 0) || (a.Nama_Kategori || "").localeCompare(b.Nama_Kategori || ""); });
  return { kategori: rows };
}

function adminGetKategoriDetail_(params) {
  requireAuth_(params);
  var k = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", params.id);
  if (!k) throw new Error("Kategori tidak ditemukan.");
  return { kategori: k };
}

function adminSaveKategori_(params) {
  var sess = requireAuth_(params);
  if (!params.Nama_Kategori || !params.Nama_Kategori.trim()) throw new Error("Nama kategori wajib diisi.");
  var nama = sanitizeText_(params.Nama_Kategori);
  var desk = sanitizeText_(params.Deskripsi || "");
  var status = params.Status === "Nonaktif" ? "Nonaktif" : "Aktif";
  var urutan = parseInt(params.Urutan, 10) || 0;

  if (params.Kategori_ID) {
    var existing = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", params.Kategori_ID);
    if (!existing) throw new Error("Kategori tidak ditemukan.");
    updateRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", params.Kategori_ID, {
      Nama_Kategori: nama, Deskripsi: desk, Status: status, Urutan: urutan
    });
    logActivity_(sess, "mengubah kategori", "KATEGORI", params.Kategori_ID, "Nama: " + nama);
    return { Kategori_ID: params.Kategori_ID, action: "updated" };
  } else {
    // Buat ID dari slug nama kategori — hindari duplikat
    var slug = slugify_(nama);
    var existing2 = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", slug);
    if (existing2) throw new Error("Kategori dengan nama serupa sudah ada. Gunakan nama lain.");
    var data = {
      Kategori_ID: slug,
      Nama_Kategori: nama,
      Deskripsi: desk,
      Status: status,
      Urutan: urutan,
      Dibuat_Pada: new Date()
    };
    appendRow_(SCHEMA.KATEGORI.name, data);
    logActivity_(sess, "menambah kategori", "KATEGORI", slug, "Nama: " + nama);
    return { Kategori_ID: slug, action: "created" };
  }
}

function adminDeleteKategori_(params) {
  var sess = requireAuth_(params);
  var id = params.id;
  if (!id) throw new Error("Parameter id wajib diisi.");
  var existing = findRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", id);
  if (!existing) throw new Error("Kategori tidak ditemukan.");
  // Cek apakah masih dipakai koleksi
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var dipakai = koleksi.some(function(k) { return String(k.Kategori_ID) === String(id); });
  if (dipakai) {
    // Tetap hapus tapi laporkan peringatan
    deleteRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", id);
    logActivity_(sess, "menghapus kategori", "KATEGORI", id, "Nama: " + existing.Nama_Kategori + " — masih dipakai koleksi lain (kategori pada koleksi tersebut menjadi kosong).");
    return { deleted: true, warning: "Kategori dihapus. Beberapa koleksi kini tidak memiliki kategori — silakan perbarui." };
  }
  deleteRowById_(SCHEMA.KATEGORI.name, "Kategori_ID", id);
  logActivity_(sess, "menghapus kategori", "KATEGORI", id, "Nama: " + existing.Nama_Kategori);
  return { deleted: true };
}

function adminGetPublikasiPilihan_(params) {
  requireAuth_(params);
  var koleksi = getSheetRows_(SCHEMA.KOLEKSI.name);
  var kategori = getSheetRows_(SCHEMA.KATEGORI.name);
  var kategoriMap = {};
  kategori.forEach(function(k) { kategoriMap[k.Kategori_ID] = k.Nama_Kategori; });
  var featured = koleksi.filter(function(k) { return k.Unggulan === "Y" || k.Unggulan === true; });
  featured.sort(function(a, b) { return (parseInt(a.Urutan_Unggulan, 10) || 999) - (parseInt(b.Urutan_Unggulan, 10) || 999); });
  var items = featured.map(function(k) { return sanitizeKoleksi_(k, kategoriMap, true); });
  return { koleksi: items };
}

function adminSetPublikasiPilihan_(params) {
  var sess = requireAuth_(params);
  var id = params.id;
  var unggulan = params.unggulan === "Y" ? "Y" : "N";
  var urutan = parseInt(params.Urutan, 10) || parseInt(params.urutan, 10) || 0;
  var k = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  if (!k) throw new Error("Koleksi tidak ditemukan.");
  updateRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id, { Unggulan: unggulan, Urutan_Unggulan: urutan });
  logActivity_(sess, unggulan === "Y" ? "menandai publikasi pilihan" : "menghapus publikasi pilihan", "KOLEKSI", id, "Judul: " + k.Judul);
  return { updated: true, unggulan: unggulan };
}

function adminGetLogList_(params) {
  requireAuth_(params);
  var page = parseInt(params.page, 10) || 1;
  var perPage = parseInt(params.per_page, 10) || 20;
  var log = getSheetRows_(SCHEMA.LOG_AKTIVITAS.name);
  log.sort(function(a, b) { return dateOf(b.Waktu) - dateOf(a.Waktu); });
  var total = log.length;
  var start = (page - 1) * perPage;
  var sliced = log.slice(start, start + perPage);
  return { log: sliced, total: total, page: page, per_page: perPage };
}

function adminSaveInstansiConfig_(params) {
  var sess = requireAuth_(params);
  var rows = getSheetRows_(SCHEMA.KONFIGURASI.name);
  var keys = ["instansi", "alamat", "telepon", "email", "slogan", "deskripsi"];
  keys.forEach(function(key) {
    if (params[key] !== undefined) {
      var existing = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].Kunci === key) { existing = rows[i]; break; }
      }
      if (existing) {
        updateRowById_(SCHEMA.KONFIGURASI.name, "Kunci", key, { Nilai: sanitizeText_(params[key]) });
      } else {
        appendRow_(SCHEMA.KONFIGURASI.name, { Kunci: key, Nilai: sanitizeText_(params[key]), Keterangan: "Diperbarui oleh " + sess.email });
      }
    }
  });
  logActivity_(sess, "mengubah konfigurasi instansi", "KONFIGURASI", "-", "Update info instansi");
  return { updated: true };
}

/* ===================== HELPER INTERNAL ===================== */

/**
 * Sanitasi koleksi untuk publik — sembunyikan field sensitif bila bukan admin.
 */
function sanitizeKoleksi_(k, kategoriMap, isAdmin) {
  if (!k) return null;
  var out = {
    ID_Koleksi: k.ID_Koleksi,
    Judul: k.Judul,
    Penulis: k.Penulis,
    Tahun: k.Tahun,
    Penerbit: k.Penerbit,
    Kategori_ID: k.Kategori_ID,
    Nama_Kategori: kategoriMap[k.Kategori_ID] || k.Kategori || "",
    Jenis_Dokumen: k.Jenis_Dokumen,
    Abstrak: k.Abstrak,
    Kata_Kunci: k.Kata_Kunci,
    ISBN_Nomor_Dokumen: k.ISBN_Nomor_Dokumen,
    Status_Publikasi: k.Status_Publikasi,
    Status_Akses: k.Status_Akses,
    Tanggal_Unggah: k.Tanggal_Unggah ? new Date(k.Tanggal_Unggah).toISOString() : null,
    URL_Sampul: k.URL_Sampul,
  };
  // URL_Dokumen: tampilkan bila Publik, sembunyikan untuk Privat.
  // Untuk Internal, jangan kirim URL langsung (admin harus approve via email).
  if (k.Status_Akses === "Publik" && k.URL_Dokumen) {
    out.URL_Dokumen = k.URL_Dokumen;
  } else if (isAdmin) {
    // Admin dapat melihat URL seluruh koleksi
    out.URL_Dokumen = k.URL_Dokumen;
    out.File_ID_Drive = k.File_ID_Drive;
    out.Diubah_Pada = k.Diubah_Pada ? new Date(k.Diubah_Pada).toISOString() : null;
    out.Diubah_Oleh = k.Diubah_Oleh;
    out.Unggulan = k.Unggulan;
    out.Urutan_Unggulan = k.Urutan_Unggulan;
  }
  return out;
}

/**
 * Sanitasi teks input — mencegah XSS & karakter kontrol.
 */
function sanitizeText_(s) {
  if (s === null || s === undefined) return "";
  s = String(s);
  // Buang null byte & karakter kontrol (kecuali tab/newline/CR)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s.trim();
}

/**
 * Slugify — untuk membuat ID kategori dari nama.
 */
function slugify_(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Konversi value apapun ke timestamp numerik untuk sorting.
 */
function dateOf(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


/* ############################################################
 * BAGIAN: DriveService
 * ############################################################ */

/**
 * =====================================================================
 * DriveService.gs — Integrasi Google Drive untuk penyimpanan PDF
 *
 * Catatan penting tentang ukuran file:
 *   - Apps Script base64 upload via base64 aman hingga ~25MB (lihat CONFIG).
 *   - Untuk file lebih besar, admin harus unggah manual ke folder Drive
 *     lalu tempel File_ID ke form admin (kolom File_ID_Drive).
 *   - File tidak otomatis dibuat publik. Hak akses default: privat
 *     (hanya pemilik). Bila dokumen berstatus "Publik", file diset
 *     "anyone with link can view" via setSharing().
 * =====================================================================
 */

/**
 * Unggah PDF ke Google Drive folder perpustakaan.
 *
 * @param {string} filename — nama file
 * @param {string} base64Data — isi file dalam base64 (tanpa prefix data:...)
 * @param {string} mime — tipe MIME, default application/pdf
 * @param {string} userEmail — email admin yang mengunggah (untuk log)
 * @returns {object} { file_id, url, filename, size_bytes }
 */
function uploadPDF_(filename, base64Data, mime, userEmail) {
  if (!CONFIG.DRIVE_FOLDER_ID) {
    throw new Error("CONFIG.DRIVE_FOLDER_ID belum diisi. Lihat PANDUAN_DEPLOY.md langkah 4.");
  }
  var folder;
  try {
    folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  } catch (e) {
    throw new Error("Folder Google Drive tidak ditemukan. Periksa DRIVE_FOLDER_ID di Code.gs. Detail: " + e.message);
  }

  // Validasi tipe MIME
  var allowedMimes = ["application/pdf"];
  if (allowedMimes.indexOf(mime) === -1) {
    throw new Error("Hanya file PDF yang diizinkan. MIME terdeteksi: " + mime);
  }

  // Sanitasi nama file — buang karakter berbahaya, tambahkan timestamp untuk hindari tabrakan
  var safeName = sanitizeFilename_(filename);
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  var uniqueName = ts + "_" + safeName;

  // Decode base64 -> bytes
  var bytes;
  try {
    bytes = Utilities.base64Decode(base64Data);
  } catch (e) {
    throw new Error("Data base64 tidak valid. Detail: " + e.message);
  }

  // Cek ukuran
  if (bytes.length > CONFIG.MAX_PDF_SIZE_BYTES) {
    throw new Error("Ukuran file (" + (bytes.length / 1024 / 1024).toFixed(2) + " MB) melebihi batas unggah otomatis (" + (CONFIG.MAX_PDF_SIZE_BYTES / 1024 / 1024) + " MB).");
  }

  // Buat file di Drive
  var blob = Utilities.newBlob(bytes, mime, uniqueName);
  var file = folder.createFile(blob);
  file.setDescription("Dokumen perpustakaan digital NTT — diunggah oleh " + (userEmail || "admin") + " pada " + new Date().toISOString());

  // Set sharing: default privat (jangan otomatis publik)
  // File hanya akan di-set publik oleh admin via toggle di UI bila status akses = Publik
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);

  // Dapatkan URL preview
  var url = "https://drive.google.com/file/d/" + file.getId() + "/preview";

  return {
    file_id: file.getId(),
    url: url,
    filename: file.getName(),
    size_bytes: file.getSize()
  };
}

/**
 * Set sharing file Drive berdasarkan status akses.
 * - Publik: anyone with link can view
 * - Internal: privat (akses via permohonan)
 * - Privat: privat (default)
 *
 * @param {string} fileId
 * @param {string} statusAkses — "Publik" | "Internal" | "Privat"
 */
function setFileSharing_(fileId, statusAkses) {
  if (!fileId) return;
  var file = DriveApp.getFileById(fileId);
  if (statusAkses === "Publik") {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } else {
    // Internal & Privat: file tetap private; admin harus approve manual bila perlu
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  }
}

/**
 * Hapus file Drive berdasarkan ID.
 * PERINGATAN: operasi ini tidak reversibel. Frontend tidak otomatis
 * memanggil fungsi ini saat hapus koleksi — lihat adminDeleteKoleksi_().
 */
function deleteFile_(fileId) {
  if (!fileId) return false;
  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true); // pindahkan ke trash, bukan permanent delete
    return true;
  } catch (e) {
    // File mungkin sudah dihapus
    return false;
  }
}

/**
 * Sanitasi nama file — buang path traversal & karakter aneh.
 */
function sanitizeFilename_(name) {
  if (!name) return "dokumen.pdf";
  var s = String(name);
  // Buang path components
  s = s.replace(/^.*[\\\/]/, "");
  // Buang karakter non-aman
  s = s.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Pastikan tetap ada ekstensi .pdf
  if (!/\.pdf$/i.test(s)) s += ".pdf";
  // Batasi panjang
  if (s.length > 100) s = s.slice(0, 95) + ".pdf";
  return s;
}

/**
 * Validasi akses file (apakah file benar-benar publik-viewable).
 */
function isFilePublic_(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var access = file.getSharingAccess();
    return access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE;
  } catch (e) {
    return false;
  }
}

/**
 * Dapatkan daftar file dalam folder perpustakaan (untuk debugging).
 */
function listFilesInFolder_() {
  if (!CONFIG.DRIVE_FOLDER_ID) return [];
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var files = folder.getFiles();
  var out = [];
  while (files.hasNext()) {
    var f = files.next();
    out.push({ id: f.getId(), name: f.getName(), size: f.getSize(), created: f.getDateCreated() });
  }
  return out;
}


/* ############################################################
 * BAGIAN: Kontak
 * ############################################################ */

/**
 * =====================================================================
 * Kontak.gs — Pesan dari formulir Kontak website -> Google Sheets
 *
 * Alur:
 *   kontak.html  --POST kirimPesanKontak-->  Apps Script  -->  sheet PESAN_KONTAK
 *                                                         \-->  email notifikasi (opsional)
 *
 * Keamanan:
 *   - Honeypot (field "website" harus kosong) untuk menyaring bot sederhana
 *   - Rate limit per email & global (CacheService)
 *   - Validasi panjang & format di server
 *   - Perlindungan formula injection: nilai berawalan = + - @ dinetralkan
 *     supaya tidak dieksekusi sebagai rumus saat dibuka di Google Sheets
 * ===================================================================== */

var KONTAK_LIMITS = { nama: 100, email: 150, instansi: 150, telepon: 30, subjek: 150, pesan: 3000 };

/** Endpoint publik: simpan pesan kontak ke sheet. */
function kirimPesanKontak_(params) {
  // Honeypot: bot biasanya mengisi semua field. Pura-pura sukses, jangan simpan.
  if (params.website) return { sent: true };

  var nama     = sanitizeText_(params.nama);
  var email    = sanitizeText_(params.email).toLowerCase();
  var instansi = sanitizeText_(params.instansi);
  var telepon  = sanitizeText_(params.telepon);
  var subjek   = sanitizeText_(params.subjek).replace(/[\r\n]+/g, " ");
  var pesan    = sanitizeText_(params.pesan);

  if (!nama)   throw new Error("Nama wajib diisi.");
  if (!email)  throw new Error("Email wajib diisi.");
  if (!subjek) throw new Error("Subjek wajib diisi.");
  if (!pesan)  throw new Error("Pesan wajib diisi.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid.");

  if (nama.length > KONTAK_LIMITS.nama || email.length > KONTAK_LIMITS.email ||
      instansi.length > KONTAK_LIMITS.instansi || telepon.length > KONTAK_LIMITS.telepon ||
      subjek.length > KONTAK_LIMITS.subjek || pesan.length > KONTAK_LIMITS.pesan) {
    throw new Error("Format isian terlalu panjang. Persingkat pesan Anda.");
  }

  cekRateLimitKontak_(email);

  var id = generateId_("MSG");
  ensureSheet_(SCHEMA.PESAN_KONTAK);
  appendRow_(SCHEMA.PESAN_KONTAK.name, {
    Pesan_ID: id,
    Waktu: new Date(),
    Nama: amanSel_(nama),
    Email: amanSel_(email),
    Instansi: amanSel_(instansi),
    Telepon: amanSel_(telepon),
    Subjek: amanSel_(subjek),
    Pesan: amanSel_(pesan),
    Status: "Baru",
    Catatan_Admin: ""
  });

  kirimNotifikasiKontak_(id, nama, email, instansi, telepon, subjek, pesan);
  logActivity_(null, "menerima pesan kontak", "PESAN_KONTAK", id, subjek);
  return { sent: true, id: id };
}

/** Admin: daftar pesan, terbaru dulu. Filter opsional: status, q. */
function adminGetPesanList_(params) {
  requireAuth_(params);
  ensureSheet_(SCHEMA.PESAN_KONTAK);
  var page = parseInt(params.page, 10) || 1;
  var perPage = Math.min(parseInt(params.per_page, 10) || 10, 100);
  var rows = getSheetRows_(SCHEMA.PESAN_KONTAK.name);

  var baru = rows.filter(function(r) { return r.Status === "Baru"; }).length;
  if (params.status) rows = rows.filter(function(r) { return r.Status === params.status; });
  if (params.q) {
    var q = String(params.q).toLowerCase();
    rows = rows.filter(function(r) {
      return [r.Nama, r.Email, r.Instansi, r.Subjek, r.Pesan].join(" ").toLowerCase().indexOf(q) !== -1;
    });
  }
  rows.sort(function(a, b) { return dateOf(b.Waktu) - dateOf(a.Waktu); });
  var total = rows.length;
  var items = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
  return { pesan: items, total: total, page: page, per_page: perPage, total_baru: baru };
}

/** Admin: ubah status (Baru/Dibaca/Selesai) dan catatan internal. */
function adminUpdatePesan_(params) {
  var sess = requireAuth_(params);
  if (!params.Pesan_ID) throw new Error("Pesan_ID wajib diisi.");
  var allowed = ["Baru", "Dibaca", "Selesai"];
  var updates = {};
  if (params.Status !== undefined) {
    if (allowed.indexOf(params.Status) === -1) throw new Error("Format status tidak valid.");
    updates.Status = params.Status;
  }
  if (params.Catatan_Admin !== undefined) {
    updates.Catatan_Admin = amanSel_(sanitizeText_(params.Catatan_Admin).slice(0, 1000));
  }
  var ok = updateRowById_(SCHEMA.PESAN_KONTAK.name, "Pesan_ID", params.Pesan_ID, updates);
  if (!ok) throw new Error("Pesan tidak ditemukan.");
  logActivity_(sess, "memperbarui pesan kontak", "PESAN_KONTAK", params.Pesan_ID, updates.Status || "catatan");
  return { updated: true };
}

/* ===================== HELPER ===================== */

/** Netralkan formula injection: sel berawalan = + - @ diperlakukan sebagai teks. */
function amanSel_(v) {
  v = String(v === null || v === undefined ? "" : v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

/** Buat sheet beserta header bila belum ada (untuk database lama yang belum punya sheet ini). */
function ensureSheet_(schema) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(schema.name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(schema.name);
  sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers])
    .setBackground("#2f5d50").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);
  return sheet;
}

/** Batasi spam: 1 pesan / 60 detik per email, maksimal 30 pesan / 10 menit secara global. */
function cekRateLimitKontak_(email) {
  var cache = CacheService.getScriptCache();
  var digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
  ).slice(0, 20);
  var keyEmail = "kontak_e_" + digest;
  if (cache.get(keyEmail)) throw new Error("Terlalu banyak pesan. Tunggu satu menit sebelum mengirim lagi.");

  var keyGlobal = "kontak_g";
  var count = parseInt(cache.get(keyGlobal) || "0", 10);
  if (count >= 30) throw new Error("Terlalu banyak pesan masuk. Coba lagi beberapa menit lagi.");

  cache.put(keyEmail, "1", 60);
  cache.put(keyGlobal, String(count + 1), 600);
}

/** Kirim notifikasi email ke instansi (gagal kirim tidak menggagalkan penyimpanan ke sheet). */
function kirimNotifikasiKontak_(id, nama, email, instansi, telepon, subjek, pesan) {
  try {
    var tujuan = "";
    try {
      var cfg = getSheetRows_(SCHEMA.KONFIGURASI.name);
      for (var i = 0; i < cfg.length; i++) if (cfg[i].Kunci === "email") tujuan = String(cfg[i].Nilai || "");
    } catch (e) {}
    tujuan = tujuan || getConfig("NOTIFIKASI_EMAIL") || "";
    if (!tujuan) return;
    var body =
      "Pesan baru dari formulir Kontak Perpustakaan Digital NTT\n\n" +
      "ID       : " + id + "\n" +
      "Nama     : " + nama + "\n" +
      "Email    : " + email + "\n" +
      "Instansi : " + (instansi || "-") + "\n" +
      "Telepon  : " + (telepon || "-") + "\n\n" +
      "Pesan:\n" + pesan + "\n\n" +
      "Kelola pesan ini di sheet PESAN_KONTAK atau dashboard admin.";
    MailApp.sendEmail({
      to: tujuan,
      subject: "[Perpustakaan Digital NTT] " + subjek,
      body: body,
      replyTo: email,
      name: "Perpustakaan Digital NTT"
    });
  } catch (e) {
    Logger.log("WARN: notifikasi email gagal: " + e.message);
  }
}


/* ############################################################
 * BAGIAN: Anggota (pengguna biasa) — pendaftaran, masuk, profil,
 *         rak favorit, riwayat baca, lupa kata sandi
 * ############################################################ */

/**
 * =====================================================================
 * Anggota.gs — Akun pengguna biasa (role "Anggota")
 *
 * Prinsip keamanan:
 *   - Anggota memakai sheet PENGGUNA yang sama dengan admin, dibedakan
 *     oleh kolom Role. Endpoint admin MENOLAK token non-admin
 *     (lihat requireAuth_), sehingga anggota tidak bisa menembus admin.
 *   - Kata sandi: SHA-256 + salt acak (sama seperti admin).
 *   - Pembatasan percobaan masuk / daftar / reset memakai CacheService.
 *   - Reset kata sandi memakai KODE 8 karakter yang dikirim ke email
 *     (bukan tautan), sehingga tidak ada celah phishing lewat tautan.
 *   - Akun admin TIDAK bisa di-reset lewat email; gunakan editor Apps Script.
 * ===================================================================== */

var PASSWORD_MIN = 8;
var MAKS_FAVORIT = 300;
var MAKS_RIWAYAT = 50;

/** Apakah role termasuk administrator (daftar putih di CONFIG.ADMIN_ROLES). */
function isAdminRole_(role) {
  return CONFIG.ADMIN_ROLES.indexOf(String(role || "")) !== -1;
}

/** Kunci cache pendek dari teks apa pun (email, dll). */
function digestKey_(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text))
  ).slice(0, 24);
}

/** String acak dari alfabet tertentu (entropi dari UUID v4). */
function acakString_(len, alphabet) {
  var seed = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var out = "";
  for (var i = 0; i < len; i++) {
    var n = parseInt(seed.substr((i * 2) % (seed.length - 1), 2), 16);
    out += alphabet.charAt(n % alphabet.length);
  }
  return out;
}

function cekKekuatanPassword_(pw) {
  pw = String(pw || "");
  if (pw.length < PASSWORD_MIN) throw new Error("Kata sandi minimal " + PASSWORD_MIN + " karakter.");
  if (pw.length > 100) throw new Error("Kata sandi terlalu panjang (maksimal 100 karakter).");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error("Kata sandi harus mengandung huruf dan angka.");
}

function emailValid_(email) {
  return email.length <= 150 && /^[A-Za-z0-9][^\s@]*@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Pastikan sheet baru & kolom Instansi ada (untuk database lama yang belum di-upgrade). */
function ensureAnggotaSchema_() {
  var cache = CacheService.getScriptCache();
  try { if (cache.get("schema_anggota_ok")) return; } catch (e) {}
  ensureSheet_(SCHEMA.FAVORIT);
  ensureSheet_(SCHEMA.RIWAYAT);
  var sheet = getSpreadsheet_().getSheetByName(SCHEMA.PENGGUNA.name);
  if (!sheet) throw new Error("Sheet 'PENGGUNA' tidak ditemukan. Jalankan initializeDatabase terlebih dulu.");
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (header.indexOf("Instansi") === -1) {
    sheet.getRange(1, header.length + 1).setValue("Instansi");
  }
  try { cache.put("schema_anggota_ok", "1", 21600); } catch (e) {}
}

/* ---------- Pembatasan laju ---------- */

function cekRateLimit_(prefix, kunci, jedaDetik, maksGlobal, jendelaDetik, pesan) {
  var cache = CacheService.getScriptCache();
  var keyU = prefix + "_u_" + digestKey_(kunci);
  if (cache.get(keyU)) throw new Error(pesan || "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.");
  var keyG = prefix + "_g";
  var n = parseInt(cache.get(keyG) || "0", 10);
  if (n >= maksGlobal) throw new Error("Terlalu banyak permintaan masuk. Coba lagi beberapa menit lagi.");
  cache.put(keyU, "1", jedaDetik);
  cache.put(keyG, String(n + 1), jendelaDetik);
}

/* ---------- Daftar & masuk ---------- */

/** Publik: daftar akun anggota baru, lalu langsung masuk. */
function daftarAnggota_(params) {
  if (params.website) return { registered: true };            // honeypot bot

  var nama     = sanitizeText_(params.nama).replace(/\s+/g, " ");
  var email    = sanitizeText_(params.email).toLowerCase();
  var instansi = sanitizeText_(params.instansi).replace(/\s+/g, " ");
  var password = String(params.password || "");

  if (!nama)  throw new Error("Nama lengkap wajib diisi.");
  if (nama.length < 2 || nama.length > 100) throw new Error("Nama harus 2–100 karakter.");
  if (!email) throw new Error("Email wajib diisi.");
  if (!emailValid_(email)) throw new Error("Format email tidak valid.");
  if (instansi.length > 150) throw new Error("Nama instansi terlalu panjang (maksimal 150 karakter).");
  cekKekuatanPassword_(password);

  cekRateLimit_("daftar", email, 30, 40, 600, "Terlalu banyak percobaan daftar. Tunggu 30 detik lalu coba lagi.");
  ensureAnggotaSchema_();

  var users = getSheetRows_(SCHEMA.PENGGUNA.name);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email) {
      throw new Error("Email ini sudah terdaftar. Silakan masuk, atau gunakan menu Lupa Kata Sandi.");
    }
  }

  var salt = generateSalt_();
  var uid = generateId_("USR");
  appendRow_(SCHEMA.PENGGUNA.name, {
    User_ID: uid, Nama: amanSel_(nama), Email: email,
    Password_Hash: hashPassword_(password, salt), Salt: salt,
    Role: CONFIG.ROLE_ANGGOTA, Status: "Aktif",
    Dibuat_Pada: new Date(), Login_Terakhir: "", Instansi: amanSel_(instansi)
  });
  logActivity_({ User_ID: uid, nama: nama, email: email }, "pendaftaran anggota", "PENGGUNA", uid, "Anggota baru mendaftar");

  var hasil = loginCore_({ email: email, password: password, ingat: false }, false);
  hasil.registered = true;
  return hasil;
}

/** Publik: masuk untuk SEMUA role. Frontend mengarahkan admin ke dashboard. */
function login_(params) {
  return loginCore_(params, false);
}

/* ---------- Anti brute-force ---------- */

function cekPercobaanLogin_(email) {
  var n = parseInt(CacheService.getScriptCache().get("lg_f_" + digestKey_(email)) || "0", 10);
  if (n >= 8) throw new Error("Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam 15 menit, atau gunakan Lupa Kata Sandi.");
}
function catatLoginGagal_(email) {
  var cache = CacheService.getScriptCache();
  var key = "lg_f_" + digestKey_(email);
  var n = parseInt(cache.get(key) || "0", 10);
  cache.put(key, String(n + 1), 900);
}
function resetLoginGagal_(email) {
  try { CacheService.getScriptCache().remove("lg_f_" + digestKey_(email)); } catch (e) {}
}

/* ---------- Cek akun masih aktif (sliding 60 detik) ---------- */

function assertUserActive_(sess) {
  var cache = CacheService.getScriptCache();
  var key = "uact_" + sess.User_ID;
  var roleCache = null;
  try { roleCache = cache.get(key); } catch (e) {}
  if (roleCache) { sess.Role = roleCache; return; }
  var u = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", sess.User_ID);
  if (!u || u.Status !== "Aktif") {
    throw new Error("Akun tidak aktif atau sudah dihapus. Silakan login kembali atau hubungi administrator.");
  }
  sess.Role = u.Role;
  try { cache.put(key, String(u.Role || "-"), 60); } catch (e) {}
}

function hapusCacheAktif_(userId) {
  try { CacheService.getScriptCache().remove("uact_" + userId); } catch (e) {}
}

/** Hapus semua sesi milik user (kecuali token tertentu). Dipakai saat ganti sandi / nonaktif. */
function hapusSesiUser_(userId, exceptToken) {
  var rows = getSheetRows_(SCHEMA.KONFIGURASI.name);
  var cache = CacheService.getScriptCache();
  rows.forEach(function(r) {
    var k = String(r.Kunci || "");
    if (k.indexOf("session_") !== 0) return;
    if (exceptToken && k === "session_" + exceptToken) return;
    var s;
    try { s = JSON.parse(r.Nilai || "{}"); } catch (e) { return; }
    if (String(s.User_ID) === String(userId)) {
      try { cache.remove(k); } catch (e) {}
      deleteRowById_(SCHEMA.KONFIGURASI.name, "Kunci", k);
    }
  });
}

/* ---------- Profil ---------- */

function memberGetProfil_(params) {
  var sess = requireMember_(params);
  var u = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", sess.User_ID);
  if (!u) throw new Error("Akun tidak ditemukan.");
  ensureAnggotaSchema_();
  var uid = String(sess.User_ID);
  var fav = getSheetRows_(SCHEMA.FAVORIT.name).filter(function(f) { return String(f.User_ID) === uid; }).length;
  var rw  = getSheetRows_(SCHEMA.RIWAYAT.name).filter(function(f) { return String(f.User_ID) === uid; }).length;
  return {
    user_id: u.User_ID, nama: u.Nama, email: u.Email, role: u.Role,
    is_admin: isAdminRole_(u.Role), instansi: u.Instansi || "",
    dibuat_pada: u.Dibuat_Pada ? new Date(u.Dibuat_Pada).toISOString() : null,
    login_terakhir: u.Login_Terakhir ? new Date(u.Login_Terakhir).toISOString() : null,
    total_favorit: fav, total_riwayat: rw
  };
}

function memberUpdateProfil_(params) {
  var sess = requireMember_(params);
  var nama = sanitizeText_(params.nama).replace(/\s+/g, " ");
  var instansi = sanitizeText_(params.instansi).replace(/\s+/g, " ");
  if (!nama) throw new Error("Nama lengkap wajib diisi.");
  if (nama.length < 2 || nama.length > 100) throw new Error("Nama harus 2–100 karakter.");
  if (instansi.length > 150) throw new Error("Nama instansi terlalu panjang (maksimal 150 karakter).");
  ensureAnggotaSchema_();
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", sess.User_ID, { Nama: amanSel_(nama), Instansi: amanSel_(instansi) });
  // Sinkronkan nama pada sesi aktif
  var s = getSession_(params.token);
  if (s) { s.Nama = nama; saveSession_(params.token, s); }
  return { nama: nama, instansi: instansi };
}

function memberGantiPassword_(params) {
  var sess = requireMember_(params);
  var lama = String(params.password_lama || "");
  var baru = String(params.password_baru || "");
  if (!lama) throw new Error("Kata sandi saat ini wajib diisi.");
  cekKekuatanPassword_(baru);
  if (lama === baru) throw new Error("Kata sandi baru harus berbeda dari yang lama.");
  var u = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", sess.User_ID);
  if (!u) throw new Error("Akun tidak ditemukan.");
  if (hashPassword_(lama, u.Salt) !== u.Password_Hash) throw new Error("Kata sandi saat ini salah.");
  var salt = generateSalt_();
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", u.User_ID, { Password_Hash: hashPassword_(baru, salt), Salt: salt });
  hapusSesiUser_(u.User_ID, params.token);               // keluarkan perangkat lain
  logActivity_(sess, "mengganti kata sandi", "PENGGUNA", u.User_ID, "Ganti kata sandi mandiri");
  return { changed: true };
}

/* ---------- Rak favorit ---------- */

function kategoriMap_() {
  var map = {};
  getSheetRows_(SCHEMA.KATEGORI.name).forEach(function(k) { map[k.Kategori_ID] = k.Nama_Kategori; });
  return map;
}

function memberGetFavoritIds_(params) {
  var sess = requireMember_(params);
  ensureAnggotaSchema_();
  var uid = String(sess.User_ID);
  var ids = getSheetRows_(SCHEMA.FAVORIT.name)
    .filter(function(f) { return String(f.User_ID) === uid; })
    .map(function(f) { return String(f.ID_Koleksi); });
  return { ids: ids };
}

function memberGetFavorit_(params) {
  var sess = requireMember_(params);
  ensureAnggotaSchema_();
  var uid = String(sess.User_ID);
  var favs = getSheetRows_(SCHEMA.FAVORIT.name).filter(function(f) { return String(f.User_ID) === uid; });
  var koleksi = {};
  getSheetRows_(SCHEMA.KOLEKSI.name).forEach(function(k) { if (k.Status_Publikasi === "Terbit") koleksi[String(k.ID_Koleksi)] = k; });
  var km = kategoriMap_();
  favs.sort(function(a, b) { return dateOf(b.Waktu) - dateOf(a.Waktu); });
  var out = [];
  favs.forEach(function(f) {
    var k = koleksi[String(f.ID_Koleksi)];
    if (!k) return;
    var item = sanitizeKoleksi_(k, km, false);
    item.Disimpan_Pada = f.Waktu ? new Date(f.Waktu).toISOString() : null;
    out.push(item);
  });
  return { koleksi: out, total: out.length };
}

function memberToggleFavorit_(params) {
  var sess = requireMember_(params);
  var id = sanitizeText_(params.id);
  if (!id) throw new Error("Parameter id wajib diisi.");
  ensureAnggotaSchema_();
  var favId = sess.User_ID + "_" + id;
  var ada = findRowById_(SCHEMA.FAVORIT.name, "Fav_ID", favId);
  if (ada) {
    deleteRowById_(SCHEMA.FAVORIT.name, "Fav_ID", favId);
    return { favorit: false, id: id };
  }
  var k = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  if (!k || k.Status_Publikasi !== "Terbit") throw new Error("Koleksi tidak ditemukan atau belum terbit.");
  var uid = String(sess.User_ID);
  var jumlah = getSheetRows_(SCHEMA.FAVORIT.name).filter(function(f) { return String(f.User_ID) === uid; }).length;
  if (jumlah >= MAKS_FAVORIT) throw new Error("Rak favorit penuh (maksimal " + MAKS_FAVORIT + " koleksi). Hapus beberapa dulu.");
  appendRow_(SCHEMA.FAVORIT.name, { Fav_ID: favId, User_ID: sess.User_ID, ID_Koleksi: id, Waktu: new Date() });
  return { favorit: true, id: id };
}

/* ---------- Riwayat baca ---------- */

function memberCatatRiwayat_(params) {
  var sess = requireMember_(params);
  var id = sanitizeText_(params.id);
  if (!id) throw new Error("Parameter id wajib diisi.");
  ensureAnggotaSchema_();
  var rid = sess.User_ID + "_" + id;
  var ada = findRowById_(SCHEMA.RIWAYAT.name, "Riwayat_ID", rid);
  if (ada) {
    updateRowById_(SCHEMA.RIWAYAT.name, "Riwayat_ID", rid, {
      Terakhir_Dibuka: new Date(), Jumlah_Dibuka: (parseInt(ada.Jumlah_Dibuka, 10) || 0) + 1
    });
    return { ok: true };
  }
  var k = findRowById_(SCHEMA.KOLEKSI.name, "ID_Koleksi", id);
  if (!k || k.Status_Publikasi !== "Terbit") return { ok: false };
  appendRow_(SCHEMA.RIWAYAT.name, { Riwayat_ID: rid, User_ID: sess.User_ID, ID_Koleksi: id, Terakhir_Dibuka: new Date(), Jumlah_Dibuka: 1 });
  // Pangkas: simpan MAKS_RIWAYAT terbaru per pengguna
  var uid = String(sess.User_ID);
  var milik = getSheetRows_(SCHEMA.RIWAYAT.name).filter(function(r) { return String(r.User_ID) === uid; });
  if (milik.length > MAKS_RIWAYAT) {
    milik.sort(function(a, b) { return dateOf(a.Terakhir_Dibuka) - dateOf(b.Terakhir_Dibuka); });
    milik.slice(0, milik.length - MAKS_RIWAYAT).forEach(function(r) {
      deleteRowById_(SCHEMA.RIWAYAT.name, "Riwayat_ID", r.Riwayat_ID);
    });
  }
  return { ok: true };
}

function memberGetRiwayat_(params) {
  var sess = requireMember_(params);
  ensureAnggotaSchema_();
  var uid = String(sess.User_ID);
  var rows = getSheetRows_(SCHEMA.RIWAYAT.name).filter(function(r) { return String(r.User_ID) === uid; });
  rows.sort(function(a, b) { return dateOf(b.Terakhir_Dibuka) - dateOf(a.Terakhir_Dibuka); });
  var koleksi = {};
  getSheetRows_(SCHEMA.KOLEKSI.name).forEach(function(k) { if (k.Status_Publikasi === "Terbit") koleksi[String(k.ID_Koleksi)] = k; });
  var km = kategoriMap_();
  var out = [];
  rows.forEach(function(r) {
    var k = koleksi[String(r.ID_Koleksi)];
    if (!k) return;
    var item = sanitizeKoleksi_(k, km, false);
    item.Terakhir_Dibuka = r.Terakhir_Dibuka ? new Date(r.Terakhir_Dibuka).toISOString() : null;
    item.Jumlah_Dibuka = parseInt(r.Jumlah_Dibuka, 10) || 1;
    out.push(item);
  });
  return { koleksi: out, total: out.length };
}

function memberHapusRiwayat_(params) {
  var sess = requireMember_(params);
  ensureAnggotaSchema_();
  var uid = String(sess.User_ID);
  var rows = getSheetRows_(SCHEMA.RIWAYAT.name).filter(function(r) { return String(r.User_ID) === uid; });
  var id = sanitizeText_(params.id);
  var n = 0;
  rows.forEach(function(r) {
    if (id && String(r.ID_Koleksi) !== id) return;
    deleteRowById_(SCHEMA.RIWAYAT.name, "Riwayat_ID", r.Riwayat_ID);
    n++;
  });
  return { dihapus: n };
}

/* ---------- Lupa kata sandi (kode lewat email) ---------- */

function lupaPasswordMinta_(params) {
  var email = sanitizeText_(params.email).toLowerCase();
  if (!email) throw new Error("Email wajib diisi.");
  if (!emailValid_(email)) throw new Error("Format email tidak valid.");
  cekRateLimit_("lupa", email, 60, 30, 600, "Permintaan kode terlalu sering. Tunggu satu menit lalu coba lagi.");

  var user = null;
  var users = getSheetRows_(SCHEMA.PENGGUNA.name);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email) { user = users[i]; break; }
  }
  // Respons SELALU sama agar email terdaftar tidak bisa ditebak.
  if (!user || user.Status !== "Aktif" || isAdminRole_(user.Role)) return { sent: true };

  var kode = acakString_(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  var rec = { h: hashPassword_(kode, email), tries: 0 };
  CacheService.getScriptCache().put("rst_" + digestKey_(email), JSON.stringify(rec), 1800);
  try {
    MailApp.sendEmail({
      to: email,
      subject: "[Perpustakaan Digital NTT] Kode atur ulang kata sandi",
      body: "Halo " + user.Nama + ",\n\n" +
            "Kami menerima permintaan atur ulang kata sandi untuk akun Anda.\n\n" +
            "Kode Anda: " + kode + "\n\n" +
            "Masukkan kode ini pada halaman Lupa Kata Sandi. Kode berlaku 30 menit dan hanya bisa dipakai sekali.\n" +
            "Jika bukan Anda yang meminta, abaikan email ini — kata sandi Anda tidak berubah.\n\n" +
            "Perpustakaan Digital Nusa Tenggara Timur",
      name: "Perpustakaan Digital NTT"
    });
  } catch (e) {
    Logger.log("WARN: email kode reset gagal: " + e.message);
  }
  return { sent: true };
}

function lupaPasswordReset_(params) {
  var email = sanitizeText_(params.email).toLowerCase();
  var kode = sanitizeText_(params.kode).toUpperCase().replace(/\s+/g, "");
  var baru = String(params.password_baru || "");
  if (!email || !kode) throw new Error("Email dan kode wajib diisi.");
  cekKekuatanPassword_(baru);

  var cache = CacheService.getScriptCache();
  var key = "rst_" + digestKey_(email);
  var raw = cache.get(key);
  if (!raw) throw new Error("Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.");
  var rec;
  try { rec = JSON.parse(raw); } catch (e) { cache.remove(key); throw new Error("Kode tidak valid atau sudah kedaluwarsa. Minta kode baru."); }
  if (rec.tries >= 5) { cache.remove(key); throw new Error("Kode tidak valid atau sudah kedaluwarsa. Minta kode baru."); }
  if (hashPassword_(kode, email) !== rec.h) {
    rec.tries++;
    cache.put(key, JSON.stringify(rec), 1800);
    throw new Error("Kode tidak valid atau sudah kedaluwarsa. Periksa kembali kode pada email Anda.");
  }

  var users = getSheetRows_(SCHEMA.PENGGUNA.name);
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email) { user = users[i]; break; }
  }
  if (!user || user.Status !== "Aktif" || isAdminRole_(user.Role)) throw new Error("Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.");

  var salt = generateSalt_();
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", user.User_ID, { Password_Hash: hashPassword_(baru, salt), Salt: salt });
  cache.remove(key);
  resetLoginGagal_(email);
  hapusSesiUser_(user.User_ID, null);
  logActivity_({ User_ID: user.User_ID, nama: user.Nama, email: user.Email }, "reset kata sandi via email", "PENGGUNA", user.User_ID, "Kata sandi diatur ulang");
  return { reset: true };
}

/* ---------- Admin: kelola anggota ---------- */

function hitungAnggota_() {
  try {
    return getSheetRows_(SCHEMA.PENGGUNA.name).filter(function(u) { return !isAdminRole_(u.Role); }).length;
  } catch (e) { return 0; }
}

function adminGetAnggotaList_(params) {
  requireAuth_(params);
  ensureAnggotaSchema_();
  var q = sanitizeText_(params.q).toLowerCase();
  var status = sanitizeText_(params.status);
  var page = Math.max(1, parseInt(params.page, 10) || 1);
  var perPage = Math.min(100, Math.max(5, parseInt(params.per_page, 10) || 10));

  var semua = getSheetRows_(SCHEMA.PENGGUNA.name);
  var ringkasan = {
    total: semua.length,
    aktif: semua.filter(function(u) { return u.Status === "Aktif"; }).length,
    nonaktif: semua.filter(function(u) { return u.Status !== "Aktif"; }).length,
    anggota: semua.filter(function(u) { return !isAdminRole_(u.Role); }).length
  };
  var list = semua.filter(function(u) {
    if (status && u.Status !== status) return false;
    if (q) {
      var hay = (String(u.Nama) + " " + String(u.Email) + " " + String(u.Instansi || "")).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  list.sort(function(a, b) { return dateOf(b.Dibuat_Pada) - dateOf(a.Dibuat_Pada); });
  var total = list.length;
  var items = list.slice((page - 1) * perPage, page * perPage).map(function(u) {
    return {
      User_ID: u.User_ID, Nama: u.Nama, Email: u.Email, Role: u.Role, Status: u.Status,
      Instansi: u.Instansi || "",
      Dibuat_Pada: u.Dibuat_Pada ? new Date(u.Dibuat_Pada).toISOString() : null,
      Login_Terakhir: u.Login_Terakhir ? new Date(u.Login_Terakhir).toISOString() : null,
      bisa_diubah: !isAdminRole_(u.Role)
    };
  });
  return { items: items, total: total, page: page, per_page: perPage, ringkasan: ringkasan };
}

function adminUpdateAnggota_(params) {
  var sess = requireAuth_(params);
  var id = sanitizeText_(params.user_id);
  var status = sanitizeText_(params.status);
  if (!id) throw new Error("Parameter user_id wajib diisi.");
  if (status !== "Aktif" && status !== "Nonaktif") throw new Error("Format status tidak valid (Aktif / Nonaktif).");
  var u = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", id);
  if (!u) throw new Error("Pengguna tidak ditemukan.");
  if (isAdminRole_(u.Role)) throw new Error("Akun administrator tidak dapat diubah dari menu ini.");
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", id, { Status: status });
  hapusCacheAktif_(id);
  if (status === "Nonaktif") hapusSesiUser_(id, null);
  logActivity_(sess, status === "Aktif" ? "mengaktifkan anggota" : "menonaktifkan anggota", "PENGGUNA", id, u.Email);
  return { user_id: id, status: status };
}

function adminResetPasswordAnggota_(params) {
  var sess = requireAuth_(params);
  var id = sanitizeText_(params.user_id);
  if (!id) throw new Error("Parameter user_id wajib diisi.");
  var u = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", id);
  if (!u) throw new Error("Pengguna tidak ditemukan.");
  if (isAdminRole_(u.Role)) throw new Error("Akun administrator tidak dapat diubah dari menu ini.");
  var sementara = acakString_(7, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz") + acakString_(3, "23456789");
  var salt = generateSalt_();
  updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", id, { Password_Hash: hashPassword_(sementara, salt), Salt: salt });
  hapusSesiUser_(id, null);
  logActivity_(sess, "mereset kata sandi anggota", "PENGGUNA", id, u.Email);
  return { user_id: id, email: u.Email, password_sementara: sementara };
}

/**
 * Tambah akun administrator baru. HANYA Super Admin yang boleh.
 * - Email belum terdaftar  -> buat akun baru + kata sandi sementara (tampil sekali).
 * - Email sudah terdaftar sebagai anggota -> dinaikkan menjadi admin
 *   (kata sandi lamanya tetap dipakai, tidak diubah).
 * - Email sudah terdaftar sebagai admin -> ditolak.
 */
function adminTambahAdmin_(params) {
  var sess = requireAuth_(params);
  ensureAnggotaSchema_();

  // Cek role Super Admin langsung dari sheet (bukan dari data sesi yang bisa usang)
  var pelaku = findRowById_(SCHEMA.PENGGUNA.name, "User_ID", sess.User_ID);
  if (!pelaku || pelaku.Status !== "Aktif" || pelaku.Role !== "Super Admin") {
    throw new Error("Hanya Super Admin yang dapat menambah administrator.");
  }

  var nama = sanitizeText_(params.nama);
  var email = sanitizeText_(params.email).toLowerCase();
  var role = sanitizeText_(params.role) || "Admin";
  if (!nama) throw new Error("Nama wajib diisi.");
  if (nama.length > 100) throw new Error("Nama terlalu panjang (maksimal 100 karakter).");
  if (!emailValid_(email)) throw new Error("Format email tidak valid.");
  if (!isAdminRole_(role)) throw new Error("Role tidak valid. Pilih: " + CONFIG.ADMIN_ROLES.join(", ") + ".");

  var ada = findRowById_(SCHEMA.PENGGUNA.name, "Email", email);
  if (ada) {
    if (isAdminRole_(ada.Role)) throw new Error("Email ini sudah terdaftar sebagai administrator.");
    updateRowById_(SCHEMA.PENGGUNA.name, "User_ID", ada.User_ID, { Role: role, Status: "Aktif" });
    hapusCacheAktif_(ada.User_ID);
    logActivity_(sess, "menaikkan anggota menjadi " + role, "PENGGUNA", ada.User_ID, email);
    return { user_id: ada.User_ID, email: email, nama: ada.Nama, role: role, dinaikkan: true, password_sementara: "" };
  }

  var sementara = acakString_(7, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz") + acakString_(3, "23456789");
  var salt = generateSalt_();
  var uid = generateId_("USR");
  appendRow_(SCHEMA.PENGGUNA.name, {
    User_ID: uid, Nama: nama, Email: email,
    Password_Hash: hashPassword_(sementara, salt), Salt: salt,
    Role: role, Status: "Aktif", Dibuat_Pada: new Date(), Login_Terakhir: "", Instansi: ""
  });
  logActivity_(sess, "menambah administrator (" + role + ")", "PENGGUNA", uid, email);
  return { user_id: uid, email: email, nama: nama, role: role, dinaikkan: false, password_sementara: sementara };
}


/* ############################################################
 * BAGIAN: Utils
 * ############################################################ */

/**
 * =====================================================================
 * Utils.gs — Helper bersama untuk backend Google Apps Script
 *
 * Berisi:
 *   - logActivity_        : tulis log ke sheet LOG_AKTIVITAS
 *   - logError_           : catat error (ke Logger, opsional ke sheet)
 *   - PropertiesService   : simpan konfigurasi aman
 *   - setConfig/getConfig : setter/getter untuk SPREADSHEET_ID dll
 * ===================================================================== */

/**
 * Catat aktivitas admin ke sheet LOG_AKTIVITAS.
 * @param {object} sess — session info dari requireAuth_
 * @param {string} aktivitas — deskripsi singkat, mis. "menambah koleksi"
 * @param {string} jenisData — "KOLEKSI" | "KATEGORI" | "AUTH" | "FILE" | "KONFIGURASI"
 * @param {string} idData — ID record yang disentuh
 * @param {string} keterangan — detail tambahan
 */
function logActivity_(sess, aktivitas, jenisData, idData, keterangan) {
  try {
    var data = {
      Log_ID: generateId_("LOG"),
      Waktu: new Date(),
      User_ID: (sess && sess.User_ID) || "SYSTEM",
      Nama_User: (sess && (sess.Nama || sess.nama)) || "SYSTEM",
      Email_User: (sess && (sess.Email || sess.email)) || "",
      Aktivitas: aktivitas || "",
      Jenis_Data: jenisData || "",
      ID_Data: idData || "",
      Keterangan: (keterangan || "").slice(0, 500) // batasi panjang
    };
    appendRow_(SCHEMA.LOG_AKTIVITAS.name, data);
  } catch (e) {
    // Logging gagal tidak boleh menggagalkan operasi utama
    Logger.log("WARN: logActivity_ gagal: " + e.message);
  }
}

/**
 * Catat error (untuk debugging). Saat ini hanya ke Logger.
 */
function logError_(action, err) {
  Logger.log("ERROR pada aksi '" + action + "': " + err.message + "\nStack: " + (err.stack || ""));
}

/**
 * Set konfigurasi via PropertiesService (lebih aman dari pada hardcode di Code.gs).
 * @param {string} key — 'SPREADSHEET_ID' | 'DRIVE_FOLDER_ID' | ...
 * @param {string} value
 */
function setConfig(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
  // Override CONFIG object di runtime
  if (key === "SPREADSHEET_ID") CONFIG.SPREADSHEET_ID = String(value);
  if (key === "DRIVE_FOLDER_ID") CONFIG.DRIVE_FOLDER_ID = String(value);
  Logger.log("Config '" + key + "' disimpan via PropertiesService.");
}

/**
 * Ambil konfigurasi dari PropertiesService.
 */
function getConfig(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Muat konfigurasi dari PropertiesService ke CONFIG object.
 * Jalankan sekali di routeAction bila CONFIG kosong.
 */
function loadConfigFromProperties_() {
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    if (props.SPREADSHEET_ID && !CONFIG.SPREADSHEET_ID) {
      CONFIG.SPREADSHEET_ID = props.SPREADSHEET_ID;
    }
    if (props.DRIVE_FOLDER_ID && !CONFIG.DRIVE_FOLDER_ID) {
      CONFIG.DRIVE_FOLDER_ID = props.DRIVE_FOLDER_ID;
    }
  } catch (e) {
    // PropertiesService belum di-set — abaikan
  }
}

/**
 * Trigger: jalankan setiap jam untuk bersihkan sesi kedaluwarsa & log lama.
 * Pasang via editor: Triggers > Add Trigger > cleanExpiredSessions_ > time-driven > hourly.
 */
function onHourlyTrigger_() {
  try { cleanExpiredSessions_(); } catch (e) { Logger.log("GC sessions gagal: " + e.message); }
  // Log retention: hapus log lebih dari 6 bulan
  try { cleanOldLogs_(6); } catch (e) { Logger.log("GC log gagal: " + e.message); }
}

/**
 * Bersihkan log lebih dari N bulan.
 */
function cleanOldLogs_(monthsToKeep) {
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (monthsToKeep || 6));
  var sheet = getSpreadsheet_().getSheetByName(SCHEMA.LOG_AKTIVITAS.name);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var times = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Waktu di kolom 2
  var toDelete = [];
  for (var i = 0; i < times.length; i++) {
    var d = new Date(times[i][0]);
    if (isNaN(d.getTime())) continue;
    if (d < cutoff) toDelete.push(i + 2);
  }
  // Hapus dari bawah ke atas untuk menjaga nomor baris
  toDelete.reverse().forEach(function(rowIdx) { sheet.deleteRow(rowIdx); });
  Logger.log("Bersihkan " + toDelete.length + " log lama (> " + monthsToKeep + " bulan).");
}

/**
 * Helper: jalankan pengujian internal — panggil dari editor.
 * function runSelfTest() {
 *   var result = [];
 *   result.push("1. Inisialisasi DB: " + (initializeDatabase() ? "OK" : "GAGAL"));
 *   result.push("2. Test statistik: " + JSON.stringify(getStatistikBeranda_({})));
 *   result.push("3. Test kategori list: " + getKategoriList_({}).kategori.length + " kategori");
 *   Logger.log(result.join("\n"));
 * }
 */


/* ############################################################
 * BAGIAN: Setup
 * ############################################################ */

/**
 * =====================================================================
 * Setup.gs — Pemasangan otomatis Google Sheets + Google Drive
 *
 * Cukup jalankan SATU fungsi dari editor Apps Script:
 *
 *     setupOtomatis
 *
 * Fungsi ini akan:
 *   1. Membuat Google Spreadsheet "Database Perpustakaan Digital NTT"
 *      (atau memakai yang sudah ada bila ID-nya sudah tersimpan)
 *   2. Membuat folder Google Drive untuk dokumen PDF
 *   3. Menyimpan kedua ID ke Script Properties (tanpa edit kode)
 *   4. Membuat semua sheet, header, kategori default, dan akun admin awal
 *   5. Memasang dropdown, validasi, dan pewarnaan status di Sheets
 *      sehingga data juga nyaman diedit langsung di Google Sheets
 *
 * Fungsi pendukung (jalankan manual bila perlu):
 *   - isiDataContoh()     : tambah 6 koleksi contoh berlabel [CONTOH]
 *   - terapkanValidasiSheet() : pasang ulang dropdown & pewarnaan
 *   - cekKoneksi()        : tes baca semua sheet + tampilkan URL penting
 * ===================================================================== */

function setupOtomatis() {
  loadConfigFromProperties_();
  var log = [];

  // 1. Spreadsheet
  var ss = null;
  if (CONFIG.SPREADSHEET_ID) {
    try { ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); log.push("✓ Memakai spreadsheet yang sudah ada."); }
    catch (e) { log.push("⚠ SPREADSHEET_ID tersimpan tidak bisa dibuka — membuat yang baru."); }
  }
  var baru = false;
  if (!ss) {
    ss = SpreadsheetApp.create("Database Perpustakaan Digital NTT");
    setConfig("SPREADSHEET_ID", ss.getId());
    baru = true;
    log.push("✓ Spreadsheet baru dibuat.");
  }

  // 2. Folder Drive
  var folder = null;
  if (CONFIG.DRIVE_FOLDER_ID) {
    try { folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID); log.push("✓ Memakai folder Drive yang sudah ada."); }
    catch (e) { log.push("⚠ DRIVE_FOLDER_ID tersimpan tidak bisa dibuka — membuat yang baru."); }
  }
  if (!folder) {
    folder = DriveApp.createFolder("Perpustakaan Digital NTT — Dokumen");
    setConfig("DRIVE_FOLDER_ID", folder.getId());
    log.push("✓ Folder Drive baru dibuat.");
  }

  // 3. Sheet, header, seed
  initializeDatabase({ skipBackup: baru });

  // 4. Rapikan: hapus sheet bawaan kosong
  ss.getSheets().forEach(function(sh) {
    var nm = sh.getName();
    if ((nm === "Sheet1" || nm === "Lembar1" || nm === "Sheet 1") &&
        sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  // 5. Dropdown & pewarnaan
  terapkanValidasiSheet();
  log.push("✓ Dropdown dan pewarnaan status dipasang.");

  log.push("");
  log.push("Spreadsheet : " + ss.getUrl());
  log.push("Folder Drive: " + folder.getUrl());
  log.push("");
  log.push("Login admin awal → email: " + (Session.getActiveUser().getEmail() || "admin@nttprov.go.id") +
           " | kata sandi: AdminNTT2024!  (GANTI SEGERA setelah login pertama)");
  log.push("");
  log.push("Pengguna biasa dapat mendaftar sendiri di halaman Daftar (role Anggota).");
  log.push("Langkah berikutnya: Deploy > New deployment > Web app, lalu tempel URL /exec ke assets/js/config.js (API_URL).");
  Logger.log(log.join("\n"));
  return log.join("\n");
}

/** Tambah koleksi contoh agar situs tidak kosong saat uji coba. Aman dijalankan berkali-kali. */
function isiDataContoh() {
  loadConfigFromProperties_();
  var ada = getSheetRows_(SCHEMA.KOLEKSI.name).filter(function(k) { return String(k.Judul).indexOf("[CONTOH]") === 0; });
  if (ada.length) { Logger.log("Data contoh sudah ada (" + ada.length + "). Dilewati."); return "Sudah ada"; }

  var now = new Date();
  var contoh = [
    ["[CONTOH] Kajian Potensi Pariwisata Berbasis Komunitas", "Tim Contoh", 2023, "Data contoh", "pariwisata", "Laporan Penelitian", "Dokumen contoh untuk menguji tampilan dan integrasi Google Sheets.", "pariwisata, komunitas", "Terbit", "Publik", "Y", 1],
    ["[CONTOH] Strategi Ketahanan Pangan Lahan Kering", "Tim Contoh", 2022, "Data contoh", "pertanian-peternakan", "Jurnal", "Dokumen contoh untuk menguji kartu koleksi dan pencarian.", "pangan, lahan kering", "Terbit", "Publik", "Y", 2],
    ["[CONTOH] Dokumentasi Tenun Ikat dan Makna Motifnya", "Tim Contoh", 2021, "Data contoh", "sosial-budaya", "Buku", "Dokumen contoh bertema budaya untuk menguji filter kategori.", "tenun, budaya", "Terbit", "Publik", "Y", 3],
    ["[CONTOH] Ringkasan Kebijakan Pembangunan Daerah", "Tim Contoh", 2024, "Data contoh", "kebijakan-publik", "Laporan Kebijakan", "Dokumen contoh dengan akses internal.", "kebijakan, perencanaan", "Terbit", "Internal", "N", 0],
    ["[CONTOH] Profil Perikanan Pesisir", "Tim Contoh", 2020, "Data contoh", "kelautan-perikanan", "Laporan Penelitian", "Dokumen contoh bertema kelautan.", "perikanan, pesisir", "Terbit", "Publik", "N", 0],
    ["[CONTOH] Draf Naskah Inovasi Daerah", "Tim Contoh", 2025, "Data contoh", "inovasi-daerah", "Dokumen Daerah", "Dokumen contoh berstatus Draft (tidak tampil di publik).", "inovasi", "Draft", "Privat", "N", 0],
  ];
  contoh.forEach(function(c, i) {
    appendRow_(SCHEMA.KOLEKSI.name, {
      ID_Koleksi: generateId_("KOL"),
      Judul: c[0], Penulis: c[1], Tahun: c[2], Penerbit: c[3],
      Kategori_ID: c[4], Jenis_Dokumen: c[5], Abstrak: c[6], Kata_Kunci: c[7],
      ISBN_Nomor_Dokumen: "", File_ID_Drive: "", URL_Dokumen: "", URL_Sampul: "",
      Status_Publikasi: c[8], Status_Akses: c[9],
      Tanggal_Unggah: new Date(now.getTime() - i * 86400000),
      Diubah_Pada: now, Diubah_Oleh: "setup",
      Unggulan: c[10], Urutan_Unggulan: c[11]
    });
  });
  Logger.log("6 koleksi contoh ditambahkan. Hapus baris berlabel [CONTOH] bila sudah tidak diperlukan.");
  return "OK";
}

/** Pasang dropdown, validasi, dan pewarnaan status pada sheet. */
function terapkanValidasiSheet() {
  loadConfigFromProperties_();
  var ss = getSpreadsheet_();
  ensureSheet_(SCHEMA.PESAN_KONTAK);
  ensureAnggotaSchema_();

  var jenis = ["Buku", "Jurnal", "Laporan Penelitian", "Laporan Kebijakan", "Skripsi/Tesis",
               "Prosiding", "E-Book", "Dokumen Daerah", "Lainnya"];

  // KOLEKSI
  var kol = ss.getSheetByName(SCHEMA.KOLEKSI.name);
  var kat = ss.getSheetByName(SCHEMA.KATEGORI.name);
  if (kol) {
    dropdown_(kol, "Status_Publikasi", ["Draft", "Terbit", "Arsip"]);
    dropdown_(kol, "Status_Akses", ["Publik", "Internal", "Privat"]);
    dropdown_(kol, "Unggulan", ["Y", "N"]);
    dropdown_(kol, "Jenis_Dokumen", jenis);
    if (kat) {
      var colKat = kolom_(kat, "Kategori_ID");
      var colK = kolom_(kol, "Kategori_ID");
      if (colKat && colK) {
        var rule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(kat.getRange(2, colKat, 500, 1), true)
          .setAllowInvalid(false)
          .setHelpText("Pilih Kategori_ID yang ada di sheet KATEGORI.").build();
        kol.getRange(2, colK, 2000, 1).setDataValidation(rule);
      }
    }
    warna_(kol, "Status_Publikasi", { "Terbit": "#dcfce7", "Draft": "#e2e8f0", "Arsip": "#fef3c7" });
    warna_(kol, "Status_Akses", { "Publik": "#dbeafe", "Internal": "#fef3c7", "Privat": "#fee2e2" });
  }
  // KATEGORI
  if (kat) {
    dropdown_(kat, "Status", ["Aktif", "Nonaktif"]);
    warna_(kat, "Status", { "Aktif": "#dcfce7", "Nonaktif": "#e2e8f0" });
  }
  // PESAN_KONTAK
  var psn = ss.getSheetByName(SCHEMA.PESAN_KONTAK.name);
  if (psn) {
    dropdown_(psn, "Status", ["Baru", "Dibaca", "Selesai"]);
    warna_(psn, "Status", { "Baru": "#fee2e2", "Dibaca": "#fef3c7", "Selesai": "#dcfce7" });
  }
  // PENGGUNA
  var usr = ss.getSheetByName(SCHEMA.PENGGUNA.name);
  if (usr) {
    dropdown_(usr, "Status", ["Aktif", "Nonaktif"]);
    dropdown_(usr, "Role", ["Super Admin", "Admin", "Editor", "Pustakawan", "Anggota"]);
    warna_(usr, "Status", { "Aktif": "#dcfce7", "Nonaktif": "#e2e8f0" });
  }

  return "OK";
}

/** Tes koneksi: baca semua sheet & tampilkan jumlah baris + URL penting. */
function cekKoneksi() {
  loadConfigFromProperties_();
  var out = [];
  var ss = getSpreadsheet_();
  out.push("Spreadsheet: " + ss.getUrl());
  Object.keys(SCHEMA).forEach(function(k) {
    var nm = SCHEMA[k].name;
    try { out.push("✓ " + nm + ": " + getSheetRows_(nm).length + " baris"); }
    catch (e) { out.push("✗ " + nm + ": " + e.message); }
  });
  out.push(CONFIG.DRIVE_FOLDER_ID ? "✓ Folder Drive: " + DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getUrl() : "✗ DRIVE_FOLDER_ID belum diisi");
  try { out.push("URL Web App : " + ScriptApp.getService().getUrl()); } catch (e) {}
  Logger.log(out.join("\n"));
  return out.join("\n");
}

/* ===================== HELPER ===================== */

function kolom_(sheet, header) {
  if (sheet.getLastColumn() < 1) return 0;
  var h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var i = h.indexOf(header);
  return i === -1 ? 0 : i + 1;
}

function dropdown_(sheet, header, daftar) {
  var c = kolom_(sheet, header);
  if (!c) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(daftar, true).setAllowInvalid(false).build();
  sheet.getRange(2, c, 2000, 1).setDataValidation(rule);
}

function warna_(sheet, header, peta) {
  var c = kolom_(sheet, header);
  if (!c) return;
  var range = sheet.getRange(2, c, 2000, 1);
  // Hapus aturan lama pada kolom yang sama agar tidak menumpuk saat dijalankan ulang
  var rules = sheet.getConditionalFormatRules().filter(function(r) {
    return !r.getRanges().some(function(g) { return g.getColumn() === c && g.getRow() === 2; });
  });
  Object.keys(peta).forEach(function(teks) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(teks).setBackground(peta[teks]).setRanges([range]).build());
  });
  sheet.setConditionalFormatRules(rules);
}
