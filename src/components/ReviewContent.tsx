import { Markdown } from "@/lib/markdown";

/**
 * Affiche une critique (S7). Si elle porte un spoiler, elle est repliée
 * derrière un `<details>` natif (aucun JavaScript requis, accessible).
 */
export function ReviewContent({
  text,
  hasSpoiler,
}: {
  text: string | null | undefined;
  hasSpoiler?: boolean;
}) {
  if (!text || !text.trim()) return null;

  if (hasSpoiler) {
    return (
      <details className="rounded-[var(--radius)] border border-border bg-elevated/50 p-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-muted">
          ⚠️ Contient un spoiler — afficher
        </summary>
        <div className="mt-2">
          <Markdown>{text}</Markdown>
        </div>
      </details>
    );
  }

  return <Markdown>{text}</Markdown>;
}
