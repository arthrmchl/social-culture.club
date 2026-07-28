import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const COVER = path.resolve(__dirname, "fixtures/cover.png");
const S = Date.now().toString(36);

// Compte administrateur du seed (le code d'invitation E2E est consommé par lot0).
const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };

const FILM = `Suivi Film ${S}`;
const SERIES = `Suivi Série ${S}`;
const MANGA = `Suivi Manga ${S}`;
const BOOK = `Suivi Livre ${S}`;
const WATCH = `Suivi Watchlist ${S}`;

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  // Connexion admin.
  await page.goto("/connexion");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
});
test.afterAll(async () => {
  await ctx.close();
});

async function createWork(opts: {
  title: string;
  year: string;
  type?: RegExp; // libellé du bouton de type
  seasons?: string;
  episodes?: string;
}) {
  await page.goto("/creer");
  if (opts.type) await page.getByRole("button", { name: opts.type }).click();
  await page.fill("#titleFr", opts.title);
  await page.fill("#year", opts.year);
  // Une lecture n'a pas de visuel de fiche (lot 5) : le champ n'est pas rendu.
  const cover = page.locator('input[type="file"]');
  if (await cover.count()) {
    await cover.setInputFiles(COVER);
    await expect(page.locator('img[alt="Aperçu du visuel"]')).toBeVisible();
  }
  if (opts.seasons) await page.fill("#seasonsCount", opts.seasons);
  if (opts.episodes) await page.fill("#episodesPerSeason", opts.episodes);
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(page).toHaveURL(/\/oeuvre\/.+/);
}

/**
 * Ajoute une édition depuis la fiche ouverte, la désigne comme celle qu'on lit
 * (sans quoi la progression à la page reste fermée — lot 5), et attend que
 * l'écran l'ait enregistré.
 */
async function addEdition(opts: {
  publisher: string;
  pages?: string;
  tomes?: string;
}) {
  await page.getByRole("button", { name: "Ajouter une édition" }).click();
  await page.fill("#ed-publisher", opts.publisher);
  if (opts.pages) await page.fill("#ed-pages", opts.pages);
  // Les tomes appartiennent au tirage (lot 6) : c'est ici qu'ils se déclarent.
  if (opts.tomes) await page.fill("#ed-tomes", opts.tomes);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("par défaut").first()).toBeVisible({
    timeout: 10000,
  });

  await page.getByRole("button", { name: "Je lis celle-ci" }).first().click();
  await expect(page.getByText("je lis celle-ci").first()).toBeVisible({
    timeout: 10000,
  });
}

test("film : note, j'aime, entrée de journal (revisionnage)", async () => {
  await createWork({ title: FILM, year: "2012" });

  // Note (4 étoiles) → le bouton « Effacer » apparaît.
  await page.getByRole("button", { name: "4 étoiles", exact: true }).click();
  await expect(page.getByRole("button", { name: "Effacer" })).toBeVisible();

  // J'aime.
  const like = page.getByRole("button", { name: "J'aime" });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");

  // Entrée de journal marquée revisionnage.
  await page.getByRole("button", { name: /Ajouter au journal/ }).click();
  await page.getByLabel("Revisionnage / relecture").check();
  // `exact` : la fiche porte d'autres boutons dont le nom commence par
  // « Enregistrer » (les étiquettes, l'édition — lots 3 et 5).
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  await expect(page.getByText(/1 visionnage au journal/)).toBeVisible();
});

test("le film consigné apparaît dans le journal global", async () => {
  await page.goto("/journal");
  await expect(
    page.getByRole("link", { name: new RegExp(FILM) }).first(),
  ).toBeVisible();
});

test("série : marquage d'une saison → statut « à jour »", async () => {
  await createWork({
    title: SERIES,
    year: "2016",
    type: /Série/,
    seasons: "1",
    episodes: "3",
  });

  await page.locator("summary", { hasText: "Saison 1" }).click();
  await page.getByLabel("Toute la saison vue").check();

  await expect(page.getByText("3/3 vus")).toBeVisible();
  // Passage automatique à « à jour » (T2).
  await expect(page.locator("select")).toHaveValue("CAUGHT_UP");
});

test("manga : suivi au tome, dans le tirage désigné", async () => {
  await createWork({ title: MANGA, year: "1990", type: /Manga/ });

  // Sans édition, rien à cocher : le tome n'existe que dans un tirage (lot 6).
  await expect(page.getByText("Progression — tomes")).toHaveCount(0);
  await addEdition({ publisher: "Glénat", tomes: "3" });

  await expect(page.getByText("0/3 tome lu")).toBeVisible();
  // à lire → en cours → lu (deux clics).
  const t1 = page.getByRole("button", { name: "T1", exact: true });
  await t1.click();
  await t1.click();
  await expect(page.getByText("1/3 tome lu")).toBeVisible();
});

test("livre : progression de lecture met le statut à « en cours »", async () => {
  // La pagination vient de l'édition, pas de la fiche (lot 5).
  await createWork({ title: BOOK, year: "2001", type: /Livre/ });
  await addEdition({ publisher: "Folio", pages: "300" });

  await page.getByRole("spinbutton").first().fill("150");
  await page.getByRole("button", { name: "Mettre à jour" }).click();

  await expect(page.locator("select")).toHaveValue("IN_PROGRESS");
});

test("watchlist : un film « à voir » apparaît dans /watchlist", async () => {
  await createWork({ title: WATCH, year: "2020" });

  const status = page.locator("select");
  await status.selectOption({ label: "À voir" });
  // Le sélecteur se désactive le temps de l'action serveur : attendre qu'il
  // redevienne actif, sinon la navigation peut devancer l'écriture.
  await expect(status).toBeEnabled();
  await page.goto("/watchlist");
  await expect(
    page.getByRole("link", { name: new RegExp(WATCH) }),
  ).toBeVisible();
});
