import { NotificationList } from "@/components/social/NotificationList";
import { requireUser } from "@/lib/session";
import { getNotifications } from "@/lib/social/read";

export const metadata = { title: "Mes notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await getNotifications(user.id);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Mes notifications</h1>
      <NotificationList initial={notifications} />
    </div>
  );
}
