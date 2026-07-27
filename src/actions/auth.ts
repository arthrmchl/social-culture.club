"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkInvitation } from "./invitation";

export type FormState = { error?: string } | undefined;

const signUpSchema = z.object({
  code: z.string().min(1, "Code d'invitation requis."),
  name: z.string().min(1, "Nom d'affichage requis.").max(60),
  username: z
    .string()
    .min(3, "3 caractères minimum.")
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Lettres minuscules, chiffres et _ uniquement."),
  email: z.string().email("Adresse e-mail invalide."),
  password: z.string().min(8, "8 caractères minimum."),
});

export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const { code, name, username, email, password } = parsed.data;

  const codeUpper = code.trim().toUpperCase();
  if (!(await checkInvitation(codeUpper))) {
    return { error: "Invitation invalide, expirée ou déjà utilisée." };
  }

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name, username },
      headers: await headers(),
    });
    // Marque l'invitation comme consommée (best-effort, non bloquant).
    await db.invitation.update({
      where: { code: codeUpper },
      data: { usedById: result.user.id, usedAt: new Date() },
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: traduireErreur(e.message) };
    }
    return { error: "Inscription impossible. Réessayez." };
  }

  redirect("/");
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Identifiants requis." };

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError)
      return { error: "E-mail ou mot de passe incorrect." };
    return { error: "Connexion impossible. Réessayez." };
  }

  redirect("/");
}

export async function requestResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  if (!email) return { error: "Adresse e-mail requise." };
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reinitialiser" },
      headers: await headers(),
    });
  } catch {
    // On ne divulgue pas l'existence du compte.
  }
  return { error: undefined };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "8 caractères minimum." };
  if (!token) return { error: "Lien invalide." };

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch {
    return { error: "Lien expiré ou invalide. Refaites une demande." };
  }
  redirect("/connexion?reset=1");
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // ignore
  }
  redirect("/connexion");
}

function traduireErreur(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") || m.includes("exist")) {
    return "Un compte existe déjà avec cet e-mail ou ce nom d'utilisateur.";
  }
  return "Inscription impossible. Vérifiez vos informations.";
}
