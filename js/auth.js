// ============================================================
// AUTH — Connexion Twitch + liaison twitch_id → auth.users
// ============================================================

// ── Variables globales ───────────────────────────────────────
// Ces variables sont accessibles partout dans le site

let currentUser     = null;  // L'utilisateur connecté (objet Supabase)
let currentTwitchId = null;  // L'ID Twitch numérique du joueur
let currentProfile  = null;  // Le profil en base de données (nbrpacks, is_admin...)
let isAdmin         = false; // Est-ce que le joueur est admin ?

// Le token JWT de connexion, mis à jour automatiquement
// On l'utilise dans cards.js pour faire les requêtes sans bloquer
let _authToken = null;


// ── Initialisation ───────────────────────────────────────────
// Appelée au démarrage du site dans index.html

async function initAuth() {

  // 1. Vérifie si l'utilisateur est déjà connecté
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {
    await handleUserLogin(user);
  }

  // 2. Écoute les changements de connexion
  //    (quand l'utilisateur se connecte, se déconnecte, ou que le token se renouvelle)
  supabaseClient.auth.onAuthStateChange(async function(event, session) {

    // Met à jour le token à chaque changement
    _authToken = session ? session.access_token : null;

    // Déconnexion
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      currentUser     = null;
      currentTwitchId = null;
      currentProfile  = null;
      isAdmin         = false;
      updateAuthUI();

    // Connexion ou renouvellement du token
    } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      if (session && session.user) {
        await handleUserLogin(session.user);
      }
    }

  });

  // 3. Quand l'utilisateur revient sur l'onglet après l'avoir minimisé,
  //    on renouvelle le token en arrière-plan pour éviter les timeouts
  document.addEventListener('visibilitychange', async function() {

    const ongletVisible = document.visibilityState === 'visible';

    if (ongletVisible && currentUser) {
      console.log('👁️ Retour sur l\'onglet — refresh token...');
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session) {
          _authToken = data.session.access_token;
          console.log('✅ Token rafraîchi');
        }
      } catch (erreur) {
        console.warn('⚠️ Impossible de rafraîchir le token :', erreur.message);
      }
    }

  });

}


// ── Connexion d'un utilisateur ───────────────────────────────
// Appelée quand Supabase détecte une connexion réussie

async function handleUserLogin(user) {

  currentUser = user;

  // Cherche l'identité Twitch dans la liste des identités du compte
  const identities     = user.identities || [];
  const twitchIdentity = identities.find(function(i) { return i.provider === 'twitch'; });

  // Stocke l'ID Twitch (BigInt pour éviter les problèmes de précision avec les grands nombres)
  currentTwitchId = twitchIdentity ? BigInt(twitchIdentity.id) : null;

  // Récupère le pseudo Twitch depuis les métadonnées
  const twitchName = user.user_metadata.preferred_username
                  || user.user_metadata.name
                  || user.email
                  || 'viewer';

  // Si on a un ID Twitch, on lie le compte et on charge le profil
  if (currentTwitchId) {

    // Lie l'ID Twitch au compte Supabase Auth (crée la ligne en BDD si elle n'existe pas)
    await supabaseClient.rpc('link_auth_to_twitch', {
      p_twitch_id:   Number(currentTwitchId),
      p_twitch_name: twitchName,
    });

    // Charge le profil complet (nbrpacks, is_admin, etc.)
    await refreshProfile();
  }

  // Met à jour l'affichage (avatar, nom, boutons)
  updateAuthUI();

}


// ── Chargement du profil ─────────────────────────────────────
// Récupère les données du joueur depuis la base de données

async function refreshProfile() {

  if (!currentTwitchId) return;

  console.log('👤 Chargement du profil...');

  try {

    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('twitch_id', Number(currentTwitchId))
      .single();

    if (error) {
      console.error('❌ Erreur profil :', error);
      return;
    }

    currentProfile = data;
    isAdmin        = currentProfile.is_admin === true;

    console.log('✅ Profil chargé :', currentProfile);

    // Met à jour le badge de packs et la nav admin
    updatePackCount();
    updateAdminNav();

  } catch (erreur) {
    console.warn('⚠️ refreshProfile échoué :', erreur.message);
  }

}


// ── Connexion via Twitch ─────────────────────────────────────
// Appelée quand l'utilisateur clique sur "Connexion Twitch"

async function loginWithTwitch() {
  await supabaseClient.auth.signInWithOAuth({
    provider: 'twitch',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
}


// ── Déconnexion ──────────────────────────────────────────────

async function logout() {
  await supabaseClient.auth.signOut();
}


// ── Récupère le pseudo affiché ───────────────────────────────

function getTwitchUsername() {
  return currentProfile?.twitch_name
      || currentUser?.user_metadata?.preferred_username
      || currentUser?.user_metadata?.name
      || 'Viewer';
}


// ── Met à jour l'interface de connexion ──────────────────────
// Affiche ou cache les boutons selon si l'utilisateur est connecté

function updateAuthUI() {

  const loginBtn   = document.getElementById('loginBtn');
  const logoutBtn  = document.getElementById('logoutBtn');
  const userBadge  = document.getElementById('userBadge');
  const userAvatar = document.getElementById('userAvatar');
  const userName   = document.getElementById('userName');

  if (currentUser) {
    // Connecté : cache le bouton connexion, affiche l'avatar et le bouton déco
    loginBtn.style.display  = 'none';
    logoutBtn.style.display = 'flex';
    userBadge.style.display = 'flex';
    userName.textContent    = getTwitchUsername();

    const avatar = currentUser.user_metadata?.avatar_url;
    if (avatar && userAvatar) {
      userAvatar.src = avatar;
    }

  } else {
    // Déconnecté : affiche le bouton connexion, cache le reste
    loginBtn.style.display  = 'flex';
    logoutBtn.style.display = 'none';
    userBadge.style.display = 'none';
  }

  updatePackCount();

}


// ── Met à jour le badge de packs ─────────────────────────────
// Affiche le nombre de packs disponibles sur le bouton "Ouvrir"

function updatePackCount() {

  const badge = document.getElementById('packCountBadge');
  if (!badge) return;

  const count = currentProfile?.nbrpacks || 0;

  badge.textContent   = count;
  badge.style.display = count > 0 ? 'flex' : 'none';

}


// ── Affiche ou cache la navigation admin ─────────────────────
// Le groupe de boutons admin dans la sidebar

function updateAdminNav() {

  const adminGroup = document.getElementById('adminNavGroup');
  if (!adminGroup) return;

  adminGroup.style.display = isAdmin ? 'flex' : 'none';

}