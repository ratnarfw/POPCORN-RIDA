/* =====================================================================
 * koleksi.js — Halaman daftar koleksi + pencarian + filter + pagination
 * ===================================================================== */

(function () {
  "use strict";

  const U = window.PUtils;
  const cfg = window.APP_CONFIG;

  const state = {
    q: U.getQueryParam("q") || "",
    kategori: U.getQueryParam("kategori") || U.getQueryParam("k") || "",
    jenis: U.getQueryParam("jenis") || U.getQueryParam("type") || "",
    tahun: U.getQueryParam("tahun") || "",
    akses: U.getQueryParam("akses") || "",
    sort: "terbaru",
    page: parseInt(U.getQueryParam("page"), 10) || 1,
    perPage: cfg.ITEMS_PER_PAGE || 12,
    total: 0,
    loading: false,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    U.mountChrome("koleksi");

    // Prefill form dari query string
    document.getElementById("filter-q").value = state.q;
    document.getElementById("sort-select").value = state.sort;

    // Tombol filter
    document.getElementById("btn-apply-filter").addEventListener("click", applyFilter);
    document.getElementById("btn-reset-filter").addEventListener("click", resetFilter);
    document.getElementById("sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.page = 1;
      loadKoleksi();
    });

    // Submit form dengan Enter
    document.getElementById("filter-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyFilter();
    });

    // Debounce live search
    document.getElementById("filter-q").addEventListener("input", U.debounce(() => {
      state.q = document.getElementById("filter-q").value.trim();
      state.page = 1;
      loadKoleksi();
    }, 500));

    // Muat dropdown kategori & tahun
    await Promise.allSettled([loadKategoriDropdown(), loadTahunDropdown()]);

    // Setelah dropdown terisi, apply filter awal
    if (state.kategori) document.getElementById("filter-kategori").value = state.kategori;
    if (state.jenis)    document.getElementById("filter-jenis").value = state.jenis;
    if (state.tahun)    document.getElementById("filter-tahun").value = state.tahun;
    if (state.akses)    document.getElementById("filter-akses").value = state.akses;

    // Auto-submit jika ada query q dari hero
    loadKoleksi();
  }

  async function loadKategoriDropdown() {
    const sel = document.getElementById("filter-kategori");
    try {
      const data = await U.apiCall("getKategoriList", {}, "GET");
      const list = data.kategori || data || [];
      list.forEach(k => {
        const opt = document.createElement("option");
        opt.value = k.Kategori_ID;
        opt.textContent = k.Nama_Kategori + (k.jumlah !== undefined ? ` (${k.jumlah})` : "");
        sel.appendChild(opt);
      });
    } catch (e) { console.warn("Kategori dropdown gagal:", e); }
  }

  async function loadTahunDropdown() {
    const sel = document.getElementById("filter-tahun");
    try {
      const data = await U.apiCall("getTahunList", {}, "GET");
      const list = data.tahun || data || [];
      list.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });
    } catch (e) { console.warn("Tahun dropdown gagal:", e); }
  }

  function applyFilter() {
    state.q = document.getElementById("filter-q").value.trim();
    state.kategori = document.getElementById("filter-kategori").value;
    state.jenis = document.getElementById("filter-jenis").value;
    state.tahun = document.getElementById("filter-tahun").value;
    state.akses = document.getElementById("filter-akses").value;
    state.page = 1;
    U.updateUrlQuery({
      q: state.q, kategori: state.kategori, jenis: state.jenis,
      tahun: state.tahun, akses: state.akses, page: state.page
    });
    loadKoleksi();
  }

  function resetFilter() {
    document.getElementById("filter-form").reset();
    state.q = ""; state.kategori = ""; state.jenis = "";
    state.tahun = ""; state.akses = ""; state.page = 1;
    state.sort = "terbaru";
    document.getElementById("sort-select").value = "terbaru";
    U.updateUrlQuery({ q:"", kategori:"", jenis:"", tahun:"", akses:"", page:"", sort:"" });
    loadKoleksi();
  }

  async function loadKoleksi() {
    if (state.loading) return;
    state.loading = true;
    const grid = document.getElementById("koleksi-grid");
    const info = document.getElementById("results-info");
    info.textContent = "Memuat koleksi…";
    grid.innerHTML = U.skeletonCards(8);
    document.getElementById("pagination").innerHTML = "";

    try {
      const params = {
        q: state.q,
        kategori_id: state.kategori || null,
        jenis_dokumen: state.jenis || null,
        tahun: state.tahun || null,
        akses: state.akses || null,
        sort: state.sort,
        page: state.page,
        per_page: state.perPage,
      };
      const data = await U.apiCall("getKoleksiList", params, "POST");
      const list = data.koleksi || data.items || data || [];
      state.total = (data.total !== undefined) ? data.total : list.length;

      if (!list.length) {
        grid.innerHTML = emptyState();
        info.textContent = "Tidak ada koleksi yang cocok dengan filter Anda.";
        return;
      }
      grid.innerHTML = list.map(k => U.koleksiCardHtml(k)).join("");
      U.syncFavButtons(grid);
      info.innerHTML = `Menampilkan <strong>${list.length}</strong> dari <strong>${U.formatAngka(state.total)}</strong> koleksi`;
      renderPagination();
    } catch (err) {
      console.error("Gagal memuat koleksi:", err);
      grid.innerHTML = emptyState(true, err.message);
      info.textContent = "Gagal memuat data.";
    } finally {
      state.loading = false;
    }
  }

  function renderPagination() {
    const pages = Math.ceil(state.total / state.perPage);
    if (pages <= 1) return;
    const p = document.getElementById("pagination");
    const cur = state.page;
    const range = 2;
    const buttons = [];
    buttons.push(`<button ${cur === 1 ? "disabled" : ""} data-page="prev" aria-label="Halaman sebelumnya">‹</button>`);
    if (cur - range > 1) buttons.push(`<button data-page="1">1</button><span style="padding:0 4px;color:var(--c-text-muted);align-self:center;">…</span>`);
    for (let i = Math.max(1, cur - range); i <= Math.min(pages, cur + range); i++) {
      buttons.push(`<button data-page="${i}" class="${i === cur ? "active" : ""}">${i}</button>`);
    }
    if (cur + range < pages) buttons.push(`<span style="padding:0 4px;color:var(--c-text-muted);align-self:center;">…</span><button data-page="${pages}">${pages}</button>`);
    buttons.push(`<button ${cur === pages ? "disabled" : ""} data-page="next" aria-label="Halaman berikutnya">›</button>`);
    p.innerHTML = buttons.join("");
    p.querySelectorAll("button[data-page]").forEach(b => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-page");
        if (v === "prev") state.page = Math.max(1, cur - 1);
        else if (v === "next") state.page = Math.min(pages, cur + 1);
        else state.page = parseInt(v, 10);
        U.updateUrlQuery({ page: state.page > 1 ? String(state.page) : "" });
        loadKoleksi();
        window.scrollTo({ top: 200, behavior: "smooth" });
      });
    });
  }

  function emptyState(error = false, msg = "") {
    if (error) {
      return `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
          <h3>Gagal Memuat Koleksi</h3>
          <p>${U.escapeHtml(msg || "Terjadi kesalahan saat menghubungi server.")}</p>
          <button class="btn btn-primary btn-sm" onclick="location.reload()">Coba Lagi</button>
        </div>`;
    }
    return `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
        <h3>Koleksi Tidak Ditemukan</h3>
        <p>Coba ubah kata kunci atau hapus beberapa filter untuk mendapatkan lebih banyak hasil.</p>
        <button class="btn btn-primary btn-sm" id="empty-reset">Reset Filter</button>
      </div>`;
  }
})();
