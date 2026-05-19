// ============================================================
// CARDS — Logique piments × versions couleur
// Proba finale = carte.proba × carteversion.proba_mult
// ============================================================

// Cache en mémoire pour éviter les requêtes répétées
let _cartes    = null;
let _versions  = null;
let _dessins = null;

// ── LECTURE ────────────────────────────────────────────────
async function getDessinMap() {
  if (_dessins) return _dessins;
  const { data } = await withTimeout(
    supabaseClient.from('cartedessin').select('*')
  );
  _dessins = {};
  (data || []).forEach(d => {
    _dessins[`${d.carte_id}_${d.carteversion_id}`] = d.image_url;
  });
  return _dessins;
}

async function getAllCartes() {
  if (_cartes) return _cartes;
  const { data, error } = await withTimeout(
    supabaseClient.from('carte').select('*').order('scoville')
  );
  if (error) { console.error(error); return []; }
  _cartes = data || [];
  return _cartes;
}

async function getAllVersions() {
  if (_versions) return _versions;
  const { data, error } = await withTimeout(
    supabaseClient.from('carteversion').select('*').order('proba_mult', { ascending: false })
  );
  if (error) { console.error(error); return []; }
  _versions = data || [];
  return _versions;
}

async function getUserCollection() {
  if (!currentTwitchId) return [];
  const { data, error } = await withTimeout(
    supabaseClient
      .from('collection')
      .select(`*, carte(*), carteversion(*)`)
      .eq('twitch_id', Number(currentTwitchId))
      .order('obtained_at', { ascending: false })
  );
  if (error) { console.error(error); return []; }
  return data || [];
}

// Helper timeout pour toutes les requêtes Supabase
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

// ── TIRAGE ─────────────────────────────────────────────────

// Construit toutes les combinaisons (piment × version) avec leur poids
async function buildCombinations() {
  const cartes   = await getAllCartes();
  const versions = await getAllVersions();

  const combos = [];
  for (const c of cartes) {
    for (const v of versions) {
      combos.push({
        carte:   c,
        version: v,
        weight:  parseFloat(c.proba) * parseFloat(v.proba_mult),
      });
    }
  }
  return combos;
}

// Tirage pondéré dans un tableau de {weight, ...}
function weightedRandom(items) {
  const total  = items.reduce((s, i) => s + i.weight, 0);
  let   random = Math.random() * total;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

// Tire `count` cartes et les retourne
async function drawCards(count = 5) {
  const combos = await buildCombinations();
  const drawn  = [];
  for (let i = 0; i < count; i++) {
    drawn.push(weightedRandom(combos));
  }
  return drawn;
}

// ── OUVERTURE ───────────────────────────────────────────────

async function openPack() {
  if (!currentTwitchId || !currentProfile) return null;
  if (currentProfile.nbrpacks <= 0) return null;

  const { data: ok, error } = await withTimeout(
    supabaseClient.rpc('open_pack', { p_twitch_id: Number(currentTwitchId) })
  );
  if (error || !ok) { console.error('open_pack error:', error); return null; }

  const drawn = await drawCards(5);
  for (const { carte, version } of drawn) {
    await addToCollection(carte.id, version.id);
  }
  await refreshProfile();
  return drawn;
}

async function addToCollection(carteId, versionId) {
  if (!currentTwitchId) return;
  const { data: existing } = await withTimeout(
    supabaseClient
      .from('collection')
      .select('id, quantity')
      .eq('twitch_id', Number(currentTwitchId))
      .eq('carte_id', carteId)
      .eq('carteversion_id', versionId)
      .maybeSingle()
  );
  if (existing) {
    await withTimeout(
      supabaseClient.from('collection').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
    );
  } else {
    await withTimeout(
      supabaseClient.from('collection').insert({
        twitch_id: Number(currentTwitchId), carte_id: carteId, carteversion_id: versionId, quantity: 1,
      })
    );
  }
}

// ── AFFICHAGE ───────────────────────────────────────────────

const VERSION_STYLES = {
  vert:  { bg: '#0d2d1a', border: '#00e676', glow: 'rgba(0,230,118,0.3)',   label: '🟢 Vert'  },
  jaune: { bg: '#2d2600', border: '#ffd700', glow: 'rgba(255,215,0,0.3)',   label: '🟡 Jaune' },
  rouge: { bg: '#2d0a0a', border: '#ff1744', glow: 'rgba(255,23,68,0.35)',  label: '🔴 Rouge' },
  noir:  { bg: '#0d0d14', border: '#9c27b0', glow: 'rgba(156,39,176,0.5)',  label: '⚫ Noir'  },
};

// Renvoie le HTML d'une carte pour la grille collection
function collectionCardHTML(item) {
  const c      = item.carte;
  const v      = item.carteversion;
  const style  = VERSION_STYLES[v.color] || VERSION_STYLES.vert;
  const image  = item.cartedessin?.image_url || c.image_url;

  return `
    <div class="card-item cv-${v.color}"
         style="--card-border:${style.border};--card-glow:${style.glow};--card-bg:${style.bg};"
         title="${c.description || c.name}">
      <div class="card-inner">
        <div class="card-visual">
          ${image
            ? `<img src="${image}" alt="${c.name}">`
            : pepperSVG(v.color, c.scoville)}
        </div>
        <div class="card-meta">
          <span class="card-name">${c.name}</span>
          <span class="card-version">${style.label}</span>
          <span class="card-scoville">${c.scoville.toLocaleString('fr-FR')} SHU</span>
        </div>
        ${item.quantity > 1
          ? `<span class="card-qty">×${item.quantity}</span>`
          : ''}
        ${v.color === 'noir'
          ? '<div class="noir-shimmer"></div>'
          : ''}
      </div>
    </div>`;
}

// Génère un SVG piment coloré selon la version
function pepperSVG(color, scoville) {
  const colors = {
    vert:  '#00e676',
    jaune: '#ffd700',
    rouge: '#ff1744',
    noir:  '#b39ddb',
  };
  const c = colors[color] || colors.vert;
  const size = Math.min(3 + scoville / 500000, 8); // taille proportionnelle au scoville

  return `
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" class="pepper-svg">
      <defs>
        <radialGradient id="pg-${color}" cx="40%" cy="30%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.4"/>
        </radialGradient>
        <filter id="glow-${color}">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Tige -->
      <path d="M50 10 Q55 5 60 8 Q58 12 55 15" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Corps du piment -->
      <ellipse cx="50" cy="65" rx="22" ry="42" fill="url(#pg-${color})" filter="url(#glow-${color})"/>
      <!-- Pointe -->
      <path d="M36 100 Q50 118 64 100" fill="url(#pg-${color})"/>
      <!-- Brillance -->
      <ellipse cx="40" cy="45" rx="7" ry="12" fill="white" opacity="0.2"/>
      <!-- Flammes si très piquant -->
      ${scoville > 500000 ? `
        <text x="50" y="68" text-anchor="middle" font-size="18" opacity="0.6">🔥</text>
      ` : ''}
    </svg>`;
}

// Probabilité combinée lisible (pour affichage)
function probabilityLabel(carteProba, versionMult) {
  const pct = (parseFloat(carteProba) * parseFloat(versionMult) * 100).toFixed(2);
  return `${pct}%`;
}
