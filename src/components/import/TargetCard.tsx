"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { setTargetResolution, setTargetType } from "@/actions/import";
import { searchCatalogue } from "@/actions/import-search";
import { MEDIA, MEDIA_ORDER, formatYear } from "@/lib/media";
import type { ImportCandidate } from "@/lib/import/match";
import type {
  ImportResolution,
  WorkType,
} from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type TargetCardData = {
  id: string;
  titleFr: string;
  year: number | null;
  type: WorkType;
  summary: string;
  resolution: ImportResolution | null;
  decided: boolean;
  confidence: number | null;
  matchedWorkId: string | null;
  candidates: ImportCandidate[];
};

/**
 * Une œuvre à rapprocher (I6) — trois issues : rattacher à une fiche
 * existante, créer une fiche, ignorer. Une décision par œuvre, jamais par
 * ligne : c'est ce qui rend l'écran praticable sur un export réel.
 */
export function TargetCard({ target }: { target: TargetCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImportCandidate[]>([]);

  // État affiché : optimiste tant que l'action serveur n'a pas répondu.
  const [local, setLocal] = useState({
    resolution: target.resolution,
    decided: target.decided,
    matchedWorkId: target.matchedWorkId,
    type: target.type,
  });

  function decide(resolution: ImportResolution, workId?: string) {
    setError(null);
    setLocal((l) => ({
      ...l,
      resolution,
      decided: true,
      matchedWorkId: resolution === "LINK" ? (workId ?? null) : null,
    }));
    startTransition(async () => {
      const res = await setTargetResolution(target.id, resolution, workId);
      if ("error" in res) {
        setError(res.error);
        setLocal({
          resolution: target.resolution,
          decided: target.decided,
          matchedWorkId: target.matchedWorkId,
          type: local.type,
        });
      } else {
        router.refresh();
      }
    });
  }

  function retype(type: WorkType) {
    setError(null);
    setLocal((l) => ({ ...l, type }));
    startTransition(async () => {
      const res = await setTargetType(target.id, type);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  function search() {
    const q = query.trim();
    if (q.length < 2) return;
    startTransition(async () => {
      setResults(await searchCatalogue(q));
    });
  }

  const best = target.candidates[0];
  const others = target.candidates.slice(1);
  const media = MEDIA[local.type];

  return (
    <Card className={cn("flex flex-col gap-3", pending && "opacity-70")}>
      {/* Identité de l'œuvre importée */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{target.titleFr}</p>
          <p className="text-xs text-muted">
            {formatYear(target.year)} · {media.emoji} {media.label} ·{" "}
            {target.summary}
          </p>
        </div>
        {local.decided && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            {RESOLUTION_LABEL[local.resolution ?? "IGNORE"]}
          </span>
        )}
      </div>

      {/* Meilleur candidat */}
      {best && (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border p-2">
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded border border-border">
            {best.coverImageId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/uploads/${best.coverImageId}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <CoverPlaceholder title={best.titleFr} type={best.type} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{best.titleFr}</p>
            <p className="text-xs text-muted">
              {formatYear(best.year)} · {MEDIA[best.type].label}
              {target.confidence !== null
                ? ` · similarité ${Math.round(target.confidence * 100)} %`
                : ""}
            </p>
          </div>
          <Link
            href={`/oeuvre/${best.id}`}
            target="_blank"
            className="shrink-0 text-xs text-muted hover:text-foreground"
          >
            Voir
          </Link>
        </div>
      )}

      {/* Issues */}
      <div className="flex flex-wrap gap-2">
        {best && (
          <Button
            size="sm"
            variant={
              local.decided && local.resolution === "LINK" ? "primary" : "secondary"
            }
            disabled={pending}
            onClick={() => decide("LINK", local.matchedWorkId ?? best.id)}
          >
            Rattacher
          </Button>
        )}
        <Button
          size="sm"
          variant={
            local.decided && local.resolution === "CREATE" ? "primary" : "secondary"
          }
          disabled={pending}
          onClick={() => decide("CREATE")}
        >
          Créer la fiche
        </Button>
        <Button
          size="sm"
          variant={
            local.decided && local.resolution === "IGNORE" ? "primary" : "ghost"
          }
          disabled={pending}
          onClick={() => decide("IGNORE")}
        >
          Ignorer
        </Button>
      </div>

      {/* Type de média, utile avant une création */}
      {local.resolution === "CREATE" && (
        <div className="flex flex-wrap gap-1">
          {MEDIA_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending}
              onClick={() => retype(t)}
              aria-pressed={t === local.type}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                t === local.type
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:bg-elevated",
              )}
            >
              {MEDIA[t].emoji} {MEDIA[t].label}
            </button>
          ))}
        </div>
      )}

      {/* Autres candidats et recherche libre */}
      <div className="flex flex-wrap gap-3 text-xs">
        {others.length > 0 && (
          <button
            type="button"
            className="text-muted hover:text-foreground"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "▾" : "▸"} Autres candidats ({others.length})
          </button>
        )}
        <button
          type="button"
          className="text-muted hover:text-foreground"
          onClick={() => setShowSearch((v) => !v)}
        >
          {showSearch ? "▾" : "▸"} Chercher dans le catalogue
        </button>
      </div>

      {showAll && others.length > 0 && (
        <ul className="flex flex-col gap-1">
          {others.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm">
                {c.titleFr}{" "}
                <span className="text-xs text-muted">
                  ({formatYear(c.year)} · {MEDIA[c.type].label})
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => decide("LINK", c.id)}
              >
                Rattacher
              </Button>
            </li>
          ))}
        </ul>
      )}

      {showSearch && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={query}
              placeholder="Titre dans le catalogue…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
            <Button size="sm" variant="secondary" disabled={pending} onClick={search}>
              Chercher
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="flex flex-col gap-1">
              {results.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">
                    {c.titleFr}{" "}
                    <span className="text-xs text-muted">
                      ({formatYear(c.year)} · {MEDIA[c.type].label})
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => decide("LINK", c.id)}
                  >
                    Rattacher
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

const RESOLUTION_LABEL: Record<ImportResolution, string> = {
  LINK: "Rattachée",
  CREATE: "À créer",
  IGNORE: "Ignorée",
};
