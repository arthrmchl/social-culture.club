"use client";

import { useState, useTransition } from "react";
import { createJournalEntry } from "@/actions/journal";
import { StarInput } from "./StarInput";
import { Input, Textarea, Select } from "./ui/Field";
import { Button } from "./ui/Button";

type Precision = "DAY" | "MONTH" | "YEAR" | "UNKNOWN";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Consigner une consommation dans le journal (S4) — repliable sur la fiche. */
export function JournalEntryForm({
  workId,
  contextSuggestions = [],
}: {
  workId: string;
  contextSuggestions?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [precision, setPrecision] = useState<Precision>("DAY");
  const [date, setDate] = useState(todayISODate());
  const [month, setMonth] = useState(todayMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [stars, setStars] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [rewatch, setRewatch] = useState(false);
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function computeDate(): {
    loggedAt: string | null;
    datePrecision: Precision;
  } {
    if (precision === "UNKNOWN")
      return { loggedAt: null, datePrecision: "UNKNOWN" };
    const iso =
      precision === "YEAR"
        ? `${year}-01-01T12:00:00.000Z`
        : precision === "MONTH"
          ? `${month}-01T12:00:00.000Z`
          : `${date}T12:00:00.000Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
      return { loggedAt: null, datePrecision: "UNKNOWN" };
    return { loggedAt: d.toISOString(), datePrecision: precision };
  }

  function reset() {
    setStars(null);
    setReview("");
    setSpoiler(false);
    setRewatch(false);
    setContext("");
    setError(null);
  }

  function submit() {
    const { loggedAt, datePrecision } = computeDate();
    setError(null);
    start(async () => {
      const res = await createJournalEntry({
        workId,
        loggedAt,
        datePrecision,
        stars: stars ?? undefined,
        reviewText: review.trim() || undefined,
        reviewHasSpoiler: spoiler,
        isRewatch: rewatch,
        context: context.trim() || undefined,
      });
      if ("error" in res) setError(res.error);
      else {
        reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Ajouter au journal
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-4">
      {/* Date + précision (S4) */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Date</label>
          <Select
            value={precision}
            onChange={(e) => setPrecision(e.target.value as Precision)}
            className="w-40"
          >
            <option value="DAY">Date précise</option>
            <option value="MONTH">Mois</option>
            <option value="YEAR">Année</option>
            <option value="UNKNOWN">Inconnue</option>
          </Select>
        </div>
        {precision === "DAY" && (
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        )}
        {precision === "MONTH" && (
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
        )}
        {precision === "YEAR" && (
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-28"
          />
        )}
      </div>

      {/* Note */}
      <div>
        <label className="mb-1 block text-xs text-muted">Note</label>
        <StarInput value={stars} onChange={setStars} size="text-xl" />
      </div>

      {/* Critique (S7) */}
      <div>
        <label className="mb-1 block text-xs text-muted">
          Critique (markdown)
        </label>
        <Textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={4}
          placeholder="**gras**, *italique*, > citation…"
        />
        <label className="mt-1 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(e) => setSpoiler(e.target.checked)}
          />
          Contient un spoiler
        </label>
      </div>

      {/* Options : revisionnage (F2) + contexte (F3) */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rewatch}
            onChange={(e) => setRewatch(e.target.checked)}
          />
          Revisionnage / relecture
        </label>
        <div>
          <label className="mb-1 block text-xs text-muted">Contexte</label>
          <Input
            list="journal-context-suggestions"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="cinéma, streaming…"
            className="w-44"
          />
          <datalist id="journal-context-suggestions">
            {contextSuggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          Enregistrer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}
