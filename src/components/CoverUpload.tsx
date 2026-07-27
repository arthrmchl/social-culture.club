"use client";

import { useRef, useState, useCallback } from "react";
import { uploadImage } from "@/actions/upload";
import { cn } from "@/lib/utils";

/**
 * Téléversement de visuel par upload OU collage presse-papier (S2, D31).
 * Écrit l'id de l'Image dans un champ caché `name` pour la soumission du formulaire.
 */
export function CoverUpload({
  name,
  defaultImageId,
  aspect = "portrait",
  label = "Visuel",
  required,
}: {
  name: string;
  defaultImageId?: string | null;
  aspect?: "portrait" | "square";
  label?: string;
  required?: boolean;
}) {
  const [imageId, setImageId] = useState<string | null>(defaultImageId ?? null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setStatus("uploading");
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadImage(fd);
    if (res.ok) {
      setImageId(res.id);
      setStatus("idle");
    } else {
      setError(res.error);
      setStatus("error");
    }
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData.items).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void upload(file);
      }
    },
    [upload],
  );

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <div
        tabIndex={0}
        onPaste={onPaste}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        aria-label="Téléverser ou coller un visuel"
        className={cn(
          "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface text-center transition-colors hover:border-accent",
          aspect === "portrait" ? "aspect-[2/3] w-40" : "aspect-square w-32",
        )}
      >
        {imageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/uploads/${imageId}`}
            alt="Aperçu du visuel"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-3 text-xs text-muted">
            {status === "uploading"
              ? "Envoi…"
              : "Cliquez pour choisir un fichier, ou collez une image (⌘V / Ctrl+V)"}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <input type="hidden" name={name} value={imageId ?? ""} />

      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
      {imageId && (
        <button
          type="button"
          onClick={() => setImageId(null)}
          className="mt-1 text-xs text-muted hover:text-foreground"
        >
          Retirer
        </button>
      )}
    </div>
  );
}
