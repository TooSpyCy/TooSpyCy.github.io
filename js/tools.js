// ============================================================
// TOOLS — Routing SPA
// ============================================================

const MAINCONTENTDIV = document.getElementById('mainContent');

function setNewHTML(pageName) {
  MAINCONTENTDIV.innerHTML = `
    <div class="loading-page">
      <div class="spinner"></div>
    </div>`;

  fetch(`html/${pageName}.html`)
    .then(r => { if (!r.ok) throw new Error(`Page "${pageName}" introuvable`); return r.text(); })
    .then(html => {
      MAINCONTENTDIV.innerHTML = html;
      // Réexécute les scripts inline
      MAINCONTENTDIV.querySelectorAll('script').forEach(old => {
        const s = document.createElement('script');
        s.textContent = old.textContent;
        old.parentNode.replaceChild(s, old);
      });
    })
    .catch(err => {
      MAINCONTENTDIV.innerHTML = `<div class="error-page"><p>⚠️ ${err.message}</p></div>`;
    });
}

function configureHTMLRoutes(btn) {
  const page = btn.getAttribute('name-page');
  if (page) setNewHTML(page);
}

function closeAllSousMenu() {
  document.querySelectorAll('.sousMenuLeftPanel').forEach(m => {
    if (!m.classList.contains('hideLeft')) m.classList.add('hideLeft');
  });
}

function closeAllTabs() {
  document.querySelectorAll('.active[name-page]').forEach(el => el.classList.remove('active'));
}
