"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IMPORTABLE_SOURCES } from "@/lib/import/adapters";
import { formatBytes, MAX_BATCH_BYTES } from "@/lib/import/limits";
import type { ImportSource } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Dépôt des fichiers d'un export tiers (lot 2).
 *
 * Passe par `fetch` vers un Route Handler plutôt que par une server action :
 * un export complet dépasse largement la limite de 1 Mo du corps des actions.
 */
export function ImportDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<ImportSource | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startTransition] = useTransition();

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const tooBig = totalBytes > MAX_BATCH_BYTES;
  const chosen = IMPORTABLE_SOURCES.find((s) => s.source === source);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const f of Array.from(list)) {
        if (!seen.has(`${f.name}:${f.size}`)) next.push(f);
      }
      return next;
    });
  }

  function upload() {
    if (files.length === 0) {
      setError("Déposez au moins un fichier CSV.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const body = new FormData();
      for (const f of files) body.append("files", f);
      if (source) body.append("source", source);

      const res = await fetch("/api/import/upload", { method: "POST", body });
      const data = (await res.json()) as { batchId?: string; error?: string };

      if (!res.ok || !data.batchId) {
        setError(data.error ?? "Le téléversement a échoué.");
        return;
      }
      router.push(`/import/${data.batchId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Choix de la source */}
      <div>
        <p className="mb-2 text-sm font-medium">
          D&apos;où viennent vos données ?
        </p>
        <div className="flex flex-wrap gap-2">
          {IMPORTABLE_SOURCES.map((s) => (
            <button
              key={s.source}
              type="button"
              onClick={() => setSource(s.source === source ? null : s.source)}
              aria-pressed={s.source === source}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                s.source === source
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border hover:bg-elevated",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {chosen
            ? chosen.hint
            : "Vous pouvez aussi déposer directement les fichiers : la source sera devinée."}
        </p>
      </div>

      {/* Zone de dépôt */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-[var(--radius)] border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-accent bg-elevated" : "border-border",
        )}
      >
        <p className="text-sm">Déposez vos fichiers CSV ici</p>
        <p className="mt-1 text-xs text-muted">
          Les archives ZIP ne sont pas lues : dézippez-les d&apos;abord.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => inputRef.current?.click()}
        >
          Choisir des fichiers
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Fichiers retenus */}
      {files.length > 0 && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {files.length} fichier{files.length > 1 ? "s" : ""} —{" "}
              {formatBytes(totalBytes)}
            </span>
            <button
              type="button"
              className="text-xs text-muted hover:text-foreground"
              onClick={() => setFiles([])}
            >
              Tout retirer
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f) => (
              <li
                key={`${f.name}:${f.size}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tooBig && (
        <p className="text-sm text-danger" role="alert">
          L&apos;ensemble dépasse {formatBytes(MAX_BATCH_BYTES)}. Retirez des
          fichiers ou importez en plusieurs fois.
        </p>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button
          onClick={upload}
          disabled={sending || tooBig || files.length === 0}
        >
          {sending ? "Envoi…" : "Analyser ces fichiers"}
        </Button>
      </div>
    </div>
  );
}
