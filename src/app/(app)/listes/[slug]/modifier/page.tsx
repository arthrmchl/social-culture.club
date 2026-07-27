import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ListForm } from "@/components/lists/ListForm";

export default async function ModifierListePage({
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
      coverImageId: true,
    },
  });
  if (!list) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link
          href={`/listes/${list.slug}`}
          className="text-sm text-muted hover:text-accent"
        >
          ← {list.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Modifier la liste</h1>
      </div>
      <ListForm initial={list} />
    </div>
  );
}
