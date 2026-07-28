import Link from "next/link";
import { MemberList } from "@/components/social/MemberList";
import {
  FollowLinkAction,
  FollowRequestActions,
} from "@/components/social/FollowRequestActions";
import { Card, EmptyState } from "@/components/ui/Card";
import { Avatar } from "@/components/social/ProfileHeader";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { blockedUserIds } from "@/lib/social/access";

export const metadata = { title: "Mes abonnements" };

const MEMBER_SELECT = {
  id: true,
  name: true,
  username: true,
  image: true,
  bio: true,
} as const;

/**
 * Mes abonnements, mes abonnés et les demandes en attente (P2, P5).
 *
 * Les comptes bloqués sont retirés des trois listes : le blocage vaut dans les
 * deux sens, y compris sur ses propres pages.
 */
export default async function AbonnementsPage() {
  const user = await requireUser();
  const blocked = await blockedUserIds(user.id);

  const [requests, following, followers] = await Promise.all([
    db.follow.findMany({
      where: {
        followingId: user.id,
        status: "PENDING",
        followerId: { notIn: blocked },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, follower: { select: MEMBER_SELECT } },
    }),
    db.follow.findMany({
      where: {
        followerId: user.id,
        status: "ACCEPTED",
        followingId: { notIn: blocked },
      },
      orderBy: { createdAt: "desc" },
      select: { following: { select: MEMBER_SELECT } },
    }),
    db.follow.findMany({
      where: {
        followingId: user.id,
        status: "ACCEPTED",
        followerId: { notIn: blocked },
      },
      orderBy: { createdAt: "desc" },
      select: { follower: { select: MEMBER_SELECT } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Mes abonnements</h1>
        <Link href="/decouvrir" className="text-sm text-muted hover:text-accent">
          Découvrir des membres →
        </Link>
      </div>

      {requests.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Demandes en attente ({requests.length})
          </h2>
          <p className="mb-2 text-xs text-muted">
            Votre compte est privé : ces membres attendent votre accord pour
            voir votre journal et vos listes.
          </p>
          <Card className="flex flex-col divide-y divide-border p-0">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={r.follower.name} image={r.follower.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.follower.name}</p>
                  {r.follower.username && (
                    <p className="truncate text-xs text-muted">
                      @{r.follower.username}
                    </p>
                  )}
                </div>
                <FollowRequestActions followId={r.id} />
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Je suis ({following.length})
        </h2>
        <MemberList
          members={following.map((f) => f.following)}
          empty={{
            title: "Vous ne suivez personne",
            description:
              "Votre fil restera vide tant que vous ne suivrez personne.",
          }}
          action={(m) => (
            <FollowLinkAction userId={m.id} mode="unfollow" name={m.name} />
          )}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Me suivent ({followers.length})
        </h2>
        {followers.length === 0 ? (
          <EmptyState
            title="Aucun abonné"
            description="Personne ne vous suit encore."
          />
        ) : (
          <MemberList
            members={followers.map((f) => f.follower)}
            empty={{ title: "Aucun abonné" }}
            action={(m) => (
              <FollowLinkAction
                userId={m.id}
                mode="remove-follower"
                name={m.name}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}
