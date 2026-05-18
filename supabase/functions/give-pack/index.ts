// ============================================================
// EDGE FUNCTION : give-pack
// Endpoint sécurisé pour ajouter des packs à un user Twitch
//
// Déploiement :
//   supabase functions deploy give-pack
//   supabase secrets set PACK_API_SECRET=ton-secret-ici
//
// Appel :
//   POST https://TON-PROJET.supabase.co/functions/v1/give-pack
//   Headers:
//     Content-Type: application/json
//     Authorization: Bearer ton-secret-ici
//   Body:
//     { "twitch_id": 123456789, "twitch_name": "pseudo", "quantity": 1 }
//
// Réponse succès : { "success": true, "nbrpacks": 3 }
// Réponse erreur : { "error": "message" }
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Vérification du token secret ──────────────────────────
    const authHeader = req.headers.get('Authorization')
    const expectedToken = `Bearer ${Deno.env.get('PACK_API_SECRET')}`

    if (!authHeader || authHeader !== expectedToken) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Lecture du body ────────────────────────────────────────
    const { twitch_id, twitch_name, quantity = 1 } = await req.json()

    if (!twitch_id || typeof twitch_id !== 'number') {
      return new Response(
        JSON.stringify({ error: 'twitch_id manquant ou invalide (doit être un nombre)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (quantity < 1 || quantity > 50) {
      return new Response(
        JSON.stringify({ error: 'quantity doit être entre 1 et 50' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Client Supabase avec service role (accès total) ────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Upsert du user + ajout des packs ───────────────────────
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          twitch_id:   twitch_id,
          twitch_name: twitch_name || null,
          nbrpacks:    quantity,
        },
        {
          onConflict:        'twitch_id',
          ignoreDuplicates:  false,
        }
      )
      .select('twitch_id, twitch_name, nbrpacks')
      .single()

    // Si le user existait déjà, on incrémente avec un UPDATE séparé
    // (upsert ne supporte pas les expressions arithmétiques)
    if (error?.code === '23505' || data) {
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ nbrpacks: supabase.rpc('nbrpacks + ' + quantity) })
        .eq('twitch_id', twitch_id)
        .select('nbrpacks')
        .single()
    }

    // Méthode plus fiable : incrément direct via RPC ou UPDATE brut
    const { data: result, error: rpcError } = await supabase.rpc('give_packs', {
      p_twitch_id:   twitch_id,
      p_twitch_name: twitch_name || '',
      p_quantity:    quantity,
    })

    if (rpcError) {
      console.error('Erreur give_packs:', rpcError)
      return new Response(
        JSON.stringify({ error: 'Erreur serveur: ' + rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success:  true,
        message:  `${quantity} pack(s) ajouté(s) pour le Twitch ID ${twitch_id}`,
        nbrpacks: result,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erreur inattendue:', err)
    return new Response(
      JSON.stringify({ error: 'Erreur serveur inattendue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
