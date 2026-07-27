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
- **Lot 2 — Reprise de l'historique** : imports Letterboxd, Serializd et
  lectures (Goodreads / literal.club) créateurs d'œuvres, écran de
  rapprochement avec le catalogue, imports rejouables sans doublon, file des
  fiches à compléter, export complet (JSON + CSV par entité), suppression de
  compte effective et scripts de sauvegarde/restauration.

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
| `npm run verify` | Vérification de la couche données contre la vraie base |
| `npm run backup` | Sauvegarde base + visuels (I5) |
| `npm run restore` | Restauration d'une sauvegarde |
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
                         rating, status, progress, tracking, markdown, dates,
                         placeholder
  lib/import/            csv, headers, values, types, infer, merge, match, dedup,
                         limits, candidates, apply + adapters/ (lot 2)
  lib/export/            csv, shape, collect (lot 2)
  actions/               auth, invitation, work, profile, upload,
                         status, journal, progress, season (suivi lot 1),
                         import, import-search, completion, account (lot 2)
  components/            UI réutilisable + WorkForm, WorkCard, NavBar, CoverUpload,
                         RatingStars/StarInput/Stars, LikeButton, StatusSelect,
                         ReviewEditor/ReviewContent, JournalEntryForm/Card,
                         EpisodeTracker, TomeTracker, ReadingProgressWidget
  app/(auth)/            Connexion, inscription, mot de passe oublié, réinitialisation
  app/(app)/             Accueil, recherche, création, catalogue, fiche, profil,
                         journal, watchlist, invitations,
                         import, a-completer, donnees (lot 2)
  app/api/auth/          Handler better-auth
  app/api/uploads/[id]/  Service des visuels téléversés
  app/api/import/upload/ Téléversement des fichiers d'import (lot 2)
  app/api/export/        Export JSON et CSV par entité (lot 2)
scripts/                 verify (vérification données), backup, restore
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

Lot 2 :

- **I1/I2/I3** imports Letterboxd, Serializd et lectures, créateurs d'œuvres.
- **I6** écran de rapprochement avec le catalogue existant, et imports
  **rejouables sans duplication** : chaque entrée de journal importée porte une
  clé stable (`JournalEntry.importKey`, unique par utilisateur).
- **D31** l'obligation de visuel ne vaut que pour la création manuelle : les
  fiches importées reçoivent un visuel de substitution et un badge « à
  compléter », rassemblées dans `/a-completer`.
- **I4** export complet (JSON + un CSV par entité), lisible sans l'application.
- **I5** scripts de sauvegarde et de restauration (base + visuels).
- **N9** suppression de compte effective, les fiches créées restant au
  catalogue partagé (D29).

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

Reprise de l'historique (lot 2) :

14. **`/import`** → choisir la source, déposer les CSV (dézippés), **analyser**.
    Le récapitulatif annonce les œuvres et les événements trouvés, et signale
    en français toute colonne manquante.
15. **Rapprochement** : l'onglet « À décider » ne contient que l'ambigu — le
    reste a été tranché automatiquement. Rattacher, créer ou ignorer, une
    décision par œuvre.
16. **Appliquer** : le journal, la liste d'envies, les notes et les critiques
    sont repris ; le rapport récapitule.
17. **Réimporter le même export** → le rapport annonce **0 fiche et 0 entrée
    créées** : les imports sont rejouables sans doublon.
18. **`/a-completer`** liste les fiches importées sans visuel ; les compléter
    retire le badge.
19. **`/donnees`** : export JSON, export CSV par entité, suppression de compte.

Vérification de la couche données (lots 0 à 2) sans le navigateur :

```bash
npm run verify              # œuvres, auto-statuts, recherche floue, import + ré-import idempotent
npm test                    # tests unitaires (rating, status, progress, import, export…)
npm run test:e2e            # parcours bout en bout Playwright (serveur dev requis sur :3000)
```

## Sauvegardes (I5)

```bash
npm run backup              # dump PostgreSQL + archive des visuels dans BACKUPS_DIR
npm run restore             # liste les sauvegardes disponibles
npm run restore -- backups/scc-....dump --yes   # restauration (écrase la base cible)
```

Le dump passe par le conteneur Docker quand il tourne (`scc-postgres`) : `pg_dump`
refuse de dialoguer avec un serveur plus récent que lui, et la version du client
local n'a aucune raison de suivre celle du conteneur. Sinon le client local est
utilisé ; s'il n'est pas dans le `PATH`, indiquez-le avec `PG_DUMP=…`.

Rétention réglée par `BACKUP_RETENTION_DAYS` (14 jours par défaut).

**Tester la restauration, régulièrement.** Une sauvegarde jamais restaurée n'est
pas une sauvegarde. Sur une base jetable :

```bash
createdb scc_restore_test
DATABASE_URL="postgresql://scc:scc@localhost:5432/scc_restore_test" \
  npm run restore -- backups/scc-....dump --yes
```

À faire côté hébergement (hors dépôt) : planification (cron ou timer systemd),
copie hors-site chiffrée, et surveillance de l'espace disque. À noter :
l'export I4 n'est **pas** une sauvegarde — il ne couvre qu'un utilisateur et
n'embarque pas les visuels.

## Hors périmètre (lots suivants)

Listes, tags, favoris, citations, objectifs annuels, gestion complète des
éditions côté UI, bibliothèque riche (lot 3) ; social (lot 4) ; statistiques,
rétrospective, PWA (lot 5).

Les listes présentes dans un export Letterboxd sont **conservées telles quelles**
dans le lot d'import : elles seront rejouées quand le modèle de listes arrivera
au lot 3, sans qu'il faille réimporter.

Formats d'export à confirmer contre de vrais fichiers (D14) : Serializd et
literal.club. Le cas échéant, seule la table `COLUMNS` de l'adaptateur concerné
est à corriger — `src/lib/import/adapters/`.
