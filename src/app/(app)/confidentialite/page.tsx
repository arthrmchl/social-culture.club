import Link from "next/link";
import { BlockButton } from "@/components/social/BlockButton";
import { MemberList } from "@/components/social/MemberList";
import { VisibilityForm } from "@/components/social/VisibilityForm";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Confidentialité" };

export default async function ConfidentialitePage() {
  const sessionUser = await requireUser();

  const [me, blocks] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        username: true,
        visibility: true,
        showJournalPublicly: true,
        showStatsPublicly: true,
      },
    }),
    // Seuls les blocages **que j'ai posés** : ceux dont je suis l'objet ne me
    // regardent pas, et les afficher dirait à un bloqué qu'il l'est.
    db.block.findMany({
      where: { blockerId: sessionUser.id },
      orderBy: { createdAt: "desc" },
      select: {
        blocked: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            bio: true,
          },
        },
      },
    }),
  ]);
  if (!me) return null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Confidentialité</h1>
        <p className="mt-1 text-sm text-muted">
          Ce que les autres membres — et le web, si vous l&apos;autorisez —
          voient de vous.
        </p>
      </div>

      {me.username ? (
        <Card className="p-3 text-sm">
          Votre profil public :{" "}
          <Link href={`/u/${me.username}`} className="text-accent">
            /u/{me.username}
          </Link>
        </Card>
      ) : (
        <Card className="p-3 text-sm">
          Vous n&apos;avez pas encore de nom d&apos;utilisateur.{" "}
          <Link href="/profil" className="text-accent">
            En choisir un
          </Link>{" "}
          donnera une adresse à votre profil.
        </Card>
      )}

      <VisibilityForm
        initial={{
          visibility: me.visibility,
          showJournalPublicly: me.showJournalPublicly,
          showStatsPublicly: me.showStatsPublicly,
        }}
        hasUsername={me.username !== null}
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Comptes bloqués ({blocks.length})
        </h2>
        <p className="mb-2 text-xs text-muted">
          Un blocage vaut dans les deux sens : vous ne voyez plus son contenu et
          il ne voit plus le vôtre. Vos j&apos;aime et commentaires déjà posés
          sont masqués, pas supprimés — débloquer les rend de nouveau visibles.
        </p>
        <MemberList
          members={blocks.map((b) => b.blocked)}
          empty={{
            title: "Aucun compte bloqué",
            description: "Vous n'avez bloqué personne.",
          }}
          action={(m) => (
            <BlockButton targetUserId={m.id} name={m.name} blocked />
          )}
        />
      </section>
    </div>
  );
}
