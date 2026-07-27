import Link from "next/link";
import { MEDIA, MEDIA_ORDER } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Filtre par type de média (liens conservant les autres paramètres). */
export function MediaFilter({
  basePath,
  current,
  params = {},
}: {
  basePath: string;
  current?: WorkType;
  params?: Record<string, string | undefined>;
}) {
  function href(type?: WorkType): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (type) sp.set("type", type);
    else sp.delete("type");
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border hover:bg-elevated",
    );

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Link href={href(undefined)} className={chip(!current)}>
        Tous
      </Link>
      {MEDIA_ORDER.map((t) => (
        <Link key={t} href={href(t)} className={chip(current === t)}>
          {MEDIA[t].emoji} {MEDIA[t].label}
        </Link>
      ))}
    </div>
  );
}
