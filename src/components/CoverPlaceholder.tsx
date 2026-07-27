import { MEDIA } from "@/lib/media";
import { placeholderStyle } from "@/lib/placeholder";
import type { WorkType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Visuel de substitution d'une fiche sans affiche (lot 2, I1) : initiales du
 * titre sur un dégradé dont la teinte est dérivée du titre, emoji du média en
 * filigrane. La clarté suit le thème (variables --placeholder-*).
 */
export function CoverPlaceholder({
  title,
  type,
  className,
}: {
  title: string;
  type: WorkType;
  className?: string;
}) {
  const { initials, hue } = placeholderStyle(title);

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(160deg,
          hsl(${hue} var(--placeholder-s) var(--placeholder-l1)),
          hsl(${hue} var(--placeholder-s) var(--placeholder-l2)))`,
      }}
      role="img"
      aria-label={`Fiche sans visuel : ${title}`}
    >
      <span
        className="absolute inset-0 flex items-center justify-center text-5xl opacity-15"
        aria-hidden
      >
        {MEDIA[type].emoji}
      </span>
      <span
        className="relative text-2xl font-semibold tracking-wide"
        style={{ color: `hsl(${hue} 25% var(--placeholder-text))` }}
        aria-hidden
      >
        {initials}
      </span>
    </div>
  );
}

/** Pastille « à compléter » posée sur une fiche importée. */
export function NeedsCompletionBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground",
        className,
      )}
      title="Fiche importée : visuel et informations à compléter"
    >
      À compléter
    </span>
  );
}
