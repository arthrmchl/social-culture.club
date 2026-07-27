import { ProfileForm } from "@/components/ProfileForm";
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
    </div>
  );
}
