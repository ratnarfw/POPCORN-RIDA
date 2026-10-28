/* =====================================================================
 * admin.js — Dashboard Administrator Perpustakaan Digital NTT
 * Fitur: login, dashboard, CRUD koleksi, kategori, publikasi pilihan,
 *        log aktivitas, info instansi, upload PDF.
 *
 * Catatan keamanan:
 * - Token sesi disimpan di sessionStorage, bukan localStorage.
 * - Setiap request admin menyertakan token via header X-Auth-Token
 *   yang dibaca dari payload Apps Script.
 * - Backend melakukan validasi token + cek role setiap operasi admin.
 * ===================================================================== */

(function () {
  "use strict";

  const U = window.PUtils;
  const cfg = window.APP_CONFIG;

  const state = {
    view: "dashboard",
    koleksi: { items: [], page: 1, perPage: cfg.ADMIN_ITEMS_PER_PAGE || 10, total: 0, q: "", kategori: "", status: "" },
    kategori: { items: [], page: 1, perPage: 20, total: 0 },
    log: { items: [], page: 1, perPage: 20, total: 0 },
    pesan: { items: [], page: 1, perPage: 10, total: 0, status: "" },
    anggota: { items: [], page: 1, perPage: 10, total: 0, q: "", status: "", ringkasan: null },
    kategoriOptions: [], // cache untuk dropdown
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    // Toggle password
    document.getElementById("toggle-pw").addEventListener("click", () => {
      const inp = document.getElementById("login-password");
      inp.type = inp.type === "password" ? "text" : "password";
    });

    // Login form
    document.getElementById("login-form").addEventListener("submit", onLoginSubmit);

    // Logout
    document.getElementById("btn-logout").addEventListener("click", logout);

    // Mobile menu
    document.getElementById("admin-toggle-mobile").addEventListener("click", () => {
      document.getElementById("admin-sidebar").classList.toggle("open");
    });

    // Navigasi admin (hash-based SPA)
    document.querySelectorAll("#admin-nav a").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const view = a.getAttribute("data-view");
        switchView(view);
        // close mobile nav
        document.getElementById("admin-sidebar").classList.remove("open");
      });
    });

    // Modal close
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });

    // Cek sesi yang masih valid
    if (U.Session.isAdmin()) {
      showAdminShell();
      const hash = location.hash.replace("#", "");
      switchView(hash && validViews.includes(hash) ? hash : "dashboard");
    } else if (U.Session.isValid()) {
      // Sedang masuk sebagai anggota biasa: jangan keluarkan, cukup minta akun admin.
      showLoginView(false);
      U.showToast("Anda sedang masuk sebagai anggota. Gunakan akun administrator untuk membuka dashboard.", "info", "Bukan akun admin", 7000);
    } else {
      showLoginView();
    }
  }

  const validViews = ["dashboard", "koleksi", "kategori", "publikasi", "pesan", "anggota", "log", "instansi"];

  function showLoginView(clearSession = true) {
    document.getElementById("login-view").hidden = false;
    document.getElementById("admin-shell").hidden = true;
    if (clearSession) U.Session.clear();
  }
  function showAdminShell() {
    document.getElementById("login-view").hidden = true;
    document.getElementById("admin-shell").hidden = false;
    const sess = U.Session.get();
    if (sess) {
      document.getElementById("auc-name").textContent = sess.nama || "Administrator";
      document.getElementById("auc-role").textContent = sess.role || "Administrator";
      document.getElementById("auc-avatar").textContent = (sess.nama || "A").charAt(0).toUpperCase();
    }
  }

  /* ---------- LOGIN ---------- */
  async function onLoginSubmit(e) {
    e.preventDefault();
    clearLoginErrors();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    let valid = true;
    if (!email) { showLoginError("login-email", "Email wajib diisi."); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showLoginError("login-email", "Format email tidak valid."); valid = false; }
    if (!password) { showLoginError("login-password", "Kata sandi wajib diisi."); valid = false; }
    if (!valid) return;

    const btn = document.getElementById("btn-login");
    const restore = U.btnLoading(btn, "Memverifikasi…");
    try {
      const data = await U.apiCall("loginAdmin", { email, password }, "POST");
      if (!data || !data.token) throw new Error("Respon login tidak valid.");
      // Simpan sesi (berlaku 8 jam)
      const expiresAt = data.expires_at || (Date.now() + 8 * 60 * 60 * 1000);
      U.Session.set({
        token: data.token,
        nama: data.nama,
        email: data.email,
        role: data.role,
        is_admin: true,
        expiresAt,
      }, false);
      showAdminShell();
      switchView("dashboard");
      U.showToast("Selamat datang, " + (data.nama || "Administrator") + ".", "success", "Login berhasil");
    } catch (err) {
      console.error("Login gagal:", err);
      U.showToast(err.message || "Login gagal. Periksa kredensial Anda.", "error", "Gagal Masuk");
    } finally {
      restore();
    }
  }

  function showLoginError(id, msg) {
    document.getElementById(id).parentElement.classList.add("has-error");
    document.getElementById(id + "-error").textContent = msg;
    document.getElementById(id + "-error").style.display = "block";
  }
  function clearLoginErrors() {
    document.querySelectorAll("#login-form .form-group").forEach(g => g.classList.remove("has-error"));
    document.querySelectorAll("#login-form .error-msg").forEach(e => e.style.display = "none");
  }

  function logout() {
    if (!confirm("Anda yakin ingin keluar dari dashboard?")) return;
    // Panggil logout di backend (best-effort)
    const sess = U.Session.get();
    if (sess && sess.token) {
      U.apiCall("logoutAdmin", { token: sess.token }, "POST").catch(() => {});
    }
    U.Session.clear();
    showLoginView();
    document.getElementById("login-form").reset();
    location.hash = "";
  }

  /* ---------- AUTH HEADER untuk request admin ---------- */
  function authParams(extra = {}) {
    const sess = U.Session.get();
    if (!sess || !sess.token) {
      // Arahkan ke login bila tidak ada token
      showLoginView();
      throw new U.ApiError("Sesi berakhir. Silakan masuk kembali.", "NO_SESSION");
    }
    return Object.assign({ token: sess.token }, extra);
  }

  /* ---------- SWITCH VIEW ---------- */
  function switchView(view) {
    if (!validViews.includes(view)) view = "dashboard";
    state.view = view;
    // Update nav
    document.querySelectorAll("#admin-nav a").forEach(a => {
      a.classList.toggle("active", a.getAttribute("data-view") === view);
    });
    // Update title
    const titles = { dashboard: "Dashboard", koleksi: "Koleksi Digital", kategori: "Kategori", publikasi: "Publikasi Pilihan", pesan: "Pesan Masuk", anggota: "Anggota", log: "Log Aktivitas", instansi: "Info Instansi" };
    document.getElementById("at-title").textContent = titles[view];
    location.hash = view;
    // Render content
    const renderers = { dashboard: renderDashboard, koleksi: renderKoleksi, kategori: renderKategori, publikasi: renderPublikasi, pesan: renderPesan, anggota: renderAnggota, log: renderLog, instansi: renderInstansi };
    renderers[view]();
  }

  /* ---------- DASHBOARD ---------- */
  async function renderDashboard() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div>
          <h1>Selamat datang, ${U.escapeHtml(((U.Session.get() || {}).nama || "Administrator").split(" ")[0])}</h1>
          <p>Ringkasan statistik perpustakaan digital Nusa Tenggara Timur.</p>
        </div>
        <button class="btn btn-primary" id="btn-tambah-koleksi-quick">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Tambah Koleksi
        </button>
      </div>

      <div class="admin-stats-grid" id="dashboard-stats">
        <div class="admin-stat-card"><div class="asc-top"><div class="asc-ico skeleton" style="width:44px;height:44px;border-radius:10px;"></div></div><div class="asc-num skeleton" style="height:30px;width:60%;"></div><div class="asc-lbl skeleton" style="height:12px;width:50%;margin-top:6px;"></div></div>
        <div class="admin-stat-card maroon"><div class="asc-top"><div class="asc-ico skeleton" style="width:44px;height:44px;border-radius:10px;"></div></div><div class="asc-num skeleton" style="height:30px;width:60%;"></div><div class="asc-lbl skeleton" style="height:12px;width:50%;margin-top:6px;"></div></div>
        <div class="admin-stat-card success"><div class="asc-top"><div class="asc-ico skeleton" style="width:44px;height:44px;border-radius:10px;"></div></div><div class="asc-num skeleton" style="height:30px;width:60%;"></div><div class="asc-lbl skeleton" style="height:12px;width:50%;margin-top:6px;"></div></div>
        <div class="admin-stat-card warning"><div class="asc-top"><div class="asc-ico skeleton" style="width:44px;height:44px;border-radius:10px;"></div></div><div class="asc-num skeleton" style="height:30px;width:60%;"></div><div class="asc-lbl skeleton" style="height:12px;width:50%;margin-top:6px;"></div></div>
      </div>

      <div class="admin-grid-2">
        <div class="admin-panel">
          <div class="ap-header">
            <h3>Koleksi Terbaru</h3>
            <a href="#koleksi" class="btn btn-ghost btn-sm" data-view-link="koleksi">Kelola →</a>
          </div>
          <div class="ap-body no-pad">
            <table class="admin-table">
              <thead><tr><th>Judul</th><th>Kategori</th><th>Tahun</th><th>Status</th></tr></thead>
              <tbody id="dash-recent-koleksi"><tr><td colspan="4" style="padding:20px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
            </table>
          </div>
        </div>
        <div class="admin-panel">
          <div class="ap-header"><h3>Log Aktivitas Terkini</h3></div>
          <div class="ap-body" id="dash-recent-log">
            <p class="text-muted">Memuat…</p>
          </div>
        </div>
      </div>`;

    // Hook quick add
    document.getElementById("btn-tambah-koleksi-quick").addEventListener("click", () => switchView("koleksi"));
    document.querySelectorAll("[data-view-link]").forEach(a => {
      a.addEventListener("click", (e) => { e.preventDefault(); switchView(a.getAttribute("data-view-link")); });
    });

    // Load stats
    loadDashboardStats();
    loadDashboardRecentKoleksi();
    loadDashboardRecentLog();
  }

  async function loadDashboardStats() {
    try {
      const data = await U.apiCall("adminGetDashboardStats", authParams(), "POST");
      const stats = [
        { card: "", ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', num: U.formatAngka(data.total_koleksi || 0), lbl: "Total Koleksi" },
        { card: "maroon", ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>', num: U.formatAngka(data.total_kategori || 0), lbl: "Kategori" },
        { card: "success", ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>', num: U.formatAngka(data.total_publik || 0), lbl: "Dokumen Publik" },
        { card: "warning", ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>', num: U.formatAngka(data.total_draft || 0), lbl: "Dokumen Draft" },
        { card: "success", ico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>', num: U.formatAngka(data.total_anggota || 0), lbl: "Anggota Terdaftar" },
      ];
      document.getElementById("dashboard-stats").innerHTML = stats.map(s => `
        <div class="admin-stat-card ${s.card}">
          <div class="asc-top">
            <div class="asc-ico">${s.ico}</div>
          </div>
          <div class="asc-num">${U.escapeHtml(s.num)}</div>
          <div class="asc-lbl">${U.escapeHtml(s.lbl)}</div>
        </div>`).join("");
    } catch (err) {
      U.showToast("Gagal memuat statistik: " + err.message, "error");
    }
  }

  async function loadDashboardRecentKoleksi() {
    try {
      const data = await U.apiCall("adminGetKoleksiList", authParams({ page: 1, per_page: 5, sort: "terbaru" }), "POST");
      const items = data.koleksi || data.items || [];
      const tbody = document.getElementById("dash-recent-koleksi");
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--c-text-muted);">Belum ada koleksi.</td></tr>`;
        return;
      }
      tbody.innerHTML = items.map(k => {
        const acc = U.accessLabel(k.Status_Akses);
        return `<tr>
          <td class="td-title">${U.escapeHtml(U.truncate(k.Judul, 60))}</td>
          <td>${U.escapeHtml(k.Nama_Kategori || "-")}</td>
          <td>${U.escapeHtml(k.Tahun || "-")}</td>
          <td><span class="mini-badge ${acc.cls}">${U.escapeHtml(acc.text)}</span></td>
        </tr>`;
      }).join("");
    } catch (err) {
      document.getElementById("dash-recent-koleksi").innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadDashboardRecentLog() {
    try {
      const data = await U.apiCall("adminGetLogList", authParams({ page: 1, per_page: 6 }), "POST");
      const items = data.log || data.items || [];
      const wrap = document.getElementById("dash-recent-log");
      if (!items.length) {
        wrap.innerHTML = `<p class="text-muted">Belum ada aktivitas tercatat.</p>`;
        return;
      }
      wrap.innerHTML = `<div class="log-list">${items.map(l => `
        <div class="log-item ${l.Jenis_Aksi ? l.Jenis_Aksi.toLowerCase() : ""}">
          <div class="li-dot"></div>
          <div class="li-body">
            <p><strong>${U.escapeHtml(l.Nama_User || l.User_ID || "Sistem")}</strong> ${U.escapeHtml(l.Aktivitas || "melakukan aksi")}</p>
            <div class="li-meta">${U.formatTanggal(l.Waktu)} · ${U.escapeHtml(l.Jenis_Data || "-")} ${l.ID_Data ? "· ID: " + U.escapeHtml(l.ID_Data) : ""}</div>
          </div>
        </div>`).join("")}</div>`;
    } catch (err) {
      document.getElementById("dash-recent-log").innerHTML = `<p style="color:var(--c-danger)">${U.escapeHtml(err.message)}</p>`;
    }
  }

  /* ---------- KOLEKSI (CRUD) ---------- */
  async function renderKoleksi() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div>
          <h1>Kelola Koleksi Digital</h1>
          <p>Tambah, ubah, atau hapus koleksi. Upload dokumen PDF ke Google Drive dan kelola hak aksesnya.</p>
        </div>
        <button class="btn btn-primary" id="btn-tambah-koleksi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Tambah Koleksi
        </button>
      </div>

      <div class="admin-panel">
        <div class="admin-toolbar">
          <div class="at-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" id="koleksi-q" placeholder="Cari judul, penulis, atau ID koleksi…" autocomplete="off" />
          </div>
          <select id="koleksi-filter-kategori"><option value="">Semua Kategori</option></select>
          <select id="koleksi-filter-status">
            <option value="">Semua Status</option>
            <option value="Terbit">Terbit</option>
            <option value="Draft">Draft</option>
            <option value="Arsip">Arsip</option>
          </select>
        </div>
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Judul & Penulis</th>
                <th>Kategori</th>
                <th>Tahun</th>
                <th>Jenis</th>
                <th>Akses</th>
                <th>Status</th>
                <th class="col-narrow">Aksi</th>
              </tr>
            </thead>
            <tbody id="koleksi-tbody">
              <tr><td colspan="7" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat data…</td></tr>
            </tbody>
          </table>
          <div class="admin-pagination" id="koleksi-pagination" style="padding-bottom:14px;"></div>
        </div>
      </div>`;

    document.getElementById("btn-tambah-koleksi").addEventListener("click", () => openKoleksiForm(null));
    document.getElementById("koleksi-q").addEventListener("input", U.debounce(() => {
      state.koleksi.q = document.getElementById("koleksi-q").value.trim();
      state.koleksi.page = 1;
      loadKoleksiList();
    }, 400));
    document.getElementById("koleksi-filter-kategori").addEventListener("change", (e) => {
      state.koleksi.kategori = e.target.value; state.koleksi.page = 1; loadKoleksiList();
    });
    document.getElementById("koleksi-filter-status").addEventListener("change", (e) => {
      state.koleksi.status = e.target.value; state.koleksi.page = 1; loadKoleksiList();
    });

    await loadKategoriOptions();
    // Isi filter kategori
    const sel = document.getElementById("koleksi-filter-kategori");
    state.kategoriOptions.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k.Kategori_ID;
      opt.textContent = k.Nama_Kategori;
      sel.appendChild(opt);
    });

    loadKoleksiList();
  }

  async function loadKategoriOptions() {
    if (state.kategoriOptions.length) return;
    // Coba pakai endpoint admin (mengembalikan semua kategori termasuk Nonaktif)
    // agar kategori pada koleksi lama tetap tampil saat edit.
    try {
      const sess = U.Session.get();
      if (sess && sess.token) {
        const data = await U.apiCall("adminGetKategoriList", { token: sess.token }, "POST");
        state.kategoriOptions = data.kategori || data || [];
        return;
      }
    } catch (err) { /* fall through ke endpoint publik */ }
    // Fallback ke endpoint publik (hanya kategori Aktif)
    try {
      const data = await U.apiCall("getKategoriList", {}, "GET");
      state.kategoriOptions = data.kategori || data || [];
    } catch (err) { console.warn("Gagal memuat kategori options:", err); }
  }

  async function loadKoleksiList() {
    const tbody = document.getElementById("koleksi-tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat data…</td></tr>`;
    try {
      const data = await U.apiCall("adminGetKoleksiList", authParams({
        page: state.koleksi.page, per_page: state.koleksi.perPage,
        q: state.koleksi.q, kategori_id: state.koleksi.kategori || null,
        status: state.koleksi.status || null, sort: "terbaru",
      }), "POST");
      const items = data.koleksi || data.items || [];
      state.koleksi.total = data.total !== undefined ? data.total : items.length;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="ae-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg></div><h3>Belum ada koleksi</h3><p>Tambahkan koleksi pertama Anda untuk memulai.</p></div></td></tr>`;
      } else {
        tbody.innerHTML = items.map(k => {
          const acc = U.accessLabel(k.Status_Akses);
          const pub = U.publikasiLabel(k.Status_Publikasi);
          return `<tr data-id="${U.escapeAttr(k.ID_Koleksi)}">
            <td>
              <div class="td-title">${U.escapeHtml(U.truncate(k.Judul, 70))}</div>
              <div style="font-size:0.78rem;color:var(--c-text-muted);">${U.escapeHtml(k.Penulis || "Anonim")}</div>
              <div style="font-size:0.72rem;color:var(--c-text-muted);font-family:monospace;">ID: ${U.escapeHtml(k.ID_Koleksi)}</div>
            </td>
            <td>${U.escapeHtml(k.Nama_Kategori || "-")}</td>
            <td>${U.escapeHtml(k.Tahun || "-")}</td>
            <td>${U.escapeHtml(k.Jenis_Dokumen || "-")}</td>
            <td><span class="mini-badge ${acc.cls}">${U.escapeHtml(acc.text)}</span></td>
            <td><span class="mini-badge ${pub.cls}">${U.escapeHtml(pub.text)}</span></td>
            <td class="td-actions">
              <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${U.escapeAttr(k.ID_Koleksi)}" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-danger btn-sm" data-act="delete" data-id="${U.escapeAttr(k.ID_Koleksi)}" title="Hapus">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </td>
          </tr>`;
        }).join("");
        // Attach handlers
        tbody.querySelectorAll('[data-act="edit"]').forEach(b => b.addEventListener("click", () => openKoleksiForm(b.getAttribute("data-id"))));
        tbody.querySelectorAll('[data-act="delete"]').forEach(b => b.addEventListener("click", () => deleteKoleksi(b.getAttribute("data-id"))));
      }
      renderKoleksiPagination();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderKoleksiPagination() {
    const pages = Math.ceil(state.koleksi.total / state.koleksi.perPage);
    const wrap = document.getElementById("koleksi-pagination");
    if (!wrap || pages <= 1) { if (wrap) wrap.innerHTML = ""; return; }
    const cur = state.koleksi.page;
    const btns = [];
    btns.push(`<button ${cur===1?"disabled":""} data-p="prev">‹</button>`);
    for (let i = 1; i <= pages; i++) {
      if (Math.abs(i - cur) > 2 && i !== 1 && i !== pages) {
        if (btns[btns.length-1] && !btns[btns.length-1].includes("…")) btns.push(`<span style="padding:0 4px;color:var(--c-text-muted);align-self:center;">…</span>`);
        continue;
      }
      btns.push(`<button data-p="${i}" class="${i===cur?"active":""}">${i}</button>`);
    }
    btns.push(`<button ${cur===pages?"disabled":""} data-p="next">›</button>`);
    wrap.innerHTML = btns.join("");
    wrap.querySelectorAll("button[data-p]").forEach(b => b.addEventListener("click", () => {
      const v = b.getAttribute("data-p");
      if (v === "prev") state.koleksi.page = Math.max(1, cur - 1);
      else if (v === "next") state.koleksi.page = Math.min(pages, cur + 1);
      else state.koleksi.page = parseInt(v, 10);
      loadKoleksiList();
    }));
  }

  /* ---------- FORM KOLEKSI (TAMBAH/EDIT) ---------- */
  async function openKoleksiForm(id) {
    await loadKategoriOptions();
    let k = null;
    if (id) {
      try {
        const data = await U.apiCall("adminGetKoleksiDetail", authParams({ id }), "POST");
        k = data.koleksi || data;
        if (!k) throw new Error("Koleksi tidak ditemukan.");
      } catch (err) {
        U.showToast("Gagal memuat data: " + err.message, "error");
        return;
      }
    }

    const kategoriOpts = state.kategoriOptions.map(opt => `<option value="${U.escapeAttr(opt.Kategori_ID)}" ${k && k.Kategori_ID === opt.Kategori_ID ? "selected" : ""}>${U.escapeHtml(opt.Nama_Kategori)}</option>`).join("");

    openModal(id ? "Edit Koleksi" : "Tambah Koleksi", `
      <form id="koleksi-form" novalidate>
        <input type="hidden" name="ID_Koleksi" value="${k ? U.escapeAttr(k.ID_Koleksi) : ""}" />
        <div class="form-group-admin">
          <label>Judul <span style="color:var(--c-danger);">*</span></label>
          <input type="text" name="Judul" required value="${k ? U.escapeAttr(k.Judul || "") : ""}" placeholder="Judul lengkap dokumen" />
        </div>
        <div class="form-grid-2">
          <div class="form-group-admin">
            <label>Penulis <span style="color:var(--c-danger);">*</span></label>
            <input type="text" name="Penulis" required value="${k ? U.escapeAttr(k.Penulis || "") : ""}" placeholder="Nama penulis/lembaga" />
          </div>
          <div class="form-group-admin">
            <label>Penerbit / Instansi Sumber</label>
            <input type="text" name="Penerbit" value="${k ? U.escapeAttr(k.Penerbit || "") : ""}" placeholder="Penerbit atau instansi sumber" />
          </div>
        </div>
        <div class="form-grid-3">
          <div class="form-group-admin">
            <label>Kategori <span style="color:var(--c-danger);">*</span></label>
            <select name="Kategori_ID" required>
              <option value="">— Pilih Kategori —</option>
              ${kategoriOpts}
            </select>
          </div>
          <div class="form-group-admin">
            <label>Tahun <span style="color:var(--c-danger);">*</span></label>
            <input type="number" name="Tahun" required min="1900" max="2100" value="${k ? U.escapeAttr(k.Tahun || "") : new Date().getFullYear()}" placeholder="2024" />
          </div>
          <div class="form-group-admin">
            <label>Jenis Dokumen <span style="color:var(--c-danger);">*</span></label>
            <select name="Jenis_Dokumen" required>
              ${["Buku","Jurnal","Laporan Penelitian","Laporan Kebijakan","Skripsi/Tesis","Prosiding","E-Book","Dokumen Daerah","Lainnya"].map(j => `<option ${k && k.Jenis_Dokumen === j ? "selected" : ""}>${j}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group-admin">
          <label>Abstrak / Deskripsi</label>
          <textarea name="Abstrak" placeholder="Ringkasan isi dokumen…">${k ? U.escapeHtml(k.Abstrak || "") : ""}</textarea>
        </div>
        <div class="form-group-admin">
          <label>Kata Kunci <span class="hint" style="font-weight:400;color:var(--c-text-muted);">(pisahkan dengan koma)</span></label>
          <input type="text" name="Kata_Kunci" value="${k ? U.escapeAttr(k.Kata_Kunci || "") : ""}" placeholder="riset, ntt, pembangunan daerah" />
        </div>
        <div class="form-grid-2">
          <div class="form-group-admin">
            <label>ISBN / Nomor Dokumen</label>
            <input type="text" name="ISBN_Nomor_Dokumen" value="${k ? U.escapeAttr(k.ISBN_Nomor_Dokumen || "") : ""}" placeholder="ISBN atau nomor dokumen resmi" />
          </div>
          <div class="form-group-admin">
            <label>Sampul (opsional)</label>
            <div class="cover-upload">
              <div class="cover-upload-preview" id="cover-preview">${k && k.URL_Sampul ? `<img src="${U.escapeAttr(U.sanitizeUrl(k.URL_Sampul))}" alt="Sampul saat ini" />` : "<span>Belum ada sampul</span>"}</div>
              <div class="cover-upload-actions">
                <input type="file" id="cover-input" accept="image/png,image/jpeg,image/webp" />
                <button type="button" class="btn btn-ghost btn-sm" id="cover-remove" ${k && k.URL_Sampul ? "" : "hidden"}>Hapus sampul</button>
              </div>
            </div>
            <input type="hidden" name="URL_Sampul" id="cover-value" value="${k ? U.escapeAttr(k.URL_Sampul || "") : ""}" />
            <div class="hint">Unggah gambar JPG/PNG/WebP (otomatis dikecilkan). Bila kosong, sistem membuatkan sampul otomatis.</div>
          </div>
        </div>

        <div class="form-group-admin">
          <label>Unggah Dokumen PDF</label>
          <div class="drop-zone" id="pdf-drop-zone">
            <input type="file" id="pdf-input" name="pdf_file" accept="application/pdf" />
            <div class="dz-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg></div>
            <div class="dz-text">Seret &amp; lepas PDF di sini atau <strong>klik untuk pilih file</strong></div>
            <div class="dz-hint">Maksimum 25 MB. Format PDF saja.</div>
            <div class="dz-preview" id="pdf-preview">${k && k.URL_Dokumen ? "File saat ini: <a href=&quot;" + U.escapeAttr(U.sanitizeUrl(k.URL_Dokumen)) + "&quot; target=&quot;_blank&quot;>Lihat PDF</a>" : ""}</div>
          </div>
          ${k && k.File_ID_Drive ? `<input type="hidden" name="File_ID_Drive" value="${U.escapeAttr(k.File_ID_Drive)}" />` : ""}
          ${k && k.URL_Dokumen ? `<input type="hidden" name="URL_Dokumen_existing" value="${U.escapeAttr(k.URL_Dokumen)}" />` : ""}
        </div>

        <div class="form-grid-2">
          <div class="form-group-admin">
            <label>Status Publikasi <span style="color:var(--c-danger);">*</span></label>
            <select name="Status_Publikasi" required>
              ${["Draft","Terbit","Arsip"].map(s => `<option ${k && k.Status_Publikasi === s ? "selected" : (s === "Draft" && !k ? "selected" : "")}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="form-group-admin">
            <label>Status Akses <span style="color:var(--c-danger);">*</span></label>
            <select name="Status_Akses" required>
              ${["Publik","Internal","Privat"].map(s => `<option ${k && k.Status_Akses === s ? "selected" : (s === "Publik" && !k ? "selected" : "")}>${s}</option>`).join("")}
            </select>
            <div class="hint">"Publik" = dapat diunduh masyarakat. "Internal" = ajukan permohonan. "Privat" = terkunci.</div>
          </div>
        </div>
      </form>
    `, [
      { label: "Batal", cls: "btn-ghost", action: "close" },
      { label: id ? "Simpan Perubahan" : "Simpan Koleksi", cls: "btn-primary", action: "save", id: "btn-save-koleksi" },
    ]);

    // Set selected values
    if (k) {
      const form = document.getElementById("koleksi-form");
      form.Kategori_ID.value = k.Kategori_ID || "";
      form.Jenis_Dokumen.value = k.Jenis_Dokumen || "Buku";
      form.Status_Publikasi.value = k.Status_Publikasi || "Draft";
      form.Status_Akses.value = k.Status_Akses || "Publik";
    }

    // Drop zone handlers
    const dz = document.getElementById("pdf-drop-zone");
    const inp = document.getElementById("pdf-input");
    const prev = document.getElementById("pdf-preview");
    inp.addEventListener("change", () => {
      if (inp.files && inp.files[0]) {
        const f = inp.files[0];
        if (f.size > 25 * 1024 * 1024) {
          U.showToast("Ukuran PDF melebihi 25 MB. Gunakan unggah manual via Drive atau kompresi terlebih dulu.", "warning", "Ukuran terlalu besar");
          inp.value = ""; prev.innerHTML = ""; return;
        }
        if (f.type !== "application/pdf") {
          U.showToast("File harus berformat PDF.", "error"); inp.value = ""; return;
        }
        prev.innerHTML = `<strong>${U.escapeHtml(f.name)}</strong> (${(f.size/1024/1024).toFixed(2)} MB) — siap diunggah`;
      }
    });
    ["dragover","dragenter"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
    ["dragleave","drop"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
    dz.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files && files[0]) { inp.files = files; inp.dispatchEvent(new Event("change")); }
    });

    // Sampul: pilih gambar -> dikecilkan -> disimpan sebagai data URL di field URL_Sampul
    const coverInp = document.getElementById("cover-input");
    const coverVal = document.getElementById("cover-value");
    const coverPrev = document.getElementById("cover-preview");
    const coverRm = document.getElementById("cover-remove");
    coverInp.addEventListener("change", async () => {
      const f = coverInp.files && coverInp.files[0];
      if (!f) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
        U.showToast("Sampul harus berformat JPG, PNG, atau WebP.", "error"); coverInp.value = ""; return;
      }
      try {
        const dataUrl = await compressCover(f);
        coverVal.value = dataUrl;
        coverPrev.innerHTML = `<img src="${dataUrl}" alt="Pratinjau sampul" />`;
        coverRm.hidden = false;
      } catch (err) {
        U.showToast(err.message || "Gagal memproses gambar.", "error"); coverInp.value = "";
      }
    });
    coverRm.addEventListener("click", () => {
      coverVal.value = "";
      coverInp.value = "";
      coverPrev.innerHTML = "<span>Belum ada sampul</span>";
      coverRm.hidden = true;
    });

    // Save action
    document.getElementById("btn-save-koleksi").addEventListener("click", saveKoleksi);
  }

  /* Kecilkan gambar sampul (rasio 3:4, maks 360x480) jadi JPEG data URL < 45.000 karakter
     agar muat di sel Google Sheets maupun db.json lokal. */
  function compressCover(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const W = 360, H = 480;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
        // "cover": isi penuh bingkai, potong bagian lebih
        const scale = Math.max(W / img.width, H / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        let q = 0.82, out = c.toDataURL("image/jpeg", q);
        while (out.length > 45000 && q > 0.3) { q -= 0.08; out = c.toDataURL("image/jpeg", q); }
        if (out.length > 45000) return reject(new Error("Gambar terlalu rumit untuk dikecilkan. Coba gambar lain."));
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gambar tidak bisa dibaca.")); };
      img.src = url;
    });
  }

  async function saveKoleksi() {
    const form = document.getElementById("koleksi-form");
    const btn = document.getElementById("btn-save-koleksi");
    // Validasi sisi klien
    const required = ["Judul", "Penulis", "Kategori_ID", "Tahun", "Jenis_Dokumen"];
    let valid = true;
    required.forEach(name => {
      const el = form.elements[name];
      if (!el.value.trim()) {
        el.style.borderColor = "var(--c-danger)";
        valid = false;
      } else el.style.borderColor = "";
    });
    if (!valid) { U.showToast("Lengkapi field bertanda wajib (*).", "warning"); return; }

    const restore = U.btnLoading(btn, "Menyimpan…");
    try {
      // Bangun FormData dengan file PDF
      const fd = new FormData(form);
      const params = {};
      // Ambil field biasa
      ["ID_Koleksi","Judul","Penulis","Penerbit","Kategori_ID","Tahun","Jenis_Dokumen","Abstrak","Kata_Kunci","ISBN_Nomor_Dokumen","URL_Sampul","Status_Publikasi","Status_Akses","File_ID_Drive","URL_Dokumen_existing"].forEach(k => {
        if (fd.has(k)) params[k] = fd.get(k);
      });
      // File PDF
      const pdfFile = fd.get("pdf_file");
      const hasPdf = pdfFile && pdfFile.size > 0;

      // Auth
      Object.assign(params, authParams({}));

      // Upload PDF via endpoint khusus (base64) - batasi 25MB
      let pdfResult = null;
      if (hasPdf) {
        if (pdfFile.size > 25 * 1024 * 1024) {
          throw new Error("Ukuran PDF melebihi 25 MB. Untuk PDF besar, unggah manual ke Google Drive dan tempel File_ID.");
        }
        // Baca sebagai base64
        U.showToast("Mengunggah PDF ke Google Drive…", "info", "Unggah");
        const base64 = await fileToBase64(pdfFile);
        pdfResult = await U.apiCall("adminUploadPDF", Object.assign(authParams({
          filename: pdfFile.name,
          mime: pdfFile.type,
          data: base64,
        })), "POST");
        if (pdfResult && pdfResult.file_id) {
          params.File_ID_Drive = pdfResult.file_id;
          params.URL_Dokumen = pdfResult.url || "";
        }
      }

      // Simpan koleksi
      const result = await U.apiCall("adminSaveKoleksi", params, "POST");
      U.showToast("Koleksi berhasil disimpan.", "success", "Tersimpan");
      closeModal();
      loadKoleksiList();
      // Refresh dashboard bila terbuka
      if (state.view === "dashboard") loadDashboardStats();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      console.error("Save gagal:", err);
      U.showToast("Gagal menyimpan: " + err.message, "error");
    } finally {
      restore();
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        // Buang prefix data:...
        const result = String(r.result || "");
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      r.onerror = () => reject(new Error("Gagal membaca file."));
      r.readAsDataURL(file);
    });
  }

  async function deleteKoleksi(id) {
    if (!confirm("Hapus koleksi ini?\n\nMetadata akan dihapus dari database. File PDF di Google Drive TIDAK otomatis dihapus untuk mencegah kehilangan data — silakan hapus manual via Drive bila perlu.\n\nLanjutkan?")) return;
    try {
      await U.apiCall("adminDeleteKoleksi", authParams({ id }), "POST");
      U.showToast("Koleksi dihapus.", "success");
      loadKoleksiList();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      U.showToast("Gagal menghapus: " + err.message, "error");
    }
  }

  /* ---------- KATEGORI MANAGE ---------- */
  async function renderKategori() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div>
          <h1>Kelola Kategori</h1>
          <p>Tambah, ubah, urutkan, atau hapus kategori koleksi.</p>
        </div>
        <button class="btn btn-primary" id="btn-tambah-kategori">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Tambah Kategori
        </button>
      </div>
      <div class="admin-panel">
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead><tr><th>Nama Kategori</th><th>Deskripsi</th><th>Status</th><th>Urutan</th><th class="col-narrow">Aksi</th></tr></thead>
            <tbody id="kategori-tbody"><tr><td colspan="5" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
          </table>
        </div>
      </div>`;
    document.getElementById("btn-tambah-kategori").addEventListener("click", () => openKategoriForm(null));
    loadKategoriList();
  }

  async function loadKategoriList() {
    const tbody = document.getElementById("kategori-tbody");
    if (!tbody) return;
    try {
      const data = await U.apiCall("adminGetKategoriList", authParams({}), "POST");
      const items = data.kategori || data || [];
      state.kategoriOptions = items;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><h3>Belum ada kategori</h3><p>Tambahkan kategori pertama Anda.</p></div></td></tr>`;
        return;
      }
      // Sort by Urutan lalu Nama
      items.sort((a,b) => (a.Urutan||0) - (b.Urutan||0) || (a.Nama_Kategori||"").localeCompare(b.Nama_Kategori||""));
      tbody.innerHTML = items.map(k => `
        <tr data-id="${U.escapeAttr(k.Kategori_ID)}">
          <td class="td-title">${U.escapeHtml(k.Nama_Kategori)}</td>
          <td>${U.escapeHtml(U.truncate(k.Deskripsi || "-", 80))}</td>
          <td><span class="mini-badge ${k.Status === "Aktif" ? "success" : "muted"}">${U.escapeHtml(k.Status || "Aktif")}</span></td>
          <td>${U.escapeHtml(String(k.Urutan || 0))}</td>
          <td class="td-actions">
            <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${U.escapeAttr(k.Kategori_ID)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn btn-danger btn-sm" data-act="delete" data-id="${U.escapeAttr(k.Kategori_ID)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </td>
        </tr>`).join("");
      tbody.querySelectorAll('[data-act="edit"]').forEach(b => b.addEventListener("click", () => openKategoriForm(b.getAttribute("data-id"))));
      tbody.querySelectorAll('[data-act="delete"]').forEach(b => b.addEventListener("click", () => deleteKategori(b.getAttribute("data-id"))));
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function openKategoriForm(id) {
    let k = null;
    if (id) {
      try {
        const data = await U.apiCall("adminGetKategoriDetail", authParams({ id }), "POST");
        k = data.kategori || data;
      } catch (err) { U.showToast("Gagal memuat: " + err.message, "error"); return; }
    }
    openModal(id ? "Edit Kategori" : "Tambah Kategori", `
      <form id="kategori-form" novalidate>
        <input type="hidden" name="Kategori_ID" value="${k ? U.escapeAttr(k.Kategori_ID) : ""}" />
        <div class="form-group-admin">
          <label>Nama Kategori <span style="color:var(--c-danger);">*</span></label>
          <input type="text" name="Nama_Kategori" required value="${k ? U.escapeAttr(k.Nama_Kategori || "") : ""}" placeholder="Contoh: Penelitian & Pengembangan" />
        </div>
        <div class="form-group-admin">
          <label>Deskripsi</label>
          <textarea name="Deskripsi" placeholder="Deskripsi singkat kategori…">${k ? U.escapeHtml(k.Deskripsi || "") : ""}</textarea>
        </div>
        <div class="form-grid-2">
          <div class="form-group-admin">
            <label>Status</label>
            <select name="Status">
              <option value="Aktif" ${k && k.Status === "Aktif" ? "selected" : ""}>Aktif</option>
              <option value="Nonaktif" ${k && k.Status === "Nonaktif" ? "selected" : ""}>Nonaktif</option>
            </select>
          </div>
          <div class="form-group-admin">
            <label>Urutan Tampil</label>
            <input type="number" name="Urutan" min="0" max="9999" value="${k ? U.escapeAttr(String(k.Urutan || 0)) : "0"}" />
            <div class="hint">Angka lebih kecil tampil lebih awal.</div>
          </div>
        </div>
      </form>`, [
      { label: "Batal", cls: "btn-ghost", action: "close" },
      { label: "Simpan", cls: "btn-primary", action: "save", id: "btn-save-kategori" },
    ]);
    document.getElementById("btn-save-kategori").addEventListener("click", async () => {
      const form = document.getElementById("kategori-form");
      if (!form.Nama_Kategori.value.trim()) { form.Nama_Kategori.style.borderColor = "var(--c-danger)"; U.showToast("Nama kategori wajib diisi.", "warning"); return; }
      const btn = document.getElementById("btn-save-kategori");
      const restore = U.btnLoading(btn, "Menyimpan…");
      try {
        const params = {
          Kategori_ID: form.Kategori_ID.value,
          Nama_Kategori: form.Nama_Kategori.value.trim(),
          Deskripsi: form.Deskripsi.value.trim(),
          Status: form.Status.value,
          Urutan: parseInt(form.Urutan.value, 10) || 0,
        };
        Object.assign(params, authParams({}));
        await U.apiCall("adminSaveKategori", params, "POST");
        U.showToast("Kategori disimpan.", "success");
        closeModal();
        loadKategoriList();
        state.kategoriOptions = []; // invalidate cache
      } catch (err) {
        if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
        U.showToast("Gagal menyimpan: " + err.message, "error");
      } finally { restore(); }
    });
  }

  async function deleteKategori(id) {
    if (!confirm("Hapus kategori ini?\n\nKoleksi yang menggunakan kategori ini TIDAK akan dihapus, namun kategori pada koleksi tersebut akan kosong dan perlu diperbarui.\n\nLanjutkan?")) return;
    try {
      await U.apiCall("adminDeleteKategori", authParams({ id }), "POST");
      U.showToast("Kategori dihapus.", "success");
      loadKategoriList();
      state.kategoriOptions = [];
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      U.showToast("Gagal menghapus: " + err.message, "error");
    }
  }

  /* ---------- PUBLIKASI PILIHAN ---------- */
  async function renderPublikasi() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div>
          <h1>Publikasi Pilihan</h1>
          <p>Tandai koleksi unggulan yang ingin ditampilkan di beranda bagian "Publikasi Pilihan".</p>
        </div>
        <button class="btn btn-primary" id="btn-tambah-publikasi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Tandai Publikasi Baru
        </button>
      </div>
      <div class="admin-panel">
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead><tr><th>Judul</th><th>Kategori</th><th>Urutan</th><th>Status</th><th class="col-narrow">Aksi</th></tr></thead>
            <tbody id="publikasi-tbody"><tr><td colspan="5" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
          </table>
        </div>
      </div>`;
    document.getElementById("btn-tambah-publikasi").addEventListener("click", openPublikasiForm);
    loadPublikasiList();
  }

  async function loadPublikasiList() {
    const tbody = document.getElementById("publikasi-tbody");
    if (!tbody) return;
    try {
      const data = await U.apiCall("adminGetPublikasiPilihan", authParams({}), "POST");
      const items = data.koleksi || data.items || [];
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><h3>Belum ada publikasi pilihan</h3><p>Tandai koleksi unggulan untuk ditampilkan di beranda.</p></div></td></tr>`;
        return;
      }
      tbody.innerHTML = items.map((k, i) => `
        <tr data-id="${U.escapeAttr(k.ID_Koleksi)}">
          <td class="td-title">${U.escapeHtml(U.truncate(k.Judul, 70))}</td>
          <td>${U.escapeHtml(k.Nama_Kategori || "-")}</td>
          <td>${i + 1}</td>
          <td><span class="mini-badge ${k.Unggulan === "Y" ? "success" : "muted"}">${k.Unggulan === "Y" ? "Unggulan" : "—"}</span></td>
          <td class="td-actions">
            <button class="btn btn-danger btn-sm" data-act="unfeature" data-id="${U.escapeAttr(k.ID_Koleksi)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg> Hapus
            </button>
          </td>
        </tr>`).join("");
      tbody.querySelectorAll('[data-act="unfeature"]').forEach(b => b.addEventListener("click", () => unsetPublikasi(b.getAttribute("data-id"))));
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function openPublikasiForm() {
    await loadKategoriOptions();
    // Load seluruh koleksi terbit
    try {
      const data = await U.apiCall("adminGetKoleksiList", authParams({ page: 1, per_page: 200, status: "Terbit", q: "" }), "POST");
      const items = data.koleksi || data.items || [];
      if (!items.length) { U.showToast("Belum ada koleksi berstatus Terbit untuk ditandai.", "warning"); return; }
      openModal("Tandai Publikasi Pilihan", `
        <form id="publikasi-form">
          <div class="form-group-admin">
            <label>Pilih Koleksi <span style="color:var(--c-danger);">*</span></label>
            <select name="ID_Koleksi" required>
              <option value="">— Pilih koleksi —</option>
              ${items.map(k => `<option value="${U.escapeAttr(k.ID_Koleksi)}">${U.escapeHtml(k.Judul)} — ${U.escapeHtml(k.Penulis || "")}</option>`).join("")}
            </select>
          </div>
          <div class="form-group-admin">
            <label>Urutan Tampil</label>
            <input type="number" name="Urutan" min="1" max="999" value="1" />
            <div class="hint">Angka lebih kecil tampil lebih awal.</div>
          </div>
        </form>`, [
        { label: "Batal", cls: "btn-ghost", action: "close" },
        { label: "Tandai", cls: "btn-primary", action: "save", id: "btn-save-publikasi" },
      ]);
      document.getElementById("btn-save-publikasi").addEventListener("click", async () => {
        const form = document.getElementById("publikasi-form");
        if (!form.ID_Koleksi.value) { U.showToast("Pilih koleksi dulu.", "warning"); return; }
        const btn = document.getElementById("btn-save-publikasi");
        const restore = U.btnLoading(btn, "Menyimpan…");
        try {
          await U.apiCall("adminSetPublikasiPilihan", authParams({
            id: form.ID_Koleksi.value,
            unggulan: "Y",
            Urutan: parseInt(form.Urutan.value, 10) || 1,
          }), "POST");
          U.showToast("Publikasi ditandai sebagai pilihan.", "success");
          closeModal(); loadPublikasiList();
        } catch (err) {
          if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
          U.showToast("Gagal: " + err.message, "error");
        } finally { restore(); }
      });
    } catch (err) {
      U.showToast("Gagal memuat koleksi: " + err.message, "error");
    }
  }

  async function unsetPublikasi(id) {
    if (!confirm("Hapus koleksi ini dari publikasi pilihan?")) return;
    try {
      await U.apiCall("adminSetPublikasiPilihan", authParams({ id, unggulan: "N", Urutan: 0 }), "POST");
      U.showToast("Publikasi pilihan dihapus.", "success");
      loadPublikasiList();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      U.showToast("Gagal: " + err.message, "error");
    }
  }

  /* ---------- PESAN MASUK (dari formulir Kontak -> sheet PESAN_KONTAK) ---------- */
  async function renderPesan() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div><h1>Pesan Masuk</h1><p>Pesan dari formulir Kontak. Data tersimpan di sheet <strong>PESAN_KONTAK</strong> pada Google Sheets.</p></div>
        <div>
          <select id="pesan-filter" aria-label="Filter status pesan">
            <option value="">Semua status</option>
            <option value="Baru">Baru</option>
            <option value="Dibaca">Dibaca</option>
            <option value="Selesai">Selesai</option>
          </select>
        </div>
      </div>
      <div class="admin-panel">
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead><tr><th>Waktu</th><th>Pengirim</th><th>Subjek</th><th>Status</th><th></th></tr></thead>
            <tbody id="pesan-tbody"><tr><td colspan="5" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
          </table>
          <div class="admin-pagination" id="pesan-pagination" style="padding-bottom:14px;"></div>
        </div>
      </div>`;
    const f = document.getElementById("pesan-filter");
    f.value = state.pesan.status;
    f.addEventListener("change", () => { state.pesan.status = f.value; state.pesan.page = 1; loadPesanList(); });
    loadPesanList();
  }

  async function loadPesanList() {
    const tbody = document.getElementById("pesan-tbody");
    if (!tbody) return;
    try {
      const data = await U.apiCall("adminGetPesanList", authParams({ page: state.pesan.page, per_page: state.pesan.perPage, status: state.pesan.status }), "POST");
      const items = data.pesan || [];
      state.pesan.items = items;
      state.pesan.total = data.total || 0;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty"><h3>Belum ada pesan</h3><p>Pesan dari formulir Kontak akan muncul di sini.</p></div></td></tr>`;
        document.getElementById("pesan-pagination").innerHTML = "";
        return;
      }
      const cls = { Baru: "danger", Dibaca: "warning", Selesai: "success" };
      tbody.innerHTML = items.map((m, i) => `
        <tr>
          <td style="white-space:nowrap;font-size:0.82rem;">${U.escapeHtml(U.formatTanggal(m.Waktu))}</td>
          <td><strong>${U.escapeHtml(m.Nama || "-")}</strong><br/><span style="font-size:0.8rem;color:var(--c-text-muted);">${U.escapeHtml(m.Email || "")}</span></td>
          <td>${U.escapeHtml(U.truncate(m.Subjek || "-", 70))}</td>
          <td><span class="mini-badge ${cls[m.Status] || "muted"}">${U.escapeHtml(m.Status || "Baru")}</span></td>
          <td><button class="btn btn-ghost btn-sm" data-i="${i}">Buka</button></td>
        </tr>`).join("");
      tbody.querySelectorAll("button[data-i]").forEach(b => b.addEventListener("click", () => openPesan(state.pesan.items[parseInt(b.getAttribute("data-i"), 10)])));
      renderPesanPagination();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderPesanPagination() {
    const pages = Math.ceil(state.pesan.total / state.pesan.perPage);
    const wrap = document.getElementById("pesan-pagination");
    if (!wrap || pages <= 1) { if (wrap) wrap.innerHTML = ""; return; }
    const cur = state.pesan.page;
    const btns = [`<button ${cur===1?"disabled":""} data-p="prev">‹</button>`];
    for (let i = 1; i <= pages; i++) {
      if (Math.abs(i-cur) > 2 && i !== 1 && i !== pages) continue;
      btns.push(`<button data-p="${i}" class="${i===cur?"active":""}">${i}</button>`);
    }
    btns.push(`<button ${cur===pages?"disabled":""} data-p="next">›</button>`);
    wrap.innerHTML = btns.join("");
    wrap.querySelectorAll("button[data-p]").forEach(b => b.addEventListener("click", () => {
      const v = b.getAttribute("data-p");
      if (v === "prev") state.pesan.page = Math.max(1, cur - 1);
      else if (v === "next") state.pesan.page = Math.min(pages, cur + 1);
      else state.pesan.page = parseInt(v, 10);
      loadPesanList();
    }));
  }

  function openPesan(m) {
    if (!m) return;
    openModal("Pesan dari " + (m.Nama || "-"), `
      <div style="display:grid;gap:10px;font-size:0.92rem;">
        <div><strong>Email:</strong> <a href="mailto:${U.escapeAttr(m.Email || "")}">${U.escapeHtml(m.Email || "-")}</a></div>
        <div><strong>Instansi:</strong> ${U.escapeHtml(m.Instansi || "-")} &nbsp; <strong>Telepon:</strong> ${U.escapeHtml(m.Telepon || "-")}</div>
        <div><strong>Subjek:</strong> ${U.escapeHtml(m.Subjek || "-")}</div>
        <div style="white-space:pre-wrap;background:var(--c-bg-soft);border:1px solid var(--c-border);border-radius:8px;padding:12px;">${U.escapeHtml(m.Pesan || "")}</div>
        <label for="pesan-status"><strong>Status</strong></label>
        <select id="pesan-status">
          ${["Baru","Dibaca","Selesai"].map(s => `<option value="${s}" ${m.Status===s?"selected":""}>${s}</option>`).join("")}
        </select>
        <label for="pesan-catatan"><strong>Catatan internal</strong></label>
        <textarea id="pesan-catatan" rows="3" maxlength="1000" placeholder="Catatan untuk tim (tidak terlihat pengirim)">${U.escapeHtml(m.Catatan_Admin || "")}</textarea>
      </div>`,
      [{ label: "Tutup", cls: "btn-ghost", action: "close" }, { label: "Simpan", cls: "btn-primary", id: "btn-pesan-save" }]);
    document.getElementById("btn-pesan-save").addEventListener("click", async () => {
      try {
        await U.apiCall("adminUpdatePesan", authParams({
          Pesan_ID: m.Pesan_ID,
          Status: document.getElementById("pesan-status").value,
          Catatan_Admin: document.getElementById("pesan-catatan").value,
        }), "POST");
        closeModal();
        U.showToast("Pesan diperbarui.", "success");
        loadPesanList();
      } catch (err) {
        U.showToast("Gagal: " + err.message, "error");
      }
    });
  }

  /* ---------- ANGGOTA ---------- */
  async function renderAnggota() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div><h1>Anggota</h1><p>Pengguna yang mendaftar di situs. Data tersimpan di sheet <strong>PENGGUNA</strong>.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${(U.Session.get() || {}).role === "Super Admin" ? '<button class="btn btn-primary" id="btn-tambah-admin">+ Tambah Admin</button>' : ""}
          <input type="search" id="ang-q" placeholder="Cari nama / email / instansi…" aria-label="Cari anggota" style="min-width:230px;width:auto;" />
          <select id="ang-status" aria-label="Filter status anggota" style="width:auto;">
            <option value="">Semua status</option><option value="Aktif">Aktif</option><option value="Nonaktif">Nonaktif</option>
          </select>
        </div>
      </div>
      <div class="admin-stats-grid" id="ang-ringkasan" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));"></div>
      <div class="admin-panel">
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead><tr><th>Nama</th><th>Instansi</th><th>Role</th><th>Bergabung</th><th>Masuk terakhir</th><th>Status</th><th></th></tr></thead>
            <tbody id="ang-tbody"><tr><td colspan="7" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
          </table>
          <div class="admin-pagination" id="ang-pagination" style="padding-bottom:14px;"></div>
        </div>
      </div>`;
    const q = document.getElementById("ang-q"), st = document.getElementById("ang-status");
    q.value = state.anggota.q; st.value = state.anggota.status;
    q.addEventListener("input", U.debounce(() => { state.anggota.q = q.value.trim(); state.anggota.page = 1; loadAnggotaList(); }, 400));
    st.addEventListener("change", () => { state.anggota.status = st.value; state.anggota.page = 1; loadAnggotaList(); });
    const btnTambah = document.getElementById("btn-tambah-admin");
    if (btnTambah) btnTambah.addEventListener("click", openTambahAdmin);
    loadAnggotaList();
  }

  function openTambahAdmin() {
    openModal("Tambah Administrator", `
      <form id="form-admin-baru" novalidate style="display:grid;gap:14px;">
        <div class="form-group">
          <label for="adm-nama">Nama lengkap <span style="color:var(--c-danger);">*</span></label>
          <input type="text" id="adm-nama" maxlength="100" autocomplete="off" placeholder="Nama administrator" />
        </div>
        <div class="form-group">
          <label for="adm-email">Email <span style="color:var(--c-danger);">*</span></label>
          <input type="email" id="adm-email" autocomplete="off" placeholder="nama@instansi.go.id" />
        </div>
        <div class="form-group">
          <label for="adm-role">Role</label>
          <select id="adm-role">
            <option value="Admin">Admin</option>
            <option value="Editor">Editor</option>
            <option value="Pustakawan">Pustakawan</option>
            <option value="Super Admin">Super Admin</option>
          </select>
        </div>
        <p class="text-muted" style="font-size:0.85rem;">Kata sandi sementara dibuat otomatis dan ditampilkan <strong>sekali</strong>. Jika email sudah terdaftar sebagai anggota, akunnya langsung dinaikkan menjadi admin dengan kata sandi lamanya.</p>
        <div id="adm-result"></div>
      </form>`,
      [{ label: "Tutup", cls: "btn-ghost", action: "close" },
       { label: "Tambah Admin", cls: "btn-primary", id: "btn-adm-simpan" }]);
    document.getElementById("btn-adm-simpan").addEventListener("click", async (e) => {
      const nama = document.getElementById("adm-nama").value.trim();
      const email = document.getElementById("adm-email").value.trim();
      const role = document.getElementById("adm-role").value;
      if (!nama || !email) { U.showToast("Nama dan email wajib diisi.", "warning"); return; }
      if (role === "Super Admin" && !confirm("Super Admin punya akses penuh, termasuk menambah admin lain. Lanjutkan?")) return;
      const restore = U.btnLoading(e.currentTarget, "Menyimpan…");
      try {
        const d = await U.apiCall("adminTambahAdmin", authParams({ nama, email, role }), "POST");
        document.getElementById("adm-result").innerHTML = d.dinaikkan
          ? `<div class="pw-box"><strong>${U.escapeHtml(d.email)}</strong> kini menjadi <strong>${U.escapeHtml(d.role)}</strong>. Kata sandi lamanya tetap dipakai.</div>`
          : `<div class="pw-box">Akun <strong>${U.escapeHtml(d.email)}</strong> (${U.escapeHtml(d.role)}) dibuat.<br/>Kata sandi sementara:<code>${U.escapeHtml(d.password_sementara)}</code><span style="font-size:0.78rem;color:var(--c-text-muted);">Hanya tampil sekarang. Sampaikan secara aman dan minta admin baru menggantinya setelah masuk.</span></div>`;
        U.showToast(d.dinaikkan ? "Anggota dinaikkan menjadi admin." : "Admin baru ditambahkan.", "success");
        e.currentTarget.disabled = true;
        loadAnggotaList();
      } catch (err) { restore(); U.showToast("Gagal: " + err.message, "error"); }
    });
  }

  async function loadAnggotaList() {
    const tbody = document.getElementById("ang-tbody");
    if (!tbody) return;
    try {
      const a = state.anggota;
      const data = await U.apiCall("adminGetAnggotaList", authParams({ page: a.page, per_page: a.perPage, q: a.q, status: a.status }), "POST");
      a.items = data.items || []; a.total = data.total || 0; a.ringkasan = data.ringkasan || null;
      const r = a.ringkasan;
      const rg = document.getElementById("ang-ringkasan");
      if (rg && r) {
        rg.innerHTML = [
          ["", "Total akun", r.total], ["success", "Aktif", r.aktif], ["warning", "Nonaktif", r.nonaktif], ["maroon", "Anggota biasa", r.anggota],
        ].map(x => `<div class="admin-stat-card ${x[0]}"><div class="asc-num">${U.formatAngka(x[2])}</div><div class="asc-lbl">${U.escapeHtml(x[1])}</div></div>`).join("");
      }
      if (!a.items.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><h3>Tidak ada anggota</h3><p>Belum ada pengguna yang cocok dengan pencarian.</p></div></td></tr>`;
        document.getElementById("ang-pagination").innerHTML = "";
        return;
      }
      tbody.innerHTML = a.items.map((u, i) => `
        <tr>
          <td><strong>${U.escapeHtml(u.Nama || "-")}</strong><br/><span style="font-size:0.8rem;color:var(--c-text-muted);">${U.escapeHtml(u.Email || "")}</span></td>
          <td>${U.escapeHtml(u.Instansi || "—")}</td>
          <td><span class="role-chip ${u.bisa_diubah ? "anggota" : ""}">${U.escapeHtml(u.Role || "-")}</span></td>
          <td style="white-space:nowrap;font-size:0.82rem;">${U.escapeHtml(U.formatTanggal(u.Dibuat_Pada, { dateOnly: true }))}</td>
          <td style="white-space:nowrap;font-size:0.82rem;">${U.escapeHtml(u.Login_Terakhir ? U.formatTanggal(u.Login_Terakhir) : "—")}</td>
          <td><span class="mini-badge ${u.Status === "Aktif" ? "success" : "muted"}">${U.escapeHtml(u.Status || "-")}</span></td>
          <td style="text-align:right;white-space:nowrap;">${u.bisa_diubah ? `<button class="btn btn-ghost btn-sm" data-i="${i}">Kelola</button>` : `<span class="text-muted" style="font-size:0.78rem;">Admin</span>`}</td>
        </tr>`).join("");
      tbody.querySelectorAll("button[data-i]").forEach(b => b.addEventListener("click", () => openAnggota(a.items[parseInt(b.getAttribute("data-i"), 10)])));
      renderAnggotaPagination();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--c-danger);padding:16px;">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderAnggotaPagination() {
    const a = state.anggota;
    const pages = Math.ceil(a.total / a.perPage);
    const wrap = document.getElementById("ang-pagination");
    if (!wrap || pages <= 1) { if (wrap) wrap.innerHTML = ""; return; }
    const cur = a.page;
    const btns = [`<button ${cur===1?"disabled":""} data-p="prev">‹</button>`];
    for (let i = 1; i <= pages; i++) {
      if (Math.abs(i-cur) > 2 && i !== 1 && i !== pages) continue;
      btns.push(`<button data-p="${i}" class="${i===cur?"active":""}">${i}</button>`);
    }
    btns.push(`<button ${cur===pages?"disabled":""} data-p="next">›</button>`);
    wrap.innerHTML = btns.join("");
    wrap.querySelectorAll("button[data-p]").forEach(b => b.addEventListener("click", () => {
      const v = b.getAttribute("data-p");
      if (v === "prev") a.page = Math.max(1, cur - 1); else if (v === "next") a.page = Math.min(pages, cur + 1); else a.page = parseInt(v, 10);
      loadAnggotaList();
    }));
  }

  function openAnggota(u) {
    if (!u) return;
    const aktif = u.Status === "Aktif";
    openModal("Kelola anggota", `
      <div style="display:grid;gap:8px;font-size:0.92rem;">
        <div><strong>${U.escapeHtml(u.Nama)}</strong></div>
        <div class="text-muted">${U.escapeHtml(u.Email)}${u.Instansi ? " · " + U.escapeHtml(u.Instansi) : ""}</div>
        <div>Status saat ini: <span class="mini-badge ${aktif ? "success" : "muted"}">${U.escapeHtml(u.Status)}</span></div>
        <hr style="border:none;border-top:1px dashed var(--c-border-strong);margin:8px 0;" />
        <p class="text-muted" style="font-size:0.85rem;">Menonaktifkan akan langsung mengeluarkan anggota dari semua perangkat. Reset kata sandi membuat kata sandi sementara yang ditampilkan <strong>sekali</strong> — sampaikan kepada anggota secara aman.</p>
        <div id="ang-result"></div>
      </div>`,
      [{ label: "Tutup", cls: "btn-ghost", action: "close" },
       { label: "Reset kata sandi", cls: "btn-ghost", id: "btn-ang-reset" },
       { label: aktif ? "Nonaktifkan" : "Aktifkan kembali", cls: aktif ? "btn-danger" : "btn-primary", id: "btn-ang-status" }]);
    document.getElementById("btn-ang-status").addEventListener("click", async (e) => {
      const restore = U.btnLoading(e.currentTarget, "Menyimpan…");
      try {
        await U.apiCall("adminUpdateAnggota", authParams({ user_id: u.User_ID, status: aktif ? "Nonaktif" : "Aktif" }), "POST");
        closeModal(); U.showToast(aktif ? "Anggota dinonaktifkan." : "Anggota diaktifkan kembali.", "success"); loadAnggotaList();
      } catch (err) { restore(); U.showToast("Gagal: " + err.message, "error"); }
    });
    document.getElementById("btn-ang-reset").addEventListener("click", async (e) => {
      if (!confirm("Buat kata sandi sementara untuk " + u.Nama + "? Kata sandi lama tidak akan berlaku.")) return;
      const restore = U.btnLoading(e.currentTarget, "Membuat…");
      try {
        const d = await U.apiCall("adminResetPasswordAnggota", authParams({ user_id: u.User_ID }), "POST");
        document.getElementById("ang-result").innerHTML = `<div class="pw-box">Kata sandi sementara untuk <strong>${U.escapeHtml(d.email)}</strong><code>${U.escapeHtml(d.password_sementara)}</code><span style="font-size:0.78rem;color:var(--c-text-muted);">Hanya tampil sekarang. Minta anggota menggantinya setelah masuk.</span></div>`;
        restore();
      } catch (err) { restore(); U.showToast("Gagal: " + err.message, "error"); }
    });
  }

  /* ---------- LOG ---------- */
  async function renderLog() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div><h1>Log Aktivitas</h1><p>Catatan setiap aksi administrator pada sistem.</p></div>
      </div>
      <div class="admin-panel">
        <div class="ap-body no-pad">
          <table class="admin-table">
            <thead><tr><th>Waktu</th><th>User</th><th>Aktivitas</th><th>Jenis Data</th><th>ID Data</th><th>Keterangan</th></tr></thead>
            <tbody id="log-tbody"><tr><td colspan="6" style="padding:24px;text-align:center;color:var(--c-text-muted);">Memuat…</td></tr></tbody>
          </table>
          <div class="admin-pagination" id="log-pagination" style="padding-bottom:14px;"></div>
        </div>
      </div>`;
    loadLogList();
  }

  async function loadLogList() {
    const tbody = document.getElementById("log-tbody");
    if (!tbody) return;
    try {
      const data = await U.apiCall("adminGetLogList", authParams({ page: state.log.page, per_page: state.log.perPage }), "POST");
      const items = data.log || data.items || [];
      state.log.total = data.total !== undefined ? data.total : items.length;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><h3>Belum ada log</h3><p>Belum ada aktivitas tercatat.</p></div></td></tr>`;
        return;
      }
      tbody.innerHTML = items.map(l => `
        <tr>
          <td style="white-space:nowrap;font-size:0.82rem;">${U.escapeHtml(U.formatTanggal(l.Waktu))}</td>
          <td>${U.escapeHtml(l.Nama_User || l.User_ID || "Sistem")}</td>
          <td>${U.escapeHtml(l.Aktivitas || "-")}</td>
          <td>${U.escapeHtml(l.Jenis_Data || "-")}</td>
          <td style="font-family:monospace;font-size:0.78rem;">${U.escapeHtml(l.ID_Data || "-")}</td>
          <td>${U.escapeHtml(U.truncate(l.Keterangan || "-", 100))}</td>
        </tr>`).join("");
      renderLogPagination();
    } catch (err) {
      if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--c-danger);">${U.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderLogPagination() {
    const pages = Math.ceil(state.log.total / state.log.perPage);
    const wrap = document.getElementById("log-pagination");
    if (!wrap || pages <= 1) { if (wrap) wrap.innerHTML = ""; return; }
    const cur = state.log.page;
    const btns = [`<button ${cur===1?"disabled":""} data-p="prev">‹</button>`];
    for (let i = 1; i <= pages; i++) {
      if (Math.abs(i-cur) > 2 && i !== 1 && i !== pages) continue;
      btns.push(`<button data-p="${i}" class="${i===cur?"active":""}">${i}</button>`);
    }
    btns.push(`<button ${cur===pages?"disabled":""} data-p="next">›</button>`);
    wrap.innerHTML = btns.join("");
    wrap.querySelectorAll("button[data-p]").forEach(b => b.addEventListener("click", () => {
      const v = b.getAttribute("data-p");
      if (v === "prev") state.log.page = Math.max(1, cur - 1);
      else if (v === "next") state.log.page = Math.min(pages, cur + 1);
      else state.log.page = parseInt(v, 10);
      loadLogList();
    }));
  }

  /* ---------- INFO INSTANSI ---------- */
  async function renderInstansi() {
    const c = document.getElementById("admin-content");
    c.innerHTML = `
      <div class="admin-page-header">
        <div><h1>Informasi Instansi</h1><p>Kelola data instansi yang tampil di seluruh halaman publik.</p></div>
      </div>
      <div class="admin-panel">
        <div class="ap-header"><h3>Edit Informasi</h3></div>
        <div class="ap-body">
          <form id="instansi-form">
            <div class="form-group-admin">
              <label>Nama Instansi</label>
              <input type="text" name="instansi" value="${U.escapeAttr(cfg.INSTANSI.instansi)}" />
            </div>
            <div class="form-group-admin">
              <label>Alamat</label>
              <input type="text" name="alamat" value="${U.escapeAttr(cfg.INSTANSI.alamat)}" />
            </div>
            <div class="form-grid-2">
              <div class="form-group-admin">
                <label>Telepon</label>
                <input type="text" name="telepon" value="${U.escapeAttr(cfg.INSTANSI.telepon)}" />
              </div>
              <div class="form-group-admin">
                <label>Email</label>
                <input type="email" name="email" value="${U.escapeAttr(cfg.INSTANSI.email)}" />
              </div>
            </div>
            <div class="form-group-admin">
              <label>Slogan</label>
              <input type="text" name="slogan" value="${U.escapeAttr(cfg.INSTANSI.slogan)}" />
            </div>
            <div class="form-group-admin">
              <label>Deskripsi Singkat</label>
              <textarea name="deskripsi">${U.escapeHtml(cfg.INSTANSI.deskripsi)}</textarea>
            </div>
            <button type="button" class="btn btn-primary" id="btn-save-instansi">Simpan Perubahan</button>
            <p class="hint" style="margin-top:8px;">Catatan: Nilai default di atas diatur di <code>assets/js/config.js</code>. Perubahan di sini disimpan di sheet KONFIGURASI dan akan menimpa nilai default saat halaman publik dimuat.</p>
          </form>
        </div>
      </div>`;

    // Coba muat nilai tersimpan dari KONFIGURASI
    try {
      const data = await U.apiCall("getInstansiConfig", {}, "GET");
      const cfg2 = data.konfigurasi || data || {};
      const form = document.getElementById("instansi-form");
      if (cfg2.instansi) form.instansi.value = cfg2.instansi;
      if (cfg2.alamat) form.alamat.value = cfg2.alamat;
      if (cfg2.telepon) form.telepon.value = cfg2.telepon;
      if (cfg2.email) form.email.value = cfg2.email;
      if (cfg2.slogan) form.slogan.value = cfg2.slogan;
      if (cfg2.deskripsi) form.deskripsi.value = cfg2.deskripsi;
    } catch (err) { /* belum ada konfigurasi — abaikan */ }

    document.getElementById("btn-save-instansi").addEventListener("click", async () => {
      const form = document.getElementById("instansi-form");
      const btn = document.getElementById("btn-save-instansi");
      const restore = U.btnLoading(btn, "Menyimpan…");
      try {
        await U.apiCall("adminSaveInstansiConfig", authParams({
          instansi: form.instansi.value.trim(),
          alamat: form.alamat.value.trim(),
          telepon: form.telepon.value.trim(),
          email: form.email.value.trim(),
          slogan: form.slogan.value.trim(),
          deskripsi: form.deskripsi.value.trim(),
        }), "POST");
        U.showToast("Informasi instansi disimpan.", "success");
      } catch (err) {
        if (err.code === "NO_SESSION" || err.code === "UNAUTHORIZED") { showLoginView(); return; }
        U.showToast("Gagal menyimpan: " + err.message, "error");
      } finally { restore(); }
    });
  }

  /* ---------- MODAL HELPERS ---------- */
  function openModal(title, bodyHtml, footerButtons = []) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHtml;
    const footer = document.getElementById("modal-footer");
    footer.innerHTML = "";
    footerButtons.forEach(b => {
      const btn = document.createElement("button");
      btn.className = `btn ${b.cls || "btn-ghost"}`;
      btn.textContent = b.label;
      if (b.id) btn.id = b.id;
      if (b.action === "close") btn.addEventListener("click", closeModal);
      footer.appendChild(btn);
    });
    document.getElementById("modal-backdrop").classList.add("active");
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("active");
    document.getElementById("modal-body").innerHTML = "";
    document.getElementById("modal-footer").innerHTML = "";
  }
})();
