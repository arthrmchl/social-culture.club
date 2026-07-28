import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const COVER = path.resolve(__dirname, "fixtures/cover.png");

// Suffixe unique pour rejouer le scénario sans collision.
const S = Date.now().toString(36);
const USER = { name: `E2E ${S}`, username: `e2e_${S}`, email: `e2e_${S}@test.dev`, password: "motdepasse123" };
const FILM_TITLE = `Inception E2E ${S}`;
const MANGA_TITLE = `Berserk E2E ${S}`;

// Parcours utilisateur séquentiel partageant une même session.
test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
});
test.afterAll(async () => {
  await ctx.close();
});

test("inscription sur invitation puis accueil", async () => {
  await page.goto("/inscription?code=SCC-E2E-0001");
  await page.fill("#name", USER.name);
  await page.fill("#username", USER.username);
  await page.fill("#email", USER.email);
  await page.fill("#password", USER.password);
  await page.getByRole("button", { name: "S'inscrire" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: new RegExp(USER.name) })).toBeVisible();
});

test("inscription refusée sans code d'invitation valide", async ({ browser }) => {
  const fresh = await browser.newContext(); // session neuve, non connectée
  const p = await fresh.newPage();
  await p.goto("/inscription");
  await p.fill("#code", "SCC-FAUX-CODE");
  await p.fill("#name", "Refus");
  await p.fill("#username", `refus_${S}`);
  await p.fill("#email", `refus_${S}@test.dev`);
  await p.fill("#password", "motdepasse123");
  await p.getByRole("button", { name: "S'inscrire" }).click();
  await expect(p.getByText(/invitation invalide/i)).toBeVisible();
  await expect(p).toHaveURL(/\/inscription/);
  await fresh.close();
});

test("création d'un film avec visuel (D31) et affichage de la fiche", async () => {
  await page.goto("/creer");
  await page.fill("#titleFr", FILM_TITLE);
  await page.fill("#year", "2010");
  await page.setInputFiles('input[type="file"]', COVER);
  await expect(page.locator('img[alt="Aperçu du visuel"]')).toBeVisible();
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  await expect(page).toHaveURL(/\/oeuvre\/.+/);
  await expect(page.getByRole("heading", { name: FILM_TITLE })).toBeVisible();
  await expect(page.getByRole("link", { name: "Modifier la fiche" })).toBeVisible();
});

test("détection de doublons à la volée", async () => {
  await page.goto("/creer");
  await page.fill("#titleFr", FILM_TITLE);
  await page.fill("#year", "2010");
  await expect(page.getByText(/fiches proches existent déjà/i)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(FILM_TITLE) })).toBeVisible();
});

test("générateur de tomes pour un manga", async () => {
  await page.goto("/creer");
  await page.getByRole("button", { name: /Manga/ }).click();
  await page.fill("#titleFr", MANGA_TITLE);
  await page.fill("#year", "1989");
  // Pas de visuel à téléverser : celui d'un manga appartient à ses éditions
  // (lot 5), et le champ n'est donc pas rendu pour une lecture.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.fill("#tomesCount", "5");
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  await expect(page).toHaveURL(/\/oeuvre\/.+/);
  // Le suivi au tome (lot 1) affiche un bouton par tome généré.
  await expect(page.getByRole("button", { name: "T5", exact: true })).toBeVisible();
});

test("recherche floue tolérante aux fautes", async () => {
  await page.goto("/recherche");
  await page.getByLabel("Recherche dans le catalogue").fill("inceptin e2e");
  await expect(page.getByRole("link", { name: new RegExp(FILM_TITLE) })).toBeVisible();
});

test("terme inconnu propose la création", async () => {
  await page.goto("/recherche");
  await page.getByLabel("Recherche dans le catalogue").fill(`zzz-inexistant-${S}`);
  await expect(page.getByRole("link", { name: /Créer/ })).toBeVisible();
});
