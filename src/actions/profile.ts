"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type ProfileState = { error?: string; success?: boolean } | undefined;

const schema = z.object({
  name: z.string().min(1, "Nom d'affichage requis.").max(60),
  username: z
    .string()
    .min(3, "3 caractères minimum.")
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Lettres minuscules, chiffres et « _ » uniquement."),
  bio: z.string().max(500).optional(),
  avatarImageId: z.string().optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    bio: formData.get("bio") || undefined,
    avatarImageId: formData.get("avatarImageId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const { name, username, bio, avatarImageId } = parsed.data;

  try {
    await db.user.update({
      where: { id: user.id },
      data: {
        name,
        username,
        displayUsername: username,
        bio: bio ?? null,
        image: avatarImageId ? `/api/uploads/${avatarImageId}` : user.image,
      },
    });
  } catch {
    return { error: "Ce nom d'utilisateur est peut-être déjà pris." };
  }

  revalidatePath("/profil");
  return { success: true };
}
