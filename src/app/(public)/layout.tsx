import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentSession } from "@/lib/session";

/**
 * Le châssis des pages ouvertes (lot 4, P1).
 *
 * **Le piège de cache est ici.** Le HTML d'un profil dépend du visiteur :
 * bouton « Suivre » ou « Se désabonner », sections masquées selon la
 * visibilité, commentaires filtrés par blocage. `getCurrentSession()` lit
 * `headers()`, ce qui rend déjà la route dynamique — mais l'écrire évite
 * qu'une future page sans session (des statistiques publiques seules, par
 * exemple) bascule silencieusement en statique et serve à tous la version d'un
 * seul.
 *
 * Corollaires à ne pas oublier : jamais de `"use cache"` ni d'`unstable_cache`
 * sur une donnée relationnelle, et `revalidatePath` purge **par chemin**, pas
 * par visiteur — ce n'est pas un mécanisme de sécurité.
 */
export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Link href={session ? "/" : "/connexion"} className="font-bold tracking-tight">
            SCC
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {session ? (
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-elevated hover:text-foreground"
              >
                Mon espace
              </Link>
            ) : (
              <Link
                href="/connexion"
                className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-elevated hover:text-foreground"
              >
                Se connecter
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-6">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
        Social Culture Club — journal culturel, en cercle privé.
      </footer>
    </div>
  );
}
