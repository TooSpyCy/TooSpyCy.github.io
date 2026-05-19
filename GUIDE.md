# 🌶️ Guide SpycySite v2 — Supabase + GitHub Pages

## Stack
- Front-end : HTML/CSS/JS (GitHub Pages, gratuit, 0 veille)
- Base de données : Supabase (Postgres + Auth + Edge Functions)
- API externe : Supabase Edge Function `/give-pack`
- Coût total : **0€/mois**

---

## Schéma de la BDD (inspiré de ton dump)

```
carte          — Les piments (name, scoville, proba de base)
carteversion   — Les 4 couleurs (vert/jaune/rouge/noir + multiplicateur)
cartedessin    — Images spécifiques par (piment × version) — optionnel
users          — Utilisateurs identifiés par twitch_id (BIGINT)
collection     — Une ligne par (user × piment × version) avec quantité
```

### Probabilités combinées
```
Proba finale = carte.proba × carteversion.proba_mult

Piments (somme = 1.00) :
  Poivron Doux    35%
  Jalapeño        25%
  Serrano         18%
  Cayenne         10%
  Habanero         7%
  Ghost Pepper     4%
  Carolina Reaper  1%

Couleurs (multiplicateur, somme = 1.00) :
  🟢 Vert  × 0.55
  🟡 Jaune × 0.25
  🔴 Rouge × 0.15
  ⚫ Noir  × 0.05

Exemple : Carolina Reaper Noir = 1% × 0.05 = 0.05% ✨
```

---

## ÉTAPE 1 — Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → **New project**
2. Nom : `SpycySite` / Région : `West EU`
3. Note le mot de passe

---

## ÉTAPE 2 — Créer la BDD

SQL Editor → New query → colle et exécute dans l'ordre :

1. **`supabase_schema.sql`** — tables + RLS + données de base
2. **`supabase_schema_additions.sql`** — fonction `give_packs` pour l'API

---

## ÉTAPE 3 — Auth Twitch

1. Supabase → **Authentication** → **Providers** → **Twitch** → activer
2. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → Register
   - OAuth Redirect : `https://TON-PROJET.supabase.co/auth/v1/callback`
3. Copie Client ID + Secret → colle dans Supabase

---

## ÉTAPE 4 — Config du code

`js/supabase-config.js` :
```js
const SUPABASE_URL      = 'https://TON-PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'TA_CLE_ANON';
```

`html/home.html` — remplace `etrize.github.io` par ton domaine GitHub Pages.

---

## ÉTAPE 5 — GitHub Pages

Settings → Pages → Source : `main` / `/ (root)` → Save

URL : `https://TON-USERNAME.github.io/SpycySite/`

---

## ÉTAPE 6 — Edge Function /give-pack (API externe)

Cette fonction permet d'ajouter des packs à un utilisateur via son **Twitch ID**.

### Installer Supabase CLI
```bash
npm install -g supabase
supabase login
supabase link --project-ref TON-PROJECT-REF
```

### Déployer la fonction
```bash
supabase functions deploy give-pack
```

### Configurer le secret
```bash
supabase secrets set PACK_API_SECRET=un-secret-tres-long-et-aleatoire
```

### Appel de l'API
```bash
curl -X POST https://TON-PROJET.supabase.co/functions/v1/give-pack \
  -H "Authorization: Bearer un-secret-tres-long-et-aleatoire" \
  -H "Content-Type: application/json" \
  -d '{"twitch_id": 123456789, "twitch_name": "toospycy", "quantity": 1}'
```

Réponse :
```json
{ "success": true, "nbrpacks": 3, "message": "1 pack(s) ajouté(s)..." }
```

### Intégration avec un bot Twitch (EventSub)
Quand un viewer rachète des points de chaîne → ton bot appelle cette URL.

```
POST /functions/v1/give-pack
Body: { "twitch_id": ID_TWITCH_DU_VIEWER, "quantity": 1 }
```

Le viewer reçoit son pack instantanément, même s'il ne s'est jamais connecté au site !

---

## ÉTAPE 7 — Tester manuellement

Dans SQL Editor :
```sql
-- Donne 3 packs à un Twitch ID
SELECT give_packs(123456789, 'ton_pseudo', 3);

-- Vérifie
SELECT * FROM users WHERE twitch_id = 123456789;
```

Puis connecte-toi au site avec ce compte Twitch → tu devrais voir 3 packs.

---

## Ajouter de vraies images de cartes

Option A — Images dans le repo GitHub :
```
cartes/poivron-vert.png
cartes/carolina-reaper-noir.png
```
Puis dans Supabase, `UPDATE carte SET image_url = 'https://TON-USERNAME.github.io/SpycySite/cartes/poivron.png'`

Option B — Supabase Storage (recommandé) :
Storage → New bucket `cards` (public) → upload images → copie l'URL publique dans `carte.image_url` ou `cartedessin.image_url`

Option C — Cloudinary (si beaucoup d'images) : gratuit jusqu'à 25 Go.

---

## Structure des fichiers

```
SpycySite/
├── index.html
├── styles.css
├── mobileStyle.css
├── supabase_schema.sql          ← SQL Editor (étape 2)
├── supabase_schema_additions.sql ← SQL Editor (étape 2)
├── js/
│   ├── supabase-config.js       ← ⚠️ Tes clés ici
│   ├── auth.js                  ← Login Twitch + liaison twitch_id
│   ├── tools.js                 ← Routing SPA
│   └── cards.js                 ← Tirage pondéré + collection
├── html/
│   ├── home.html
│   ├── cardsCollection.html
│   ├── cardsOpening.html
│   └── probabilities.html       ← Tableau des probas
├── supabase/
│   └── functions/
│       └── give-pack/
│           └── index.ts         ← Edge Function API (déployer avec CLI)
├── icones/
└── cartes/                      ← Tes images de piments
```
