"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; emoji: string };

/** Les six entrées de la barre mobile (N1) — elle est pleine par construction. */
const ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", emoji: "🏠" },
  { href: "/recherche", label: "Recherche", emoji: "🔎" },
  { href: "/creer", label: "Créer", emoji: "➕" },
  { href: "/catalogue", label: "Catalogue", emoji: "📚" },
  { href: "/journal", label: "Journal", emoji: "📓" },
  { href: "/profil", label: "Profil", emoji: "👤" },
];

/**
 * Entrées du bureau uniquement : la barre mobile est pleine, elles sont
 * atteignables au téléphone depuis `/profil` (règle du lot 2, étendue au 3).
 */
const DESKTOP_ONLY: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/listes", label: "Listes" },
  { href: "/import", label: "Importer" },
  { href: "/invitations", label: "Invitations", adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function NavBar({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Barre supérieure (desktop + mobile) */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-bold tracking-tight">
            SCC
          </Link>
          <nav
            className="hidden gap-1 sm:flex"
            aria-label="Navigation principale"
          >
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm hover:bg-elevated",
                  isActive(pathname, item.href)
                    ? "bg-elevated font-medium text-accent"
                    : "text-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
            {DESKTOP_ONLY.filter((item) => !item.adminOnly || isAdmin).map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm hover:bg-elevated",
                    isActive(pathname, item.href)
                      ? "bg-elevated font-medium text-accent"
                      : "text-muted",
                  )}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm text-muted sm:inline">
              {displayName}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm text-muted hover:bg-elevated hover:text-foreground"
              >
                Quitter
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Barre inférieure (mobile — N1) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur sm:hidden"
        aria-label="Navigation mobile"
      >
        <div className="flex justify-around">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                isActive(pathname, item.href) ? "text-accent" : "text-muted",
              )}
            >
              <span className="text-lg" aria-hidden>
                {item.emoji}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
