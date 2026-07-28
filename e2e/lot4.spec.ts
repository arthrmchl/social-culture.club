import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Lot 4 — social : profils publics, visibilité, abonnements, fil, j'aime,
// commentaires, notifications, signalement, blocage et propositions de
// correction.
//
// Trois contextes, parce que tout le lot se joue dans l'écart entre eux :
// l'administrateur (auteur du contenu), un membre ordinaire, et un visiteur
// **anonyme** — c'est ce dernier qui prouve que les profils sont bien ouverts
// par lien sans que le reste de l'application le soit.

const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };
const MEMBRE = { email: "membre@social-culture.club", password: "changeme123" };

/** Suffixe unique : les tests ne se marchent pas dessus d'une exécution à l'autre. */
const S = Date.now().toString(36);
const COMMENT = `Tout à fait d'accord ${S}`;
const CORRECTION = `L'année mériterait vérification ${S}`;

test.describe.configure({ mode: "serial" });

let adminCtx: BrowserContext;
let membreCtx: BrowserContext;
let anonCtx: BrowserContext;
let admin: Page;
let membre: Page;
let anon: Page;

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/connexion");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
}

test.beforeAll(async ({ browser }) => {
  adminCtx = await browser.newContext();
  membreCtx = await browser.newContext();
  anonCtx = await browser.newContext();
  admin = await adminCtx.newPage();
  membre = await membreCtx.newPage();
  anon = await anonCtx.newPage();

  await login(admin, ADMIN);
  await login(membre, MEMBRE);
});

test.afterAll(async () => {
  await adminCtx.close();
  await membreCtx.close();
  await anonCtx.close();
});

test("le profil public de l'administrateur s'ouvre depuis son profil", async () => {
  await admin.goto("/profil");
  await admin.getByRole("link", { name: /Mon profil public/ }).click();
  await expect(admin).toHaveURL("/u/admin");
  await expect(admin.getByRole("heading", { name: "Administrateur" })).toBeVisible();
});

test("un visiteur déconnecté voit le profil mais reste dehors du reste", async () => {
  // L'arbitrage central du lot : /u/ est ouvert, tout le reste ne l'est pas.
  await anon.goto("/u/admin");
  await expect(anon.getByRole("heading", { name: "Administrateur" })).toBeVisible();

  await anon.goto("/journal");
  await expect(anon).toHaveURL(/\/connexion/);
});

test("un membre connecté atteint le profil sans être renvoyé à l'accueil", async () => {
  // Le correctif de proxy.ts : la règle « connecté + préfixe public → / »
  // valait pour /connexion, elle renvoyait aussi les liens de profil.
  await membre.goto("/u/admin");
  await expect(membre).toHaveURL("/u/admin");
  await expect(membre.getByRole("heading", { name: "Administrateur" })).toBeVisible();
});

test("le membre s'abonne et voit l'activité dans son fil", async () => {
  await membre.goto("/u/admin");
  await membre.getByRole("button", { name: "Suivre" }).click();
  await expect(membre.getByRole("button", { name: "Se désabonner" })).toBeVisible();

  await membre.goto("/fil");
  await expect(membre.getByRole("heading", { name: "Mon fil" })).toBeVisible();
  await expect(membre.getByText("a consigné").first()).toBeVisible();
});

test("le membre aime une publication et la commente", async () => {
  await membre.goto("/u/admin/journal");
  await membre.getByRole("link", { name: /Voir l'entrée/ }).first().click();
  await expect(membre).toHaveURL(/\/u\/admin\/journal\/[a-z0-9]+$/);

  await membre.getByRole("button", { name: "J'aime" }).click();
  await expect(
    membre.getByRole("button", { name: "Retirer mon j'aime" }),
  ).toBeVisible();

  await membre.fill("#comment-body", COMMENT);
  await membre.getByRole("button", { name: "Publier le commentaire" }).click();
  await expect(membre.getByText(COMMENT)).toBeVisible();
});

test("l'administrateur reçoit ses notifications et les marque comme lues", async () => {
  await admin.goto("/notifications");
  await expect(admin.getByText("a aimé").first()).toBeVisible();
  await expect(admin.getByText("a commenté").first()).toBeVisible();

  await admin.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await expect(
    admin.getByRole("button", { name: "Tout marquer comme lu" }),
  ).toHaveCount(0);
});

test("en compte privé, l'abonné voit encore mais l'anonyme ne voit plus", async () => {
  await admin.goto("/confidentialite");
  await admin.getByRole("radio", { name: /Privé/ }).check();
  await admin.getByRole("button", { name: "Enregistrer la confidentialité" }).click();
  await expect(admin.getByText("Réglages enregistrés.")).toBeVisible();

  // L'abonnement du membre a été accepté d'office : le compte était ouvert
  // quand il l'a créé, il n'a pas à le redemander.
  await membre.goto("/u/admin");
  await expect(membre.getByRole("heading", { name: "Administrateur" })).toBeVisible();

  await anon.goto("/u/admin");
  await expect(anon.getByRole("heading", { name: "Administrateur" })).toHaveCount(0);

  // On rouvre pour la suite du scénario.
  await admin.goto("/confidentialite");
  await admin.getByRole("radio", { name: "Public" }).check();
  await admin.getByRole("button", { name: "Enregistrer la confidentialité" }).click();
  await expect(admin.getByText("Réglages enregistrés.")).toBeVisible();
});

test("le membre signale une publication, l'administrateur la masque", async () => {
  await membre.goto("/u/admin/journal");
  await membre.getByRole("link", { name: /Voir l'entrée/ }).first().click();
  const url = membre.url();

  await membre.getByText("⚑ Signaler").click();
  await membre.selectOption("#report-reason", "SPAM");
  await membre.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(
    membre.getByText("Signalement transmis à l'administration."),
  ).toBeVisible();

  await admin.goto("/moderation");
  await expect(admin.getByRole("heading", { name: "Modération" })).toBeVisible();
  await admin.getByRole("button", { name: "Masquer le contenu" }).first().click();
  await expect(
    admin.getByRole("button", { name: "Masquer le contenu" }),
  ).toHaveCount(0);

  // Masqué : le membre ne le voit plus, son auteur si — avec un bandeau.
  await membre.goto(url);
  await expect(membre.getByText(COMMENT)).toHaveCount(0);
});

test("un non-administrateur ne trouve pas la file de modération", async () => {
  await membre.goto("/moderation");
  await expect(membre.getByRole("heading", { name: "Modération" })).toHaveCount(0);
});

test("le membre propose une correction sur une fiche qu'il n'a pas créée", async () => {
  await membre.goto("/catalogue");
  await membre.locator('a[href^="/oeuvre/"]').first().click();
  await expect(membre).toHaveURL(/\/oeuvre\/[a-z0-9]+$/);

  // Le bouton était `disabled` avec title="Bientôt (lot 4)" jusqu'ici.
  await membre.getByText("✎ Proposer une correction").click();
  await membre.fill("#correction-message", CORRECTION);
  await membre.getByRole("button", { name: "Envoyer la proposition" }).click();
  await expect(
    membre.getByText(/Proposition transmise/),
  ).toBeVisible();

  // D30 : le créateur **et** l'administration sont prévenus.
  await admin.goto("/notifications");
  await expect(admin.getByText("propose une correction").first()).toBeVisible();
});

test("« découvrir » propose des membres et des œuvres", async () => {
  await membre.goto("/decouvrir");
  await expect(membre.getByRole("heading", { name: "Découvrir" })).toBeVisible();
  await expect(
    membre.getByRole("heading", { name: "Les plus suivies" }),
  ).toBeVisible();
});

test("le blocage referme le profil et vide le fil", async () => {
  // Bloquer demande confirmation — le geste est réciproque et coupe les
  // abonnements des deux côtés. Playwright rejette les dialogues par défaut :
  // sans ce gestionnaire, le clic ne bloque rien et le test « passe » à côté.
  membre.once("dialog", (d) => d.accept());

  await membre.goto("/u/admin");
  await membre.getByRole("button", { name: "Bloquer", exact: true }).click();

  // Le profil se referme **sur place** : la revalidation rejoue la page, dont
  // la lecture renvoie désormais null, et `notFound()` remplace le contenu.
  // C'est aussi ce qui prouve que le blocage prend effet sans rechargement.
  await expect(
    membre.getByRole("heading", { name: "Administrateur" }),
  ).toHaveCount(0);

  // Et il reste introuvable en navigation directe — la même réponse qu'un
  // pseudonyme inexistant, pour ne pas dire au bloqué qu'il l'est.
  await membre.goto("/u/admin");
  await expect(membre.getByRole("heading", { name: "Administrateur" })).toHaveCount(0);

  await membre.goto("/fil");
  await expect(membre.getByText("a consigné")).toHaveCount(0);

  // On débloque : le scénario doit se relancer sur un état propre même si le
  // global-setup venait à changer.
  await membre.goto("/confidentialite");
  await membre
    .getByRole("button", { name: "Débloquer", exact: true })
    .first()
    .click();
  await expect(membre.getByText("Aucun compte bloqué")).toBeVisible();
});
