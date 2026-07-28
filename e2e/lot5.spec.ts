import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

// Lot 5 — l'œuvre et son édition : un livre se crée sans visuel, et c'est son
// édition qui l'illustre, jusque dans le catalogue.

const COVER = path.resolve(__dirname, "fixtures/cover.png");
const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };

const S = Date.now().toString(36);
const BOOK = `Édition Livre ${S}`;

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

test("un livre se crée sans visuel : D31 ne vaut plus pour une lecture", async () => {
  await page.goto("/creer?type=BOOK");

  // Le champ de téléversement n'est pas rendu : rien à obliger.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText(/visuel appartient à l'édition/i)).toBeVisible();

  await page.fill("#titleFr", BOOK);
  await page.fill("#titleOriginal", "Ulysses");
  await page.fill("#originalLanguage", "en");
  await page.fill("#year", "1922");
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  await expect(page).toHaveURL(/\/oeuvre\/.+/);
  await expect(page.getByRole("heading", { name: BOOK })).toBeVisible();
  // Sans édition, la vignette est générée : aucune image téléversée.
  await expect(page.locator('img[alt=""]')).toHaveCount(0);
});

test("l'édition porte la couverture, le catalogue la reprend", async () => {
  await page.getByRole("button", { name: "Ajouter une édition" }).click();
  await page.fill("#ed-title", "Ulysse");
  await page.fill("#ed-publisher", "Gallimard");
  await page.fill("#ed-language", "fr");
  await page.fill("#ed-translators", "Ludmila Savitzky");
  await page.fill("#ed-pages", "380");
  await page.fill("#ed-isbn", "9782070400188");
  await page.setInputFiles('input[type="file"]', COVER);
  await expect(page.locator('img[alt="Aperçu du visuel"]')).toBeVisible();
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();

  // L'édition apparaît avec son libellé composé et son traducteur.
  await expect(page.getByText(/Ulysse · Gallimard · Français/)).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText(/Traduction de Ludmila Savitzky/)).toBeVisible();

  // La fiche affiche désormais la couverture de son édition par défaut.
  const workUrl = page.url();
  await page.reload();
  await expect(page.locator(`img[alt="Visuel de ${BOOK}"]`)).toBeVisible();

  // Et le catalogue aussi : la cascade vaut partout, pas seulement sur la fiche.
  await page.goto("/catalogue?type=BOOK");
  await expect(
    page.locator(`a[href="${new URL(workUrl).pathname}"] img`),
  ).toBeVisible();
});

test("la recherche retrouve l'œuvre par l'ISBN de son édition", async () => {
  await page.goto("/recherche?q=9782070400188");
  await expect(page.getByText(BOOK)).toBeVisible();
});
