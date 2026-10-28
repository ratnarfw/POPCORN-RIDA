/* =====================================================================
 * detail.js — Halaman detail koleksi + pembaca PDF + kontrol akses
 * ===================================================================== */

(function () {
  "use strict";

  const U = window.PUtils;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    U.mountChrome("koleksi");

    const id = U.getQueryParam("id");
    if (!id) {
      renderNotFound();
      return;
    }
    renderSkeleton();
    try {
      const data = await U.apiCall("getKoleksiDetail", { id }, "POST");
      if (!data || !data.ID_Koleksi) {
        renderNotFound(data && data.message);
        return;
      }
      renderDetail(data);
      // Update breadcrumb
      document.getElementById("bc-current").textContent = U.truncate(data.Judul, 60);
    } catch (err) {
      renderNotFound(err.message);
    }
  }

  function renderSkeleton() {
    const layout = document.getElementById("detail-layout");
    layout.innerHTML = `
      <div class="detail-grid">
        <aside class="detail-cover">
          <div class="dc-fallback skeleton" style="aspect-ratio:3/4;border-radius:10px;"></div>
          <div class="detail-cover-actions">
            <div class="skeleton" style="height:40px;"></div>
            <div class="skeleton" style="height:40px;"></div>
          </div>
        </aside>
        <main class="detail-main">
          <div class="skeleton" style="height:36px;width:70%;margin-bottom:14px;"></div>
          <div class="skeleton" style="height:18px;width:50%;margin-bottom:24px;"></div>
          <div class="skeleton" style="height:120px;margin-bottom:24px;"></div>
          <div class="skeleton" style="height:200px;"></div>
        </main>
      </div>`;
  }

  function renderDetail(k) {
    const layout = document.getElementById("detail-layout");
    const access = U.accessLabel(k.Status_Akses);
    const publikasi = U.publikasiLabel(k.Status_Publikasi);

    const cover = k.URL_Sampul
      ? `<img src="${U.escapeAttr(U.sanitizeUrl(k.URL_Sampul))}" alt="Sampul ${U.escapeHtml(k.Judul)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="dc-fallback" style="display:none;">${U.escapeHtml(U.inisialJudul(k.Judul))}</div>`
      : `<div class="dc-fallback">${U.escapeHtml(U.inisialJudul(k.Judul))}</div>`;

    // Hak akses tombol baca/unduh
    let accessActions = "";
    const isPublic = access.cls === "success" && k.URL_Dokumen;
    const isInternal = access.text === "Internal";

    if (isPublic && k.URL_Dokumen) {
      accessActions = `
        <a href="${U.escapeAttr(U.sanitizeUrl(k.URL_Dokumen))}" target="_blank" rel="noopener" class="btn btn-primary btn-block" id="btn-baca-pdf">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
          Baca Dokumen
        </a>
        <a href="${U.escapeAttr(U.sanitizeUrl(k.URL_Dokumen))}" download class="btn btn-outline btn-block" id="btn-unduh-pdf">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Unduh PDF
        </a>`;
    } else if (isInternal) {
      accessActions = `
        <button class="btn btn-primary btn-block" id="btn-request-access" data-id="${U.escapeAttr(k.ID_Koleksi)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
          Ajukan Permohonan Akses
        </button>
        <p style="font-size:0.78rem;color:var(--c-text-muted);text-align:center;margin-top:6px;">
          Dokumen internal hanya diakses oleh pemangku instansi. Hubungi BAPPERIDA untuk mendapatkan izin.
        </p>`;
    } else {
      accessActions = `
        <button class="btn btn-ghost btn-block" disabled>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Dokumen Tidak Bisa Diunduh
        </button>
        <p style="font-size:0.78rem;color:var(--c-text-muted);text-align:center;margin-top:6px;">
          Status akses dokumen ini bersifat privat. Silakan hubungi BAPPERIDA untuk informasi lebih lanjut.
        </p>`;
    }

    // Tag kata kunci
    const tags = (k.Kata_Kunci || "").split(",").map(s => s.trim()).filter(Boolean);
    const tagHtml = tags.length
      ? `<div class="tag-list">${tags.map(t => `<span>${U.escapeHtml(t)}</span>`).join("")}</div>`
      : `<p class="text-muted">Tidak ada kata kunci tercatat.</p>`;

    // Metadata terorganisir
    const metaItems = [
      { label: "Penulis", value: k.Penulis },
      { label: "Penerbit / Sumber", value: k.Penerbit },
      { label: "Tahun Terbit", value: k.Tahun },
      { label: "Jenis Dokumen", value: k.Jenis_Dokumen },
      { label: "Kategori", value: k.Nama_Kategori },
      { label: "ISBN / Nomor Dokumen", value: k.ISBN_Nomor_Dokumen },
      { label: "Tanggal Unggah", value: U.formatTanggal(k.Tanggal_Unggah, { dateOnly: true }) },
      { label: "Status Publikasi", value: publikasi.text },
    ];

    // PDF viewer (hanya bila publik & ada URL)
    let pdfSection = "";
    if (isPublic && k.URL_Dokumen) {
      pdfSection = `
        <div class="detail-section" id="pdf-section">
          <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> Pembaca Dokumen</h3>
          <div class="pdf-viewer-wrap">
            <iframe src="${U.escapeAttr(U.sanitizeUrl(k.URL_Dokumen))}" title="Dokumen: ${U.escapeAttr(k.Judul)}" allowfullscreen></iframe>
          </div>
        </div>`;
    } else if (isInternal) {
      pdfSection = `
        <div class="detail-section">
          <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Pembaca Dokumen</h3>
          <div class="pdf-viewer-wrap">
            <div class="pdf-restricted">
              <div class="pr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
              <h3>Dokumen Terbatas</h3>
              <p>Dokumen ini berstatus <strong>Internal</strong> dan hanya dapat diakses oleh pemangku instansi yang berwenang. Hubungi BAPPERIDA Provinsi NTT untuk mengajukan permohonan akses resmi.</p>
            </div>
          </div>
        </div>`;
    } else {
      pdfSection = `
        <div class="detail-section">
          <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Pembaca Dokumen</h3>
          <div class="pdf-viewer-wrap">
            <div class="pdf-restricted">
              <div class="pr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
              <h3>Dokumen Belum Tersedia untuk Akses Umum</h3>
              <p>Status akses dokumen ini bersifat privat atau file PDF belum diunggah. Silakan hubungi BAPPERIDA Provinsi NTT untuk informasi lebih lanjut.</p>
            </div>
          </div>
        </div>`;
    }

    // Tombol rak favorit (anggota) atau ajakan masuk (tamu)
    const loggedIn = U.Auth.isLoggedIn();
    const favBlock = loggedIn
      ? `<button type="button" class="btn btn-ghost btn-block" id="btn-fav" aria-pressed="false">${U.ICON.heart.replace("<svg", '<svg width="18" height="18"')} <span id="btn-fav-label">Simpan ke Rak Favorit</span></button>`
      : `<div class="login-hint"><a href="${U.escapeAttr(U.Auth.loginUrl())}">Masuk</a> atau <a href="masuk.html#daftar">daftar gratis</a> untuk menyimpan koleksi ini ke rak favorit.</div>`;

    layout.innerHTML = `
      <div class="detail-grid">
        <aside class="detail-cover">
          ${cover}
          <div class="detail-cover-actions">
            ${accessActions}
            ${favBlock}
            <a href="koleksi.html" class="btn btn-ghost btn-block">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Kembali ke Daftar Koleksi
            </a>
          </div>
        </aside>

        <main class="detail-main">
          <div class="detail-meta-row">
            <span class="badge primary">${U.escapeHtml(k.Nama_Kategori)}</span>
            <span class="badge ${access.cls === "success" ? "success" : "muted"}">Akses: ${U.escapeHtml(access.text)}</span>
            <span class="badge maroon">${U.escapeHtml(k.Jenis_Dokumen || "Dokumen")}</span>
            <span class="badge muted">Tahun ${U.escapeHtml(k.Tahun || "—")}</span>
          </div>
          <h1>${U.escapeHtml(k.Judul)}</h1>

          <div class="detail-section">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg> Abstrak / Deskripsi</h3>
            <div class="abstract-box">
              <p>${U.escapeHtml(k.Abstrak || "Tidak ada abstrak tercatat untuk dokumen ini.")}</p>
            </div>
          </div>

          <div class="detail-section">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg> Informasi Metadata</h3>
            <div class="meta-list">
              ${metaItems.map(m => `<div class="ml-item"><span class="ml-label">${U.escapeHtml(m.label)}</span><span class="ml-value">${U.escapeHtml(m.value || "—")}</span></div>`).join("")}
            </div>
          </div>

          <div class="detail-section">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1"/></svg> Kata Kunci</h3>
            ${tagHtml}
          </div>

          ${pdfSection}

          <div class="detail-section">
            <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.5 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.5-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> Hubungi untuk Informasi Lebih Lanjut</h3>
            <p>Butuh akses dokumen penuh, salinan resmi, atau klarifikasi konten? Hubungi tim perpustakaan BAPPERIDA Provinsi NTT melalui halaman kontak resmi.</p>
            <a href="kontak.html" class="btn btn-primary">Hubungi BAPPERIDA</a>
          </div>
        </main>
      </div>`;

    // Rak favorit + riwayat baca (hanya saat masuk)
    const favBtn = document.getElementById("btn-fav");
    if (favBtn) {
      const paint = (on) => {
        favBtn.setAttribute("aria-pressed", on ? "true" : "false");
        favBtn.classList.toggle("btn-maroon", on);
        favBtn.classList.toggle("btn-ghost", !on);
        document.getElementById("btn-fav-label").textContent = on ? "Tersimpan di Rak Favorit" : "Simpan ke Rak Favorit";
      };
      U.Fav.load().then(() => paint(U.Fav.has(k.ID_Koleksi)));
      favBtn.addEventListener("click", async () => {
        favBtn.disabled = true;
        try {
          await U.Fav.load();
          const on = await U.Fav.toggle(k.ID_Koleksi);
          paint(on);
          U.showToast(on ? "Disimpan ke rak favorit Anda." : "Dihapus dari rak favorit.", on ? "success" : "info");
        } catch (err) { U.showToast(err.message || "Gagal memperbarui favorit.", "error"); }
        finally { favBtn.disabled = false; }
      });
    }
    if (loggedIn) U.apiAuth("memberCatatRiwayat", { id: k.ID_Koleksi }).catch(() => {});

    // Handler untuk ajukan akses internal
    const reqBtn = document.getElementById("btn-request-access");
    if (reqBtn) {
      reqBtn.addEventListener("click", () => {
        const subj = encodeURIComponent("Permohonan Akses Dokumen: " + (k.Judul || ""));
        const body = encodeURIComponent(
          `Yth. BAPPERIDA Provinsi NTT,\n\nDengan hormat, saya bermaksud mengajukan permohonan akses terhadap dokumen berikut:\n\n` +
          `Judul: ${k.Judul}\nPenulis: ${k.Penulis || "-"}\nTahun: ${k.Tahun || "-"}\nID Dokumen: ${k.ID_Koleksi}\n\n` +
          `Kebutuhan: (sebutkan tujuan)\n\nDemikian permohonan ini saya sampaikan. Atas perhatian dan kerja sama yang baik, saya ucapkan terima kasih.\n\nNama: ${(U.Auth.user() || {}).nama || ""}\nEmail: ${(U.Auth.user() || {}).email || ""}\nInstansi: \nNo. HP: \n`
        );
        window.location.href = `mailto:${window.APP_CONFIG.INSTANSI.email}?subject=${subj}&body=${body}`;
      });
    }
  }

  function renderNotFound(msg) {
    const layout = document.getElementById("detail-layout");
    layout.innerHTML = `
      <div class="empty-state" style="margin:60px 0;">
        <div class="es-ico es-art-wrap">${U.emptyArt()}</div>
        <h3>Koleksi Tidak Ditemukan</h3>
        <p>${U.escapeHtml(msg || "Dokumen yang Anda cari tidak tersedia, telah diarsipkan, atau ID tidak valid.")}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a href="koleksi.html" class="btn btn-primary">Jelajahi Koleksi</a>
          <a href="index.html" class="btn btn-ghost">Kembali ke Beranda</a>
        </div>
      </div>`;
  }
})();
