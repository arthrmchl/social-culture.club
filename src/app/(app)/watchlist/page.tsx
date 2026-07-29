import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { requireUser } from "@/lib/session";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const rows = await db.userWork.findMany({
    where: {
      userId: user.id,
      state: "WANT",
      ...(workType ? { work: { type: workType } } : {}),
    },
    orderBy: { watchlistedAt: "desc" },
    include: {
      work: {
        select: {
          id: true,
          type: true,
          titleFr: true,
          titleOriginal: true,
          year: true,
          endYear: true,
          coverImageId: true,
          needsCompletion: true,
        },
      },
    },
  });

  const covers = await resolveCovers(
    rows.map((r) => r.work),
    user.id,
  );
  const works = rows.map((r) => ({
    ...r.work,
    coverImageId: covers.get(r.work.id),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">À voir / à lire</h1>
        <p className="mt-1 text-sm text-muted">
          Vos œuvres en attente, les plus récemment ajoutées d'abord.
        </p>
      </div>
      <MediaFilter basePath="/watchlist" current={workType} />

      {works.length > 0 ? (
        <WorkGrid works={works} />
      ) : (
        <EmptyState
          title="Rien en attente"
          description="Marquez une œuvre « à voir » ou « à lire » depuis sa fiche."
        />
      )}
    </div>
  );
}
