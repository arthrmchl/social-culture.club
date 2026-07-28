import Link from "next/link";
import { VisibilityForm } from "@/components/social/VisibilityForm";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Confidentialité" };

export default async function ConfidentialitePage() {
  const sessionUser = await requireUser();

  const me = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      username: true,
      visibility: true,
      showJournalPublicly: true,
      showStatsPublicly: true,
    },
  });
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
    </div>
  );
}
