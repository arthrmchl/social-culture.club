import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { describeList } from "@/lib/lists";
import { Card } from "@/components/ui/Card";
import { ListActions } from "@/components/lists/ListActions";
import { AddWorkToList } from "@/components/lists/AddWorkToList";
import {
  ListItemRow,
  type ListItemRowData,
} from "@/components/lists/ListItemRow";

export default async function ListePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();

  const list = await db.list.findFirst({
    where: { userId: user.id, slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isRanked: true,
      isPinned: true,
      coverImageId: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          workId: true,
          note: true,
          work: {
            select: {
              titleFr: true,
              type: true,
              year: true,
              coverImageId: true,
            },
          },
        },
      },
    },
  });
  if (!list) notFound();

  const items: ListItemRowData[] = list.items.map((i) => ({
    workId: i.workId,
    note: i.note,
    title: i.work.titleFr,
    type: i.work.type,
    year: i.work.year,
    coverImageId: i.work.coverImageId,
  }));

  const cover = list.coverImageId ? `/api/uploads/${list.coverImageId}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/listes" className="text-sm text-muted hover:text-accent">
          ← Mes listes
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        {cover && (
          <div className="size-28 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt={`Visuel de ${list.title}`}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {list.isPinned && <span aria-label="Épinglée">📌 </span>}
            {list.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {describeList(items.length, list.isRanked)}
          </p>
          {list.description && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
              {list.description}
            </p>
          )}
          <div className="mt-4">
            <ListActions
              listId={list.id}
              title={list.title}
              slug={list.slug}
              isPinned={list.isPinned}
            />
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Ajouter une œuvre
        </h2>
        <AddWorkToList listId={list.id} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {list.isRanked ? "Classement" : "Œuvres"}
        </h2>
        {items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <ListItemRow
                key={item.workId}
                listId={list.id}
                item={item}
                index={index}
                total={items.length}
                isRanked={list.isRanked}
              />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">
            Cette liste est vide. Cherchez une œuvre ci-dessus pour l&apos;y
            ranger.
          </Card>
        )}
      </section>
    </div>
  );
}
