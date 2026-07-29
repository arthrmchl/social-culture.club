import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Lot 6 — le manga tel qu'il se publie : une période de parution, des
// auteur·rice·s, et des tomes qui appartiennent au tirage.

const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };

const S = Date.now().toString(36);
const MANGA = `Manga Lot6 ${S}`;

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
  await expect(page).toHaveURL("/");
});

test.afterAll(async () => {
  await ctx.close();
});

test("un manga se publie sur une période, et a des auteur·rice·s", async () => {
  await page.goto("/creer");
  await page.getByRole("button", { name: /Manga/ }).click();

  // Le vocabulaire suit le média : ni « créateurs », ni « année » toute seule.
  await expect(page.getByText("Auteur·rice(s)")).toBeVisible();
  await expect(page.getByText("Année de début de publication")).toBeVisible();

  await page.fill("#titleFr", MANGA);
  await page.fill("#year", "1989");
  await page.fill("#creators", "Kentarō Miura");
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  await expect(page).toHaveURL(/\/oeuvre\/[a-z0-9]+$/);
  // Année de fin laissée vide : la publication est déclarée en cours.
  await expect(page.getByText("1989 – en cours")).toBeVisible();
  await expect(page.getByText("Auteur·rice(s) :")).toBeVisible();
});

test("l'année de fin se pose puis se retire", async () => {
  await page.getByRole("link", { name: "Modifier la fiche" }).click();
  await page.fill("#endYear", "2021");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("1989 – 2021")).toBeVisible();

  // Une fin saisie par erreur doit pouvoir être effacée : la série reprend.
  await page.getByRole("link", { name: "Modifier la fiche" }).click();
  await page.fill("#endYear", "");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("1989 – en cours")).toBeVisible();
});

test("les tomes appartiennent à l'édition, et un tome suivi ne s'efface pas", async () => {
  // Sans édition, rien à suivre : un tome n'existe que dans un tirage.
  await expect(page.getByText("Progression — tomes")).toHaveCount(0);

  await page.getByRole("button", { name: "Ajouter une édition" }).click();
  await page.fill("#ed-publisher", "Glénat");
  await page.fill("#ed-tomes", "3");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText(/3 tomes/).first()).toBeVisible({
    timeout: 10000,
  });

  // Le suivi ne s'ouvre qu'une fois le tirage désigné.
  await expect(
    page.getByText(/Désignez l'édition que vous lisez/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Je lis celle-ci" }).click();
  await expect(page.getByText("0/3 tome lu")).toBeVisible({ timeout: 10000 });

  // à lire → en cours → lu (deux clics).
  const t3 = page.getByRole("button", { name: "T3", exact: true });
  await t3.click();
  await t3.click();
  await expect(page.getByText("1/3 tome lu")).toBeVisible();

  // Réduire le tirage à deux volumes effacerait le tome 3, déjà suivi : refus.
  await page.getByRole("button", { name: /^Modifier l'édition/ }).click();
  await page.fill("#ed-tomes", "2");
  await page.getByRole("button", { name: "Enregistrer l'édition" }).click();
  await expect(page.getByText(/Le tome 3 est déjà suivi/)).toBeVisible({
    timeout: 10000,
  });
});
