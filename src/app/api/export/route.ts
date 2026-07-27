/**
 * Export JSON complet des données de l'utilisateur (I4, N9).
 *
 * `src/proxy.ts` exclut `/api` de son matcher : l'authentification se fait
 * donc ici, et un accès non authentifié reçoit un 401 — pas une redirection,
 * ce n'est pas une page.
 */

import { getCurrentSession } from "@/lib/session";
import { collectUserExport } from "@/lib/export/collect";
import { exportFilename } from "@/lib/export/shape";

export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  const doc = await collectUserExport(session.user.id);
  const filename = exportFilename(session.user.username ?? null, "json");

  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
