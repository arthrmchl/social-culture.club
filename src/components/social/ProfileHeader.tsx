import Link from "next/link";
import { Markdown } from "@/lib/markdown";
import type { PublicAuthor } from "@/lib/social/access";

export type ProfileTab = "profil" | "journal" | "critiques" | "listes";

const TABS: { key: ProfileTab; label: string; href: (u: string) => string }[] = [
  { key: "profil", label: "Profil", href: (u) => `/u/${u}` },
  { key: "journal", label: "Journal", href: (u) => `/u/${u}/journal` },
  { key: "critiques", label: "Critiques", href: (u) => `/u/${u}/critiques` },
  { key: "listes", label: "Listes", href: (u) => `/u/${u}/listes` },
];

/** L'avatar d'un membre — repli sur l'initiale, jamais d'image cassée. */
export function Avatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-base";

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        className={`${px} shrink-0 rounded-full border border-border object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${px} ${text} flex shrink-0 items-center justify-center rounded-full border border-border bg-elevated font-semibold text-muted`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/**
 * L'en-tête commun aux pages `/u/[username]/*` (P1).
 *
 * Les onglets sont des liens et non un état client : chaque section du profil
 * est une URL partageable, dans la continuité des facettes du lot 3.
 * Les onglets fermés par la visibilité ne sont simplement pas rendus — un
 * onglet qui mène à une page introuvable est pire qu'un onglet absent.
 */
export function ProfileHeader({
  author,
  tab,
  sections,
  follows,
  action,
}: {
  author: PublicAuthor;
  tab: ProfileTab;
  sections: { journal: boolean; reviews: boolean; lists: boolean };
  follows: { followers: number; following: number } | null;
  action?: React.ReactNode;
}) {
  const username = author.username ?? "";
  const visible = TABS.filter((t) => {
    if (t.key === "journal") return sections.journal;
    if (t.key === "critiques") return sections.reviews;
    if (t.key === "listes") return sections.lists;
    return true;
  });

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <Avatar name={author.name} image={author.image} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{author.name}</h1>
          {username && <p className="text-sm text-muted">@{username}</p>}
          {follows && (
            <p className="mt-1 text-sm text-muted">
              <Link
                href={`/u/${username}/abonnes`}
                className="hover:text-accent"
              >
                <strong className="text-foreground">{follows.followers}</strong>{" "}
                {follows.followers === 1 ? "abonné" : "abonnés"}
              </Link>
              {" · "}
              <Link
                href={`/u/${username}/abonnements`}
                className="hover:text-accent"
              >
                <strong className="text-foreground">{follows.following}</strong>{" "}
                {follows.following === 1 ? "abonnement" : "abonnements"}
              </Link>
            </p>
          )}
        </div>
        {action}
      </div>

      {author.bio && (
        <div className="text-sm text-muted">
          <Markdown>{author.bio}</Markdown>
        </div>
      )}

      <nav
        aria-label="Sections du profil"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {visible.map((t) => (
          <Link
            key={t.key}
            href={t.href(username)}
            className={
              t.key === tab
                ? "-mb-px border-b-2 border-accent px-3 py-2 text-sm font-medium text-accent"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
