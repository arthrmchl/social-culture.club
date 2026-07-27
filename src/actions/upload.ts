"use server";

import { requireUser } from "@/lib/session";
import { saveImageFromBuffer } from "@/lib/storage";

export type UploadResult =
  | { ok: true; id: string; url: string }
  | { ok: false; error: string };

/**
 * Téléverse un visuel (upload ou collage presse-papier) et renvoie l'id de l'Image.
 * Le formulaire de création stocke ensuite cet id comme coverImageId.
 */
export async function uploadImage(formData: FormData): Promise<UploadResult> {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Aucun fichier fourni." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Le fichier doit être une image." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await saveImageFromBuffer(buffer, user.id);
    return { ok: true, id: image.id, url: `/api/uploads/${image.id}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Échec du téléversement.",
    };
  }
}
