import Link from "next/link";

/** Étiquettes cliquables (S10) — même pastille que les genres de la fiche. */
export function TagPills({
  tags,
  className,
}: {
  tags: { name: string; slug: string }[];
  className?: string;
}) {
  if (tags.length === 0) return null;

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {tags.map((t) => (
        <Link
          key={t.slug}
          href={`/tag/${t.slug}`}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-elevated"
        >
          #{t.name}
        </Link>
      ))}
    </div>
  );
}
