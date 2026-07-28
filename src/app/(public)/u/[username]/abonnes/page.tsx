import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/social/ProfileHeader";
import { MemberList } from "@/components/social/MemberList";
import { getFollowList } from "@/lib/social/read";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Abonnés de @${username}`,
    robots: { index: false, follow: false },
  };
}

export default async function AbonnesPage({ params }: Props) {
  const { username } = await params;

  const view = await getFollowList(username, "followers");
  if (!view) notFound();

  const { profile } = view.author;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/u/${username}`}
        className="flex items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <Avatar name={profile.name} image={profile.image} size="sm" />
        <span>Profil de {profile.name}</span>
      </Link>

      <h1 className="text-xl font-semibold">Abonnés</h1>

      <MemberList
        members={view.members}
        empty={{
          title: "Aucun abonné",
          description: "Personne ne suit encore ce membre.",
        }}
      />
    </div>
  );
}
