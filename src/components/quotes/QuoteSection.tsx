"use client";

import { useState, useTransition } from "react";
import { createQuote, deleteQuote, editQuote } from "@/actions/quote";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";

export type QuoteData = {
  id: string;
  text: string;
  page: number | null;
  note: string | null;
  tomeNumber: number | null;
};

/** Passages sauvegardés d'une lecture (L3, D9). */
export function QuoteSection({
  workId,
  quotes,
  tomes,
}: {
  workId: string;
  quotes: QuoteData[];
  tomes: { id: string; number: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [page, setPage] = useState("");
  const [note, setNote] = useState("");
  const [tomeId, setTomeId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setText("");
    setPage("");
    setNote("");
    setTomeId("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {quotes.length > 0 && (
        <div className="flex flex-col gap-2">
          {quotes.map((q) => (
            <QuoteCard key={q.id} quote={q} />
          ))}
        </div>
      )}

      {!open ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            ❝ Ajouter une citation
          </Button>
        </div>
      ) : (
        <Card className="flex flex-col gap-3 p-4">
          <div>
            <Label htmlFor="quote-text">Passage</Label>
            <Textarea
              id="quote-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={10000}
              placeholder="Le passage qui vous a arrêté…"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-28">
              <Label htmlFor="quote-page">Page</Label>
              <Input
                id="quote-page"
                type="number"
                min={1}
                value={page}
                onChange={(e) => setPage(e.target.value)}
              />
            </div>

            {tomes.length > 0 && (
              <div className="w-36">
                <Label htmlFor="quote-tome">Tome</Label>
                <Select
                  id="quote-tome"
                  value={tomeId}
                  onChange={(e) => setTomeId(e.target.value)}
                >
                  <option value="">—</option>
                  {tomes.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tome {t.number}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="quote-note">Commentaire</Label>
            <Input
              id="quote-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="Pourquoi ce passage ?"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || text.trim().length === 0}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await createQuote({
                    workId,
                    text,
                    page: page ? Number(page) : null,
                    note,
                    tomeId: tomeId || undefined,
                  });
                  if ("error" in res) setError(res.error);
                  else reset();
                });
              }}
            >
              Enregistrer la citation
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={reset}
            >
              Annuler
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function QuoteCard({ quote }: { quote: QuoteData }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(quote.text);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const location = [
    quote.tomeNumber ? `Tome ${quote.tomeNumber}` : null,
    quote.page ? `p. ${quote.page}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="flex flex-col gap-2 p-4">
      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={10000}
          aria-label="Passage"
        />
      ) : (
        <blockquote className="border-l-2 border-border pl-3 text-sm italic leading-relaxed">
          {quote.text}
        </blockquote>
      )}

      {(location || quote.note) && !editing && (
        <p className="text-xs text-muted">
          {location}
          {location && quote.note ? " — " : ""}
          {quote.note}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-1">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await editQuote(quote.id, { text });
                  if ("error" in res) setError(res.error);
                  else setEditing(false);
                });
              }}
            >
              Enregistrer la citation
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setText(quote.text);
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label="Modifier la citation"
            >
              Modifier
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label="Supprimer la citation"
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await deleteQuote(quote.id);
                  if ("error" in res) setError(res.error);
                });
              }}
            >
              Supprimer
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
