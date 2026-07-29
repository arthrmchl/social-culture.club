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
- **Lot 2 — Reprise de l'historique** : chantier d'import (Letterboxd,
  Serializd, Goodreads / literal.club) **retiré au lot 6**, une fois
  l'historique repris. En restent l'export complet (JSON + CSV par entité), la
  file des fiches à compléter, la suppression de compte effective et les
  scripts de sauvegarde/restauration.

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
| `npm run test:e2e` | Parcours bout en bout (Playwright), sur une base jetable |
| `npm run test:e2e:keep` | Idem, mais laisse la base debout pour inspection |
| `npm run verify` | Vérification de la couche données, sur une base jetable |
| `npm run backup` | Sauvegarde base + visuels (I5) |
| `npm run restore` | Restauration d'une sauvegarde |
| `npm run lint` | ESLint |
| `npm run db:up` | Démarre PostgreSQL (Docker) |
| `npm run db:migrate` | Applique les migrations Prisma |
| `npm run db:seed` | Peuple la base (admin, invitation, genres) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:test:down` | Détruit la base de test restée debout |

## Tests

Aucun test n'écrit dans la base de développement. `npm run test:e2e` et
`npm run verify` passent par `scripts/with-test-db.ts`, qui **monte une base
neuve, l'utilise, puis la détruit** :

```
docker compose up -d db-test        conteneur dédié, port 5433, tmpfs (en RAM)
DROP / CREATE DATABASE scc_test
prisma migrate deploy               les migrations telles qu'elles sont versionnées
prisma/seed.ts + prisma/fixtures.ts comptes, genres, catalogue de référence
… la commande …                     Playwright lance lui-même Next sur :3001
docker compose rm -sf db-test       même en cas d'échec ou d'interruption
```

Un `npm run dev` local sur `:3000` peut continuer à tourner pendant les tests :
autre port, autre base, autre répertoire de build (`.next-test`).

La configuration du harnais vit dans **`scripts/test-env.ts`**, un module
versionné — et non un `.env.test`, que `.gitignore` exclurait. Les fixtures
(`prisma/fixtures.ts`) sont **déterministes** : mêmes identifiants, mêmes dates,
donc le même état de départ à chaque exécution.

```bash
npm run test:e2e                       # tout le parcours, base montée puis détruite
npm run test:e2e -- e2e/lot3.spec.ts   # un seul scénario
npm run test:e2e:keep                  # garde la base : psql …@localhost:5433/scc_test
npm run db:test:down                   # nettoyage après un test:e2e:keep
```

## Architecture

```
prisma/
  schema.prisma          Modèle unifié (œuvre, sous-unités, éditions, suivi, auth)
  migrations/            Init + pg_trgm (index GIN géré par Prisma) + suivi lot 1
  seed.ts                Admin + invitation + genres
  fixtures.ts            Catalogue de référence déterministe (base de test)
src/
  lib/                   db, auth, session, storage, search, text, generators, media,
                         rating, status, progress, tracking, markdown, dates,
                         placeholder
  lib/csv.ts             Parseur CSV (RFC 4180), relit ce qu'écrit l'export
  lib/export/            csv, shape, collect
  actions/               auth, invitation, work, profile, upload,
                         status, journal, progress, season (suivi lot 1),
                         edition (lots 3, 5 et 6), completion, account
  components/            UI réutilisable + WorkForm, WorkCard, NavBar, CoverUpload,
                         RatingStars/StarInput/Stars, LikeButton, StatusSelect,
                         ReviewEditor/ReviewContent, JournalEntryForm/Card,
                         EpisodeTracker, TomeTracker, ReadingProgressWidget
  app/(auth)/            Connexion, inscription, mot de passe oublié, réinitialisation
  app/(app)/             Accueil, recherche, création, catalogue, fiche, profil,
                         journal, watchlist, invitations,
                         a-completer, donnees
  app/api/auth/          Handler better-auth
  app/api/uploads/[id]/  Service des visuels téléversés
  app/api/export/        Export JSON et CSV par entité
scripts/                 verify (vérification données), backup, restore,
                         test-env / test-db / with-test-db (base de test jetable)
  proxy.ts               Protection optimiste des routes (ex-middleware)
```

## Décisions clés couvertes

Lot 0 :

- **D6/D29** catalogue interne partagé, aucune API externe.
- **D30** édition d'une fiche réservée au créateur et à l'administrateur.
- **D31** création : titre + année obligatoires, et visuel pour les médias qui
  en portent un — depuis le lot 5, celui d'un livre, d'une BD ou d'un manga
  appartient à ses éditions.
- **D24** inscription en cercle privé, sur invitation.
- **D8** modèle des éditions/intégrales prêt dès le lot 0 (interface au lot 3).

Lot 1 :

- **D3/S5** échelle unique (5 étoiles par demi-point), stockée sur 10 en interne.
- **D4/S6** j'aime indépendant de la note.
- **D5/T3** note et critique au niveau série et saison ; les épisodes se cochent
  et se datent mais ne portent ni note ni critique.
- **D10/F3** contexte de consommation, champ optionnel.
- **T2** passage automatique à « à jour » / « terminé » selon la progression,
  sans écraser un statut manuel (en pause, abandonné).
- **L2** progression de lecture historisée (table `ReadingProgress`).

Lot 2 (l'import lui-même a été retiré au lot 6) :

- **D31** l'obligation de visuel ne vaut que pour la création manuelle : les
  fiches importées ont reçu un visuel de substitution et un badge « à
  compléter », rassemblées dans `/a-completer`.
- **I4** export complet (JSON + un CSV par entité), lisible sans l'application.
- **I5** scripts de sauvegarde et de restauration (base + visuels).
- **N9** suppression de compte effective, les fiches créées restant au
  catalogue partagé (D29).

Lot 3 :

- **S9/D11** listes multi-médias, ordonnées ou non, avec description, visuel,
  commentaire par élément et épinglage (`/listes`).
- **S10** étiquettes personnelles sur les œuvres et le journal, navigables
  (`/tags`, `/tag/[slug]`). L'identité d'un tag est son slug : « Science-Fiction »
  et « science fiction » sont la même étiquette.
- **S11** quatre favoris de profil, tous médias confondus — distincts du
  « j'aime » (S6), qui reste une réaction à l'œuvre.
- **L5/D12** objectifs annuels par portée, dont « Lectures » activée par défaut
  (`/objectifs`). Est compté ce qui est consigné au journal dans l'année.
- **L6/D8** éditions : édition par défaut, édition lue (qui pilote la
  pagination et les tomes affichés), et « J'ai lu cette édition » qui marque
  tous ses tomes comme lus en une seule entrée de journal.
- **S12** bibliothèque filtrable (`/bibliotheque`) — **mes** œuvres, par média,
  statut, note, genre et étiquette ; à distinguer de `/catalogue`, qui montre
  les fiches de toute l'instance.
- **S13** accueil enrichi : progression des objectifs et listes épinglées.

Lot 5a — l'œuvre et son édition :

- Une **œuvre** porte le texte : titre, titre original, **langue originale**,
  auteur·rice·s, année de première publication. Une **édition** porte l'objet
  publié : éditeur, titre, langue, **traducteur·rice·s**, ISBN, pagination et
  **couverture**. L'ISBN et la pagination quittent donc la fiche d'œuvre.
- La couverture d'un livre, d'une BD ou d'un manga se résout **mon édition →
  édition par défaut → vignette générée**, partout : fiche, catalogue,
  bibliothèque, fil et profils publics (où c'est l'édition de *l'auteur* qui
  illustre son étagère).
- **D31** ne s'applique plus aux médias de lecture : un livre se crée sans
  visuel, et ses éditions viennent ensuite.

Lot 6 — le manga tel qu'il se publie :

- Une œuvre **sérielle** (série, animé, BD, manga) porte une **année de début**
  et une **année de fin facultative** : la laisser vide déclare une publication
  **en cours** (« 1989 – en cours »).
- Un manga a des **auteur·rice·s**, pas des « créateurs ».
- Le **nombre de tomes appartient à l'édition** : Berserk fait 41 tomes chez
  Glénat et 14 en Deluxe. Il se saisit sur le tirage, et le suivi au tome exige
  d'avoir désigné l'édition qu'on lit — comme le suivi à la page depuis le
  lot 5. Réduire un tirage refuse d'effacer un tome déjà suivi.
- L'**import est retiré** ; l'**export** passe en **version 6**.

## Vérification manuelle (bout en bout)

Une fois la base démarrée et peuplée :

1. Se connecter avec l'admin → onglet **Invitations** → générer une invitation.
2. Se déconnecter, ouvrir le lien d'inscription (ou saisir le code) → créer un
   second compte. Sans code valide → refus.
3. **Créer** une œuvre de chaque type ; visuel par **collage** (⌘V) puis par
   **upload**. Vérifier le refus si titre / année manquant, et le refus du
   visuel manquant sur un film ou une série. Un **livre**, une **BD** ou un
   **manga** se crée sans visuel : c'est son édition qui l'illustrera.
4. Générateur d'épisodes : « 1 saison de 12 épisodes ». Un manga ne demande
   **pas** de nombre de tomes : il se déclare sur son édition (lot 6).
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
11. **BD/manga** : ajouter une **édition** avec son **nombre de tomes**, la
    désigner (« Je lis celle-ci »), puis cliquer les tomes (à lire → en cours →
    lu) ; l'agrégat « X/Y tomes lus » et le statut se mettent à jour. Sans
    édition désignée, la fiche demande d'abord laquelle on lit.
12. **Livre** : ajouter une **édition** (éditeur, titre, langue, traducteur,
    ISBN, pages, couverture) — elle devient l'édition par défaut et sa
    couverture apparaît au catalogue. Tant qu'aucune édition n'est **désignée**,
    la progression de lecture invite à en choisir une — et elle n'apparaît pas
    du tout sans édition. Cliquer « Je lis celle-ci », puis mettre à jour la
    **page courante** (depuis la fiche ou l'accueil) ; le statut passe à
    « en cours ». En ajouter une seconde et la désigner : la pagination et la
    vignette suivent. Chercher l'**ISBN** d'une édition retrouve l'œuvre.
13. Marquer une œuvre **« à voir »** → elle apparaît dans **`/watchlist`**.

Éditions et années (lots 5 et 6) :

14. **`/oeuvre/<id>/modifier`** : renseigner l'**année de fin** d'une série puis
    la vider → l'en-tête repasse à « en cours ».
15. Sur un manga, ajouter une seconde édition d'un autre nombre de tomes et la
    désigner : le décompte repart sur ce tirage.
16. Réduire une édition à moins de tomes qu'il n'en est suivi → refus motivé.
17. **`/donnees`** : export JSON (version 6), export CSV par entité, suppression
    de compte.

Vérification de la couche données sans le navigateur :

```bash
npm run verify              # œuvres, auto-statuts, recherche floue, éditions, social
npm test                    # tests unitaires (rating, status, progress, média, export…)
npm run test:e2e            # parcours bout en bout Playwright
```

`verify` et `test:e2e` montent chacun leur base jetable (voir « Tests ») : rien
à démarrer à la main, et la base de développement reste intacte.

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

## Social (lot 4)

Profils publics partageables par lien (`/u/<pseudonyme>`), réglages de
visibilité, abonnements et demandes d'abonnement, fil d'activité, page
« découvrir », j'aime et commentaires sur les entrées de journal, les listes et
les critiques, notifications internes, signalement, blocage, file de modération
et propositions de correction (D30).

Deux points valent d'être connus à l'usage. Les profils sont **ouverts hors
connexion** — c'est le seul endroit de l'application qui le soit ; tout le reste
reste derrière la connexion. Et le fil ignore les entrées **importées** : sans
cela, l'historique Letterboxd repris au lot 2 noierait le fil de tous vos
abonnés — la fonctionnalité d'import a disparu, ses entrées sont toujours là.

## Hors périmètre (lot suivant)

Statistiques, rétrospective annuelle et PWA.
