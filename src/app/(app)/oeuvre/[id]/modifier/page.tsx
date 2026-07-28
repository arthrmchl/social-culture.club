import { notFound, redirect } from "next/navigation";
import { WorkForm } from "@/components/WorkForm";
import { editWork } from "@/actions/work";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";

export default async function ModifierOeuvrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const work = await db.work.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      creators: { include: { person: true } },
    },
  });
  if (!work) notFound();
  if (work.createdById !== user.id && !isAdmin(user)) redirect(`/oeuvre/${id}`);

  const genres = await db.genre.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const metadata = (work.metadata ?? {}) as { format?: string };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Modifier la fiche</h1>
      <WorkForm
        action={editWork.bind(null, id)}
        mode="edit"
        submitLabel="Enregistrer"
        genreOptions={genres.map((g) => g.name)}
        initial={{
          type: work.type,
          titleFr: work.titleFr,
          titleOriginal: work.titleOriginal ?? undefined,
          originalLanguage: work.originalLanguage ?? undefined,
          year: work.year ?? undefined,
          synopsis: work.synopsis ?? undefined,
          durationMinutes: work.durationMinutes ?? undefined,
          format: metadata.format,
          genres: work.genres.map((g) => g.genre.name).join(", "),
          creators: work.creators.map((c) => c.person.name).join(", "),
          coverImageId: work.coverImageId,
        }}
      />
    </div>
  );
}
