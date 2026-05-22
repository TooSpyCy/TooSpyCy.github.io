<div align="center">

<img src="icones/Loo_sans_fond.png" alt="TooSpyCy Logo" width="120">

# 🌶️ TooSpyCy — Site Twitch

**Site communautaire avec système de collection de cartes piments**  
Hébergé sur GitHub Pages · Backend Supabase · Intégration Twitch

[![Site en ligne](https://img.shields.io/badge/Site-toospycy.github.io-ff4d8d?style=for-the-badge&logo=github)](https://toospycy.github.io)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Twitch](https://img.shields.io/badge/Stream-TooSpyCy-9147ff?style=for-the-badge&logo=twitch)](https://twitch.tv/TooSpyCy)

</div>

---

## ✨ Présentation

Site communautaire pour la chaîne Twitch **TooSpyCy**, centré autour d'un système de collection de cartes piments. Les viewers peuvent obtenir des packs en échangeant leurs points de chaîne Twitch, ouvrir ces packs et collectionner 120 cartes uniques (30 piments × 4 versions couleur).

---

## 🃏 Système de cartes

**30 piments** × **4 versions** = **120 combinaisons** à collectionner

| Version | Couleur | Multiplicateur |
|---------|---------|---------------|
| 🟢 Vert  | Commun  | ×0.55 |
| 🟡 Jaune | Peu commun | ×0.25 |
| 🔴 Rouge | Rare | ×0.15 |
| ⚫ Noir  | Très rare | ×0.05 |

La probabilité d'obtenir une carte = `proba du piment × multiplicateur de la version`  
La carte la plus rare (Pepper X Noir) a une probabilité de **0.025%** par tirage.

---

## 🗂️ Structure du projet

```
TooSpyCy.github.io/
│
├── index.html              # SPA principale — routing + nav
├── styles.css              # Thème global (dark rose + glassmorphism)
├── mobileStyle.css         # Responsive mobile
│
├── html/                   # Pages chargées dynamiquement
│   ├── home.html           # Accueil + embed Twitch
│   ├── cardsCollection.html # Collection du joueur (30 slots)
│   ├── cardsOpening.html   # Ouverture de packs
│   ├── probabilities.html  # Tableau des probabilités
│   ├── adminStats.html     # Stats globales (admin)
│   └── adminCollection.html # Collection d'un joueur (admin)
│
├── js/
│   ├── supabase-config.js  # URL + clé Supabase
│   ├── auth.js             # Connexion Twitch OAuth + profil
│   ├── cards.js            # Requêtes BDD + logique cartes
│   └── tools.js            # Routing SPA + utilitaires
│
├── cartes/                 # Images des 120 cartes + assets
│   ├── packOpening.png
│   ├── dos_carte_1.png
│   └── [nom_piment]_[1-4].png
│
├── icones/                 # Logo et icônes
│
└── supabase/
    └── functions/
        ├── open-pack-and-draw/  # Tirage sécurisé côté serveur
        └── give-pack/           # Donner des packs (webhook Twitch)
```

---

## 🛠️ Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | HTML / CSS / JavaScript vanilla |
| Hébergement | GitHub Pages |
| Base de données | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth — OAuth Twitch |
| Backend | Supabase Edge Functions (Deno) |
| Points Twitch | EventSub (à venir) |

---

## 🗄️ Base de données

```
carte          — 30 piments (nom, scoville, probabilité)
carteversion   — 4 couleurs (vert, jaune, rouge, noir)
cartedessin    — 120 images (carte_id × version_id)
users          — Joueurs (twitch_id, nbrpacks, is_admin)
collection     — Cartes possédées (twitch_id × carte × version × quantité)
```

La sécurité est assurée par **Row Level Security (RLS)** — chaque joueur ne voit que sa propre collection. Les écritures en BDD passent exclusivement par les Edge Functions (service role).

---

## ⚡ Edge Functions

### `open-pack-and-draw`
Ouvre un pack de manière **100% sécurisée côté serveur** :
1. Vérifie que le joueur est authentifié et a des packs
2. Décrémente le pack (optimistic lock anti race-condition)
3. Tire 5 cartes selon les probabilités pondérées
4. Sauvegarde en collection
5. Retourne les cartes au client

### `give-pack`
Donne des packs à un joueur via une API sécurisée (secret HMAC).  
Utilisée par le bot Twitch pour les points de chaîne.

---

## 🔑 Variables d'environnement

Dans `js/supabase-config.js` (à ne pas commiter en production) :

```js
const SUPABASE_URL      = 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

Secrets Supabase (Edge Functions) :
```
PACK_API_SECRET       — Secret pour l'API give-pack
TWITCH_EVENTSUB_SECRET — Secret HMAC pour les webhooks Twitch
TWITCH_CLIENT_ID      — Client ID de l'app Twitch
PACK_REWARD_ID        — ID de la récompense points de chaîne
```

---

## 🚀 Installation locale

```bash
git clone https://github.com/TooSpyCy/TooSpyCy.github.io.git
cd TooSpyCy.github.io
```

Ouvrir `index.html` dans un navigateur ou utiliser un serveur local :

```bash
npx serve .
# ou
python -m http.server 8080
```

---

## 🛡️ Sécurité

- **RLS strict** sur toutes les tables Supabase
- **Tirage côté serveur** via Edge Function — impossible de tricher depuis le navigateur
- **Token JWT** mis en cache pour éviter les appels bloquants à `getSession()`
- **Bypass WebSocket Supabase** — les requêtes BDD utilisent `fetch()` direct pour éviter les bugs de reconnexion sur Brave/Chrome

---

## 📱 Compatibilité

- ✅ Desktop (Chrome, Firefox, Edge)
- ✅ Mobile (barre de navigation fixe en bas)
- ⚠️ Brave — Shields à désactiver pour ce domaine

---

<div align="center">

Fait avec 🌶️ pour la communauté TooSpyCy

</div>
