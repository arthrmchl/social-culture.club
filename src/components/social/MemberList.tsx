import Link from "next/link";
import { EmptyState } from "@/components/ui/Card";
import type { PublicMember } from "@/lib/social/read";
import { Avatar } from "./ProfileHeader";

/**
 * Une liste de membres — abonnés, abonnements, membres à suivre.
 *
 * Un membre sans pseudonyme n'est pas cliquable : `User.username` est nullable
 * (plugin better-auth) et un profil public exige une URL. Le cas se produit
 * pour un compte créé avant le lot 4 ; on l'affiche plutôt que de le taire.
 */
export function MemberList({
  members,
  empty,
  action,
}: {
  members: PublicMember[];
  empty: { title: string; description?: string };
  action?: (member: PublicMember) => React.ReactNode;
}) {
  if (members.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} />;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-[var(--radius)] border border-border bg-surface">
      {members.map((m) => {
        const inner = (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={m.name} image={m.image} />
            <div className="min-w-0">
              <p className="truncate font-medium">{m.name}</p>
              {m.username ? (
                <p className="truncate text-xs text-muted">@{m.username}</p>
              ) : (
                <p className="truncate text-xs text-muted">
                  Sans nom d&apos;utilisateur
                </p>
              )}
            </div>
          </div>
        );

        return (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            {m.username ? (
              <Link
                href={`/u/${m.username}`}
                className="flex min-w-0 flex-1 hover:text-accent"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
            {action?.(m)}
          </li>
        );
      })}
    </ul>
  );
}
