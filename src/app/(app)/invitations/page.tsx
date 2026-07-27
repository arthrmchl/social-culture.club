import { redirect } from "next/navigation";
import { InvitationManager } from "@/components/InvitationManager";
import { Card } from "@/components/ui/Card";
import { requireUser, isAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export default async function InvitationsPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");

  const invitations = await db.invitation.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true } } },
    take: 50,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Invitations</h1>
      <InvitationManager appUrl={appUrl} />

      <Card className="divide-y divide-border">
        {invitations.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            Aucune invitation pour l'instant.
          </p>
        ) : (
          invitations.map((inv) => {
            const expired = inv.expiresAt && inv.expiresAt < new Date();
            const status = inv.usedById
              ? `Utilisée par ${inv.usedBy?.name ?? "?"}`
              : expired
                ? "Expirée"
                : "Disponible";
            return (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 p-4 text-sm"
              >
                <span className="font-mono">{inv.code}</span>
                <span
                  className={
                    inv.usedById
                      ? "text-muted"
                      : expired
                        ? "text-danger"
                        : "text-accent"
                  }
                >
                  {status}
                </span>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
