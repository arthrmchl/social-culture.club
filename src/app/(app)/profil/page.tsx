import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
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
  const user = await db.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">Mon profil</h1>
      <ProfileForm
        initial={{
          name: user.name,
          username: user.username ?? "",
          email: user.email,
          bio: user.bio ?? "",
          avatarImageId: imageIdFromUrl(user.image),
        }}
      />

      {/* Accès mobile aux pages de données — la barre du bas est pleine. */}
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
