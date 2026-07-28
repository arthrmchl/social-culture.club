import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Lot 3 — bibliothèque riche : listes multi-médias, étiquettes, favoris de
// profil, citations, objectifs annuels, éditions et bibliothèque filtrable.

const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };

/** Suffixe unique : les tests ne se marchent pas dessus d'une exécution à l'autre. */
const S = Date.now().toString(36);
const LIST = `Mes indispensables ${S}`;
const TAG = `coup-de-coeur-${S}`;

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  await page.goto("/connexion");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
});

test.afterAll(async () => {
  await ctx.close();
});

/** Ouvre la fiche de la première œuvre du catalogue. */
async function openFirstWork(): Promise<void> {
  await page.goto("/catalogue");
  await page.locator('a[href^="/oeuvre/"]').first().click();
  await expect(page).toHaveURL(/\/oeuvre\/[a-z0-9]+$/);
}

test("crée une liste, y range une œuvre et l'épingle", async () => {
  await page.goto("/listes");
  await page
    .getByRole("link", { name: /Nouvelle liste|première liste/ })
    .click();

  await page.fill("#title", LIST);
  await page.fill("#description", "Ce qui compte vraiment.");
  await page.getByLabel("Liste ordonnée (classement)").check();
  await page.getByRole("button", { name: "Créer la liste" }).click();

  await expect(page).toHaveURL(/\/listes\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: LIST })).toBeVisible();

  // Ajout d'une œuvre par la recherche floue du catalogue.
  await page.getByLabel("Chercher une œuvre à ajouter").fill("chihiro");
  const add = page.getByRole("button", { name: "Ajouter" }).first();
  await expect(add).toBeVisible({ timeout: 10000 });
  await add.click();
  await expect(page.getByRole("button", { name: "Ajoutée" })).toBeVisible();

  // L'épinglage remonte la liste sur l'accueil.
  await page.reload();
  await page.getByRole("button", { name: "📌 Épingler" }).click();
  await expect(page.getByRole("button", { name: "📌 Épinglée" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Listes épinglées")).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(LIST) }),
  ).toBeVisible();
});

test("l'œuvre rangée connaît la liste qui la contient", async () => {
  await page.goto("/listes");
  await page.getByRole("link", { name: new RegExp(LIST) }).click();
  await page.locator('a[href^="/oeuvre/"]').first().click();

  await expect(page.getByText("Mes listes")).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(`📋 ${LIST}`) }),
  ).toBeVisible();
});

test("étiquette une œuvre et la retrouve par la page du tag", async () => {
  await openFirstWork();

  await page.getByLabel("Étiquettes, séparées par des virgules").fill(TAG);
  await page
    .getByRole("button", { name: "Enregistrer les étiquettes" })
    .click();

  // Attendre la confirmation avant de recharger : le clic rend la main avant
  // que la transition serveur n'aboutisse, et un `reload()` immédiat
  // l'interrompt — l'étiquette n'est alors jamais écrite.
  await expect(
    page.getByRole("button", { name: "Étiquettes enregistrées" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: `#${TAG}` })).toBeVisible();

  await page.getByRole("link", { name: `#${TAG}` }).click();
  await expect(page).toHaveURL(new RegExp(`/tag/${TAG}$`));
  await expect(page.getByRole("heading", { name: `#${TAG}` })).toBeVisible();
  await expect(page.getByText("Œuvres")).toBeVisible();
});

test("met une œuvre en favori de profil", async () => {
  await openFirstWork();

  const favorite = page.getByRole("button", { name: "Favori" });
  if ((await favorite.getAttribute("aria-pressed")) === "true") {
    await favorite.click(); // repartir d'un état connu
    await expect(favorite).toBeEnabled();
  }
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  // `aria-pressed` est optimiste : il bascule avant l'aller-retour serveur. Le
  // bouton, lui, n'est réactivé qu'à la fin de la transition — c'est ce
  // signal-là qu'il faut attendre avant de naviguer, sinon on interrompt
  // l'écriture.
  await expect(favorite).toBeEnabled();

  await page.goto("/profil");
  await expect(page.getByText("Mes favoris")).toBeVisible();
  await expect(page.locator('a[href^="/oeuvre/"]').first()).toBeVisible();
});

test("ajoute une citation à une lecture, mais pas à un film", async () => {
  // Les citations ne concernent que les lectures (D9).
  await page.goto("/catalogue?type=MANGA_SERIES");
  await page.locator('a[href^="/oeuvre/"]').first().click();

  await expect(page.getByText("Citations")).toBeVisible();
  await page.getByRole("button", { name: "❝ Ajouter une citation" }).click();
  await page.fill("#quote-text", `Un passage retenu ${S}.`);
  await page.fill("#quote-page", "42");
  await page.getByRole("button", { name: "Enregistrer la citation" }).click();

  await expect(page.getByText(`Un passage retenu ${S}.`)).toBeVisible();

  await page.goto("/citations");
  await expect(page.getByText(`Un passage retenu ${S}.`)).toBeVisible();

  // Sur un film, la section n'existe pas.
  await page.goto("/catalogue?type=FILM");
  await page.locator('a[href^="/oeuvre/"]').first().click();
  await expect(
    page.getByRole("button", { name: "❝ Ajouter une citation" }),
  ).toHaveCount(0);
});

test("crée une intégrale et marque les tomes qu'elle couvre", async () => {
  await page.goto("/catalogue?type=MANGA_SERIES");
  await page.locator('a[href^="/oeuvre/"]').first().click();

  await expect(page.getByText("Éditions")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une édition" }).click();
  await page.fill("#ed-publisher", "Glénat");
  await page.fill("#ed-from", "1");
  await page.fill("#ed-to", "3");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();

  const omnibus = page.getByRole("button", {
    name: "J'ai lu cette intégrale",
  });
  await expect(omnibus).toBeVisible({ timeout: 10000 });
  await omnibus.click();

  // Les trois premiers tomes passent à « lu ».
  await page.reload();
  await expect(page.getByText(/3\/\d+ tomes lus|Tomes 1 à 3/)).toBeVisible();
});

test("pose un objectif annuel et voit sa progression", async () => {
  await page.goto("/objectifs");
  const year = new Date().getFullYear();
  await expect(
    page.getByRole("heading", { name: `Mes objectifs ${year}` }),
  ).toBeVisible();

  // La ligne « Lectures » est celle activée par défaut (D12). La cible est
  // décalée de la valeur courante, sinon le bouton reste inactif — le
  // formulaire ne propose d'enregistrer que ce qui a changé.
  const field = page.getByLabel(`Objectif Lectures pour ${year}`);
  const current = Number((await field.inputValue()) || "0");
  await field.fill(String(current + 1));

  const row = page.locator("div").filter({ has: field }).last();
  await row.getByRole("button", { name: /Enregistrer|Retirer/ }).click();

  await expect(page.getByRole("progressbar").first()).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(`Objectifs ${year}`)).toBeVisible();
});

test("la bibliothèque filtre mes œuvres et reste plus étroite que le catalogue", async () => {
  await page.goto("/bibliotheque");
  await expect(
    page.getByRole("heading", { name: "Ma bibliothèque" }),
  ).toBeVisible();

  const mine = await page.locator('a[href^="/oeuvre/"]').count();

  // Bascule en vue liste : les facettes sont des liens, donc l'URL les porte.
  await page.getByRole("link", { name: "☰ Liste" }).click();
  await expect(page).toHaveURL(/vue=liste/);

  // Un filtre restreint sans jamais élargir.
  await page.getByRole("link", { name: "4 ★ et +" }).click();
  await expect(page).toHaveURL(/note=4/);
  const filtered = await page.locator('a[href^="/oeuvre/"]').count();
  expect(filtered).toBeLessThanOrEqual(mine);

  await page.goto("/catalogue");
  const catalogue = await page.locator('a[href^="/oeuvre/"]').count();
  expect(mine).toBeLessThanOrEqual(catalogue);
});
