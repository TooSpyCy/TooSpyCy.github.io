// ============================================================
// CONFIGURATION SUPABASE
// Remplace les deux valeurs par celles de ton projet
// Settings > API dans le dashboard Supabase
// ============================================================

const SUPABASE_URL      = 'https://TON-PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'TA_CLE_ANON_PUBLIQUE';

const { createClient } = supabase;
const supabaseClient   = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
