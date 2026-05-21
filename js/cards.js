// ============================================================
// CARDS — Logique piments × versions couleur
//
// POURQUOI DES FETCH DIRECTS ?
// Le client Supabase JS initialise un WebSocket pour le
// realtime et appelle getSession() de façon synchrone lors
// des requêtes. Quand l'onglet est mis en arrière-plan puis
// reprend le focus, le navigateur peut bloquer ce processus
// indéfiniment (bug reproductible sur Brave ET Chrome).
//
// Solution : bypass du client Supabase pour les requêtes data.
// On utilise fetch() directement avec le token JWT stocké
// dans _authToken (mis à jour par auth.js via onAuthStateChange).
// Le fetch() natif ne hang jamais au retour d'onglet.
// ============================================================


// ── Cache en mémoire ─────────────────────────────────────────
// On stocke les données une fois chargées pour ne pas refaire
// les mêmes requêtes à chaque fois

let _cartes   = null; // Liste de tous les piments
let _versions = null; // Liste des 4 couleurs (vert, jaune, rouge, noir)
let _dessins  = null; // Map des images par combinaison piment+couleur


// ── Requête GET vers Supabase ─────────────────────────────────
// path = la table + les filtres, ex: 'carte?select=*&order=scoville.asc'
// options = headers ou body supplémentaires si besoin

async function sbFetch(path, options = {}) {

  // Utilise le token JWT mis en cache — jamais de getSession() bloquant
  const token = _authToken || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    console.error('❌ sbFetch:', res.status, res.statusText, path);
    return null;
  }

  return res.json();
}


// ── Appel d'une fonction SQL (RPC) ───────────────────────────
// fnName = nom de la fonction SQL, ex: 'open_pack'
// params = les paramètres à passer à la fonction

async function sbRpc(fnName, params = {}) {

  const token = _authToken || SUPABASE_ANON_KEY;

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
    console.error('❌ sbRpc:', res.status, res.statusText, fnName);
    return null;
  }

  return res.json();
}


// ── Charge tous les piments ───────────────────────────────────
// Triés du moins piquant au plus piquant (scoville croissant)

async function getAllCartes() {

  // Si déjà en cache, on retourne directement sans refaire la requête
  if (_cartes) {
    console.log('📦 Cache cartes OK');
    return _cartes;
  }

  console.log('🌶️ Chargement cartes...');

  const data = await sbFetch('carte?select=*&order=scoville.asc');

  if (!data) {
    console.error('❌ getAllCartes échoué');
    return [];
  }

  _cartes = data;
  console.log(`✅ ${data.length} cartes chargées`);
  return _cartes;
}


// ── Charge les 4 versions de couleur ─────────────────────────
// Triées par probabilité décroissante (vert en premier, noir en dernier)

async function getAllVersions() {

  if (_versions) return _versions;

  const data = await sbFetch('carteversion?select=*&order=proba_mult.desc');

  if (!data) return [];

  _versions = data;
  return _versions;
}


// ── Charge la collection du joueur connecté ──────────────────
// Retourne toutes les cartes qu'il possède avec leurs détails

async function getUserCollection() {

  if (!currentTwitchId) return [];

  console.log('👤 Chargement collection pour', Number(currentTwitchId));

  const data = await sbFetch(
    `collection?twitch_id=eq.${Number(currentTwitchId)}&select=*,carte(*),carteversion(*)&order=obtained_at.desc`
  );

  if (!data) {
    console.error('❌ getUserCollection échoué');
    return [];
  }

  console.log(`✅ ${data.length} cartes en collection`);
  return data;
}


// ── Charge la map des images de cartes ───────────────────────
// Construit un objet { "carte_id_version_id": "url_image" }
// pour retrouver rapidement l'image d'une combinaison piment+couleur

async function getDessinMap() {

  if (_dessins) {
    console.log('🖼️ Cache dessins OK');
    return _dessins;
  }

  console.log('🖼️ Chargement dessins...');

  const data = await sbFetch('cartedessin?select=*');

  if (!data) {
    console.error('❌ getDessinMap échoué');
    return {};
  }

  // Construit la map pour un accès rapide par clé "carte_id_version_id"
  _dessins = {};
  data.forEach(dessin => {
    const cle = `${dessin.carte_id}_${dessin.carteversion_id}`;
    _dessins[cle] = dessin.image_url;
  });

  console.log(`✅ ${data.length} dessins chargés`);
  return _dessins;
}


// ── Ouvre un pack ─────────────────────────────────────────────
// Appelle l'Edge Function qui fait tout côté serveur :
// décrémente le pack, tire 5 cartes, les sauvegarde en BDD
// et retourne les cartes tirées

async function openPack() {

  console.log('📦 Ouverture pack via Edge Function...');

  if (!currentTwitchId || !currentProfile) {
    console.warn('⚠️ openPack: pas de profil');
    return null;
  }

  if (currentProfile.nbrpacks <= 0) {
    console.warn('⚠️ openPack: 0 packs');
    return null;
  }

  const token = _authToken || SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/open-pack-and-draw`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('❌ open-pack-and-draw échoué:', res.status, err);
    return null;
  }

  const result = await res.json();

  console.log(
    '✅ Pack ouvert, cartes reçues:',
    result.cards?.map(c => `${c.carte.name} ${c.version.color}`)
  );

  // Met à jour le compteur de packs affiché dans la sidebar
  if (currentProfile) currentProfile.nbrpacks = result.nbrpacks;
  updatePackCount();

  // Retourne les cartes sous le format [{ carte, version }]
  return result.cards;
}


// ── Ajoute une carte à la collection ─────────────────────────
// Si la carte existe déjà, incrémente la quantité
// Sinon, crée une nouvelle ligne

async function addToCollection(carteId, versionId) {

  if (!currentTwitchId) return;

  // Vérifie si le joueur a déjà cette combinaison piment+couleur
  const existing = await sbFetch(
    `collection?twitch_id=eq.${Number(currentTwitchId)}&carte_id=eq.${carteId}&carteversion_id=eq.${versionId}&select=id,quantity`
  );
  const ligne = existing?.[0];

  if (ligne) {
    // La carte existe → on incrémente la quantité
    await sbFetch(`collection?id=eq.${ligne.id}`, {
      method:  'PATCH',
      body:    JSON.stringify({ quantity: ligne.quantity + 1 }),
      headers: { 'Prefer': 'return=minimal' },
    });
  } else {
    // La carte n'existe pas → on crée une nouvelle ligne
    await sbFetch('collection', {
      method:  'POST',
      body:    JSON.stringify({
        twitch_id:       Number(currentTwitchId),
        carte_id:        carteId,
        carteversion_id: versionId,
        quantity:        1,
      }),
      headers: { 'Prefer': 'return=minimal' },
    });
  }
}


// ── Construit toutes les combinaisons possibles ───────────────
// 30 piments × 4 couleurs = 120 combinaisons
// Chaque combinaison a un poids = proba du piment × proba de la couleur

async function buildCombinations() {

  const cartes   = await getAllCartes();
  const versions = await getAllVersions();
  const combos   = [];

  for (const carte of cartes) {
    for (const version of versions) {
      combos.push({
        carte,
        version,
        weight: parseFloat(carte.proba) * parseFloat(version.proba_mult),
      });
    }
  }

  return combos;
}


// ── Tirage pondéré ────────────────────────────────────────────
// Tire un élément au hasard en respectant les probabilités
// Les cartes avec un poids élevé ont plus de chances d'être tirées

function weightedRandom(items) {

  // Calcule la somme totale des poids
  const total = items.reduce((somme, item) => somme + item.weight, 0);

  // Tire un nombre aléatoire entre 0 et total
  let aleatoire = Math.random() * total;

  // Parcourt les items et soustrait leur poids jusqu'à tomber à 0
  for (const item of items) {
    aleatoire -= item.weight;
    if (aleatoire <= 0) return item;
  }

  // Sécurité : retourne le dernier item si rien n'a été sélectionné
  return items[items.length - 1];
}


// ── Tire `count` cartes aléatoires ───────────────────────────

async function drawCards(count = 5) {

  const combos = await buildCombinations();
  const tirees = [];

  for (let i = 0; i < count; i++) {
    tirees.push(weightedRandom(combos));
  }

  return tirees;
}


// ── Génère un SVG de piment coloré ───────────────────────────
// Utilisé quand une carte n'a pas encore d'image personnalisée

function pepperSVG(color, scoville) {

  // Couleur du piment selon la version
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
      <!-- Tige -->
      <path d="M50 10 Q55 5 60 8 Q58 12 55 15" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Corps -->
      <ellipse cx="50" cy="65" rx="22" ry="42" fill="url(#pg-${color})" filter="url(#glow-${color})"/>
      <!-- Pointe -->
      <path d="M36 100 Q50 118 64 100" fill="url(#pg-${color})"/>
      <!-- Reflet -->
      <ellipse cx="40" cy="45" rx="7" ry="12" fill="white" opacity="0.2"/>
      <!-- Flamme si très piquant (> 500 000 scoville) -->
      ${scoville > 500000 ? `<text x="50" y="68" text-anchor="middle" font-size="18" opacity="0.6">🔥</text>` : ''}
    </svg>`;
}


// ── Formate une probabilité en pourcentage lisible ────────────
// Ex: probabilityLabel(0.01, 0.05) → "0.05%"

function probabilityLabel(carteProba, versionMult) {
  const pct = (parseFloat(carteProba) * parseFloat(versionMult) * 100).toFixed(2);
  return `${pct}%`;
}