/* =====================================================================
 * auth.js — Halaman masuk / daftar / lupa kata sandi (masuk.html)
 *
 * - Satu pintu masuk untuk anggota DAN administrator.
 * - Hasil login membawa is_admin; admin diarahkan ke dashboard.
 * - Pengalihan "next" divalidasi (hanya halaman .html lokal).
 * ===================================================================== */
(function () {
  "use strict";

  const U = window.PUtils;
  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    U.mountChrome("");

    // Sudah masuk? Langsung arahkan.
    if (U.Auth.isLoggedIn()) {
      location.replace(afterLoginUrl(U.Auth.isAdmin(), false));
      return;
    }

    // Tab & navigasi antar panel
    document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
    document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => show(b.dataset.go)));
    window.addEventListener("hashchange", () => show(currentFromHash()));
    show(currentFromHash(), true);

    // Tampilkan / sembunyikan kata sandi
    document.querySelectorAll("[data-toggle-pw]").forEach(b => b.addEventListener("click", () => {
      const inp = $(b.dataset.togglePw);
      inp.type = inp.type === "password" ? "text" : "password";
      b.setAttribute("aria-label", inp.type === "password" ? "Tampilkan kata sandi" : "Sembunyikan kata sandi");
    }));

    $("login-form").addEventListener("submit", onLogin);
    $("reg-form").addEventListener("submit", onRegister);
    $("reg-password").addEventListener("input", meter);
    $("lupa-form-1").addEventListener("submit", onLupaMinta);
    $("lupa-form-2").addEventListener("submit", onLupaReset);
    $("lupa-ulang").addEventListener("click", () => { $("lupa-form-2").hidden = true; $("lupa-form-1").hidden = false; setAlert("lupa-alert", ""); });
  }

  /* ---------- Panel & tab ---------- */
  function currentFromHash() {
    const h = location.hash.replace("#", "");
    return ["daftar", "lupa", "masuk"].includes(h) ? h : "masuk";
  }
  function show(name, silent) {
    ["masuk", "daftar", "lupa"].forEach(n => { $("panel-" + n).hidden = n !== name; });
    const tabs = $("auth-tabs");
    tabs.hidden = name === "lupa";
    ["masuk", "daftar"].forEach(n => {
      const t = $("tab-" + n);
      t.classList.toggle("active", n === name);
      t.setAttribute("aria-selected", n === name ? "true" : "false");
    });
    const newHash = name === "masuk" ? "" : "#" + name;
    if (!silent && location.hash !== newHash && (newHash || location.hash)) history.replaceState(null, "", location.pathname + location.search + newHash);
    const first = $("panel-" + name).querySelector("input:not([tabindex='-1']):not([type=checkbox]):not([hidden])");
    if (first && !silent) setTimeout(() => first.focus(), 30);
  }

  /* ---------- Util tampilan ---------- */
  function setAlert(id, msg, type) {
    const el = $(id);
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.className = "alert " + (type || "error");
    el.textContent = msg; el.hidden = false;
  }
  function fieldErr(id, msg) {
    const err = $(id + "-error");
    const grp = $(id).closest(".form-group");
    if (!err) return;
    if (msg) { err.textContent = msg; grp.classList.add("has-error"); } else { err.textContent = ""; grp.classList.remove("has-error"); }
  }
  function clearErrs(form) {
    form.querySelectorAll(".form-group").forEach(g => g.classList.remove("has-error"));
    form.querySelectorAll(".error-msg").forEach(e => { e.textContent = ""; });
  }

  function afterLoginUrl(isAdmin, isNew) {
    const next = U.safeNext(U.getQueryParam("next"), "");
    if (next) return next;
    if (isAdmin) return "admin.html";
    return isNew ? "akun.html" : "index.html";
  }

  function saveSession(d, remember) {
    U.Session.set({
      token: d.token, nama: d.nama, email: d.email, role: d.role,
      is_admin: d.is_admin === true, expiresAt: d.expires_at,
    }, remember);
  }

  /* ---------- Masuk ---------- */
  async function onLogin(e) {
    e.preventDefault();
    setAlert("login-alert", "");
    clearErrs($("login-form"));
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    let ok = true;
    if (!email) { fieldErr("login-email", "Email wajib diisi."); ok = false; }
    else if (!EMAIL_RE.test(email)) { fieldErr("login-email", "Format email tidak valid."); ok = false; }
    if (!password) { fieldErr("login-password", "Kata sandi wajib diisi."); ok = false; }
    if (!ok) return;

    const restore = U.btnLoading($("btn-login"), "Memeriksa…");
    try {
      const remember = $("login-ingat").checked;
      const d = await U.apiCall("login", { email, password, ingat: remember }, "POST");
      if (!d || !d.token) throw new Error("Respons login tidak valid.");
      saveSession(d, remember);
      U.Fav.reset();
      U.showToast("Selamat datang, " + (d.nama || "Sahabat Pembaca") + ".", "success", "Berhasil masuk");
      setTimeout(() => { location.href = afterLoginUrl(d.is_admin === true, false); }, 500);
    } catch (err) {
      setAlert("login-alert", err.message || "Gagal masuk. Periksa email dan kata sandi.");
      restore();
    }
  }

  /* ---------- Daftar ---------- */
  function strength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
    return Math.min(s, 4);
  }
  function meter() {
    const pw = $("reg-password").value;
    const s = pw ? Math.max(1, strength(pw)) : 0;
    const bar = $("pw-bar");
    bar.style.width = (s * 25) + "%";
    bar.style.background = ["transparent", "#b3392b", "#c8742f", "#8aa23a", "#2e7d4f"][s];
    $("pw-hint").textContent = pw ? ["", "Terlalu lemah", "Cukup — tambahkan panjang atau simbol", "Bagus", "Kuat"][s] : "Gunakan huruf dan angka.";
  }

  async function onRegister(e) {
    e.preventDefault();
    setAlert("reg-alert", "");
    clearErrs($("reg-form"));
    const nama = $("reg-nama").value.trim();
    const email = $("reg-email").value.trim();
    const instansi = $("reg-instansi").value.trim();
    const pw = $("reg-password").value;
    const pw2 = $("reg-password2").value;
    let ok = true;
    if (nama.length < 2) { fieldErr("reg-nama", "Nama lengkap wajib diisi (min. 2 huruf)."); ok = false; }
    if (!EMAIL_RE.test(email)) { fieldErr("reg-email", "Format email tidak valid."); ok = false; }
    if (pw.length < 8) { fieldErr("reg-password", "Kata sandi minimal 8 karakter."); ok = false; }
    else if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) { fieldErr("reg-password", "Harus mengandung huruf dan angka."); ok = false; }
    if (pw2 !== pw) { fieldErr("reg-password2", "Kata sandi tidak sama."); ok = false; }
    if (!ok) return;

    const restore = U.btnLoading($("btn-reg"), "Membuat akun…");
    try {
      const d = await U.apiCall("daftarAnggota", { nama, email, instansi, password: pw, website: $("reg-website").value }, "POST");
      if (!d || !d.token) throw new Error("Pendaftaran diterima, tetapi masuk otomatis gagal. Silakan masuk manual.");
      saveSession(d, false);
      U.Fav.reset();
      U.showToast("Akun Anda siap. Selamat membaca!", "success", "Pendaftaran berhasil");
      setTimeout(() => { location.href = afterLoginUrl(false, true); }, 600);
    } catch (err) {
      setAlert("reg-alert", err.message || "Pendaftaran gagal. Coba lagi.");
      restore();
    }
  }

  /* ---------- Lupa kata sandi ---------- */
  async function onLupaMinta(e) {
    e.preventDefault();
    setAlert("lupa-alert", "");
    clearErrs($("lupa-form-1"));
    const email = $("lupa-email").value.trim();
    if (!EMAIL_RE.test(email)) { fieldErr("lupa-email", "Masukkan email yang valid."); return; }
    const restore = U.btnLoading($("btn-lupa-1"), "Mengirim…");
    try {
      await U.apiCall("lupaPasswordMinta", { email }, "POST");
      setAlert("lupa-alert", "Jika email terdaftar, kode telah dikirim. Periksa kotak masuk (dan folder spam).", "success");
      $("lupa-form-1").hidden = true;
      $("lupa-form-2").hidden = false;
      $("lupa-kode").focus();
    } catch (err) {
      setAlert("lupa-alert", err.message || "Gagal mengirim kode.", "error");
    } finally { restore(); }
  }

  async function onLupaReset(e) {
    e.preventDefault();
    clearErrs($("lupa-form-2"));
    const email = $("lupa-email").value.trim();
    const kode = $("lupa-kode").value.trim();
    const pw = $("lupa-password").value;
    let ok = true;
    if (!kode) { fieldErr("lupa-kode", "Kode wajib diisi."); ok = false; }
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) { fieldErr("lupa-password", "Minimal 8 karakter dengan huruf dan angka."); ok = false; }
    if (!ok) return;
    const restore = U.btnLoading($("btn-lupa-2"), "Menyimpan…");
    try {
      await U.apiCall("lupaPasswordReset", { email, kode, password_baru: pw }, "POST");
      U.showToast("Kata sandi berhasil diatur ulang. Silakan masuk.", "success", "Selesai");
      $("lupa-form-2").reset(); $("lupa-form-2").hidden = true; $("lupa-form-1").hidden = false; setAlert("lupa-alert", "");
      $("login-email").value = email;
      show("masuk");
    } catch (err) {
      setAlert("lupa-alert", err.message || "Gagal mengatur ulang kata sandi.", "error");
    } finally { restore(); }
  }
})();
