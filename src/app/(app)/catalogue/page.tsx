import Link from "next/link";
import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { requireUser } from "@/lib/session";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const [works, toComplete] = await Promise.all([
    db.work.findMany({
      where: workType ? { type: workType } : undefined,
      orderBy: { createdAt: "desc" },
      take: 120,
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
    db.work.count({ where: { needsCompletion: true } }),
  ]);

  const covers = await resolveCovers(works, user.id);
  const items = works.map((w) => ({ ...w, coverImageId: covers.get(w.id) }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Catalogue partagé</h1>
          <p className="mt-1 text-sm text-muted">
            Toutes les fiches de l&apos;instance (D29).{" "}
            <Link href="/bibliotheque" className="text-accent hover:underline">
              Voir seulement mes œuvres
            </Link>
          </p>
        </div>
        <Link href="/creer">
          <Button size="sm">➕ Ajouter</Button>
        </Link>
      </div>
      <MediaFilter basePath="/catalogue" current={workType} />

      {toComplete > 0 && (
        <Link
          href="/a-completer"
          className="rounded-[var(--radius)] border border-accent/40 px-3 py-2 text-sm hover:bg-elevated"
        >
          ✨{" "}
          {toComplete === 1
            ? "1 fiche à compléter"
            : `${toComplete} fiches à compléter`}{" "}
          <span className="text-muted">
            — visuels et informations manquants
          </span>
        </Link>
      )}

      {works.length > 0 ? (
        <WorkGrid works={items} />
      ) : (
        <EmptyState
          title="Le catalogue est vide"
          description="Créez la première fiche pour lancer le catalogue partagé."
          action={
            <Link href="/creer">
              <Button>Créer une œuvre</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
