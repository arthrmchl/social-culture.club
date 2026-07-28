import Link from "next/link";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { formatYear } from "@/lib/media";
import type { PublicWork } from "@/lib/social/read";

/**
 * Une vignette d'œuvre, sur les pages publiques.
 *
 * Le lien pointe vers `/oeuvre/<id>`, qui vit dans `(app)` : un visiteur
 * déconnecté sera renvoyé vers la connexion. C'est volontaire — le catalogue
 * partagé (D29) reste réservé aux membres ; seul le profil est ouvert.
 */
export function PublicWorkCover({
  work,
  className = "",
}: {
  work: PublicWork;
  className?: string;
}) {
  return (
    <Link
      href={`/oeuvre/${work.id}`}
      className={`group block ${className}`}
      title={`${work.titleFr} — ${formatYear(work.year)}`}
    >
      <div className="aspect-[2/3] overflow-hidden rounded-md border border-border bg-elevated">
        {work.coverImageId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/uploads/${work.coverImageId}`}
            alt={work.titleFr}
            className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
          />
        ) : (
          <CoverPlaceholder title={work.titleFr} type={work.type} />
        )}
      </div>
    </Link>
  );
}

/** Une grille de vignettes — les favoris de profil, le contenu d'une liste. */
export function PublicWorkGrid({ works }: { works: PublicWork[] }) {
  return (
    <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
      {works.map((w) => (
        <li key={w.id}>
          <PublicWorkCover work={w} />
          <p className="mt-1 truncate text-[11px] text-muted">{w.titleFr}</p>
        </li>
      ))}
    </ul>
  );
}
