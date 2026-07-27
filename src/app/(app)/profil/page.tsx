import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
import { FavoritesRow } from "@/components/profile/FavoritesRow";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

function imageIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/uploads\/([^/]+)$/);
  return m ? m[1] : null;
}

export default async function ProfilPage() {
  const sessionUser = await requireUser();
  const [user, favorites] = await Promise.all([
    db.user.findUnique({ where: { id: sessionUser.id } }),
    db.favorite.findMany({
      where: { userId: sessionUser.id },
      orderBy: { position: "asc" },
      select: {
        work: {
          select: {
            id: true,
            titleFr: true,
            type: true,
            year: true,
            coverImageId: true,
          },
        },
      },
    }),
  ]);
  if (!user) return null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">Mon profil</h1>

      {/* Favoris de profil (S11) — la vitrine, avant l'état civil. */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Mes favoris
        </h2>
        <FavoritesRow initial={favorites.map((f) => f.work)} />
      </section>

      <ProfileForm
        initial={{
          name: user.name,
          username: user.username ?? "",
          email: user.email,
          bio: user.bio ?? "",
          avatarImageId: imageIdFromUrl(user.image),
        }}
      />

      {/* Accès mobile aux pages hors barre du bas — celle-ci est pleine. */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Ma bibliothèque
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          <Link
            href="/catalogue"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            🗂️ Catalogue partagé
            <span className="block text-xs text-muted">
              Toutes les fiches de l&apos;instance, pas seulement les vôtres
            </span>
          </Link>
          <Link href="/listes" className="px-4 py-3 text-sm hover:bg-elevated">
            📋 Mes listes
            <span className="block text-xs text-muted">
              Classements et recueils, tous médias mêlés
            </span>
          </Link>
          <Link href="/tags" className="px-4 py-3 text-sm hover:bg-elevated">
            🏷️ Mes étiquettes
            <span className="block text-xs text-muted">
              Le vocabulaire posé sur vos œuvres et votre journal
            </span>
          </Link>
          <Link
            href="/citations"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            ❝ Mes citations
            <span className="block text-xs text-muted">
              Les passages sauvegardés de vos lectures
            </span>
          </Link>
          <Link
            href="/objectifs"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            🎯 Mes objectifs
            <span className="block text-xs text-muted">
              Une cible annuelle par média, et sa progression
            </span>
          </Link>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Mes données
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          <Link href="/import" className="px-4 py-3 text-sm hover:bg-elevated">
            📥 Importer mon historique
            <span className="block text-xs text-muted">
              Letterboxd, Serializd, lectures
            </span>
          </Link>
          <Link href="/donnees" className="px-4 py-3 text-sm hover:bg-elevated">
            📤 Exporter mes données
            <span className="block text-xs text-muted">
              JSON complet et CSV par entité
            </span>
          </Link>
          <Link
            href="/a-completer"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            ✨ Fiches à compléter
            <span className="block text-xs text-muted">
              Visuels manquants des fiches importées
            </span>
          </Link>
        </Card>
      </section>
    </div>
  );
}
