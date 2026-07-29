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
| `npm run test:e2e` | Playwright, sur une base de test jetable |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Admin + invitation + genres |
| `npm run verify` | Vérification de la couche données, sur une base jetable |
| `npm run db:test:down` | Détruit une base de test restée debout |
| `npm run backup` / `restore` | Sauvegarde et restauration (base + visuels) |

`npm run verify` passe `--conditions=react-server` : le script importe des
modules `server-only`, qui lèvent une erreur sans cette condition.

## Base de test (harnais)

- **Aucun test n'écrit dans la base de développement.** `test:e2e` et `verify`
  passent par `scripts/with-test-db.ts` : montage d'une base neuve, exécution,
  destruction dans un `finally`. C'est l'inverse de l'état antérieur, où
  `verify.ts` laissait ses œuvres en base et où `lot3`/`lot4` en dépendaient
  sans le dire.
- **Un serveur Postgres à part, pas une base de plus** : service `db-test`
  (docker-compose, port **5433**, `tmpfs`, profil `test`). Aucun `DROP` du
  harnais ne peut atteindre `scc`, et `assertIsTestDatabase` refuse toute cible
  hors 5433 / suffixe `_test`.
- **`scripts/test-env.ts` est le point unique de vérité**, et un module
  TypeScript versionné — pas un `.env.test`, que `.gitignore` exclurait. Les
  variables passées aux processus enfants priment : ni `dotenv` ni Next ne
  réécrivent une variable déjà définie, `.env` ne peut donc pas ramener la base
  locale par la bande.
- **Playwright lance l'application lui-même** (`webServer`, `next dev --port
  3001`, `distDir = .next-test`) : un `npm run dev` local sur `:3000` continue
  de tourner sans interférer. Les specs n'écrivent donc plus d'URL absolue —
  `toHaveURL("/")` se résout contre `baseURL`.
- **`prisma/fixtures.ts` est déterministe** : identifiants et dates figés, aucun
  `randomUUID()` ni `Date.now()`. Les identifiants d'œuvres sont en `[a-z0-9]`
  seulement, les specs assertant `/\/oeuvre\/[a-z0-9]+$/`. Les entrées de
  journal portent `importKey: null`, sans quoi le fil du lot 4 les ignore, et
  `needsCompletion: false`, sans quoi elles fausseraient le compte de
  `/a-completer` vérifié par `lot2`.
- **`e2e/global-setup.ts` ne purge plus rien** : sur une base neuve, il n'y a
  rien à remettre à zéro. Il ne reste qu'une garde — bonne base, fixtures
  présentes — pour qu'un `playwright test` lancé à la main échoue tout de suite
  et lisiblement.
- **Un environnement propre découvre des tests fragiles.** Deux hypothèses
  cachées sont tombées au premier run : `/listes` affiche **deux** liens vers
  `/listes/nouvelle` quand aucune liste n'existe, et la vue grille rend un lien
  par œuvre (`WorkCard`) là où la vue liste en rend deux (`WorkRow`) — ne jamais
  comparer des comptages de liens pris dans deux vues différentes.

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
- **L'œuvre et son édition** (lots 5 et 6) : une **œuvre** est le texte — titre,
  titre original, langue originale (`originalLanguage`, code ISO 639-1 via
  `src/lib/languages.ts`), auteur·rice·s, années de publication. Une **édition**
  est l'objet publié — éditeur, titre, langue, traducteur·rice·s
  (`EditionCreator`, rôle « traducteur »), ISBN, pagination, couverture, et
  depuis le lot 6 ses **tomes**. Un ISBN sur une œuvre n'a pas de sens : c'est
  l'édition qui est publiée. `Edition.workId` n'est plus nullable et
  `Edition.tomeId` a disparu — une édition appartient à une œuvre, et **contient**
  ses volumes.
- **Une œuvre sérielle se publie sur une période** (lot 6) : `Work.year` est
  l'année de début, `Work.endYear` celle de fin, **facultative — nulle veut dire
  « en cours »**, il n'y a pas de troisième état. Ne vaut que pour `isSerial`
  (série, animé, BD, manga, soit exactement les médias à sous-unités) ;
  `formatYears` (`src/lib/media.ts`) est le seul juge de l'affichage
  (« 1989 – 2021 », « 1989 – en cours »), et `yearLabels` du vocabulaire
  (diffusion à l'écran, publication sur le papier). Dans `editWork`, `endYear`
  est le seul champ écrit en `d.endYear ?? null` et non `?? work.endYear` :
  `formToObject` écartant les chaînes vides, le motif habituel interdirait de
  **vider** une fin saisie par erreur.
- **Un manga a des auteur·rice·s** : `creatorRole` pose « auteur » pour `BOOK`
  **et** `MANGA_SERIES` ; la BD garde un rôle nul — scénariste et dessinateur,
  qu'un mot unique trahirait. Le libellé vient de `creatorsLabel`, jamais d'un
  `type === "BOOK"` recopié dans un composant.
- **La couverture d'une lecture appartient à ses éditions** : pour `BOOK`,
  `BD_SERIES` et `MANGA_SERIES`, le visuel affiché se résout **mon édition →
  édition par défaut → vignette générée** (`pickCoverImageId`, `src/lib/covers.ts`).
  Une liste ne fait jamais une requête par vignette : `resolveCovers`
  (`src/lib/cover-loader.ts`, `server-only`) en fait **deux au total**, et prend
  le « regard » du propriétaire de l'écran — moi sur mes pages, l'auteur de
  l'élément dans le fil et sur un profil. D31 (visuel obligatoire) ne vaut donc
  plus que pour les médias non-lecture, et `worksOwnCover` en est le seul juge.
- **Pas de suivi à la page sans édition désignée** : une page ne se compte que
  dans un tirage précis. La section « Progression de lecture » disparaît si
  l'œuvre n'a aucune édition, invite à en désigner une tant que
  `UserWork.editionId` est vide, et chaque `ReadingProgress` porte son
  `editionId` — `updateReadingProgress` le **refuse** sinon, la garde n'est pas
  seulement dans l'interface. L'en-tête de fiche, lui, annonce la pagination de
  référence (`pageCountFor` : la mienne, sinon celle par défaut), qui est une
  information de catalogue et non de suivi.
- **Le tome appartient à l'édition** (lot 6, `Tome.editionId`) : le nombre de
  volumes décrit un **tirage** — 41 chez Glénat, 14 en Deluxe — pas un texte.
  Il se saisit donc dans le formulaire d'édition (`tomeCount` →
  `setTomeCount`, `src/actions/edition.ts`), jamais à la création de l'œuvre.
  Réduire un tirage **refuse** d'effacer un tome déjà suivi, fût-ce par un autre
  membre : l'édition est du catalogue partagé (D30), le suivi ne l'est pas.
- **Pas de suivi au tome sans édition désignée** — le pendant exact de la règle
  des pages. La section « Progression — tomes » disparaît sans édition, invite à
  en désigner une tant que `UserWork.editionId` est vide, et n'affiche que les
  tomes de **cette** édition. `recomputeTomesState` compte contre elle :
  corollaire assumé, changer de tirage change le décompte, et les tomes lus d'une
  autre édition ne sont pas reportés (`setMyEdition` recalcule le statut).
- **Plus d'« intégrale » déclarée** : `coversTomeFrom`/`coversTomeTo` et
  `applyEditionCoverage` ont disparu au lot 6. Une intégrale est simplement une
  édition à peu de volumes, et « J'ai lu cette édition » (`markEditionRead` →
  `markEditionTomesRead`) marque **tous** ses tomes en une entrée de journal —
  jamais une par tome, sinon `recomputeViewings` compterait cinq lectures pour
  une.
- **Pas de type « one-shot »** : un manga en un volume est un `MANGA_SERIES` dont
  l'édition n'a qu'un tome, suivi au tome comme les autres. Un type dédié aurait
  suivi la page (`usesPages`) alors que tout le reste du manga suit le tome
  (`usesTomes`). `usesPages` ne vaut donc que pour `BOOK`.
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
  accessible au mobile depuis `/profil`, comme `/catalogue` et `/donnees`.

## Export (et ce qui reste de l'import)

- **L'import a été retiré** (lot 6) : plus d'adaptateurs, plus de pages
  `/import`, plus de tables `Import*`. Ce qu'il a produit reste — fiches,
  entrées de journal, listes — et n'a besoin de rien pour vivre.
- **`JournalEntry.importKey` et `List.importKey` sont conservées, inertes** :
  plus personne ne les écrit, mais elles marquent ce qui vient d'un service
  tiers. Le fil s'en sert toujours (`importKey: null` dans
  `src/lib/social/feed-query.ts` et `discover.ts`) : les supprimer relâcherait
  d'un coup des milliers d'entrées importées dans l'actualité des abonnés.
- **`Work.needsCompletion`, `/a-completer` et le bandeau « Fiche à compléter »**
  restent aussi : les fiches importées sont toujours à compléter, et `editWork`
  continue de baisser le drapeau. Plus rien ne le lève — la page pourra
  disparaître quand la file sera vide.
- **`src/lib/csv.ts`** (parseur RFC 4180) a survécu à l'import qui l'a fait
  naître : c'est lui qui relit ce qu'écrit `src/lib/export/csv.ts`, et donc lui
  qui atteste l'aller-retour écriture → lecture.
- **Export** (`src/lib/export/`) : les sous-unités sont désignées par leur
  **numéro**, pas par un identifiant interne. Les tomes y sont sous leur
  **édition** depuis le lot 6, et le CSV « tomes » nomme le tirage — sans quoi
  deux « tome 3 » d'éditions différentes seraient indiscernables.
  `EXPORT_VERSION` **vaut 6** : toute entité qui apparaît ou disparaît le fait
  bouger, sans quoi un export récent serait indiscernable d'un export où le
  membre n'avait rien saisi.

## Bibliothèque riche (lot 3)

- **Données individuelles** : listes, étiquettes, favoris et objectifs
  appartiennent à leur auteur. Toute lecture comme toute écriture se
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
  nomme sa cible (« Enregistrer les étiquettes », « Enregistrer l'édition »)
  plutôt que de répéter « Enregistrer ».

## Social (lot 4)

- **Une seule porte de lecture.** Les lots 1 à 3 tiennent la règle « toute
  lecture se referme sur `userId` » ; le lot 4 l'inverse. Elle ne s'ouvre donc
  qu'en un endroit : `src/lib/social/read.ts`, qui renvoie **`null`** plutôt
  qu'un objet partiel — une page qui oublierait de vérifier l'accès n'a alors
  rien à afficher. Une règle ESLint interdit à `src/app/(public)/**` d'importer
  `@/lib/db`.
- **`notFound()`, jamais 403.** Compte inexistant, privé, bloqué ou banni : la
  même réponse. Un 403 confirmerait l'existence du compte, et dirait à un bloqué
  qu'il l'est. Vaut aussi pour `/moderation` et pour les refus d'action, qui
  répondent « introuvable ».
- **Décider sans base, charger à part.** `src/lib/visibility.ts` est pur et
  testé par matrice ; `src/lib/social/access.ts` charge et ne lit **jamais** la
  session — le visiteur lui est passé, ce qui permet à `scripts/verify.ts`
  d'exercer le chemin réel hors requête HTTP (`session.ts` importe
  `next/navigation`, incompatible avec `--conditions=react-server`). « Qui
  regarde » vit dans `viewer.ts`.
- **Ordre des règles d'accès, non négociable** : blocage (il prime même sur
  l'administrateur — la modération passe par `/moderation`, pas par un profil),
  puis soi-même, puis administrateur, puis banni, puis la visibilité du compte,
  puis les drapeaux de section, qui ne peuvent que **retrancher**.
- **Blocage** : stocké dans un sens, appliqué dans les deux. `blockedUserIds()`
  est le seul endroit qui connaisse cette asymétrie. Bloquer supprime les
  abonnements et notifications croisés, mais **pas** les j'aime ni les
  commentaires — masqués à la lecture, donc le déblocage est réversible.
- **Cibles sociales** : entrée de journal, liste, critique d'œuvre (`UserWork`),
  portées par trois clés étrangères réelles et non un couple `(type, id)` — la
  cascade l'impose. `src/lib/social-target.ts` est le point unique de traduction
  vers les colonnes ; `targetFromColumns` **lève** si zéro ou deux sont
  renseignées, car cet état ne peut venir que d'une écriture qui l'a contourné.
- **`SocialLike` n'est pas `UserWork.liked`** : le premier aime un écrit (P3),
  le second une œuvre (S6). Deux composants, deux libellés (« J'aime cette
  œuvre »), jamais un compteur commun.
- **Fil** : trois sources fusionnées en mémoire, pas de table `Activity`.
  Ordonné sur `createdAt`/`reviewedAt` et jamais sur `loggedAt` — une entrée
  antidatée n'est pas une actualité, et c'est la seule grandeur commune aux
  sources, donc au curseur. **`importKey: null` est obligatoire** : l'import a
  disparu au lot 6, mais ses entrées sont toujours en base et sans ce filtre
  elles noieraient le fil de tous les abonnés. `dedupeReviewAndEntry`
  tranche le doublon critique/entrée : texte identique → l'entrée gagne ; textes
  différents → les deux ; jamais de déduplication par proximité temporelle.
- **Notifications** : décision pure dans `notify-rules.ts` (jamais soi-même,
  jamais à travers un blocage, jamais empiler une identique **non lue**),
  écriture **dans la transaction du geste** — une écriture qui échoue ne doit
  pas laisser de notification fantôme. Aucun marquage automatique au rendu.
- **Modération** : aucun filtrage automatique (D25). Les FK d'un `Report` sont
  en `SetNull` et son instantané (`targetKind`/`targetLabel`/`targetExcerpt`)
  est figé — après suppression du contenu, c'est tout ce qui reste. Une critique
  se **masque** seulement : le `UserWork` porte aussi le suivi du membre.
- **Routage** : `src/proxy.ts` distingue `AUTH_PREFIXES` (les connectés y sont
  renvoyés à l'accueil) d'`OPEN_PREFIXES` (`/u/`, ouvert avec ou sans session).
  Le groupe `(public)` est en `force-dynamic` : le HTML dépend du visiteur.
  `revalidatePath` purge **par chemin**, pas par visiteur — ce n'est jamais un
  mécanisme de sécurité.
- **Navigation** : la barre mobile reste pleine à 6. `/fil`, `/decouvrir` et
  `/moderation` (admin) rejoignent `DESKTOP_ONLY`, que `/import` a quitté ; la cloche de notifications
  vit dans la barre **supérieure** — c'est un indicateur, pas une entrée.
- **`User.username` est nullable** : sans pseudonyme, pas d'URL de profil.
  `updateVisibility` refuse `PUBLIC`/`MEMBERS` sans lui, et `/profil` le dit.
- **E2E** : l'état social repart de zéro à chaque exécution parce que la base
  elle-même est neuve (voir « Base de test ») — le second run retrouve donc le
  bouton « Suivre » sans qu'aucune purge ne soit nécessaire. Les gestes à
  `confirm()` demandent un `page.once("dialog", …)`, et une action serveur
  déclenchée par `useTransition` doit être **attendue à l'écran** avant de
  naviguer.

## Lotissement

Lots 0 (fondations), 1 (suivi), 2 (reprise de l'historique), 3 (bibliothèque
riche) et 4 (social) sont livrés, ainsi que la séparation de l'œuvre et de son
édition (lot 5a, migration `lot5_oeuvre_edition`) et le lot 6 — années de
publication, auteur·rice·s de manga, tomes rattachés à l'édition (migration
`lot6_manga_editions`, export version 6). À venir : statistiques, rétrospective
annuelle et PWA.

Le **lot 2 a été retiré** au lot 6 (migration `retrait_import`) : c'était un
chantier de reprise, pas une fonctionnalité durable, et il était le dernier à
créer des tomes hors d'une édition. Ce qu'il a écrit reste en base ; voir
« Export (et ce qui reste de l'import) » pour ce qui a délibérément survécu.
