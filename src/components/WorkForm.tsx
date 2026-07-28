"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { detectDuplicates, type WorkFormState } from "@/actions/work";
import type { DuplicateCandidate } from "@/lib/search";
import {
  MEDIA,
  MEDIA_ORDER,
  creatorsLabel,
  formatYears,
  isSerial,
  worksOwnCover,
  yearLabels,
} from "@/lib/media";
import { LANGUAGES } from "@/lib/languages";
import type { WorkType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Label, FieldHint } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CoverUpload } from "@/components/CoverUpload";
import { cn } from "@/lib/utils";

export type WorkFormInitial = {
  type: WorkType;
  titleFr?: string;
  titleOriginal?: string;
  originalLanguage?: string;
  year?: number;
  endYear?: number;
  synopsis?: string;
  durationMinutes?: number;
  format?: string;
  genres?: string;
  creators?: string;
  coverImageId?: string | null;
};

export function WorkForm({
  action,
  mode,
  initial,
  genreOptions,
  submitLabel,
}: {
  action: (state: WorkFormState, fd: FormData) => Promise<WorkFormState>;
  mode: "create" | "edit";
  initial: WorkFormInitial;
  genreOptions: string[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<WorkFormState, FormData>(
    action,
    undefined,
  );
  const [type, setType] = useState<WorkType>(initial.type);
  const [title, setTitle] = useState(initial.titleFr ?? "");
  const [year, setYear] = useState<string>(
    initial.year ? String(initial.year) : "",
  );
  const [dupes, setDupes] = useState<DuplicateCandidate[]>([]);
  const [, startTransition] = useTransition();

  // Détection de doublons à la volée (création uniquement — S2, D31).
  useEffect(() => {
    if (mode !== "create") return;
    const t = setTimeout(() => {
      const y = Number(year);
      if (title.trim().length < 2 || !Number.isInteger(y)) {
        setDupes([]);
        return;
      }
      startTransition(async () => {
        setDupes(await detectDuplicates(title.trim(), y));
      });
    }, 400);
    return () => clearTimeout(t);
  }, [title, year, mode]);

  const media = MEDIA[type];
  const showEpisodes = media.subUnit === "episodes";
  const isFilm = type === "FILM";
  const isManga = type === "MANGA_SERIES";
  const isBook = type === "BOOK";
  const ownsCover = worksOwnCover(type);
  const years = yearLabels(type);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Type de média */}
      {mode === "create" ? (
        <div>
          <Label>Type d'œuvre</Label>
          <div className="flex flex-wrap gap-2">
            {MEDIA_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  type === t
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border hover:bg-elevated",
                )}
                aria-pressed={type === t}
              >
                {MEDIA[t].emoji} {MEDIA[t].label}
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          {media.emoji} {media.label}
        </p>
      )}

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Une lecture ne porte pas de visuel : celui de ses éditions s'ajoute
            depuis la fiche (lot 5). */}
        {ownsCover && (
          <CoverUpload
            name="coverImageId"
            defaultImageId={initial.coverImageId}
            label="Visuel"
            required
          />
        )}

        <div className="flex flex-1 flex-col gap-4">
          <div>
            <Label htmlFor="titleFr">Titre (français)</Label>
            <Input
              id="titleFr"
              name="titleFr"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="titleOriginal">Titre original</Label>
            <Input
              id="titleOriginal"
              name="titleOriginal"
              defaultValue={initial.titleOriginal}
            />
          </div>
          <div>
            <Label htmlFor="originalLanguage">Langue originale</Label>
            <Input
              id="originalLanguage"
              name="originalLanguage"
              list="language-options"
              defaultValue={initial.originalLanguage}
              placeholder="fr, en, ja…"
            />
            <datalist id="language-options">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="year">{years.start}</Label>
              <Input
                id="year"
                name="year"
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </div>
            {/* Une série se publie sur une période : sa fin reste facultative,
                et son absence déclare qu'elle se poursuit (lot 6). */}
            {isSerial(type) && (
              <div className="min-w-[12rem] flex-1">
                <Label htmlFor="endYear">{years.end}</Label>
                <Input
                  id="endYear"
                  name="endYear"
                  type="number"
                  inputMode="numeric"
                  defaultValue={initial.endYear}
                />
                <FieldHint>
                  Laisser vide si la publication est en cours.
                </FieldHint>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Doublons potentiels */}
      {dupes.length > 0 && (
        <Card className="border-accent/50 bg-accent/5 p-4">
          <p className="mb-2 text-sm font-medium">
            Des fiches proches existent déjà — inutile de recréer :
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {dupes.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/oeuvre/${d.id}`}
                  className="text-accent hover:underline"
                >
                  {MEDIA[d.type].emoji} {d.titleFr} ({formatYears(d)})
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Champs spécifiques */}
      {type === "ANIME" && (
        <div className="max-w-xs">
          <Label htmlFor="format">Format</Label>
          <select
            id="format"
            name="format"
            defaultValue={initial.format ?? "TV"}
            className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface px-3"
          >
            <option value="TV">TV</option>
            <option value="OAV">OAV</option>
            <option value="ONA">ONA</option>
            <option value="SPECIAL">Spécial</option>
          </select>
        </div>
      )}

      {isFilm && (
        <div className="max-w-xs">
          <Label htmlFor="durationMinutes">Durée (minutes)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            defaultValue={initial.durationMinutes}
          />
        </div>
      )}

      <div>
        <Label htmlFor="genres">Genres</Label>
        <Input
          id="genres"
          name="genres"
          list="genre-options"
          defaultValue={initial.genres}
          placeholder="Séparés par des virgules"
        />
        <datalist id="genre-options">
          {genreOptions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      <div>
        <Label htmlFor="creators">{creatorsLabel(type)}</Label>
        <Input
          id="creators"
          name="creators"
          defaultValue={initial.creators}
          placeholder={
            isManga
              ? "Mangaka, autrice… (virgules)"
              : isBook
                ? "Autrice, auteur… (virgules)"
                : "Réalisateur, autrice, dessinateur… (virgules)"
          }
        />
      </div>

      <div>
        <Label htmlFor="synopsis">Synopsis</Label>
        <Textarea
          id="synopsis"
          name="synopsis"
          defaultValue={initial.synopsis}
        />
      </div>

      {/* Générateurs de sous-unités (création uniquement — S2) */}
      {mode === "create" && showEpisodes && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">Générer les épisodes</p>
          <div className="flex flex-wrap gap-4">
            <div className="max-w-[10rem]">
              <Label htmlFor="seasonsCount">Nombre de saisons</Label>
              <Input
                id="seasonsCount"
                name="seasonsCount"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="max-w-[12rem]">
              <Label htmlFor="episodesPerSeason">Épisodes / saison</Label>
              <Input
                id="episodesPerSeason"
                name="episodesPerSeason"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
          </div>
          <FieldHint>
            Ex. 1 saison de 12 épisodes. Modifiable ensuite.
          </FieldHint>
        </Card>
      )}

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <div>
        <SubmitButton size="lg">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
