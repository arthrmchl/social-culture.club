/**
 * Export CSV d'une entité (I4). Un fichier par entité, sans archive : le lot 2
 * n'introduit aucune dépendance de compression.
 */

import { getCurrentSession } from "@/lib/session";
import { collectUserExport, entityToCsv } from "@/lib/export/collect";
import { exportFilename, isCsvEntity } from "@/lib/export/shape";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return Response.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { entity } = await params;
  if (!isCsvEntity(entity)) {
    return Response.json({ error: "Entité inconnue." }, { status: 404 });
  }

  const doc = await collectUserExport(session.user.id);
  const csv = entityToCsv(doc, entity);
  const filename = exportFilename(
    `${session.user.username ?? "export"}-${entity}`,
    "csv",
  );

  // BOM UTF-8 : sans lui, Excel massacre les accents à l'ouverture.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
