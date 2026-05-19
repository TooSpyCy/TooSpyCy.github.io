// ============================================================
// AUTH — Connexion Twitch + liaison twitch_id → auth.users
// ============================================================

let currentUser = null; // session Supabase
let currentTwitchId = null; // Twitch ID (bigint)
let currentProfile = null; // ligne dans la table users

async function initAuth() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (user) await handleUserLogin(user);

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || event === "USER_DELETED") {
      currentUser = null;
      currentTwitchId = null;
      currentProfile = null;
      updateAuthUI();
    } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      if (session?.user) await handleUserLogin(session.user);
    }
  });
}

async function handleUserLogin(user) {
  currentUser = user;

  // Récupère le Twitch ID depuis les identités Supabase
  const twitchIdentity = user.identities?.find((i) => i.provider === "twitch");
  currentTwitchId = twitchIdentity ? BigInt(twitchIdentity.id) : null;

  const twitchName =
    user.user_metadata?.preferred_username ||
    user.user_metadata?.name ||
    user.email ||
    "viewer";

  if (currentTwitchId) {
    // Lie le compte Supabase Auth au twitch_id dans notre table users
    await supabaseClient.rpc("link_auth_to_twitch", {
      p_twitch_id: Number(currentTwitchId),
      p_twitch_name: twitchName,
    });

    // Charge le profil (nbrpacks, etc.)
    await refreshProfile();
  }

  updateAuthUI();
}

async function refreshProfile() {
  if (!currentTwitchId) return;
  const { data } = await supabaseClient
    .from("users")
    .select("*")
    .eq("twitch_id", Number(currentTwitchId))
    .single();
  currentProfile = data;
  updatePackCount();
}

async function loginWithTwitch() {
  await supabaseClient.auth.signInWithOAuth({
    provider: "twitch",
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
}

async function logout() {
  await supabaseClient.auth.signOut();
}

function getTwitchUsername() {
  return (
    currentProfile?.twitch_name ||
    currentUser?.user_metadata?.preferred_username ||
    currentUser?.user_metadata?.name ||
    "Viewer"
  );
}

function updateAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userBadge = document.getElementById("userBadge");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");

  if (currentUser) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "flex";
    userBadge.style.display = "flex";
    userName.textContent = getTwitchUsername();
    const avatar = currentUser.user_metadata?.avatar_url;
    if (avatar && userAvatar) userAvatar.src = avatar;
  } else {
    loginBtn.style.display = "flex";
    logoutBtn.style.display = "none";
    userBadge.style.display = "none";
  }
  updatePackCount();
}

function updatePackCount() {
  const badge = document.getElementById("packCountBadge");
  if (!badge) return;
  const count = currentProfile?.nbrpacks || 0;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}
