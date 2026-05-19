// ============================================================
// TOOLS — Routing SPA
// ============================================================

const MAINCONTENTDIV = document.getElementById("mainContent");

function setNewHTML(pageName) {
  MAINCONTENTDIV.innerHTML = `<div class="loading-page"><div class="spinner"></div></div>`;

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 8000)
  );

  Promise.race([fetch(`html/${pageName}.html`), timeout])
    .then(r => { if (!r.ok) throw new Error(`Page introuvable`); return r.text(); })
    .then(html => {
      MAINCONTENTDIV.innerHTML = html;
      MAINCONTENTDIV.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        s.textContent = `(function(){\n${old.textContent}\n})();`;
        old.parentNode.replaceChild(s, old);
      });
    })
    .catch(err => {
      MAINCONTENTDIV.innerHTML = `
        <div class="empty-state">
          <div class="icon">⚠️</div>
          <p>Erreur de chargement</p>
          <small>${err.message}</small>
          <button class="btn-pink" onclick="setNewHTML('${pageName}')" style="margin-top:12px">
            Réessayer
          </button>
        </div>`;
    });
}


function configureHTMLRoutes(btn) {
  const page = btn.getAttribute("name-page");
  if (page) setNewHTML(page);
}

function closeAllSousMenu() {
  document.querySelectorAll(".sousMenuLeftPanel").forEach((m) => {
    if (!m.classList.contains("hideLeft")) m.classList.add("hideLeft");
  });
}

function closeAllTabs() {
  document
    .querySelectorAll(".active[name-page]")
    .forEach((el) => el.classList.remove("active"));
}
