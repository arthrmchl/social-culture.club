import { describe, expect, it } from "vitest";
import {
  buildFeedPage,
  decodeCursor,
  dedupeReviewAndEntry,
  encodeCursor,
  mergeFeed,
  type FeedItem,
} from "./feed";

const at = (iso: string) => new Date(iso);

const item = (over: Partial<FeedItem> & { id: string }): FeedItem => ({
  kind: "entry",
  authorId: "a1",
  at: at("2026-07-01T12:00:00.000Z"),
  workId: "w1",
  text: null,
  ...over,
});

describe("mergeFeed", () => {
  it("trie strictement du plus récent au plus ancien", () => {
    const merged = mergeFeed(
      [
        [item({ id: "b", at: at("2026-07-02T00:00:00.000Z") })],
        [item({ id: "a", at: at("2026-07-03T00:00:00.000Z") })],
        [item({ id: "c", at: at("2026-07-01T00:00:00.000Z") })],
      ],
      10,
    );
    expect(merged.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("départage les ex æquo par identifiant, de façon stable", () => {
    // Sans départage, deux éléments de même horodatage pourraient s'inverser
    // d'une page à l'autre et l'un des deux disparaîtrait du fil.
    const same = at("2026-07-01T00:00:00.000Z");
    const first = mergeFeed(
      [[item({ id: "x", at: same })], [item({ id: "y", at: same })]],
      10,
    );
    const second = mergeFeed(
      [[item({ id: "y", at: same })], [item({ id: "x", at: same })]],
      10,
    );
    expect(first.map((i) => i.id)).toEqual(second.map((i) => i.id));
  });

  it("coupe à la limite demandée", () => {
    const src = Array.from({ length: 5 }, (_, i) =>
      item({ id: `i${i}`, at: at(`2026-07-0${i + 1}T00:00:00.000Z`) }),
    );
    expect(mergeFeed([src], 3)).toHaveLength(3);
  });

  it("accepte des sources vides", () => {
    expect(mergeFeed([[], []], 10)).toEqual([]);
  });
});

describe("dedupeReviewAndEntry", () => {
  it("écarte la critique quand elle répète mot pour mot une entrée", () => {
    const items = [
      item({ id: "e1", kind: "entry", text: "Un chef-d'œuvre." }),
      item({ id: "r1", kind: "review", text: "Un chef-d'œuvre." }),
    ];
    const out = dedupeReviewAndEntry(items);
    // L'entrée gagne : elle porte date, sous-unité, revisionnage, étiquettes.
    expect(out.map((i) => i.id)).toEqual(["e1"]);
  });

  it("ignore la casse et les espaces surnuméraires", () => {
    const items = [
      item({ id: "e1", kind: "entry", text: "  Un   chef-d'œuvre. " }),
      item({ id: "r1", kind: "review", text: "un chef-d'œuvre." }),
    ];
    expect(dedupeReviewAndEntry(items).map((i) => i.id)).toEqual(["e1"]);
  });

  it("garde les deux quand les textes diffèrent", () => {
    const items = [
      item({ id: "e1", kind: "entry", text: "La saison 3 m'a moins plu." }),
      item({ id: "r1", kind: "review", text: "Mon avis sur la série." }),
    ];
    expect(dedupeReviewAndEntry(items).map((i) => i.id)).toEqual(["e1", "r1"]);
  });

  it("ne dédoublonne pas entre auteurs différents", () => {
    const items = [
      item({ id: "e1", kind: "entry", authorId: "a1", text: "Sublime." }),
      item({ id: "r1", kind: "review", authorId: "a2", text: "Sublime." }),
    ];
    expect(dedupeReviewAndEntry(items)).toHaveLength(2);
  });

  it("ne dédoublonne pas entre œuvres différentes", () => {
    const items = [
      item({ id: "e1", kind: "entry", workId: "w1", text: "Sublime." }),
      item({ id: "r1", kind: "review", workId: "w2", text: "Sublime." }),
    ];
    expect(dedupeReviewAndEntry(items)).toHaveLength(2);
  });

  it("garde une critique sans texte", () => {
    const items = [
      item({ id: "e1", kind: "entry", text: "Sublime." }),
      item({ id: "r1", kind: "review", text: null }),
    ];
    expect(dedupeReviewAndEntry(items)).toHaveLength(2);
  });

  it("écarte la critique même si plusieurs entrées existent, dont une identique", () => {
    const items = [
      item({ id: "e1", kind: "entry", text: "Première vision." }),
      item({ id: "e2", kind: "entry", text: "Sublime." }),
      item({ id: "r1", kind: "review", text: "Sublime." }),
    ];
    expect(dedupeReviewAndEntry(items).map((i) => i.id)).toEqual(["e1", "e2"]);
  });

  it("ne touche jamais aux listes", () => {
    const items = [
      item({ id: "l1", kind: "list", workId: null, text: "Sublime." }),
      item({ id: "e1", kind: "entry", text: "Sublime." }),
    ];
    expect(dedupeReviewAndEntry(items)).toHaveLength(2);
  });
});

describe("curseur", () => {
  it("fait l'aller-retour", () => {
    const i = item({ id: "e1", at: at("2026-07-01T10:20:30.000Z") });
    const back = decodeCursor(encodeCursor(i));
    expect(back?.id).toBe("e1");
    expect(back?.at.toISOString()).toBe("2026-07-01T10:20:30.000Z");
  });

  it("ne lève jamais sur une valeur bricolée", () => {
    // Même discipline que parseLibraryQuery au lot 3 : une URL malmenée ne
    // produit pas d'erreur, elle retombe sur la première page.
    for (const raw of [
      undefined,
      null,
      "",
      "n'importe quoi",
      "|",
      "|abc",
      "pas-une-date|abc",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z|",
    ]) {
      expect(() => decodeCursor(raw)).not.toThrow();
      expect(decodeCursor(raw)).toBeNull();
    }
  });

  it("accepte un identifiant contenant une barre verticale", () => {
    expect(decodeCursor("2026-07-01T00:00:00.000Z|a|b")?.id).toBe("a|b");
  });
});

describe("buildFeedPage", () => {
  const many = (kind: FeedItem["kind"], n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) =>
      item({
        id: `${kind}${i + offset}`,
        kind,
        at: at(new Date(Date.UTC(2026, 6, 1) - (i + offset) * 86400000).toISOString()),
        text: null,
      }),
    );

  it("rend une page et un curseur quand il reste des éléments", () => {
    const page = buildFeedPage([many("entry", 10)], 5);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).not.toBeNull();
    expect(page.nextCursor).toBe(encodeCursor(page.items[4]));
  });

  it("ne rend pas de curseur quand la source est épuisée", () => {
    const page = buildFeedPage([many("entry", 3)], 5);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it("rend une page vide sans curseur", () => {
    expect(buildFeedPage([[], []], 5)).toEqual({ items: [], nextCursor: null });
  });

  it("peut rendre moins d'éléments que la limite après déduplication", () => {
    // Comportement assumé : dédupliquer avant la coupe évite une boucle de
    // re-fetch qui compliquerait le curseur pour un gain cosmétique.
    const page = buildFeedPage(
      [
        [item({ id: "e1", kind: "entry", text: "Sublime." })],
        [item({ id: "r1", kind: "review", text: "Sublime." })],
      ],
      5,
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
