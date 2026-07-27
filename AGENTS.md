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
| `npx tsx scripts/verify.ts` | Vérification de la couche données contre la vraie base |

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
  (`src/app/globals.css`).

## Lotissement

Lot 0 (fondations) et lot 1 (suivi) sont livrés. À venir : imports/export (lot 2),
bibliothèque riche — listes, tags, favoris, citations, objectifs, éditions (lot 3),
social (lot 4), statistiques/rétrospective/PWA (lot 5).
