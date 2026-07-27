import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Renvoie l'utilisateur connecté ou redirige vers la connexion. */
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/connexion");
  return session.user;
}

export function isAdmin(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}
