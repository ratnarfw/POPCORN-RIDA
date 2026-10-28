/* =====================================================================
 * akun.js — Halaman Akun Saya: profil, rak favorit, riwayat, keamanan
 * ===================================================================== */
(function () {
  "use strict";

  const U = window.PUtils;
  const $ = (id) => document.getElementById(id);
  const PANELS = ["profil", "favorit", "riwayat", "keamanan"];
  const state = { profil: null, favorit: null, riwayat: null, panel: "profil" };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    U.mountChrome("");
    if (!U.Auth.isLoggedIn()) {
      location.replace(U.Auth.loginUrl("akun.html" + location.hash));
      return;
    }
    document.querySelectorAll("#akun-nav [data-panel]").forEach(b => b.addEventListener("click", () => go(b.dataset.panel)));
    $("ak-logout").addEventListener("click", () => U.Auth.logout());
    window.addEventListener("hashchange", () => go(fromHash()));
    document.addEventListener("fav:changed", onFavChanged);

    // Identitas dasar dari sesi (langsung tampil), lalu segarkan dari server
    paintIdentity(U.Auth.user());
    await loadProfil();
    go(fromHash(), true);
    // Hitung favorit & riwayat untuk lencana menu (di latar)
    loadFavorit().then(() => { if (state.panel !== "favorit") $("cnt-fav").textContent = state.favorit.length; });
    loadRiwayat().then(() => { if (state.panel !== "riwayat") $("cnt-riw").textContent = state.riwayat.length; });
  }

  function fromHash() { const h = location.hash.replace("#", ""); return PANELS.includes(h) ? h : "profil"; }

  function paintIdentity(s) {
    if (!s) return;
    $("ak-avatar").textContent = (s.nama || "?").charAt(0).toUpperCase();
    $("ak-nama").textContent = s.nama || "";
    $("ak-email").textContent = s.email || "";
    $("ak-role").textContent = s.is_admin ? (s.role || "Administrator") : "Anggota";
    $("ak-admin").hidden = !s.is_admin;
  }

  /* ---------- Data ---------- */
  async function guarded(fn) {
    try { return await fn(); }
    catch (err) {
      if (err.code === "UNAUTHORIZED") {
        U.showToast("Sesi Anda berakhir. Silakan masuk lagi.", "warning", "Sesi berakhir");
        setTimeout(() => { location.replace(U.Auth.loginUrl("akun.html")); }, 900);
      }
      throw err;
    }
  }
  async function loadProfil() {
    try { state.profil = await guarded(() => U.apiAuth("memberGetProfil")); } catch (e) { state.profil = null; }
    if (state.profil) {
      paintIdentity({ nama: state.profil.nama, email: state.profil.email, role: state.profil.role, is_admin: state.profil.is_admin });
      $("cnt-fav").textContent = state.profil.total_favorit || 0;
      $("cnt-riw").textContent = state.profil.total_riwayat || 0;
    }
  }
  async function loadFavorit(force) {
    if (state.favorit && !force) return state.favorit;
    const d = await guarded(() => U.apiAuth("memberGetFavorit"));
    state.favorit = d.koleksi || [];
    return state.favorit;
  }
  async function loadRiwayat(force) {
    if (state.riwayat && !force) return state.riwayat;
    const d = await guarded(() => U.apiAuth("memberGetRiwayat"));
    state.riwayat = d.koleksi || [];
    return state.riwayat;
  }

  /* ---------- Navigasi panel ---------- */
  function go(name, silent) {
    state.panel = name;
    document.querySelectorAll("#akun-nav [data-panel]").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
    const newHash = name === "profil" ? "" : "#" + name;
    if (!silent && location.hash !== newHash && (newHash || location.hash)) history.replaceState(null, "", location.pathname + newHash);
    ({ profil: renderProfil, favorit: renderFavorit, riwayat: renderRiwayat, keamanan: renderKeamanan })[name]();
  }

  /* ---------- Profil ---------- */
  function renderProfil() {
    const p = state.profil;
    const s = U.Auth.user() || {};
    $("akun-content").innerHTML = `
      <h2>Halo, ${U.escapeHtml((p ? p.nama : s.nama || "").split(" ")[0] || "Sahabat Pembaca")} 👋</h2>
      <p class="sub">Berikut ringkasan rak bacaan dan data akun Anda.</p>
      <div class="mini-stats">
        <div class="ms-item"><b>${U.formatAngka(p ? p.total_favorit : 0)}</b><span>Koleksi favorit</span></div>
        <div class="ms-item"><b>${U.formatAngka(p ? p.total_riwayat : 0)}</b><span>Dokumen pernah dibuka</span></div>
        <div class="ms-item"><b style="font-size:1.1rem;">${U.escapeHtml(p && p.dibuat_pada ? U.formatTanggal(p.dibuat_pada, { dateOnly: true }) : "—")}</b><span>Bergabung sejak</span></div>
      </div>
      <div class="form-card">
        <h3>Data profil</h3>
        <p class="text-muted" style="font-size:0.88rem;margin-bottom:18px;">Email dipakai untuk masuk dan tidak dapat diubah di sini.</p>
        <form id="profil-form" novalidate>
          <div class="form-row">
            <div class="form-group">
              <label for="pf-nama">Nama lengkap</label>
              <input type="text" id="pf-nama" maxlength="100" value="${U.escapeAttr(p ? p.nama : s.nama || "")}" required />
              <div class="error-msg" id="pf-nama-error"></div>
            </div>
            <div class="form-group">
              <label for="pf-email">Email</label>
              <input type="email" id="pf-email" value="${U.escapeAttr(p ? p.email : s.email || "")}" disabled />
            </div>
          </div>
          <div class="form-group">
            <label for="pf-instansi">Instansi / sekolah</label>
            <input type="text" id="pf-instansi" maxlength="150" value="${U.escapeAttr(p ? p.instansi : "")}" placeholder="Opsional" />
          </div>
          <button type="submit" class="btn btn-primary" id="pf-save">Simpan Perubahan</button>
        </form>
      </div>`;
    $("profil-form").addEventListener("submit", saveProfil);
  }

  async function saveProfil(e) {
    e.preventDefault();
    const nama = $("pf-nama").value.trim();
    const grp = $("pf-nama").closest(".form-group");
    if (nama.length < 2) { grp.classList.add("has-error"); $("pf-nama-error").textContent = "Nama minimal 2 huruf."; return; }
    grp.classList.remove("has-error");
    const restore = U.btnLoading($("pf-save"), "Menyimpan…");
    try {
      const d = await guarded(() => U.apiAuth("memberUpdateProfil", { nama, instansi: $("pf-instansi").value.trim() }));
      const s = U.Session.get();
      if (s) { s.nama = d.nama; const remember = !!localStorage.getItem(window.APP_CONFIG.SESSION_KEY); U.Session.set(s, remember); }
      if (state.profil) { state.profil.nama = d.nama; state.profil.instansi = d.instansi; }
      paintIdentity(Object.assign({}, U.Auth.user(), { nama: d.nama }));
      U.showToast("Profil diperbarui.", "success");
    } catch (err) { U.showToast(err.message || "Gagal menyimpan profil.", "error"); }
    finally { restore(); }
  }

  /* ---------- Favorit ---------- */
  async function renderFavorit() {
    $("akun-content").innerHTML = `<h2>Rak Favorit</h2><p class="sub">Koleksi yang Anda simpan untuk dibaca nanti.</p><div class="koleksi-grid" id="fav-grid">${U.skeletonCards(3)}</div>`;
    try {
      const list = await loadFavorit(true);
      $("cnt-fav").textContent = list.length;
      const grid = $("fav-grid");
      if (!list.length) {
        grid.outerHTML = emptyBox("Rak favorit masih kosong", "Ketuk ikon hati pada kartu koleksi untuk menyimpannya di sini.", '<a href="koleksi.html" class="btn btn-primary btn-sm">Jelajahi koleksi</a>');
        return;
      }
      grid.innerHTML = list.map(k => U.koleksiCardHtml(k)).join("");
      U.syncFavButtons(grid);
    } catch (err) { $("fav-grid").outerHTML = emptyBox("Gagal memuat rak favorit", err.message, ""); }
  }

  function onFavChanged(e) {
    if (state.panel !== "favorit" || e.detail.on) return;
    const card = document.querySelector(`#fav-grid .koleksi-card[data-id="${CSS.escape(e.detail.id)}"]`);
    if (card) {
      card.style.transition = "opacity .25s, transform .25s"; card.style.opacity = "0"; card.style.transform = "scale(.94)";
      setTimeout(() => {
        card.remove();
        state.favorit = (state.favorit || []).filter(k => String(k.ID_Koleksi) !== String(e.detail.id));
        $("cnt-fav").textContent = state.favorit.length;
        if (!state.favorit.length) renderFavorit();
      }, 260);
    }
  }

  /* ---------- Riwayat ---------- */
  async function renderRiwayat() {
    $("akun-content").innerHTML = `<h2>Riwayat Baca</h2><p class="sub">Dokumen yang terakhir Anda buka (maksimal 50 terbaru).</p><div id="riw-wrap">${U.skeletonCards(1)}</div>`;
    try {
      const list = await loadRiwayat(true);
      $("cnt-riw").textContent = list.length;
      const wrap = $("riw-wrap");
      if (!list.length) { wrap.innerHTML = emptyBox("Belum ada riwayat", "Dokumen yang Anda buka akan muncul di sini.", '<a href="koleksi.html" class="btn btn-primary btn-sm">Mulai membaca</a>'); return; }
      wrap.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button type="button" class="btn btn-ghost btn-sm" id="riw-clear">Hapus semua riwayat</button></div>
        <div class="riwayat-list">${list.map(k => `
          <a class="riwayat-item" href="detail.html?id=${U.escapeAttr(k.ID_Koleksi)}">
            <span class="ri-ico">${U.escapeHtml(U.inisialJudul(k.Judul))}</span>
            <span class="ri-body"><strong>${U.escapeHtml(k.Judul)}</strong><span>${U.escapeHtml(k.Penulis || "Anonim")} · ${U.escapeHtml(k.Nama_Kategori || "Umum")} · dibuka ${U.escapeHtml(U.formatTanggal(k.Terakhir_Dibuka))}${k.Jumlah_Dibuka > 1 ? " (" + k.Jumlah_Dibuka + "×)" : ""}</span></span>
          </a>`).join("")}</div>`;
      $("riw-clear").addEventListener("click", async () => {
        if (!confirm("Hapus seluruh riwayat baca Anda?")) return;
        try { await guarded(() => U.apiAuth("memberHapusRiwayat")); state.riwayat = []; U.showToast("Riwayat dihapus.", "success"); renderRiwayat(); }
        catch (err) { U.showToast(err.message || "Gagal menghapus riwayat.", "error"); }
      });
    } catch (err) { $("riw-wrap").innerHTML = emptyBox("Gagal memuat riwayat", err.message, ""); }
  }

  /* ---------- Keamanan ---------- */
  function renderKeamanan() {
    $("akun-content").innerHTML = `
      <h2>Keamanan</h2>
      <p class="sub">Ganti kata sandi secara berkala. Perangkat lain akan otomatis keluar.</p>
      <div class="form-card" style="max-width:520px;">
        <form id="pw-form" novalidate>
          <div class="form-group"><label for="pw-lama">Kata sandi saat ini</label><input type="password" id="pw-lama" autocomplete="current-password" /><div class="error-msg" id="pw-lama-error"></div></div>
          <div class="form-group"><label for="pw-baru">Kata sandi baru</label><input type="password" id="pw-baru" autocomplete="new-password" placeholder="Min. 8 karakter, huruf &amp; angka" /><div class="error-msg" id="pw-baru-error"></div></div>
          <div class="form-group"><label for="pw-baru2">Ulangi kata sandi baru</label><input type="password" id="pw-baru2" autocomplete="new-password" /><div class="error-msg" id="pw-baru2-error"></div></div>
          <button type="submit" class="btn btn-primary" id="pw-save">Ganti Kata Sandi</button>
        </form>
      </div>`;
    $("pw-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const lama = $("pw-lama").value, baru = $("pw-baru").value, baru2 = $("pw-baru2").value;
      let ok = true;
      const err = (id, m) => { const g = $(id).closest(".form-group"); $(id + "-error").textContent = m || ""; g.classList.toggle("has-error", !!m); if (m) ok = false; };
      err("pw-lama", lama ? "" : "Wajib diisi.");
      err("pw-baru", (baru.length < 8 || !/[A-Za-z]/.test(baru) || !/[0-9]/.test(baru)) ? "Minimal 8 karakter dengan huruf dan angka." : (baru === lama ? "Harus berbeda dari kata sandi lama." : ""));
      err("pw-baru2", baru2 === baru ? "" : "Tidak sama dengan kata sandi baru.");
      if (!ok) return;
      const restore = U.btnLoading($("pw-save"), "Menyimpan…");
      try {
        await guarded(() => U.apiAuth("memberGantiPassword", { password_lama: lama, password_baru: baru }));
        $("pw-form").reset();
        U.showToast("Kata sandi berhasil diganti.", "success");
      } catch (e2) { U.showToast(e2.message || "Gagal mengganti kata sandi.", "error"); }
      finally { restore(); }
    });
  }

  function emptyBox(title, msg, actions) {
    return `<div class="empty-state"><div class="es-ico es-art-wrap">${U.emptyArt()}</div><h3>${U.escapeHtml(title)}</h3><p>${U.escapeHtml(msg)}</p>${actions}</div>`;
  }
})();
