import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
import { FavoritesRow } from "@/components/profile/FavoritesRow";
import { Card } from "@/components/ui/Card";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";

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
            endYear: true,
            coverImageId: true,
          },
        },
      },
    }),
  ]);
  if (!user) return null;

  const covers = await resolveCovers(
    favorites.map((f) => f.work),
    sessionUser.id,
  );

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">Mon profil</h1>

      {/* Favoris de profil (S11) — la vitrine, avant l'état civil. */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Mes favoris
        </h2>
        <FavoritesRow
          initial={favorites.map((f) => ({
            ...f.work,
            coverImageId: covers.get(f.work.id),
          }))}
        />
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

      {/* Social (lot 4) — en tête, parce que c'est la nouveauté qu'on cherche. */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Social
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          {user.username ? (
            <Link
              href={`/u/${user.username}`}
              className="px-4 py-3 text-sm hover:bg-elevated"
            >
              🌍 Mon profil public
              <span className="block text-xs text-muted">
                /u/{user.username} — partageable par lien
              </span>
            </Link>
          ) : (
            // `User.username` est nullable : sans pseudonyme, il n'y a pas
            // d'URL de profil. On le dit ici plutôt que de laisser un lien mort.
            <div className="px-4 py-3 text-sm text-muted">
              🌍 Mon profil public
              <span className="block text-xs">
                Choisissez un nom d&apos;utilisateur ci-dessus pour donner une
                adresse à votre profil.
              </span>
            </div>
          )}
          <Link href="/fil" className="px-4 py-3 text-sm hover:bg-elevated">
            📰 Mon fil
            <span className="block text-xs text-muted">
              L&apos;activité récente des membres que je suis
            </span>
          </Link>
          <Link
            href="/abonnements"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            👥 Mes abonnements
            <span className="block text-xs text-muted">
              Qui je suis, qui me suit, et les demandes en attente
            </span>
          </Link>
          <Link
            href="/notifications"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            🔔 Mes notifications
            <span className="block text-xs text-muted">
              Abonnements, j&apos;aime et commentaires
            </span>
          </Link>
          <Link
            href="/confidentialite"
            className="px-4 py-3 text-sm hover:bg-elevated"
          >
            🔒 Confidentialité
            <span className="block text-xs text-muted">
              Qui voit mon profil, mon journal et mes statistiques
            </span>
          </Link>
        </Card>
      </section>

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
