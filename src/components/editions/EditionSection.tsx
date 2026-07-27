"use client";

import { useState, useTransition } from "react";
import {
  createEdition,
  deleteEdition,
  markOmnibusRead,
  setDefaultEdition,
  setMyEdition,
} from "@/actions/edition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select } from "@/components/ui/Field";
import { editionLabel, isOmnibus, omnibusLabel } from "@/lib/editions";

export type EditionData = {
  id: string;
  isbn: string | null;
  pageCount: number | null;
  publisher: string | null;
  format: string | null;
  isDefault: boolean;
  coversTomeFrom: number | null;
  coversTomeTo: number | null;
};

/**
 * Éditions d'une œuvre (L6, D8) : la liste, l'édition par défaut, l'édition
 * que je lis, et la lecture d'une intégrale.
 */
export function EditionSection({
  workId,
  editions,
  myEditionId,
  canEdit,
  hasTomes,
}: {
  workId: string;
  editions: EditionData[];
  myEditionId: string | null;
  canEdit: boolean;
  hasTomes: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [publisher, setPublisher] = useState("");
  const [format, setFormat] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [isbn, setIsbn] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {editions.length > 0 && (
        <div className="flex flex-col gap-2">
          {editions.map((e) => (
            <Card key={e.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {editionLabel(e)}
                  {e.isDefault && (
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                      par défaut
                    </span>
                  )}
                  {myEditionId === e.id && (
                    <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-[11px] text-accent">
                      je lis celle-ci
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {isOmnibus(e)
                    ? `Intégrale · ${omnibusLabel(e)}`
                    : "Édition simple"}
                  {e.isbn ? ` · ISBN ${e.isbn}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                {myEditionId !== e.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setMyEdition(workId, e.id))}
                  >
                    Je lis celle-ci
                  </Button>
                )}
                {isOmnibus(e) && hasTomes && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    title="Consigne une lecture et marque les tomes couverts comme lus"
                    onClick={() => run(() => markOmnibusRead(e.id))}
                  >
                    J&apos;ai lu cette intégrale
                  </Button>
                )}
                {canEdit && !e.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setDefaultEdition(e.id))}
                  >
                    Par défaut
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={`Supprimer l'édition ${editionLabel(e)}`}
                    onClick={() => run(() => deleteEdition(e.id))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editions.length > 0 && myEditionId && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => setMyEdition(workId, null))}
          >
            Ne plus préciser d&apos;édition
          </Button>
        </div>
      )}

      {canEdit &&
        (adding ? (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-3">
              <div className="w-44">
                <Label htmlFor="ed-publisher">Éditeur</Label>
                <Input
                  id="ed-publisher"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder="Glénat"
                />
              </div>
              <div className="w-40">
                <Label htmlFor="ed-format">Format</Label>
                <Select
                  id="ed-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="poche">Poche</option>
                  <option value="broché">Broché</option>
                  <option value="relié">Relié</option>
                  <option value="numérique">Numérique</option>
                  <option value="intégrale">Intégrale</option>
                </Select>
              </div>
              <div className="w-28">
                <Label htmlFor="ed-pages">Pages</Label>
                <Input
                  id="ed-pages"
                  type="number"
                  min={1}
                  value={pageCount}
                  onChange={(e) => setPageCount(e.target.value)}
                />
              </div>
              <div className="w-44">
                <Label htmlFor="ed-isbn">ISBN</Label>
                <Input
                  id="ed-isbn"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                />
              </div>
            </div>

            {hasTomes && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <Label htmlFor="ed-from">Intégrale, du tome</Label>
                  <Input
                    id="ed-from"
                    type="number"
                    min={1}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <Label htmlFor="ed-to">au tome</Label>
                  <Input
                    id="ed-to"
                    type="number"
                    min={1}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted">
                  Laissez vide pour une édition simple.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const res = await createEdition({
                      workId,
                      publisher,
                      format,
                      pageCount: pageCount || undefined,
                      isbn,
                      coversTomeFrom: from || undefined,
                      coversTomeTo: to || undefined,
                    });
                    if ("ok" in res) {
                      setPublisher("");
                      setFormat("");
                      setPageCount("");
                      setIsbn("");
                      setFrom("");
                      setTo("");
                      setAdding(false);
                    }
                    return res;
                  })
                }
              >
                Ajouter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setAdding(false)}
              >
                Annuler
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdding(true)}
            >
              Ajouter une édition
            </Button>
          </div>
        ))}

      {error && !adding && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
