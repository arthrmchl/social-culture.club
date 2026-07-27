import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

// Lot 2 — reprise de l'historique : import Letterboxd, rapprochement,
// application, puis ré-import (qui ne doit rien créer).

const ADMIN = { email: "admin@social-culture.club", password: "changeme123" };
const FIXTURES = path.resolve(
  __dirname,
  "../src/lib/import/fixtures/letterboxd",
);
const FILES = ["diary.csv", "reviews.csv", "watched.csv", "ratings.csv", "watchlist.csv"];

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

/** Dépose les fixtures, analyse, décide, applique — et rend le rapport. */
async function runImport(): Promise<string> {
  await page.goto("/import");
  await page.getByRole("button", { name: "Letterboxd", exact: true }).click();
  await page.setInputFiles(
    'input[type="file"]',
    FILES.map((f) => path.join(FIXTURES, f)),
  );
  await page.getByRole("button", { name: "Analyser ces fichiers" }).click();
  await expect(page).toHaveURL(/\/import\/[a-z0-9]+$/, { timeout: 20000 });

  await page.getByRole("button", { name: /Analyser|Relancer/ }).click();
  await expect(page.getByRole("link", { name: /Rapprocher|Vérifier/ })).toBeVisible({
    timeout: 20000,
  });

  await page.getByRole("link", { name: /Rapprocher|Vérifier/ }).click();
  await expect(page.getByRole("heading", { name: "Rapprochement" })).toBeVisible();

  // Ce qui reste ambigu part en création.
  const bulk = page.getByRole("button", { name: "Tout créer" });
  if (await bulk.isVisible().catch(() => false)) {
    page.once("dialog", (d) => d.accept());
    await bulk.click();
    await expect(bulk).toBeHidden({ timeout: 15000 });
  }

  await page.getByRole("button", { name: /Appliquer l'import|Reprendre/ }).click();
  await expect(page).toHaveURL(/\/rapport$/, { timeout: 60000 });
  return page.locator("main").innerText();
}

test("import Letterboxd : journal, watchlist et fiches à compléter", async () => {
  const rapport = await runImport();

  expect(rapport).toContain("Import terminé");
  expect(rapport).toContain("Entrées de journal");

  // Le journal contient les films importés.
  await page.goto("/journal");
  await expect(page.getByText("Dune").first()).toBeVisible();

  // La watchlist a repris l'envie de voir.
  await page.goto("/watchlist");
  await expect(page.getByText("Mickey 17").first()).toBeVisible();

  // Les fiches créées sont sans visuel et signalées comme à compléter.
  await page.goto("/a-completer");
  await expect(
    page.getByRole("heading", { name: "À compléter" }),
  ).toBeVisible();
  await expect(page.getByText("Dune").first()).toBeVisible();
});

test("ré-import du même export : aucun doublon (I6)", async () => {
  const entriesBefore = await countJournalEntries();

  const rapport = await runImport();

  // Le rapport annonce explicitement qu'aucune entrée n'a été créée.
  expect(rapport).toMatch(/Fiches créées\s*0/);
  expect(rapport).toMatch(/Entrées de journal\s*0/);

  expect(await countJournalEntries()).toBe(entriesBefore);
});

/** Nombre d'entrées visibles dans le journal. */
async function countJournalEntries(): Promise<number> {
  await page.goto("/journal");
  await page.waitForLoadState("networkidle");
  return page.getByTestId("journal-entry").count();
}
