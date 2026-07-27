import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

const PAGE_SIZE = 60;

/**
 * File des fiches à compléter (lot 2, I1 et R8) : les fiches importées
 * arrivent sans visuel, on les rassemble ici plutôt que de les laisser se
 * diluer dans le catalogue.
 */
export default async function ACompleterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; mine?: string }>;
}) {
  const { type, mine } = await searchParams;
  const user = await requireUser();

  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;
  const onlyMine = mine === "1";

  const where = {
    needsCompletion: true,
    ...(workType ? { type: workType } : {}),
    ...(onlyMine ? { createdById: user.id } : {}),
  };

  // Les compteurs des deux onglets ignorent le filtre « créées par moi »,
  // mais suivent le filtre par média.
  const scope = {
    needsCompletion: true,
    ...(workType ? { type: workType } : {}),
  };

  const [works, total, allCount, mineCount] = await Promise.all([
    db.work.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        titleFr: true,
        titleOriginal: true,
        year: true,
        coverImageId: true,
        needsCompletion: true,
      },
    }),
    db.work.count({ where }),
    db.work.count({ where: scope }),
    db.work.count({ where: { ...scope, createdById: user.id } }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">À compléter</h1>
        <p className="mt-1 text-sm text-muted">
          Fiches importées sans visuel ni informations complètes. Les compléter
          profite à tout le monde : le catalogue est partagé (D29).
        </p>
      </div>

      <MediaFilter basePath="/a-completer" current={workType} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={workType ? `/a-completer?type=${workType}` : "/a-completer"}
          className={`rounded-full border px-3 py-1 ${
            onlyMine ? "border-border text-muted" : "border-accent text-accent"
          }`}
        >
          Toutes ({allCount})
        </Link>
        <Link
          href={
            workType
              ? `/a-completer?type=${workType}&mine=1`
              : "/a-completer?mine=1"
          }
          className={`rounded-full border px-3 py-1 ${
            onlyMine ? "border-accent text-accent" : "border-border text-muted"
          }`}
        >
          Créées par moi ({mineCount})
        </Link>
      </div>

      {works.length > 0 ? (
        <>
          <WorkGrid works={works} />
          {total > works.length && (
            <Card className="text-sm text-muted">
              {total - works.length} fiche(s) supplémentaire(s) à compléter.
              Affinez par média pour les atteindre.
            </Card>
          )}
        </>
      ) : (
        <EmptyState
          title="Rien à compléter"
          description={
            onlyMine
              ? "Aucune de vos fiches n'attend d'être complétée."
              : "Toutes les fiches du catalogue ont leur visuel."
          }
          action={
            <Link href="/catalogue">
              <Button>Voir le catalogue</Button>
            </Link>
          }
        />
      )}

      {isAdmin(user) && total > 0 && (
        <p className="text-xs text-muted">
          Astuce : en tant qu&apos;administrateur, vous pouvez compléter
          n&apos;importe quelle fiche, y compris celles créées par d&apos;autres
          membres (D30).
        </p>
      )}
    </div>
  );
}
