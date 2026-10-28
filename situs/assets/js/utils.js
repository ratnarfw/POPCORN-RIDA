/* =====================================================================
 * utils.js — Helper bersama untuk seluruh halaman frontend
 * Berisi: API client, sanitasi XSS, format, toast, skeleton, dll.
 * ===================================================================== */

(function (global) {
  "use strict";

  /* ---------- 1. API client ---------- */
  // Melakukan request ke Google Apps Script Web App.
  // Apps Script tidak mendukung POST body JSON secara default pada fetch
  // dengan cross-origin, jadi kita kirim via text/plain agar tidak
  // memicu preflight CORS. Server membaca e.postData.contents.
  async function apiCall(action, params = {}, method = "POST") {
    const cfg = global.APP_CONFIG || {};
    const baseUrl = cfg.API_URL;
    if (!baseUrl || baseUrl.indexOf("PASTE_URL") === 0) {
      throw new ApiError(
        "Backend belum dikonfigurasi. Isi APP_CONFIG.API_URL pada assets/js/config.js. Lihat PANDUAN_DEPLOY.md langkah 9.",
        "NOT_CONFIGURED"
      );
    }

    const payload = { action, params };
    const body = JSON.stringify(payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), cfg.FETCH_TIMEOUT || 25000);

    let response;
    try {
      const options = {
        method: method,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        signal: controller.signal,
      };
      if (method === "POST") options.body = body;
      // Untuk GET, lampirkan payload ke query string.
      const url = method === "GET"
        ? `${baseUrl}?action=${encodeURIComponent(action)}&payload=${encodeURIComponent(body)}`
        : baseUrl;
      response = await fetch(url, options);
    } catch (err) {
      if (err.name === "AbortError") {
        throw new ApiError("Permintaan ke server membutuhkan waktu terlalu lama. Coba lagi.", "TIMEOUT");
      }
      throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi internet atau status backend.", "NETWORK");
    } finally {
      clearTimeout(timeoutId);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new ApiError("Respon server tidak valid (bukan JSON). Periksa URL deployment atau log Apps Script.", "BAD_RESPONSE");
    }

    if (!data || data.success !== true) {
      const msg = (data && data.message) || "Terjadi kesalahan tidak diketahui.";
      const code = (data && data.code) || "UNKNOWN";
      throw new ApiError(msg, code);
    }
    return data.data !== undefined ? data.data : data;
  }

  /* ---------- 2. Error kustom ---------- */
  class ApiError extends Error {
    constructor(message, code) {
      super(message);
      this.name = "ApiError";
      this.code = code || "UNKNOWN";
    }
  }

  /* ---------- 3. Sanitasi XSS (HTML escape) ----------
   * WAJIB untuk semua teks dinamis yang akan dimasukkan ke innerHTML.
   * Mencegah penyisipan <script> lewat judul/deskripsi dokumen.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Untuk membuat URL aman (mencegah javascript:) */
  function sanitizeUrl(url) {
    if (!url) return "";
    const s = String(url).trim();
    if (/^javascript:/i.test(s)) return "";
    if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(s)) return s;
    // default treat as relative
    return s;
  }

  /* Escape atribut — sama dengan escapeHtml tapi tanda kutip diubah */
  function escapeAttr(str) { return escapeHtml(str); }

  /* ---------- 4. Format tanggal Indonesia ---------- */
  function formatTanggal(iso, opts = {}) {
    if (!iso) return "-";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "-";
      const bulan = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
      if (opts.dateOnly) {
        return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
      }
      const jam = String(d.getHours()).padStart(2,"0");
      const menit = String(d.getMinutes()).padStart(2,"0");
      return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}, ${jam}:${menit}`;
    } catch (e) { return iso; }
  }

  /* ---------- 5. Format angka ribuan ---------- */
  function formatAngka(n) {
    if (n === null || n === undefined || isNaN(n)) return "0";
    return Number(n).toLocaleString("id-ID");
  }

  /* ---------- 6. Truncate ---------- */
  function truncate(str, len = 120) {
    if (!str) return "";
    const s = String(str);
    if (s.length <= len) return s;
    return s.slice(0, len - 1).trimEnd() + "…";
  }

  /* ---------- 7. Query string helper ---------- */
  function getQueryParam(name) {
    const params = new URLSearchParams(global.location.search);
    return params.get(name);
  }
  function setQueryParams(obj) {
    const params = new URLSearchParams(global.location.search);
    Object.keys(obj).forEach(k => {
      if (obj[k] === null || obj[k] === "" || obj[k] === undefined) params.delete(k);
      else params.set(k, obj[k]);
    });
    return params.toString();
  }
  function updateUrlQuery(obj) {
    const qs = setQueryParams(obj);
    const newUrl = `${global.location.pathname}${qs ? "?" + qs : ""}`;
    global.history.replaceState(null, "", newUrl);
  }

  /* ---------- 8. Toast notification ---------- */
  function ensureToastContainer() {
    let c = document.getElementById("toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "toast-container";
      c.className = "toast-container";
      document.body.appendChild(c);
    }
    return c;
  }
  function showToast(message, type = "info", title = "", duration = 4000) {
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>',
      error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.13 14a1 1 0 00.86 1.5h16.27a1 1 0 00.86-1.5l-8.13-14a1 1 0 00-1.72 0z"/></svg>',
      info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 8v4M12 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    };
    const titles = { success: "Berhasil", error: "Gagal", warning: "Peringatan", info: "Informasi" };
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="t-ico">${icons[type] || icons.info}</span>
      <div class="t-body">
        <strong>${escapeHtml(title || titles[type] || "Informasi")}</strong>
        ${escapeHtml(message)}
      </div>
      <button class="t-close" aria-label="Tutup notifikasi">×</button>
    `;
    container.appendChild(toast);
    const close = () => { toast.style.opacity = "0"; toast.style.transform = "translateX(120%)"; setTimeout(() => toast.remove(), 300); };
    toast.querySelector(".t-close").addEventListener("click", close);
    if (duration) setTimeout(close, duration);
  }

  /* ---------- 9. Loading overlay global ---------- */
  function showLoading() {
    let ov = document.getElementById("loading-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "loading-overlay";
      ov.className = "loading-overlay";
      ov.innerHTML = '<div class="spinner" role="status" aria-label="Memuat"></div>';
      document.body.appendChild(ov);
    }
    ov.classList.add("active");
  }
  function hideLoading() {
    const ov = document.getElementById("loading-overlay");
    if (ov) ov.classList.remove("active");
  }

  /* Tombol loading state */
  function btnLoading(btn, loadingText = "Memproses…") {
    if (!btn) return () => {};
    const original = btn.innerHTML;
    btn.classList.add("loading");
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> ${escapeHtml(loadingText)}`;
    return function restore() {
      btn.classList.remove("loading");
      btn.disabled = false;
      btn.innerHTML = original;
    };
  }

  /* ---------- 10. Skeleton helper ---------- */
  function skeletonCards(n = 4) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(`
        <div class="koleksi-card skeleton-card">
          <div class="sk-cover skeleton"></div>
          <div class="sk-line long skeleton"></div>
          <div class="sk-line short skeleton"></div>
          <div class="sk-line long skeleton"></div>
        </div>`);
    }
    return out.join("");
  }

  /* ---------- 11. Cover fallback generator ---------- */
  function coverFallback(title, seedNum = 0) {
    const colors = (global.APP_CONFIG && global.APP_CONFIG.COVER_FALLBACK_COLORS) || ["1e3a8a"];
    const color = colors[seedNum % colors.length];
    const inisial = (title || "?").trim().charAt(0).toUpperCase() || "?";
    // Sampul SVG bertema NTT: gradasi, matahari, buku, huruf awal judul, dan pita tenun.
    return `data:image/svg+xml;utf8,` + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stop-color="#${color}"/><stop offset="1" stop-color="#1b2a24"/>
          </linearGradient>
          <pattern id="t" width="40" height="24" patternUnits="userSpaceOnUse">
            <rect width="40" height="24" fill="#b4532f"/>
            <path d="M20 2 L33 12 L20 22 L7 12 Z" fill="#e0a43a"/>
            <path d="M20 7 L26 12 L20 17 L14 12 Z" fill="#8f3f22"/>
          </pattern>
        </defs>
        <rect width="300" height="400" fill="url(#g)"/>
        <g fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="1.5">
          <path d="M150 20 L280 150 L150 280 L20 150 Z"/><path d="M150 60 L240 150 L150 240 L60 150 Z"/>
        </g>
        <circle cx="150" cy="96" r="26" fill="#fbbf24" opacity="0.9"/>
        <path d="M150 292 C 130 276 98 276 76 284 V 340 C 98 332 130 332 150 346 C 170 332 202 332 224 340 V 284 C 202 276 170 276 150 292 Z"
              fill="#fff" fill-opacity="0.16" stroke="#fff" stroke-opacity="0.45" stroke-width="2"/>
        <text x="150" y="215" font-family="Georgia, serif" font-size="110" font-weight="700"
              fill="#fff" fill-opacity="0.9" text-anchor="middle" dominant-baseline="middle">${inisial}</text>
        <rect x="0" y="366" width="300" height="34" fill="url(#t)"/>
        <rect x="0" y="362" width="300" height="4" fill="#fbbf24"/>
      </svg>`);
  }

  /* Ilustrasi SVG untuk keadaan kosong / error */
  function emptyArt() {
    return '<img class="es-art" src="assets/img/empty-state.svg" alt="" width="190" height="130" loading="lazy" />';
  }

  /* ---------- 12. Status access label ---------- */
  function accessLabel(status) {
    if (!status) return { text: "Privat", cls: "muted" };
    const s = String(status).toLowerCase();
    if (s === "publik" || s === "public" || s === "open") return { text: "Publik", cls: "success" };
    if (s === "internal" || s === "restricted") return { text: "Internal", cls: "warning" };
    return { text: "Privat", cls: "muted" };
  }
  function publikasiLabel(status) {
    if (!status) return { text: "Draft", cls: "muted" };
    const s = String(status).toLowerCase();
    if (s === "terbit" || s === "publish" || s === "published") return { text: "Terbit", cls: "success" };
    if (s === "arsip" || s === "archived") return { text: "Arsip", cls: "warning" };
    return { text: "Draft", cls: "muted" };
  }

  /* ---------- 13. Debounce ---------- */
  function debounce(fn, wait = 300) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* ---------- 14. Sesi (admin = sessionStorage; anggota "ingat saya" = localStorage) ---------- */
  const Session = {
    _read(store) {
      try {
        const raw = store.getItem(global.APP_CONFIG.SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    get() { return Session._read(global.sessionStorage) || Session._read(global.localStorage); },
    set(data, remember) {
      Session.clear();
      // Admin SELALU sessionStorage (hilang saat tab ditutup). Hanya anggota yang boleh "ingat saya".
      const store = (remember && !data.is_admin) ? global.localStorage : global.sessionStorage;
      store.setItem(global.APP_CONFIG.SESSION_KEY, JSON.stringify(data));
    },
    clear() {
      try { global.sessionStorage.removeItem(global.APP_CONFIG.SESSION_KEY); } catch (e) {}
      try { global.localStorage.removeItem(global.APP_CONFIG.SESSION_KEY); } catch (e) {}
    },
    isValid() {
      const s = Session.get();
      return !!(s && s.token && s.expiresAt && Date.now() < s.expiresAt);
    },
    isAdmin() { return Session.isValid() && Session.get().is_admin === true; },
  };

  /* ---------- 15. Status masuk & API berotentikasi ---------- */
  async function apiAuth(action, params = {}) {
    const s = Session.get();
    if (!Session.isValid()) {
      Session.clear();
      throw new ApiError("Silakan masuk terlebih dahulu.", "UNAUTHORIZED");
    }
    try {
      return await apiCall(action, Object.assign({ token: s.token }, params), "POST");
    } catch (err) {
      if (err.code === "UNAUTHORIZED") Session.clear();
      throw err;
    }
  }

  const Auth = {
    isLoggedIn() { return Session.isValid(); },
    isAdmin() { return Session.isAdmin(); },
    user() { return Session.isValid() ? Session.get() : null; },
    loginUrl(next) {
      const n = next || (location.pathname.split("/").pop() || "index.html") + location.search;
      return "masuk.html?next=" + encodeURIComponent(n);
    },
    async logout() {
      const s = Session.get();
      Session.clear();
      Fav.reset();
      if (s && s.token) { try { await apiCall("logout", { token: s.token }, "POST"); } catch (e) {} }
      global.location.href = "index.html";
    },
  };

  /* ---------- 16. Rak favorit (cache id di memori) ---------- */
  const Fav = {
    ids: null, _p: null,
    reset() { Fav.ids = null; Fav._p = null; },
    load() {
      if (!Auth.isLoggedIn()) return Promise.resolve(new Set());
      if (Fav.ids) return Promise.resolve(Fav.ids);
      if (!Fav._p) {
        Fav._p = apiAuth("memberGetFavoritIds")
          .then(d => { Fav.ids = new Set((d.ids || []).map(String)); return Fav.ids; })
          .catch(() => { Fav._p = null; return new Set(); });
      }
      return Fav._p;
    },
    has(id) { return !!(Fav.ids && Fav.ids.has(String(id))); },
    async toggle(id) {
      const d = await apiAuth("memberToggleFavorit", { id });
      if (!Fav.ids) Fav.ids = new Set();
      if (d.favorit) Fav.ids.add(String(id)); else Fav.ids.delete(String(id));
      return d.favorit;
    },
  };

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 000-7.8z"/></svg>';

  function favButtonHtml(id, on) {
    const label = on ? "Hapus dari rak favorit" : "Simpan ke rak favorit";
    return `<button type="button" class="fav-btn${on ? " on" : ""}" data-fav="${escapeAttr(id)}" aria-pressed="${on ? "true" : "false"}" aria-label="${label}" title="${label}">${HEART}</button>`;
  }

  /* Sinkronkan tampilan hati pada semua kartu di dalam root */
  async function syncFavButtons(root) {
    if (!Auth.isLoggedIn()) return;
    await Fav.load();
    (root || document).querySelectorAll(".fav-btn[data-fav]").forEach(b => setFavState(b, Fav.has(b.getAttribute("data-fav"))));
  }
  function setFavState(btn, on) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const label = on ? "Hapus dari rak favorit" : "Simpan ke rak favorit";
    btn.setAttribute("aria-label", label); btn.setAttribute("title", label);
  }
  function bindFavClicks() {
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".fav-btn[data-fav]");
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      if (!Auth.isLoggedIn()) {
        showToast("Masuk dulu untuk menyimpan koleksi ke rak favorit Anda.", "info", "Perlu masuk");
        setTimeout(() => { global.location.href = Auth.loginUrl(); }, 1100);
        return;
      }
      const id = btn.getAttribute("data-fav");
      btn.disabled = true;
      try {
        await Fav.load();
        const on = await Fav.toggle(id);
        document.querySelectorAll(`.fav-btn[data-fav="${CSS.escape(id)}"]`).forEach(b => setFavState(b, on));
        btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
        showToast(on ? "Disimpan ke rak favorit Anda." : "Dihapus dari rak favorit.", on ? "success" : "info");
        document.dispatchEvent(new CustomEvent("fav:changed", { detail: { id, on } }));
      } catch (err) {
        if (err.code === "UNAUTHORIZED") { showToast("Sesi Anda berakhir. Silakan masuk lagi.", "warning"); setTimeout(() => { global.location.href = Auth.loginUrl(); }, 1000); }
        else showToast(err.message || "Gagal memperbarui favorit.", "error");
      } finally { btn.disabled = false; }
    });
  }

  /* Huruf pertama bermakna (lewati tanda kurung/simbol) */
  function inisialJudul(j) { const m = String(j || "").match(/[A-Za-z0-9\u00C0-\u024F]/); return m ? m[0].toUpperCase() : "?"; }

  /* ---------- 17. Kartu koleksi bersama (tampilan buku) ---------- */
  function koleksiCardHtml(k, opts = {}) {
    const access = accessLabel(k.Status_Akses);
    const inisial = escapeHtml(inisialJudul(k.Judul));
    const cover = k.URL_Sampul
      ? `<img src="${escapeAttr(sanitizeUrl(k.URL_Sampul))}" alt="Sampul ${escapeAttr(k.Judul)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="cover-fallback" style="display:none;">${inisial}</div>`
      : `<div class="cover-fallback">${inisial}</div>`;
    const canRead = access.cls === "success" && k.URL_Dokumen;
    return `
      <article class="koleksi-card" data-id="${escapeAttr(k.ID_Koleksi)}">
        <div class="koleksi-cover">
          ${cover}
          <span class="badge-type">${escapeHtml(k.Jenis_Dokumen || "Dokumen")}</span>
          <span class="badge-access ${access.cls === "success" ? "public" : ""}">${escapeHtml(access.text)}</span>
          ${favButtonHtml(k.ID_Koleksi, Fav.has(k.ID_Koleksi))}
        </div>
        <div class="koleksi-body">
          <span class="kc-cat">${escapeHtml(k.Nama_Kategori || "Umum")}</span>
          <h3>${escapeHtml(truncate(k.Judul, 90))}</h3>
          <p class="kc-meta"><strong>${escapeHtml(k.Penulis || "Anonim")}</strong> · ${escapeHtml(k.Tahun || "—")}</p>
          <div class="kc-actions">
            <a href="detail.html?id=${escapeAttr(k.ID_Koleksi)}" class="btn btn-ghost btn-sm" style="flex:1;">Lihat Detail</a>
            ${canRead && opts.showRead !== false ? `<a href="${escapeAttr(sanitizeUrl(k.URL_Dokumen))}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="flex:1;">Baca</a>` : ""}
          </div>
        </div>
      </article>`;
  }

  /* ---------- 18. Tema terang / malam ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#1b1713" : "#2f5d50");
  }
  function toggleTheme() {
    const now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(now);
    try { global.localStorage.setItem("perpus_ntt_theme", now); } catch (e) {}
  }

  /* ---------- 19. Header & footer bersama ---------- */
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.7 2.34a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.74-1.27a2 2 0 012.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0122 16.92z"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    mail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 000-7.8z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  };

  function authSlotHtml() {
    const u = Auth.user();
    if (!u) {
      return `<a href="masuk.html" class="btn btn-ghost btn-sm">Masuk</a><a href="masuk.html#daftar" class="btn btn-primary btn-sm">Daftar</a>`;
    }
    const nama = u.nama || "Pengguna";
    return `
      <div class="user-menu" id="user-menu">
        <button type="button" class="um-btn" id="um-btn" aria-haspopup="true" aria-expanded="false">
          <span class="um-avatar">${escapeHtml(nama.charAt(0).toUpperCase())}</span>
          <span class="um-name">${escapeHtml(nama.split(" ")[0])}</span>
        </button>
        <div class="um-dropdown" role="menu">
          <div class="um-head"><strong>${escapeHtml(nama)}</strong><span>${escapeHtml(u.email || "")}</span></div>
          <a href="akun.html" role="menuitem">${ICON.user} Akun Saya</a>
          <a href="akun.html#favorit" role="menuitem">${ICON.heart} Rak Favorit</a>
          <a href="akun.html#riwayat" role="menuitem">${ICON.clock} Riwayat Baca</a>
          ${u.is_admin ? `<div class="um-sep"></div><a href="admin.html" role="menuitem">${ICON.shield} Dashboard Admin</a>` : ""}
          <div class="um-sep"></div>
          <button type="button" data-logout role="menuitem">${ICON.out} Keluar</button>
        </div>
      </div>`;
  }

  function renderSharedHeader(activePage) {
    const cfg = global.APP_CONFIG;
    const navItems = [
      { key: "beranda",   label: "Beranda",         href: "index.html",    icon: ICON.home },
      { key: "koleksi",   label: "Koleksi",         href: "koleksi.html",  icon: ICON.book },
      { key: "kategori",  label: "Kategori",        href: "kategori.html", icon: ICON.grid },
      { key: "publikasi", label: "Riset",           href: "koleksi.html?jenis=Laporan%20Penelitian", icon: ICON.flask },
      { key: "tentang",   label: "Tentang",         href: "tentang.html",  icon: ICON.info },
      { key: "kontak",    label: "Kontak",          href: "kontak.html",   icon: ICON.phone },
    ];
    const navHtml = navItems.map(n => `
      <a href="${n.href}" class="${activePage === n.key ? "active" : ""}" data-nav="${n.key}" ${activePage === n.key ? 'aria-current="page"' : ""}>${n.icon}<span>${n.label}</span></a>`).join("");
    const u = Auth.user();
    const navAuth = u
      ? `<div class="nav-auth"><a href="akun.html" class="btn btn-ghost">${escapeHtml(u.nama || "Akun Saya")}</a>${u.is_admin ? '<a href="admin.html" class="btn btn-ghost">Dashboard Admin</a>' : ""}<button type="button" class="btn btn-primary" data-logout>Keluar</button></div>`
      : `<div class="nav-auth"><a href="masuk.html" class="btn btn-ghost">Masuk</a><a href="masuk.html#daftar" class="btn btn-primary">Daftar Gratis</a></div>`;
    return `
      <header class="site-header">
        <div class="header-top">
          <div class="container">
            <div class="top-info">
              <span>${ICON.pin} ${escapeHtml(cfg.INSTANSI.alamat)}</span>
              <span>${ICON.mail} ${escapeHtml(cfg.INSTANSI.email)}</span>
            </div>
            <div class="top-info"><a href="admin.html" class="nav-admin-link">Login Admin</a></div>
          </div>
        </div>
        <div class="header-main">
          <div class="container">
            <a href="index.html" class="brand" aria-label="Beranda POPCORN RIDA — Perpustakaan Digital NTT">
              <span class="brand-logo has-img"><img src="assets/img/logo.svg" alt="" width="46" height="46" /></span>
              <span class="brand-text">
                <span class="brand-title">POPCORN RIDA</span>
                <span class="brand-sub">Perpustakaan Digital NTT</span>
              </span>
            </a>
            <nav class="main-nav" id="main-nav" aria-label="Navigasi utama">
              ${navHtml}
              ${navAuth}
            </nav>
            <div class="header-actions">
              <button type="button" class="icon-btn theme-toggle" id="theme-toggle" aria-label="Ganti mode terang / malam" title="Mode terang / malam">
                <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                <svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>
              </button>
              <div class="auth-slot" id="auth-slot">${authSlotHtml()}</div>
            </div>
            <button class="menu-toggle" id="menu-toggle" aria-label="Buka menu navigasi" aria-expanded="false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
          </div>
        </div>
      </header>
      <div class="nav-backdrop" id="nav-backdrop" aria-hidden="true"></div>`;
  }

  function renderSharedFooter() {
    const cfg = global.APP_CONFIG;
    const u = Auth.user();
    const soc = (label, path) => `<a href="#" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg></a>`;
    return `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-col">
              <div class="footer-brand">
                <span class="brand-logo has-img"><img src="assets/img/logo.svg" alt="" width="46" height="46" /></span>
                <div>
                  <div class="brand-title">${escapeHtml(cfg.INSTANSI.nama)}</div>
                  <div class="brand-sub">${escapeHtml(cfg.INSTANSI.slogan)}</div>
                </div>
              </div>
              <p>${escapeHtml(cfg.INSTANSI.deskripsi)}</p>
              <div class="footer-socials">
                ${soc("Instagram", '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>')}
                ${soc("Facebook", '<path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>')}
                ${soc("YouTube", '<path d="M22.54 6.42a2.78 2.78 0 00-1.95-2C18.88 4 12 4 12 4s-6.88 0-8.59.42a2.78 2.78 0 00-1.95 2 29 29 0 000 11.16 2.78 2.78 0 001.95 2C5.12 20 12 20 12 20s6.88 0 8.59-.42a2.78 2.78 0 001.95-2 29 29 0 000-11.16z"/><path d="M9.75 15.02l5.75-3.27-5.75-3.27v6.54z"/>')}
              </div>
            </div>
            <div class="footer-col">
              <h4>Jelajahi</h4>
              <ul>
                <li><a href="index.html">Beranda</a></li>
                <li><a href="koleksi.html">Koleksi Digital</a></li>
                <li><a href="kategori.html">Kategori</a></li>
                <li><a href="tentang.html">Tentang Kami</a></li>
                <li><a href="kontak.html">Kontak</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h4>Anggota</h4>
              <ul>
                ${u
                  ? `<li><a href="akun.html">Akun Saya</a></li><li><a href="akun.html#favorit">Rak Favorit</a></li><li><a href="akun.html#riwayat">Riwayat Baca</a></li>`
                  : `<li><a href="masuk.html">Masuk</a></li><li><a href="masuk.html#daftar">Daftar Gratis</a></li><li><a href="masuk.html#lupa">Lupa Kata Sandi</a></li>`}
                <li><a href="kategori.html?k=sosial-budaya">Sosial &amp; Budaya</a></li>
                <li><a href="kategori.html?k=pendidikan">Pendidikan</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h4>Kontak Instansi</h4>
              <ul>
                <li>${escapeHtml(cfg.INSTANSI.instansi)}</li>
                <li>${escapeHtml(cfg.INSTANSI.alamat)}</li>
                <li>Telp: ${escapeHtml(cfg.INSTANSI.telepon)}</li>
                <li>Email: <a href="mailto:${escapeAttr(cfg.INSTANSI.email)}">${escapeHtml(cfg.INSTANSI.email)}</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <div class="fb-left">${escapeHtml(cfg.INSTANSI.copyright)}</div>
            <div class="fb-right"><a href="tentang.html">Tentang</a><a href="kontak.html">Kontak</a><a href="admin.html">Admin</a></div>
          </div>
        </div>
      </footer>
      <button type="button" class="backtop" id="backtop" aria-label="Kembali ke atas"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg></button>`;
  }

  /* Pasang perilaku header: menu mobile, menu pengguna, tema, back-to-top */
  function wireHeader() {
    const toggle = document.getElementById("menu-toggle");
    const nav = document.getElementById("main-nav");
    const backdrop = document.getElementById("nav-backdrop");
    if (toggle && nav) {
      const close = () => { nav.classList.remove("open"); backdrop && backdrop.classList.remove("active"); toggle.setAttribute("aria-expanded", "false"); };
      toggle.onclick = () => {
        const open = nav.classList.toggle("open");
        backdrop && backdrop.classList.toggle("active", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
      if (backdrop) backdrop.onclick = close;
      nav.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
    }
    const tt = document.getElementById("theme-toggle");
    if (tt) tt.onclick = toggleTheme;
    const um = document.getElementById("user-menu");
    const umBtn = document.getElementById("um-btn");
    if (um && umBtn) {
      umBtn.onclick = (e) => { e.stopPropagation(); const o = um.classList.toggle("open"); umBtn.setAttribute("aria-expanded", o ? "true" : "false"); };
    }
    document.querySelectorAll("[data-logout]").forEach(b => { b.onclick = () => Auth.logout(); });
    const bt = document.getElementById("backtop");
    if (bt) bt.onclick = () => global.scrollTo({ top: 0, behavior: "smooth" });
  }

  let _globalBound = false;
  function initSharedUI() {
    wireHeader();
    if (!_globalBound) {
      _globalBound = true;
      document.addEventListener("click", (e) => {
        const um = document.getElementById("user-menu");
        if (um && !um.contains(e.target)) { um.classList.remove("open"); const b = document.getElementById("um-btn"); b && b.setAttribute("aria-expanded", "false"); }
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const um = document.getElementById("user-menu"); um && um.classList.remove("open"); } });
      global.addEventListener("scroll", () => { const bt = document.getElementById("backtop"); bt && bt.classList.toggle("show", global.scrollY > 500); }, { passive: true });
      bindFavClicks();
    }
    // Muat konfigurasi instansi dari backend lalu render ulang header/footer dengan data terbaru
    loadInstansiConfig().finally(() => {
      const headerEl = document.getElementById("site-header");
      const footerEl = document.getElementById("site-footer");
      if (headerEl && headerEl.children.length) {
        headerEl.innerHTML = renderSharedHeader(headerEl.getAttribute("data-active-page") || "");
      }
      if (footerEl && footerEl.children.length) footerEl.innerHTML = renderSharedFooter();
      wireHeader();
    });
    // Segarkan nama/role dari server bila sedang masuk (diam-diam)
    if (Auth.isLoggedIn()) Fav.load();
  }

  /* Load konfigurasi instansi dari backend & override APP_CONFIG.INSTANSI */
  async function loadInstansiConfig() {
    try {
      const data = await apiCall("getInstansiConfig", {}, "GET");
      const cfg = (data && data.konfigurasi) || data || {};
      if (cfg.instansi)  global.APP_CONFIG.INSTANSI.instansi = cfg.instansi;
      if (cfg.alamat)    global.APP_CONFIG.INSTANSI.alamat = cfg.alamat;
      if (cfg.telepon)   global.APP_CONFIG.INSTANSI.telepon = cfg.telepon;
      if (cfg.email)     global.APP_CONFIG.INSTANSI.email = cfg.email;
      if (cfg.slogan)    global.APP_CONFIG.INSTANSI.slogan = cfg.slogan;
      if (cfg.deskripsi) global.APP_CONFIG.INSTANSI.deskripsi = cfg.deskripsi;
      global.APP_CONFIG.INSTANSI.copyright = "Hak Cipta © " + new Date().getFullYear() + " " + (cfg.instansi || global.APP_CONFIG.INSTANSI.nama) + " — BAPPERIDA Provinsi NTT.";
    } catch (err) {
      console.debug("Konfigurasi instansi pakai default (backend belum siap).");
    }
  }

  /* Render header/footer ke halaman dengan satu panggilan */
  function mountChrome(activePage) {
    const h = document.getElementById("site-header");
    const f = document.getElementById("site-footer");
    if (h) { h.setAttribute("data-active-page", activePage || ""); h.innerHTML = renderSharedHeader(activePage || ""); }
    if (f) f.innerHTML = renderSharedFooter();
    initSharedUI();
  }

  /* Pengalihan aman: hanya ke halaman lokal (cegah open-redirect) */
  function safeNext(next, fallback) {
    if (!next) return fallback;
    if (/^[a-z0-9_-]+\.html(\?[^\s]*)?(#[^\s]*)?$/i.test(next)) return next;
    return fallback;
  }

  /* ---------- 20. Publik: pasang di window.PUtils ---------- */
  global.PUtils = {
    apiCall, apiAuth, ApiError,
    escapeHtml, escapeAttr, sanitizeUrl,
    formatTanggal, formatAngka, truncate,
    getQueryParam, setQueryParams, updateUrlQuery,
    showToast, showLoading, hideLoading, btnLoading,
    skeletonCards, coverFallback, emptyArt, inisialJudul,
    accessLabel, publikasiLabel,
    debounce, Session, Auth, Fav, ICON,
    koleksiCardHtml, favButtonHtml, syncFavButtons,
    renderSharedHeader, renderSharedFooter, initSharedUI, mountChrome,
    applyTheme, toggleTheme, safeNext,
  };

})(window);
