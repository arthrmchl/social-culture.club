import Link from "next/link";
import { WorkGrid } from "@/components/WorkCard";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { MEDIA, MEDIA_ORDER } from "@/lib/media";

export default async function AccueilPage() {
  const user = await requireUser();

  const [recent, total] = await Promise.all([
    db.work.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        titleFr: true,
        titleOriginal: true,
        year: true,
        coverImageId: true,
      },
    }),
    db.work.count(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Bonjour {user.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {total} œuvre{total > 1 ? "s" : ""} dans le catalogue partagé.
        </p>
      </div>

      {/* Ajout rapide (N1) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Ajouter une œuvre
        </h2>
        <div className="flex flex-wrap gap-2">
          {MEDIA_ORDER.map((t) => (
            <Link key={t} href={`/creer?type=${t}`}>
              <Button variant="secondary" size="sm">
                {MEDIA[t].emoji} {MEDIA[t].label}
              </Button>
            </Link>
          ))}
        </div>
      </section>

      {/* En cours — livré au lot 1 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          En cours
        </h2>
        <Card className="p-4 text-sm text-muted">
          Vos séries à poursuivre et lectures ouvertes apparaîtront ici (lot 1).
        </Card>
      </section>

      {/* Derniers ajouts au catalogue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Derniers ajouts au catalogue
        </h2>
        {recent.length > 0 ? (
          <WorkGrid works={recent} />
        ) : (
          <EmptyState
            title="Rien pour l'instant"
            description="Lancez le catalogue en créant la première fiche."
            action={
              <Link href="/creer">
                <Button>Créer une œuvre</Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
