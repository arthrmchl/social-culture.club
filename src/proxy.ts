import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Contrôle optimiste (présence du cookie de session) — la validation réelle
// se fait dans les server components via requireUser().

/**
 * Pages d'authentification : un membre déjà connecté n'a rien à y faire, on le
 * renvoie à l'accueil.
 */
const AUTH_PREFIXES = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/reinitialiser",
];

/**
 * Pages ouvertes (lot 4, P1) : consultables **sans** session comme **avec**.
 *
 * La distinction avec AUTH_PREFIXES est la raison d'être de cette scission.
 * Jusqu'ici, une seule liste servait aux deux usages : « connecté + préfixe
 * public → accueil ». Sain pour /connexion, absurde pour /u/alice — un membre
 * connecté doit pouvoir ouvrir le lien de profil qu'on lui a partagé.
 *
 * Le proxy ne fait qu'autoriser le passage : le contrôle fin (D25, D26) est
 * fait en Server Component par src/lib/social/read.ts. Le slash final de
 * « /u/ » est indispensable — « /u » attraperait aussi un futur /utilisateurs.
 */
const OPEN_PREFIXES = ["/u/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = getSessionCookie(req);
  const isAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const isOpen = OPEN_PREFIXES.some((p) => pathname.startsWith(p));

  if (!hasSession && !isAuthPage && !isOpen) {
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclut les assets, l'API auth et les visuels téléversés.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
