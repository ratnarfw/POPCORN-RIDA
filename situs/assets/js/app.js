/* =====================================================================
 * app.js — Logika halaman beranda (index.html)
 * Memuat: statistik, koleksi terbaru, kategori populer, publikasi pilihan
 * ===================================================================== */

(function () {
  "use strict";

  const U = window.PUtils;
  const cfg = window.APP_CONFIG;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    // Render header & footer bersama
    U.mountChrome("beranda");

    // Sapaan personal & blok ajakan daftar hanya untuk tamu
    const user = U.Auth.user();
    if (user) {
      const t = document.getElementById("hero-eyebrow-text");
      if (t) t.textContent = "Selamat datang kembali, " + (user.nama || "Sahabat").split(" ")[0];
    }
    document.querySelectorAll("[data-guest-only]").forEach(el => { el.hidden = !!user; });

    // Pencarian hero
    const heroForm = document.getElementById("hero-search-form");
    if (heroForm) {
      heroForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = document.getElementById("hero-search-input").value.trim();
        const url = "koleksi.html" + (q ? "?q=" + encodeURIComponent(q) : "");
        window.location.href = url;
      });
    }

    // Render placeholder skeleton
    renderKoleksiSkeleton();
    renderKategoriSkeleton();
    renderFeaturedSkeleton();
    renderStatsSkeleton();

    // Ambil data beranda secara paralel
    await Promise.allSettled([
      loadStats(),
      loadKoleksiTerbaru(),
      loadKategoriPopuler(),
      loadPublikasiPilihan(),
    ]);
  }

  /* ---------- STATISTIK ---------- */
  function renderStatsSkeleton() {
    const grid = document.getElementById("stats-grid");
    if (!grid) return;
    const items = [
      { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', label: "Total Koleksi Digital" },
      { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', label: "Total Kategori" },
      { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>', label: "Publikasi Riset" },
      { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>', label: "Dokumen Akses Publik" },
    ];
    grid.innerHTML = items.map(() => `
      <div class="stat-card">
        <div class="stat-ico"><span class="skeleton" style="width:52px;height:52px;border-radius:10px;"></span></div>
        <div class="stat-num skeleton" style="width:70%;height:32px;margin:10px auto 6px;"></div>
        <div class="stat-lbl skeleton" style="width:50%;height:14px;margin:0 auto;"></div>
      </div>`).join("");
  }

  async function loadStats() {
    try {
      const data = await U.apiCall("getStatistikBeranda", {}, "GET");
      const grid = document.getElementById("stats-grid");
      const items = [
        { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', num: U.formatAngka(data.total_koleksi), lbl: "Total Koleksi Digital" },
        { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', num: U.formatAngka(data.total_kategori), lbl: "Total Kategori" },
        { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>', num: U.formatAngka(data.total_publikasi), lbl: "Publikasi Riset" },
        { ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>', num: U.formatAngka(data.total_publik), lbl: "Dokumen Akses Publik" },
      ];
      grid.innerHTML = items.map(it => `
        <div class="stat-card">
          <div class="stat-ico">${it.ico}</div>
          <div class="stat-num">${U.escapeHtml(it.num)}</div>
          <div class="stat-lbl">${U.escapeHtml(it.lbl)}</div>
        </div>`).join("");

      // Update pita statistik hero
      const strip = document.getElementById("hero-stats-strip");
      if (strip) {
        strip.querySelector('[data-stat="total_koleksi"]').textContent = U.formatAngka(data.total_koleksi);
        strip.querySelector('[data-stat="total_kategori"]').textContent = U.formatAngka(data.total_kategori);
        strip.querySelector('[data-stat="total_publikasi"]').textContent = U.formatAngka(data.total_publikasi);
        strip.querySelector('[data-stat="total_publik"]').textContent = U.formatAngka(data.total_publik);
      }
    } catch (err) {
      console.warn("Gagal memuat statistik:", err);
      const grid = document.getElementById("stats-grid");
      grid.innerHTML = `
        <div class="stat-card" style="grid-column:1/-1;">
          <p class="text-muted text-center">Data statistik belum tersedia. ${U.escapeHtml(err.message || "Backend tidak terjangkau.")}</p>
        </div>`;
      // Hero strip tetap pakai tanda strip placeholder
      document.querySelectorAll('#hero-stats-strip .hs-num').forEach(el => el.textContent = "0");
    }
  }

  /* ---------- KOLEKSI TERBARU ---------- */
  function renderKoleksiSkeleton() {
    const grid = document.getElementById("koleksi-terbaru-grid");
    if (grid) grid.innerHTML = U.skeletonCards(4);
  }

  async function loadKoleksiTerbaru() {
    const grid = document.getElementById("koleksi-terbaru-grid");
    try {
      const data = await U.apiCall("getKoleksiTerbaru", { limit: cfg.RECENT_KOLEKSI_COUNT || 8 }, "GET");
      const list = data.koleksi || data || [];
      if (!list.length) {
        grid.innerHTML = emptyState("Belum ada koleksi terbaru", "Administrator sedang menyiapkan koleksi pertama. Silakan kembali nanti.");
        return;
      }
      grid.innerHTML = list.map(k => U.koleksiCardHtml(k)).join("");
      U.syncFavButtons(grid);
    } catch (err) {
      console.warn("Gagal memuat koleksi terbaru:", err);
      grid.innerHTML = emptyState("Koleksi tidak dapat dimuat", err.message || "Terjadi kesalahan saat memuat data.");
    }
  }


  /* ---------- KATEGORI POPULER ---------- */
  function renderKategoriSkeleton() {
    const grid = document.getElementById("kategori-grid");
    if (grid) {
      grid.innerHTML = Array.from({length: 6}).map(() => `
        <div class="kategori-card skeleton-card">
          <div class="sk-cover skeleton" style="width:56px;height:56px;border-radius:10px;"></div>
          <div class="kat-body"><div class="sk-line long skeleton" style="margin-bottom:4px;"></div><div class="sk-line short skeleton" style="height:10px;"></div></div>
        </div>`).join("");
    }
  }

  async function loadKategoriPopuler() {
    const grid = document.getElementById("kategori-grid");
    try {
      const data = await U.apiCall("getKategoriPopuler", {}, "GET");
      const list = data.kategori || data || [];
      if (!list.length) {
        grid.innerHTML = emptyState("Belum ada kategori", "Administrator belum menambah kategori apa pun.");
        return;
      }
      grid.innerHTML = list.map(k => `
        <a href="kategori.html?k=${U.escapeAttr(k.Kategori_ID)}" class="kategori-card">
          <span class="kat-ico">${kategoriIcon(k.Nama_Kategori)}</span>
          <span class="kat-body">
            <h3>${U.escapeHtml(k.Nama_Kategori)}</h3>
            <p>${U.escapeHtml(U.truncate(k.Deskripsi || (k.jumlah ? k.jumlah + " dokumen" : "Telusuri koleksi"), 80))}</p>
          </span>
        </a>`).join("");
    } catch (err) {
      console.warn("Gagal memuat kategori:", err);
      grid.innerHTML = emptyState("Kategori tidak dapat dimuat", err.message);
    }
  }

  function kategoriIcon(nama) {
    const n = (nama || "").toLowerCase();
    const map = [
      { kw: ["penelitian","riset","penelitian dan pengembangan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/></svg>' },
      { kw: ["inovasi"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z"/></svg>' },
      { kw: ["sosial","budaya","sosial dan budaya"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>' },
      { kw: ["ekonomi","pembangunan","ekonomi dan pembangunan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 3 3 5-5"/></svg>' },
      { kw: ["pendidikan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/></svg>' },
      { kw: ["pertanian","peternakan","pertanian dan peternakan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M5 8l7 4 7-4M12 12v10M5 8c0 6 3 10 7 10s7-4 7-10"/></svg>' },
      { kw: ["kelautan","perikanan","kelautan dan perikanan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 6c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>' },
      { kw: ["pariwisata","wisata"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' },
      { kw: ["lingkungan","kehutanan","lingkungan dan kehutanan"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l-5 9h3l-4 7h12l-4-7h3z"/></svg>' },
      { kw: ["kebijakan","publik","kebijakan publik"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>' },
      { kw: ["statistik","statistik daerah"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16V10M12 16V6M17 16v-4"/></svg>' },
      { kw: ["buku","jurnal","buku dan jurnal"], ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>' },
    ];
    for (const m of map) {
      if (m.kw.some(k => n.includes(k))) return m.ico;
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>';
  }

  /* ---------- PUBLIKASI PILIHAN ---------- */
  function renderFeaturedSkeleton() {
    const grid = document.getElementById("featured-list");
    if (grid) grid.innerHTML = Array.from({length:3}).map(() => `
      <div class="featured-item skeleton-card" style="min-height:280px;">
        <div class="sk-cover skeleton" style="position:absolute;inset:0;"></div>
      </div>`).join("");
  }

  async function loadPublikasiPilihan() {
    const grid = document.getElementById("featured-list");
    try {
      const data = await U.apiCall("getPublikasiPilihan", { limit: cfg.FEATURED_COUNT || 5 }, "GET");
      const list = data.koleksi || data || [];
      if (!list.length) {
        grid.innerHTML = emptyState("Belum ada publikasi pilihan", "Tim perpustakaan belum menandai publikasi unggulan.");
        return;
      }
      grid.innerHTML = list.map((k, i) => {
        const cover = k.URL_Sampul
          ? `<div class="fi-bg"><img src="${U.escapeAttr(U.sanitizeUrl(k.URL_Sampul))}" alt="" onerror="this.parentElement.style.background='linear-gradient(135deg,#2f5d50,#8f3f22)';"/></div>`
          : `<div class="fi-bg" style="background:linear-gradient(135deg,#2f5d50,#8f3f22);"></div>`;
        return `
          <a href="detail.html?id=${U.escapeAttr(k.ID_Koleksi)}" class="featured-item">
            ${cover}
            <div class="fi-body">
              <div class="fi-cat">${U.escapeHtml(k.Nama_Kategori || "Publikasi")}</div>
              <h3 class="fi-title">${U.escapeHtml(U.truncate(k.Judul, 110))}</h3>
              <p class="fi-meta">${U.escapeHtml(k.Penulis || "Tim Penulis")} · ${U.escapeHtml(k.Tahun || "—")} · ${U.escapeHtml(k.Jenis_Dokumen || "Publikasi")}</p>
            </div>
          </a>`;
      }).join("");
    } catch (err) {
      console.warn("Gagal memuat publikasi pilihan:", err);
      grid.innerHTML = emptyState("Publikasi pilihan tidak dapat dimuat", err.message);
    }
  }

  function emptyState(title, msg) {
    return `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
        <h3>${U.escapeHtml(title)}</h3>
        <p>${U.escapeHtml(msg)}</p>
        <a href="koleksi.html" class="btn btn-primary btn-sm">Jelajahi koleksi</a>
      </div>`;
  }

})();
