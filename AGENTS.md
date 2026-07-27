# AGENTS.md — social-culture.club

Application web de suivi culturel (films, séries, animés, livres, BD, mangas),
catalogue interne partagé, **sans aucun référentiel externe** (décision D6).
Voir `README.md` pour la présentation et le démarrage.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript, Turbopack)
- **PostgreSQL** + **Prisma 7** (driver adapter `@prisma/adapter-pg`, client généré
  dans `src/generated/prisma`)
- **better-auth** (e-mail/mot de passe, invitations, plugins `username` + `admin`)
- **Tailwind CSS 4** — thème sombre par défaut, mobile-first, **interface en français**

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (`:3000`) |
| `npm run build` | Build de production (typecheck inclus) |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Playwright (serveur dev requis sur `:3000`) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Admin + invitation + genres |
| `npm run verify` | Vérification de la couche données contre la vraie base |
| `npm run backup` / `restore` | Sauvegarde et restauration (base + visuels) |

`npm run verify` passe `--conditions=react-server` : le script importe des
modules `server-only`, qui lèvent une erreur sans cette condition.

## Conventions

- **Server actions** (`src/actions/*.ts`) : `"use server"`, validation **Zod**,
  `requireUser()` (voir `src/lib/session.ts`), écritures via `db.$transaction`,
  puis `revalidatePath`. Renvoyer `{ ok: true } | { error: string }`.
- **Droits** : une fiche d'œuvre n'est éditable que par son créateur ou l'admin
  (D30, `isAdmin`). Les données de suivi (journal, statuts, notes, progression)
  sont **individuelles** : toujours filtrer par `userId`.
- **Suppression d'une œuvre** : réservée à l'**administrateur seul** (`deleteWork`,
  plus restrictif que l'édition car destructif pour le suivi/journal de *tous* les
  utilisateurs). La cascade est portée par la base (`onDelete: Cascade`), pas de
  suppression manuelle des enfants.
- **Notation** : échelle d'affichage 0,5–5 étoiles par demi-point, **stockée sur
  10** en base. Convertir uniquement à l'affichage/saisie via `src/lib/rating.ts`.
- **Logique pure et testée** dans `src/lib/` (`rating`, `status`, `progress`,
  `text`, `generators`) avec un `*.test.ts` voisin. `tracking.ts`, `search.ts`,
  `session.ts` sont `server-only`.
- **Statut auto** (`src/lib/tracking.ts`) : « à jour »/« terminé » recalculés
  après une progression, sans écraser un état manuel (en pause, abandonné).
- **Index pg_trgm** : l'index GIN sur `Work.titleNormalized` est **géré par Prisma**
  (preview `postgresqlExtensions` + `@@index(..., type: Gin)`). Ne pas le recréer
  en SQL brut : `migrate dev` le supprimerait.
- **Composants** : primitives dans `src/components/ui/`, réutiliser `MEDIA`
  (`src/lib/media.ts`), `Card`, `Button`, `Field`. Client components synchronisant
  une valeur serveur : ajuster l'état pendant le rendu (état « précédent »), pas
  via `useEffect` (règle ESLint `react-hooks/set-state-in-effect`).
- **UI en français**, mobile d'abord (N1) ; thème clair/sombre via variables CSS
  (`src/app/globals.css`). La barre de navigation basse est **pleine** (6 entrées) :
  une nouvelle page de premier niveau s'ajoute à la barre du bureau et se rend
  accessible au mobile depuis `/profil`, comme `/import` et `/donnees`.

## Imports et export (lot 2)

- **Un adaptateur ne fait qu'une chose** (`src/lib/import/adapters/`) :
  transformer des fichiers texte en `ImportedEvent[]`. Tout le reste —
  rapprochement, création de fiches, journal, idempotence — est mutualisé et
  ignore la source.
- **Les noms de colonnes ne sont jamais codés en dur** ailleurs que dans la
  table `COLUMNS` en tête de chaque adaptateur : c'est le point unique de
  correction quand un export tiers change. Une colonne manquante produit un
  `ImportWarning` en français, **jamais** une exception (R5).
- **Idempotence (I6)** : chaque entrée importée porte une `importKey` stable
  (`buildImportKey`, `src/lib/import/dedup.ts`), adossée à
  `@@unique([userId, importKey])` sur `JournalEntry`. Les écritures de journal
  passent par `createMany({ skipDuplicates: true })`, le reste par des `upsert` —
  rejouer un lot ne doit jamais rien dupliquer. C'est la propriété centrale du
  lot : toute modification du pipeline doit être revalidée par `npm run verify`,
  dont la section lot 2 réimporte le même lot et exige 0 création.
- **Rapprochement** : `findImportCandidates` fait **une** requête pg_trgm par
  paquet de cibles — ne jamais appeler `findDuplicateWorks` en boucle. Ne jamais
  appeler `set_limit()` : le seuil s'applique à la connexion, partagée.
- **Application** : par paquets de 25, **une transaction par cible** avec
  `{ timeout: 30_000 }` (le défaut de 5 s ne suffit pas). `revalidatePath`
  seulement à la clôture du lot, jamais par paquet ; caches (`recomputeViewings`
  et compagnie) une fois par cible, jamais par ligne.
- **L'import n'écrase rien** : une note, une critique ou un statut déjà saisis
  sont conservés et le conflit est signalé dans le rapport.
- **Fiches importées** : `coverImageId = null` + `needsCompletion = true` ; le
  visuel de substitution est calculé à l'affichage (`src/lib/placeholder.ts`),
  jamais stocké. L'obligation de visuel (D31) ne vaut que pour la création
  manuelle.
- **Téléversement** par Route Handler (`/api/import/upload`) et non par server
  action : la limite de corps de 1 Mo ne convient pas à un export complet.
- **Export** (`src/lib/export/`) : les sous-unités sont désignées par leur
  **numéro**, pas par un identifiant interne, et l'aller-retour écriture →
  lecture est testé avec le parseur d'import.

## Bibliothèque riche (lot 3)

- **Données individuelles** : listes, étiquettes, favoris, citations et
  objectifs appartiennent à leur auteur. Toute lecture comme toute écriture se
  referme sur `userId` — y compris pour retirer une étiquette d'une œuvre du
  catalogue partagé, où plusieurs membres peuvent en avoir posé.
- **Étiquettes** : l'identité d'un tag est son **slug**, pas son libellé ; le
  premier libellé rencontré est conservé à l'affichage (`src/lib/tags.ts`).
- **Objectifs** : la portée est un énuméré `GoalScope` non nul, jamais un
  `WorkType?`. Un scope nullable rendrait `@@unique([userId, year, scope])`
  inopérant pour l'objectif global, PostgreSQL traitant les NULL comme
  distincts. Ce qui compte est défini **une seule fois**, dans
  `src/lib/goal-count.ts`.
- **Positions** (éléments de liste, favoris) : toujours contiguës à partir de
  0, jamais de contrainte d'unicité — elle interdirait toute permutation sans
  valeur temporaire. `reorderPositions` (`src/lib/lists.ts`) ne renvoie que les
  lignes réellement déplacées.
- **Éditions** : une édition décrit l'objet publié, donc **catalogue partagé**
  et droits D30 ; choisir son édition (`UserWork.editionId`) et déclarer une
  lecture sont du **suivi**, ouverts à chacun. L'invariante « une seule édition
  par défaut » est tenue par l'action, pas par la base : un index unique
  partiel se ferait réécrire à chaque `migrate dev`.
- **Intégrales** : `applyEditionCoverage` (`src/lib/tracking.ts`) n'écrit que
  des `TomeProgress`, jamais une entrée de journal par tome — sinon
  `recomputeViewings` compterait cinq lectures pour une. Elle n'est branchée
  que sur des gestes explicites, jamais sur la progression en pages.
- **Bibliothèque** (`/bibliotheque`) : **mes** œuvres, à ne pas confondre avec
  `/catalogue` (toute l'instance, D29). Ses facettes sont des liens, pas un
  état client : chaque combinaison est une URL. `src/lib/library.ts` valide les
  `searchParams` en ramenant l'inconnu au défaut plutôt qu'en levant.
- **Barre de navigation** : la 4ᵉ entrée mobile est `/bibliotheque` ;
  `/catalogue`, `/listes`, `/import` et `/invitations` vivent dans
  `DESKTOP_ONLY` et sont atteignables au mobile depuis `/profil`.
- **Boutons** : sur une fiche, plusieurs formulaires cohabitent — un libellé
  nomme sa cible (« Enregistrer les étiquettes », « Enregistrer la citation »)
  plutôt que de répéter « Enregistrer ».

## Lotissement

Lots 0 (fondations), 1 (suivi), 2 (reprise de l'historique) et 3 (bibliothèque
riche) sont livrés. À venir : social (lot 4), statistiques/rétrospective/PWA
(lot 5).

Les listes des exports Letterboxd sont désormais **importées** (événements
`LIST_ITEM`), et les étiquettes du diary rejoignent `JournalEntryTag` au lieu
d'échouer dans `JournalEntry.context`. Un lot du lot 2 dont les fichiers ont
été conservés (`parsed = false`) se reprend par `replayRetainedFiles` : elle
recopie ces fichiers dans un **lot neuf** plutôt que de relâcher la garde qui
interdit de ré-analyser un lot appliqué — ré-analyser recréerait ses cibles.
