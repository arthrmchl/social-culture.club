import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { ListCard, type ListCardData } from "@/components/lists/ListCard";

export const metadata = { title: "Mes listes" };

export default async function ListesPage() {
  const user = await requireUser();

  const lists = await db.list.findMany({
    where: { userId: user.id },
    // Épinglées d'abord (S9), puis les plus récemment touchées.
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: {
      slug: true,
      title: true,
      description: true,
      isRanked: true,
      isPinned: true,
      coverImageId: true,
      _count: { select: { items: true } },
      // Les médias présents servent à montrer qu'une liste est multi-médias
      // (D11) — quelques éléments suffisent à le dire.
      items: {
        take: 12,
        orderBy: { position: "asc" },
        select: { work: { select: { type: true } } },
      },
    },
  });

  const cards: ListCardData[] = lists.map((l) => ({
    slug: l.slug,
    title: l.title,
    description: l.description,
    isRanked: l.isRanked,
    isPinned: l.isPinned,
    coverImageId: l.coverImageId,
    count: l._count.items,
    types: [...new Set(l.items.map((i) => i.work.type))],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes listes</h1>
          <p className="mt-1 text-sm text-muted">
            Films, livres, séries et mangas peuvent cohabiter dans une même
            liste.
          </p>
        </div>
        <Link href="/listes/nouvelle">
          <Button size="sm">Nouvelle liste</Button>
        </Link>
      </div>

      {cards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((l) => (
            <ListCard key={l.slug} list={l} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucune liste pour l'instant"
          description="Une liste rassemble ce que vous voulez : un classement de l'année, une pile à lire, un thème."
          action={
            <Link href="/listes/nouvelle">
              <Button>Créer ma première liste</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
