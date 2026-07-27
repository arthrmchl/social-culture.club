import Link from "next/link";
import {
  LIBRARY_SORTS,
  LIBRARY_SORT_LABELS,
  libraryHref,
  type LibraryQuery,
} from "@/lib/library";
import { allowedStates, stateLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { STAR_STEPS } from "@/lib/rating";
import type { WorkStatusState } from "@/generated/prisma/enums";

/**
 * Facettes de la bibliothèque (S12).
 *
 * Entièrement en liens : chaque facette est une URL, donc partageable,
 * navigable au clavier et restaurée par le bouton « précédent ». Aucun état
 * client, aucun JavaScript nécessaire.
 */
export function LibraryFilters({
  query,
  genres,
  tags,
}: {
  query: LibraryQuery;
  genres: { name: string; slug: string }[];
  tags: { name: string; slug: string }[];
}) {
  const base = "/bibliotheque";

  // Les statuts proposés dépendent du média choisi ; sans média, l'union de
  // tous les états reste cohérente puisqu'ils portent le même sens.
  const states: WorkStatusState[] = query.type
    ? allowedStates(query.type)
    : ["WANT", "IN_PROGRESS", "CAUGHT_UP", "ON_HOLD", "COMPLETED", "DROPPED"];

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border hover:bg-elevated",
    );

  return (
    <div className="flex flex-col gap-3">
      <Row label="Statut">
        <Link
          href={libraryHref(base, query, { state: undefined })}
          className={chip(!query.state)}
        >
          Tous
        </Link>
        {states.map((s) => (
          <Link
            key={s}
            href={libraryHref(base, query, { state: s })}
            className={chip(query.state === s)}
          >
            {stateLabel(query.type ?? "FILM", s)}
          </Link>
        ))}
      </Row>

      <Row label="Note minimale">
        <Link
          href={libraryHref(base, query, { minScore: undefined })}
          className={chip(query.minScore == null)}
        >
          Toutes
        </Link>
        {STAR_STEPS.filter((s) => Number.isInteger(s)).map((stars) => (
          <Link
            key={stars}
            href={libraryHref(base, query, { minScore: stars * 2 })}
            className={chip(query.minScore === stars * 2)}
          >
            {stars} ★ et +
          </Link>
        ))}
      </Row>

      {genres.length > 0 && (
        <Row label="Genre">
          <Link
            href={libraryHref(base, query, { genre: undefined })}
            className={chip(!query.genre)}
          >
            Tous
          </Link>
          {genres.map((g) => (
            <Link
              key={g.slug}
              href={libraryHref(base, query, { genre: g.slug })}
              className={chip(query.genre === g.slug)}
            >
              {g.name}
            </Link>
          ))}
        </Row>
      )}

      {tags.length > 0 && (
        <Row label="Étiquette">
          <Link
            href={libraryHref(base, query, { tag: undefined })}
            className={chip(!query.tag)}
          >
            Toutes
          </Link>
          {tags.map((t) => (
            <Link
              key={t.slug}
              href={libraryHref(base, query, { tag: t.slug })}
              className={chip(query.tag === t.slug)}
            >
              #{t.name}
            </Link>
          ))}
        </Row>
      )}

      <Row label="Tri">
        {LIBRARY_SORTS.map((s) => (
          <Link
            key={s}
            href={libraryHref(base, query, { sort: s })}
            className={chip(query.sort === s)}
          >
            {LIBRARY_SORT_LABELS[s]}
          </Link>
        ))}
        <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
        <Link
          href={libraryHref(base, query, { view: "grille" })}
          className={chip(query.view === "grille")}
        >
          ▦ Grille
        </Link>
        <Link
          href={libraryHref(base, query, { view: "liste" })}
          className={chip(query.view === "liste")}
        >
          ☰ Liste
        </Link>
      </Row>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden w-28 shrink-0 text-xs uppercase tracking-wide text-muted sm:block">
        {label}
      </span>
      <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}
