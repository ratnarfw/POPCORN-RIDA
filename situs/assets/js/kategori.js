/* =====================================================================
 * kategori.js — Halaman daftar kategori + koleksi per kategori
 * ===================================================================== */

(function () {
  "use strict";
  const U = window.PUtils;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    U.mountChrome("kategori");

    const kategoriId = U.getQueryParam("k");
    if (kategoriId) {
      // Tampilkan koleksi untuk kategori tertentu
      document.getElementById("bc-current").textContent = "Kategori";
      await renderKoleksiByKategori(kategoriId);
    } else {
      // Tampilkan semua kategori
      await renderKategoriList();
    }
  }

  async function renderKategoriList() {
    const wrap = document.getElementById("kategori-content");
    wrap.innerHTML = `
      <div class="section-header" style="margin-bottom:24px;">
        <h2>Semua Kategori Koleksi</h2>
        <p>Pilih kategori berikut untuk menelusuri dokumen yang telah dikelompokkan berdasarkan tema pengetahuan daerah NTT.</p>
      </div>
      <div class="kategori-grid" id="kategori-grid">${skeletonKategori(6)}</div>`;

    try {
      const data = await U.apiCall("getKategoriList", {}, "GET");
      const list = data.kategori || data || [];
      if (!list.length) {
        document.getElementById("kategori-grid").innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
            <h3>Belum Ada Kategori</h3>
            <p>Administrator belum menambahkan kategori apa pun. Silakan kembali nanti.</p>
          </div>`;
        return;
      }
      const icons = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 00-4 12.74V17h8v-2.26A7 7 0 0012 2z"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 3 3 5-5"/></svg>',
      ];
      document.getElementById("kategori-grid").innerHTML = list.map((k, i) => `
        <a href="kategori.html?k=${U.escapeAttr(k.Kategori_ID)}" class="kategori-card">
          <span class="kat-ico">${icons[i % icons.length]}</span>
          <span class="kat-body">
            <h3>${U.escapeHtml(k.Nama_Kategori)}</h3>
            <p>${U.escapeHtml(U.truncate(k.Deskripsi || "Telusuri koleksi pada kategori ini.", 80))}${k.jumlah !== undefined ? ` · ${k.jumlah} dokumen` : ""}</p>
          </span>
        </a>`).join("");
    } catch (err) {
      document.getElementById("kategori-grid").innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
            <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
          <h3>Gagal Memuat Kategori</h3>
          <p>${U.escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  function skeletonKategori(n) {
    return Array.from({length:n}).map(() => `
      <div class="kategori-card skeleton-card">
        <div class="sk-cover skeleton" style="width:56px;height:56px;border-radius:10px;"></div>
        <div class="kat-body">
          <div class="sk-line long skeleton" style="margin-bottom:4px;"></div>
          <div class="sk-line short skeleton" style="height:10px;"></div>
        </div>
      </div>`).join("");
  }

  async function renderKoleksiByKategori(kategoriId) {
    const wrap = document.getElementById("kategori-content");
    wrap.innerHTML = `
      <div class="section-header" style="margin-bottom:24px;">
        <span class="eyebrow">Kategori</span>
        <h2 id="kategori-title">Memuat kategori…</h2>
        <p id="kategori-desc">Mengambil informasi kategori…</p>
      </div>
      <div class="koleksi-grid" id="koleksi-grid">${U.skeletonCards(4)}</div>
      <div class="pagination" id="pagination"></div>`;

    try {
      const data = await U.apiCall("getKoleksiByKategori", { kategori_id: kategoriId, page: 1, per_page: 24 }, "POST");
      const kategori = data.kategori || {};
      const list = data.koleksi || data.items || data || [];
      document.getElementById("kategori-title").textContent = kategori.Nama_Kategori || "Kategori";
      document.getElementById("kategori-desc").textContent = kategori.Deskripsi || `Menampilkan ${list.length} dokumen pada kategori ini.`;
      document.getElementById("bc-current").innerHTML = `<a href="kategori.html">Kategori</a> <span style="margin:0 4px;color:var(--c-border-strong);">/</span> ${U.escapeHtml(kategori.Nama_Kategori || "")}`;
      if (!list.length) {
        document.getElementById("koleksi-grid").innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
            <h3>Belum Ada Koleksi pada Kategori Ini</h3>
            <p>Administrator sedang menyiapkan koleksi pada kategori ini.</p>
            <a href="kategori.html" class="btn btn-primary btn-sm">Lihat Semua Kategori</a>
          </div>`;
        return;
      }
      const gridEl = document.getElementById("koleksi-grid");
      gridEl.innerHTML = list.map(k => U.koleksiCardHtml(k)).join("");
      U.syncFavButtons(gridEl);
    } catch (err) {
      document.getElementById("koleksi-grid").innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
            <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
          <h3>Gagal Memuat Koleksi</h3>
          <p>${U.escapeHtml(err.message)}</p>
          <a href="kategori.html" class="btn btn-primary btn-sm">Lihat Semua Kategori</a>
        </div>`;
    }
  }
})();
