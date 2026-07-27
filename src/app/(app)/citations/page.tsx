import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { MEDIA, isWorkType } from "@/lib/media";
import { Card, EmptyState } from "@/components/ui/Card";
import { MediaFilter } from "@/components/MediaFilter";
import type { WorkType } from "@/generated/prisma/enums";

export const metadata = { title: "Mes citations" };

/** Toutes mes citations (L3), groupées par œuvre. */
export default async function CitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;
  const workType = type && isWorkType(type) ? type : undefined;

  const quotes = await db.quote.findMany({
    where: {
      userId: user.id,
      ...(workType ? { work: { type: workType } } : {}),
    },
    orderBy: [{ workId: "asc" }, { page: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      text: true,
      page: true,
      note: true,
      tome: { select: { number: true } },
      work: { select: { id: true, titleFr: true, type: true } },
    },
  });

  // Regroupement par œuvre, dans l'ordre de première apparition.
  const byWork = new Map<
    string,
    { title: string; type: WorkType; items: typeof quotes }
  >();
  for (const q of quotes) {
    const entry = byWork.get(q.work.id);
    if (entry) entry.items.push(q);
    else
      byWork.set(q.work.id, {
        title: q.work.titleFr,
        type: q.work.type,
        items: [q],
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Mes citations</h1>
        <p className="mt-1 text-sm text-muted">
          {quotes.length} passage{quotes.length > 1 ? "s" : ""} sauvegardé
          {quotes.length > 1 ? "s" : ""}.
        </p>
      </div>

      <MediaFilter basePath="/citations" current={workType} />

      {byWork.size > 0 ? (
        <div className="flex flex-col gap-6">
          {[...byWork.entries()].map(([workId, group]) => (
            <section key={workId}>
              <h2 className="mb-2 text-sm font-semibold">
                <Link href={`/oeuvre/${workId}`} className="hover:text-accent">
                  {MEDIA[group.type].emoji} {group.title}
                </Link>
              </h2>
              <div className="flex flex-col gap-2">
                {group.items.map((q) => {
                  const location = [
                    q.tome ? `Tome ${q.tome.number}` : null,
                    q.page ? `p. ${q.page}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <Card key={q.id} className="flex flex-col gap-2 p-4">
                      <blockquote className="border-l-2 border-border pl-3 text-sm italic leading-relaxed">
                        {q.text}
                      </blockquote>
                      {(location || q.note) && (
                        <p className="text-xs text-muted">
                          {location}
                          {location && q.note ? " — " : ""}
                          {q.note}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Aucune citation"
          description="Les citations se prennent depuis la fiche d'un livre, d'une BD ou d'un manga."
        />
      )}
    </div>
  );
}
