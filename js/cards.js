// ============================================================
// CARDS — Logique piments × versions couleur
//
// POURQUOI DES FETCH DIRECTS ?
// Le client Supabase JS initialise en interne un WebSocket
// pour son système "realtime". Sur Brave, ce WebSocket est
// intercepté par le navigateur, ce qui bloque tout le client
// (y compris les requêtes HTTP normales) indéfiniment.
//
// Solution : bypasser le client Supabase et appeler l'API
// REST directement avec fetch(). Le fetch fonctionne
// parfaitement sur Brave, seul le client JS est bloqué.
// ============================================================

// ── Cache en mémoire ────────────────────────────────────────
let _cartes   = null;
let _versions = null;
let _dessins  = null;

// ── Helpers fetch directs ────────────────────────────────────

// GET vers l'API REST Supabase
// path = ex: 'carte?select=*&order=scoville.asc'
async function sbFetch(path, options = {}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...(options.headers || {}),
    }
  });

  if (!res.ok) {
    console.error('❌ sbFetch erreur:', res.status, res.statusText, path);
    return null;
  }
  return res.json();
}

// POST vers une fonction RPC Supabase
// fnName = ex: 'open_pack', params = { p_twitch_id: 123 }
async function sbRpc(fnName, params = {}) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    console.error('❌ sbRpc erreur:', res.status, res.statusText, fnName);
    return null;
  }
  return res.json();
}

// ── Lecture ──────────────────────────────────────────────────

async function getAllCartes() {
  if (_cartes) { console.log('📦 Cache cartes OK'); return _cartes; }
  console.log('🌶️ Chargement cartes...');
  const data = await sbFetch('carte?select=*&order=scoville.asc');
  if (!data) { console.error('❌ getAllCartes échoué'); return []; }
  _cartes = data;
  console.log(`✅ ${data.length} cartes chargées`);
  return _cartes;
}

async function getAllVersions() {
  if (_versions) return _versions;
  const data = await sbFetch('carteversion?select=*&order=proba_mult.desc');
  if (!data) return [];
  _versions = data;
  return _versions;
}

async function getUserCollection() {
  if (!currentTwitchId) return [];
  console.log('👤 Chargement collection pour', Number(currentTwitchId));
  const data = await sbFetch(
    `collection?twitch_id=eq.${Number(currentTwitchId)}&select=*,carte(*),carteversion(*)&order=obtained_at.desc`
  );
  if (!data) { console.error('❌ getUserCollection échoué'); return []; }
  console.log(`✅ ${data.length} cartes en collection`);
  return data;
}

async function getDessinMap() {
  if (_dessins) { console.log('🖼️ Cache dessins OK'); return _dessins; }
  console.log('🖼️ Chargement dessins...');
  const data = await sbFetch('cartedessin?select=*');
  if (!data) { console.error('❌ getDessinMap échoué'); return {}; }
  _dessins = {};
  data.forEach(d => {
    _dessins[`${d.carte_id}_${d.carteversion_id}`] = d.image_url;
  });
  console.log(`✅ ${data.length} dessins chargés`);
  return _dessins;
}

// ── Ouverture de pack ─────────────────────────────────────────

async function openPack() {
  console.log('📦 Ouverture pack...');
  if (!currentTwitchId || !currentProfile) { console.warn('⚠️ openPack: pas de profil'); return null; }
  if (currentProfile.nbrpacks <= 0)        { console.warn('⚠️ openPack: 0 packs');      return null; }

  const ok = await sbRpc('open_pack', { p_twitch_id: Number(currentTwitchId) });
  if (ok === null || ok === false) { console.error('❌ open_pack échoué'); return null; }
  console.log('✅ Pack décrémenté');

  const drawn = await drawCards(5);
  console.log('🎲 Cartes tirées:', drawn.map(d => `${d.carte.name} ${d.version.color}`));

  for (const { carte, version } of drawn) {
    await addToCollection(carte.id, version.id);
  }
  await refreshProfile();
  return drawn;
}

async function addToCollection(carteId, versionId) {
  if (!currentTwitchId) return;

  const existing = await sbFetch(
    `collection?twitch_id=eq.${Number(currentTwitchId)}&carte_id=eq.${carteId}&carteversion_id=eq.${versionId}&select=id,quantity`
  );
  const row = existing?.[0];

  if (row) {
    await sbFetch(`collection?id=eq.${row.id}`, {
      method:  'PATCH',
      body:    JSON.stringify({ quantity: row.quantity + 1 }),
      headers: { 'Prefer': 'return=minimal' }
    });
  } else {
    await sbFetch('collection', {
      method:  'POST',
      body:    JSON.stringify({
        twitch_id:       Number(currentTwitchId),
        carte_id:        carteId,
        carteversion_id: versionId,
        quantity:        1,
      }),
      headers: { 'Prefer': 'return=minimal' }
    });
  }
}

// ── Tirage pondéré ────────────────────────────────────────────

async function buildCombinations() {
  const cartes   = await getAllCartes();
  const versions = await getAllVersions();
  const combos   = [];
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

function weightedRandom(items) {
  const total  = items.reduce((s, i) => s + i.weight, 0);
  let   random = Math.random() * total;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

async function drawCards(count = 5) {
  const combos = await buildCombinations();
  const drawn  = [];
  for (let i = 0; i < count; i++) {
    drawn.push(weightedRandom(combos));
  }
  return drawn;
}

// ── Affichage ─────────────────────────────────────────────────

function pepperSVG(color, scoville) {
  const colors = {
    vert:  '#00e676',
    jaune: '#ffd700',
    rouge: '#ff1744',
    noir:  '#b39ddb',
  };
  const c = colors[color] || colors.vert;

  return `
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" class="pepper-svg">
      <defs>
        <radialGradient id="pg-${color}" cx="40%" cy="30%">
          <stop offset="0%"   stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.4"/>
        </radialGradient>
        <filter id="glow-${color}">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="M50 10 Q55 5 60 8 Q58 12 55 15" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round"/>
      <ellipse cx="50" cy="65" rx="22" ry="42" fill="url(#pg-${color})" filter="url(#glow-${color})"/>
      <path d="M36 100 Q50 118 64 100" fill="url(#pg-${color})"/>
      <ellipse cx="40" cy="45" rx="7" ry="12" fill="white" opacity="0.2"/>
      ${scoville > 500000 ? `<text x="50" y="68" text-anchor="middle" font-size="18" opacity="0.6">🔥</text>` : ''}
    </svg>`;
}

function probabilityLabel(carteProba, versionMult) {
  const pct = (parseFloat(carteProba) * parseFloat(versionMult) * 100).toFixed(2);
  return `${pct}%`;
}