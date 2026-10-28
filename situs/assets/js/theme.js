/* theme.js — terapkan mode terang/malam SEBELUM halaman dilukis (mencegah kilatan). */
(function () {
  try {
    var t = localStorage.getItem("perpus_ntt_theme");
    if (!t && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) t = "dark";
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
