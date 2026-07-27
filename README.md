# Social Culture Club (SCC)

Application web de suivi culturel unifiée — films, séries, animés, livres, BD et
mangas — avec catalogue interne partagé, sans aucun référentiel externe (D6).

Ce dépôt contient le **lot 0 — Fondations** : comptes sur invitation, modèle
d'œuvre unifié, catalogue partagé, parcours de création éclair (S2), recherche
interne floue et fiches pour les six médias.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **PostgreSQL** + **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **better-auth** (e-mail/mot de passe, invitations, plugins `username` + `admin`)
- **Tailwind CSS 4** — thème sombre par défaut, mobile-first, interface en français
- **sharp** pour le traitement des visuels (stockés sur disque)

## Prérequis

- Node.js ≥ 20 (testé avec Node 24)
- **Docker Desktop** (pour PostgreSQL en local) — non installé sur cette machine :
  à installer avant de lancer la base. Alternative sans Docker : un PostgreSQL
  local, en adaptant `DATABASE_URL`.

## Démarrage

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env   # ajuster BETTER_AUTH_SECRET en production

# 3. Base de données (nécessite Docker Desktop lancé)
npm run db:up          # docker compose up -d  → PostgreSQL sur :5432

# 4. Migrations + données de départ
npm run db:migrate     # applique le schéma + l'extension pg_trgm
npm run db:seed        # crée l'admin, une invitation, les genres

# 5. Lancer l'application
npm run dev            # http://localhost:3000
```

### Compte administrateur (seed)

- E-mail : `admin@social-culture.club`
- Mot de passe : `changeme123`
- Invitation de démarrage : `SCC-WELCOME-01`

(Configurables via `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_USERNAME`.)

## Scripts

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build et exécution de production |
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | ESLint |
| `npm run db:up` | Démarre PostgreSQL (Docker) |
| `npm run db:migrate` | Applique les migrations Prisma |
| `npm run db:seed` | Peuple la base (admin, invitation, genres) |
| `npm run db:studio` | Prisma Studio |

## Architecture

```
prisma/
  schema.prisma          Modèle unifié (œuvre, sous-unités, éditions, auth)
  migrations/            Init + extension pg_trgm (index GIN sur titleNormalized)
  seed.ts                Admin + invitation + genres
src/
  lib/                   db, auth, session, storage, search, text, generators, media
  actions/               Server actions : auth, invitation, work, profile, upload
  components/            UI réutilisable + WorkForm, WorkCard, NavBar, CoverUpload…
  app/(auth)/            Connexion, inscription, mot de passe oublié, réinitialisation
  app/(app)/             Accueil, recherche, création, catalogue, fiche, profil, invitations
  app/api/auth/          Handler better-auth
  app/api/uploads/[id]/  Service des visuels téléversés
  proxy.ts               Protection optimiste des routes (ex-middleware)
```

## Décisions clés couvertes (lot 0)

- **D6/D29** catalogue interne partagé, aucune API externe.
- **D30** édition d'une fiche réservée au créateur et à l'administrateur.
- **D31** création : titre + année + visuel obligatoires.
- **D24** inscription en cercle privé, sur invitation.
- **D8** modèle des éditions/intégrales prêt dès le lot 0 (UI au lot 3).

## Vérification manuelle (bout en bout)

Une fois la base démarrée et peuplée :

1. Se connecter avec l'admin → onglet **Invitations** → générer une invitation.
2. Se déconnecter, ouvrir le lien d'inscription (ou saisir le code) → créer un
   second compte. Sans code valide → refus.
3. **Créer** une œuvre de chaque type ; visuel par **collage** (⌘V) puis par
   **upload**. Vérifier le refus si titre / année / visuel manquant.
4. Générateurs : « 1 saison de 12 épisodes », « série de 23 tomes ».
5. Recréer un titre + année proche → la **détection de doublon** propose la fiche
   existante.
6. **Recherche** avec une faute de frappe → l'œuvre remonte (pg_trgm) ; terme
   inconnu → proposition de création pré-remplie.
7. Consulter la **fiche** et le **catalogue** filtré par média.

## Hors périmètre du lot 0

Journal, notes, statuts et progression (lot 1) ; imports/export (lot 2) ; listes,
tags, favoris, citations, objectifs, gestion complète des éditions côté UI
(lot 3) ; social (lot 4) ; statistiques, rétrospective, PWA (lot 5).
