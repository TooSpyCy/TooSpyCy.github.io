// ============================================================
// AUTH — Connexion Twitch + liaison twitch_id → auth.users
// ============================================================

let currentUser     = null;
let currentTwitchId = null;
let currentProfile  = null;

// Token JWT mis à jour automatiquement via onAuthStateChange
// Utilisé par sbFetch/sbRpc dans cards.js sans appeler getSession()
let _authToken = null;

async function initAuth() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) await handleUserLogin(user);

  // Met à jour _authToken à chaque changement d'état auth
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    _authToken = session?.access_token || null;

    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      currentUser     = null;
      currentTwitchId = null;
      currentProfile  = null;
      updateAuthUI();
    } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      if (session?.user) await handleUserLogin(session.user);
    }
  });

  // Quand l'utilisateur revient sur l'onglet → rafraîchit le token
  // sans bloquer les requêtes (le token est mis à jour en arrière-plan)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && currentUser) {
      console.log('👁️ Retour sur l\'onglet — refresh token...');
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session?.access_token) {
          _authToken = data.session.access_token;
          console.log('✅ Token rafraîchi');
        }
      } catch (e) {
        console.warn('⚠️ Impossible de rafraîchir le token:', e.message);
      }
    }
  });
}

async function handleUserLogin(user) {
  currentUser = user;

  const twitchIdentity = user.identities?.find(i => i.provider === 'twitch');
  currentTwitchId      = twitchIdentity ? BigInt(twitchIdentity.id) : null;

  const twitchName = user.user_metadata?.preferred_username
                  || user.user_metadata?.name
                  || user.email
                  || 'viewer';

  if (currentTwitchId) {
    await supabaseClient.rpc('link_auth_to_twitch', {
      p_twitch_id:   Number(currentTwitchId),
      p_twitch_name: twitchName,
    });
    await refreshProfile();
  }

  updateAuthUI();
}

async function refreshProfile() {
  if (!currentTwitchId) return;
  console.log('👤 Refresh profil...');
  try {
    const data = await sbFetch(
      `users?twitch_id=eq.${Number(currentTwitchId)}&select=*&limit=1`
    );
    if (data?.[0]) {
      currentProfile = data[0];
      console.log('✅ Profil:', currentProfile);
      updatePackCount();
    }
  } catch (e) {
    console.warn('⚠️ refreshProfile échoué:', e.message);
  }
}

async function loginWithTwitch() {
  await supabaseClient.auth.signInWithOAuth({
    provider: 'twitch',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

async function logout() {
  await supabaseClient.auth.signOut();
}

function getTwitchUsername() {
  return currentProfile?.twitch_name
      || currentUser?.user_metadata?.preferred_username
      || currentUser?.user_metadata?.name
      || 'Viewer';
}

function updateAuthUI() {
  const loginBtn   = document.getElementById('loginBtn');
  const logoutBtn  = document.getElementById('logoutBtn');
  const userBadge  = document.getElementById('userBadge');
  const userAvatar = document.getElementById('userAvatar');
  const userName   = document.getElementById('userName');

  if (currentUser) {
    loginBtn.style.display  = 'none';
    logoutBtn.style.display = 'flex';
    userBadge.style.display = 'flex';
    userName.textContent    = getTwitchUsername();
    const avatar            = currentUser.user_metadata?.avatar_url;
    if (avatar && userAvatar) userAvatar.src = avatar;
  } else {
    loginBtn.style.display  = 'flex';
    logoutBtn.style.display = 'none';
    userBadge.style.display = 'none';
  }
  updatePackCount();
}

function updatePackCount() {
  const badge = document.getElementById('packCountBadge');
  if (!badge) return;
  const count = currentProfile?.nbrpacks || 0;
  badge.textContent   = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}