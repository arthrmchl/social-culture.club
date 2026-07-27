import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { searchWorks } from "@/lib/search";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const results = q ? await searchWorks(q, workType) : [];
  const createHref = `/creer?${new URLSearchParams({
    ...(q ? { title: q } : {}),
    ...(workType ? { type: workType } : {}),
  }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Recherche</h1>
      <SearchBox />
      <MediaFilter
        basePath="/recherche"
        current={workType}
        params={{ q }}
      />

      {q ? (
        results.length > 0 ? (
          <>
            <WorkGrid works={results} />
            <div className="pt-2 text-center text-sm text-muted">
              L'œuvre n'est pas là ?{" "}
              <Link href={createHref} className="text-accent hover:underline">
                Créer une nouvelle fiche
              </Link>
            </div>
          </>
        ) : (
          <EmptyState
            title={`Aucun résultat pour « ${q} »`}
            description="Le catalogue est alimenté par les membres. Soyez le premier à consigner cette œuvre."
            action={
              <Link href={createHref}>
                <Button>Créer « {q} »</Button>
              </Link>
            }
          />
        )
      ) : (
        <p className="text-sm text-muted">
          Tapez un titre pour chercher dans le catalogue partagé.
        </p>
      )}
    </div>
  );
}
