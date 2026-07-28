import { NavBar } from "@/components/NavBar";
import { requireUser, isAdmin } from "@/lib/session";
import { countUnreadNotifications } from "@/lib/social/read";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Une requête indexée (`Notification @@index([userId, readAt])`) sur chaque
  // page de l'application. La page est déjà dynamique — `requireUser()` lit
  // `headers()` — donc le surcoût est celui d'un seul COUNT.
  const unreadCount = await countUnreadNotifications(user.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar
        displayName={user.name}
        isAdmin={isAdmin(user)}
        unreadCount={unreadCount}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:pb-10">
        {children}
      </main>
    </div>
  );
}
