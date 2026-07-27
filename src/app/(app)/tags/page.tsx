import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/Card";
import { TagManager } from "@/components/tags/TagManager";

export const metadata = { title: "Mes étiquettes" };

export default async function TagsPage() {
  const user = await requireUser();

  const tags = await db.tag.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { works: true, entries: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Mes étiquettes</h1>
        <p className="mt-1 text-sm text-muted">
          Votre vocabulaire, posé sur les œuvres comme sur les entrées de
          journal. Il n&apos;appartient qu&apos;à vous.
        </p>
      </div>

      {tags.length > 0 ? (
        <TagManager
          tags={tags.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            works: t._count.works,
            entries: t._count.entries,
          }))}
        />
      ) : (
        <EmptyState
          title="Aucune étiquette"
          description="Ajoutez-en depuis une fiche d'œuvre ou une entrée de journal : « policier », « à relire », « vu au cinéma »…"
        />
      )}
    </div>
  );
}
