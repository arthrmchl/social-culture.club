import Link from "next/link";
import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { db } from "@/lib/db";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const works = await db.work.findMany({
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
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catalogue</h1>
        <Link href="/creer">
          <Button size="sm">➕ Ajouter</Button>
        </Link>
      </div>
      <MediaFilter basePath="/catalogue" current={workType} />

      {works.length > 0 ? (
        <WorkGrid works={works} />
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
