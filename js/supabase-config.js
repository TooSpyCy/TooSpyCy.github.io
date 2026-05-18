// ============================================================
// CONFIGURATION SUPABASE
// Remplace les deux valeurs par celles de ton projet
// Settings > API dans le dashboard Supabase
// ============================================================

const SUPABASE_URL      = 'https://trayertrmajocnfrengj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KLjT25yOxTILq4YKeiJUtw_0JteKl2m';

const { createClient } = supabase;
const supabaseClient   = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
