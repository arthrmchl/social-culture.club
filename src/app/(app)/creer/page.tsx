import { WorkForm } from "@/components/WorkForm";
import { createWork } from "@/actions/work";
import { db } from "@/lib/db";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function CreerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; title?: string }>;
}) {
  const { type, title } = await searchParams;
  const initialType: WorkType =
    type && isWorkType(type) ? type : "FILM";

  const genres = await db.genre.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">Nouvelle œuvre</h1>
      <p className="mb-6 text-sm text-muted">
        Titre, année et visuel suffisent — le reste est complétable plus tard.
      </p>
      <WorkForm
        action={createWork}
        mode="create"
        submitLabel="Créer la fiche"
        genreOptions={genres.map((g) => g.name)}
        initial={{ type: initialType, titleFr: title ?? "" }}
      />
    </div>
  );
}
