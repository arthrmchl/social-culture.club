"use client";

import { useState, useTransition } from "react";
import {
  createEdition,
  deleteEdition,
  editEdition,
  markEditionRead,
  setDefaultEdition,
  setMyEdition,
} from "@/actions/edition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CoverUpload } from "@/components/CoverUpload";
import { Input, Label, Select } from "@/components/ui/Field";
import { editionLabel } from "@/lib/editions";
import { LANGUAGES } from "@/lib/languages";

export type EditionData = {
  id: string;
  title: string | null;
  language: string | null;
  isbn: string | null;
  pageCount: number | null;
  publisher: string | null;
  format: string | null;
  isDefault: boolean;
  coverImageId: string | null;
  translators: string[];
  /** Le nombre de volumes de ce tirage (lot 6) — 0 pour un livre. */
  tomeCount: number;
};

/** La saisie, toujours en chaînes : un seul état plutôt que dix `useState`. */
type Draft = {
  title: string;
  language: string;
  translators: string;
  publisher: string;
  format: string;
  pageCount: string;
  isbn: string;
  tomeCount: string;
  coverImageId: string | null;
};

const EMPTY: Draft = {
  title: "",
  language: "",
  translators: "",
  publisher: "",
  format: "",
  pageCount: "",
  isbn: "",
  tomeCount: "",
  coverImageId: null,
};

function draftOf(e: EditionData): Draft {
  return {
    title: e.title ?? "",
    language: e.language ?? "",
    translators: e.translators.join(", "),
    publisher: e.publisher ?? "",
    format: e.format ?? "",
    pageCount: e.pageCount ? String(e.pageCount) : "",
    isbn: e.isbn ?? "",
    tomeCount: e.tomeCount ? String(e.tomeCount) : "",
    coverImageId: e.coverImageId,
  };
}

/**
 * Éditions d'une œuvre (L6, D8) : la liste, l'édition par défaut, l'édition
 * que je lis, ses tomes, et la lecture de l'édition entière.
 *
 * Depuis le lot 5, l'édition porte ce qui décrit l'objet publié — titre, langue,
 * traducteurs, couverture — que la fiche d'œuvre ne connaît plus ; depuis le
 * lot 6, ses **tomes** aussi. Une intégrale n'est donc plus une étendue
 * déclarée sur la série : c'est une édition à peu de volumes.
 */
export function EditionSection({
  workId,
  editions,
  myEditionId,
  canEdit,
  showTomes,
}: {
  workId: string;
  editions: EditionData[];
  myEditionId: string | null;
  canEdit: boolean;
  /** Média suivi au tome : le tirage déclare alors son nombre de volumes. */
  showTomes: boolean;
}) {
  // `null` : aucun formulaire ouvert. `"new"` : création. Sinon l'id modifié.
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
    });
  }

  function openCreate() {
    setError(null);
    setDraft(EMPTY);
    setOpen("new");
  }

  function openEdit(e: EditionData) {
    setError(null);
    setDraft(draftOf(e));
    setOpen(e.id);
  }

  function submit() {
    const payload = {
      title: draft.title,
      language: draft.language,
      translators: draft.translators,
      publisher: draft.publisher,
      format: draft.format,
      pageCount: draft.pageCount || undefined,
      isbn: draft.isbn,
      tomeCount: showTomes ? draft.tomeCount || "0" : undefined,
      coverImageId: draft.coverImageId ?? "",
    };
    run(async () => {
      const res =
        open === "new"
          ? await createEdition({ workId, ...payload })
          : await editEdition(open!, payload);
      if ("ok" in res) setOpen(null);
      return res;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {editions.length > 0 && (
        <div className="flex flex-col gap-2">
          {editions.map((e) => (
            // Chaque édition est un groupe nommé : « Je lis celle-ci » et
            // « J'ai lu cette édition » se répètent d'une carte à l'autre, et
            // rien d'autre ne dirait de quel tirage il s'agit.
            <Card
              key={e.id}
              role="group"
              aria-label={editionLabel(e, e.tomeCount)}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              {e.coverImageId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/uploads/${e.coverImageId}`}
                  alt=""
                  className="h-16 w-11 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {editionLabel(e, e.tomeCount)}
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
                  {e.isbn ? `ISBN ${e.isbn}` : "Édition"}
                  {e.translators.length > 0
                    ? ` · Traduction de ${e.translators.join(", ")}`
                    : ""}
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
                {e.tomeCount > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    title="Consigne une lecture et marque tous les tomes de ce tirage comme lus"
                    onClick={() => run(() => markEditionRead(e.id))}
                  >
                    J&apos;ai lu cette édition
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
                    aria-label={`Modifier l'édition ${editionLabel(e, e.tomeCount)}`}
                    onClick={() => openEdit(e)}
                  >
                    Modifier
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={`Supprimer l'édition ${editionLabel(e, e.tomeCount)}`}
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
        (open !== null ? (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <CoverUpload
                // Repart d'un visuel propre à chaque ouverture du formulaire.
                key={open}
                name="ed-cover"
                label="Couverture"
                defaultImageId={draft.coverImageId}
                onChange={(id) => setDraft((d) => ({ ...d, coverImageId: id }))}
              />

              <div className="flex flex-1 flex-wrap gap-3">
                <div className="w-full sm:w-64">
                  <Label htmlFor="ed-title">Titre de l&apos;édition</Label>
                  <Input
                    id="ed-title"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder="Titre traduit, titre de collection…"
                  />
                </div>
                <div className="w-44">
                  <Label htmlFor="ed-publisher">Éditeur</Label>
                  <Input
                    id="ed-publisher"
                    value={draft.publisher}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, publisher: e.target.value }))
                    }
                    placeholder="Glénat"
                  />
                </div>
                <div className="w-40">
                  <Label htmlFor="ed-format">Format</Label>
                  <Select
                    id="ed-format"
                    value={draft.format}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, format: e.target.value }))
                    }
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
                    value={draft.pageCount}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, pageCount: e.target.value }))
                    }
                  />
                </div>
                <div className="w-44">
                  <Label htmlFor="ed-isbn">ISBN</Label>
                  <Input
                    id="ed-isbn"
                    value={draft.isbn}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, isbn: e.target.value }))
                    }
                  />
                </div>
                <div className="w-32">
                  <Label htmlFor="ed-language">Langue</Label>
                  <Input
                    id="ed-language"
                    list="edition-language-options"
                    value={draft.language}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, language: e.target.value }))
                    }
                    placeholder="fr, en…"
                  />
                  <datalist id="edition-language-options">
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="w-full sm:w-64">
                  <Label htmlFor="ed-translators">Traducteur·rice(s)</Label>
                  <Input
                    id="ed-translators"
                    value={draft.translators}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, translators: e.target.value }))
                    }
                    placeholder="À renseigner si c'est une traduction (virgules)"
                  />
                </div>
              </div>
            </div>

            {showTomes && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-36">
                  <Label htmlFor="ed-tomes">Nombre de tomes</Label>
                  <Input
                    id="ed-tomes"
                    type="number"
                    min={0}
                    value={draft.tomeCount}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tomeCount: e.target.value }))
                    }
                  />
                </div>
                <p className="text-xs text-muted">
                  Les volumes de ce tirage : 41 chez l&apos;un, 14 en édition
                  deluxe. C&apos;est sur eux que porte le suivi.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={submit}>
                {open === "new" ? "Ajouter" : "Enregistrer l'édition"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setOpen(null)}
              >
                Annuler
              </Button>
            </div>
          </Card>
        ) : (
          <div>
            <Button variant="secondary" size="sm" onClick={openCreate}>
              Ajouter une édition
            </Button>
          </div>
        ))}

      {error && open === null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
