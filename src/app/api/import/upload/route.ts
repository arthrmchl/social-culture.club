/**
 * Téléversement des fichiers d'import (lot 2).
 *
 * Passe par un Route Handler et non par une server action : la limite de
 * 1 Mo du corps des server actions ne convient pas à un export complet.
 * `src/proxy.ts` exclut `/api` de son matcher, l'authentification est donc
 * faite ici, et un accès non authentifié reçoit un 401 (pas une redirection —
 * ce n'est pas une page).
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { detectSource, adapterFor } from "@/lib/import/adapters";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/import/types";
import type { ImportSource } from "@/generated/prisma/enums";
import {
  MAX_BATCH_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  formatBytes,
  hasAcceptedExtension,
} from "@/lib/import/limits";

const SOURCES: ImportSource[] = ["LETTERBOXD", "GOODREADS", "SERIALIZD", "SCC"];

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Téléversement illisible." },
      { status: 400 },
    );
  }

  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0) {
    return NextResponse.json({ error: "Aucun fichier déposé." }, { status: 400 });
  }
  if (entries.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Trop de fichiers : ${MAX_FILES} au maximum.` },
      { status: 400 },
    );
  }

  const files: { name: string; content: string; bytes: number }[] = [];
  let totalBytes = 0;

  for (const file of entries) {
    const name = (file.name || "sans-nom.csv").replace(/\\/g, "/");

    if (file.size === 0) continue;
    if (!hasAcceptedExtension(name)) {
      return NextResponse.json(
        {
          error: `« ${name} » n'est pas un fichier CSV. Dézippez l'archive et déposez les CSV qu'elle contient.`,
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `« ${name} » dépasse ${formatBytes(MAX_FILE_BYTES)}.`,
        },
        { status: 400 },
      );
    }

    totalBytes += file.size;
    if (totalBytes > MAX_BATCH_BYTES) {
      return NextResponse.json(
        { error: `L'ensemble dépasse ${formatBytes(MAX_BATCH_BYTES)}.` },
        { status: 400 },
      );
    }

    files.push({ name, content: await file.text(), bytes: file.size });
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Tous les fichiers déposés sont vides." },
      { status: 400 },
    );
  }

  // Source imposée par l'utilisateur, sinon devinée d'après les fichiers.
  const asked = form.get("source");
  const forced =
    typeof asked === "string" && SOURCES.includes(asked as ImportSource)
      ? (asked as ImportSource)
      : null;
  const guessed = detectSource(files);
  const source = forced ?? guessed?.source ?? null;

  if (!source || !adapterFor(source)) {
    return NextResponse.json(
      {
        error:
          "Source non reconnue : choisissez le service d'origine avant de déposer les fichiers.",
      },
      { status: 400 },
    );
  }

  const batch = await db.importBatch.create({
    data: {
      userId: session.user.id,
      source,
      status: "UPLOADED",
      label: `${adapterFor(source)!.label} — ${new Date().toLocaleDateString("fr-FR")}`,
      options: { ...DEFAULT_IMPORT_OPTIONS },
      files: {
        create: files.map((f) => ({
          name: f.name,
          bytes: f.bytes,
          checksum: createHash("sha256").update(f.content).digest("hex"),
          content: f.content,
        })),
      },
    },
    select: { id: true, source: true },
  });

  return NextResponse.json({
    ok: true,
    batchId: batch.id,
    source: batch.source,
    detected: guessed?.source ?? null,
    confidence: guessed?.confidence ?? 0,
  });
}
