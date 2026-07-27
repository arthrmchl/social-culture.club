# Social Culture Club (SCC)

Application web de suivi culturel unifiée — films, séries, animés, livres, BD et
mangas — avec catalogue interne partagé, sans aucun référentiel externe (D6).

Ce dépôt contient les lots suivants :

- **Lot 0 — Fondations** : comptes sur invitation, modèle d'œuvre unifié,
  catalogue partagé, parcours de création éclair (S2), recherche interne floue
  et fiches pour les six médias.
- **Lot 1 — Suivi** : journal daté, notation (5 étoiles par demi-point, stockée
  sur 10), j'aime, critiques markdown (spoiler repliable), statuts par média,
  progression fine (épisodes, tomes, pages), watchlist et accueil « en cours ».
  À ce stade, l'application remplace les trois services de référence en usage
  solo — **jalon scénario A**.

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
  schema.prisma          Modèle unifié (œuvre, sous-unités, éditions, suivi, auth)
  migrations/            Init + pg_trgm (index GIN géré par Prisma) + suivi lot 1
  seed.ts                Admin + invitation + genres
src/
  lib/                   db, auth, session, storage, search, text, generators, media,
                         rating, status, progress, tracking, markdown, dates
  actions/               auth, invitation, work, profile, upload,
                         status, journal, progress, season (suivi lot 1)
  components/            UI réutilisable + WorkForm, WorkCard, NavBar, CoverUpload,
                         RatingStars/StarInput/Stars, LikeButton, StatusSelect,
                         ReviewEditor/ReviewContent, JournalEntryForm/Card,
                         EpisodeTracker, TomeTracker, ReadingProgressWidget
  app/(auth)/            Connexion, inscription, mot de passe oublié, réinitialisation
  app/(app)/             Accueil, recherche, création, catalogue, fiche, profil,
                         journal, watchlist, invitations
  app/api/auth/          Handler better-auth
  app/api/uploads/[id]/  Service des visuels téléversés
  proxy.ts               Protection optimiste des routes (ex-middleware)
```

## Décisions clés couvertes

Lot 0 :

- **D6/D29** catalogue interne partagé, aucune API externe.
- **D30** édition d'une fiche réservée au créateur et à l'administrateur.
- **D31** création : titre + année + visuel obligatoires.
- **D24** inscription en cercle privé, sur invitation.
- **D8** modèle des éditions/intégrales prêt dès le lot 0 (UI au lot 3).

Lot 1 :

- **D3/S5** échelle unique (5 étoiles par demi-point), stockée sur 10 en interne.
- **D4/S6** j'aime indépendant de la note.
- **D5/T3** note et critique au niveau série et saison ; les épisodes se cochent
  et se datent mais ne portent ni note ni critique.
- **D10/F3** contexte de consommation, champ optionnel.
- **T2** passage automatique à « à jour » / « terminé » selon la progression,
  sans écraser un statut manuel (en pause, abandonné).
- **L2** progression de lecture historisée (table `ReadingProgress`).

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

Suivi (lot 1), sur une fiche :

8. **Noter** (5 étoiles par demi-point), **aimer**, choisir un **statut** (les
   états proposés dépendent du média), écrire une **critique** markdown (avec
   spoiler repliable).
9. **Ajouter au journal** : date précise / mois / année / inconnue, note,
   critique, revisionnage, contexte. L'entrée apparaît dans le **journal** de la
   fiche et dans le **journal global** (`/journal`, filtrable par média).
10. **Série/animé** : cocher un épisode, cocher une saison entière, « vu jusqu'à
    SxxEyy » ; le statut passe à **« à jour »** quand tous les épisodes sont vus ;
    noter/critiquer une **saison**.
11. **BD/manga** : cliquer les tomes (à lire → en cours → lu) ; l'agrégat
    « X/Y tomes lus » et le statut se mettent à jour.
12. **Livre** : mettre à jour la **page courante** (depuis la fiche ou l'accueil) ;
    le statut passe à « en cours ».
13. Marquer une œuvre **« à voir »** → elle apparaît dans **`/watchlist`**.

Vérification de la couche données (lot 0 + lot 1) sans le navigateur :

```bash
npx tsx scripts/verify.ts   # crée des œuvres, coche épisodes/tomes, vérifie les auto-statuts
npm test                    # tests unitaires (rating, status, progress, generators, text)
npm run test:e2e            # parcours bout en bout Playwright (serveur dev requis sur :3000)
```

## Hors périmètre (lots suivants)

Imports/export (lot 2) ; listes, tags, favoris, citations, objectifs annuels,
gestion complète des éditions côté UI, bibliothèque riche (lot 3) ; social
(lot 4) ; statistiques, rétrospective, PWA (lot 5).
