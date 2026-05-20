// ============================================================
// CONFIGURATION SUPABASE
// ============================================================

const SUPABASE_URL      = 'https://trayertrmajocnfrengj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KLjT25yOxTILq4YKeiJUtw_0JteKl2m';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 0
    }
  },
  db: {
    schema: 'public'
  }
});
