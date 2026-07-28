import { describe, it, expect } from "vitest";
import { goodreadsAdapter } from "./goodreads";
import { loadFixture } from "../fixtures";
import { DEFAULT_IMPORT_OPTIONS, type ImportedEvent } from "../types";

const goodreads = loadFixture("goodreads");
const result = goodreadsAdapter.parse(goodreads, DEFAULT_IMPORT_OPTIONS);

const eventsFor = (title: string): ImportedEvent[] =>
  result.events.filter((e) => e.work.titleFr === title);
const stateOf = (title: string) =>
  eventsFor(title).find((e) => e.kind === "STATE");
const logsOf = (title: string) =>
  eventsFor(title).filter((e) => e.kind === "LOG");

describe("détection de la source", () => {
  it("reconnaît un export Goodreads", () => {
    expect(goodreadsAdapter.detect(goodreads)).toBeGreaterThan(0.8);
  });

  it("reconnaît un export literal.club", () => {
    expect(goodreadsAdapter.detect(loadFixture("literal"))).toBeGreaterThan(0.5);
  });
});

describe("fiche importée", () => {
  it("reprend l'auteur et l'identifiant de la source", () => {
    const ref = stateOf("Dune")!.work;
    expect(ref.creators).toEqual(["Frank Herbert"]);
    expect(ref.externalId).toBe("goodreads:12345");
  });

  it("ne reprend aucun détail d'édition dans la fiche", () => {
    // ISBN et pagination décrivent l'objet publié (lot 5) : l'import crée
    // l'œuvre seule, à charge de l'utilisateur de décrire son édition.
    const ref = stateOf("Dune")!.work;
    expect(Object.keys(ref)).not.toContain("isbn");
    expect(Object.keys(ref)).not.toContain("pageCount");
  });

  it("privilégie l'année de publication originale", () => {
    expect(stateOf("Dune")!.work.year).toBe(1965);
  });

  it("détecte un tome et en fait une série de mangas", () => {
    const ref = stateOf("Berserk")!.work;
    expect(ref.type).toBe("MANGA_SERIES");
    expect(ref.volumeNumber).toBe(12);
  });

  it("laisse un livre sans tome en type livre", () => {
    expect(stateOf("Dune")!.work.type).toBe("BOOK");
  });

  it("peut renoncer à la détection de tomes", () => {
    const r = goodreadsAdapter.parse(goodreads, {
      ...DEFAULT_IMPORT_OPTIONS,
      detectVolumes: false,
    });
    const berserk = r.events.find((e) => e.work.titleFr.startsWith("Berserk"));
    expect(berserk?.work.type).toBe("BOOK");
    expect(berserk?.work.volumeNumber).toBeNull();
  });
});

describe("états et notes", () => {
  it("traduit les étagères en statuts", () => {
    expect(stateOf("Dune")!.state).toBe("COMPLETED");
    expect(stateOf("La Horde du Contrevent")!.state).toBe("IN_PROGRESS");
    expect(stateOf("Piranesi")!.state).toBe("WANT");
  });

  it("convertit la note sur l'échelle interne", () => {
    expect(stateOf("Dune")!.rating).toBe(10);
    expect(stateOf("Berserk")!.rating).toBe(8);
  });

  it("traite la note 0 comme une absence de note", () => {
    expect(stateOf("Piranesi")!.rating).toBeNull();
  });

  it("date la fin de lecture et l'ajout à la liste d'envies", () => {
    expect(stateOf("Dune")!.finishedAt?.toISOString()).toContain("2026-02-10");
    expect(stateOf("Piranesi")!.watchlistedAt?.toISOString()).toContain("2026-07-01");
  });

  it("reprend les étagères personnalisées comme contexte", () => {
    expect(stateOf("Dune")!.context).toBe("science-fiction, classiques");
  });
});

describe("journal des lectures", () => {
  it("crée une entrée par lecture, relectures comprises", () => {
    expect(logsOf("Dune")).toHaveLength(2);
    expect(logsOf("Berserk")).toHaveLength(1);
  });

  it("date la première lecture et laisse la relecture sans date", () => {
    const [premiere, relecture] = logsOf("Dune");
    expect(premiere.loggedAt?.toISOString()).toContain("2026-02-10");
    expect(premiere.isRewatch).toBe(false);
    expect(relecture.loggedAt).toBeNull();
    expect(relecture.isRewatch).toBe(true);
  });

  it("ne recopie pas la critique sur chaque relecture", () => {
    const [premiere, relecture] = logsOf("Dune");
    expect(premiere.reviewText).toBe("Un monument.\n\nLe désert, surtout.");
    expect(relecture.reviewText).toBeNull();
  });

  it("ne crée aucune entrée pour une lecture en cours ou à lire", () => {
    expect(logsOf("La Horde du Contrevent")).toHaveLength(0);
    expect(logsOf("Piranesi")).toHaveLength(0);
  });

  it("conserve une critique écrite sans lecture terminée", () => {
    const critique = eventsFor("Piranesi").find((e) => e.kind === "REVIEW");
    expect(critique?.reviewText).toBe("Hâte de le commencer.");
  });

  it("donne une graine distincte à chaque lecture", () => {
    const seeds = logsOf("Dune").map((e) => e.seed);
    expect(new Set(seeds).size).toBe(2);
  });
});

describe("literal.club via les mêmes alias", () => {
  const literal = goodreadsAdapter.parse(
    loadFixture("literal"),
    DEFAULT_IMPORT_OPTIONS,
  );
  const state = (title: string) =>
    literal.events.find((e) => e.kind === "STATE" && e.work.titleFr === title);

  it("traduit les états propres au service", () => {
    expect(state("Le Nom du vent")!.state).toBe("COMPLETED");
    expect(state("Les Furtifs")!.state).toBe("IN_PROGRESS");
    expect(state("Kafka sur le rivage")!.state).toBe("WANT");
  });

  it("reprend les dates de début et de fin de lecture", () => {
    const s = state("Le Nom du vent")!;
    expect(s.startedAt?.toISOString()).toContain("2026-04-01");
    expect(s.finishedAt?.toISOString()).toContain("2026-04-20");
  });

  it("garde une graine stable pour chaque ouvrage", () => {
    // L'identifiant du service prime ; c'est lui qui rend un ré-import
    // idempotent (I6), quoi que devienne la fiche.
    expect(state("Le Nom du vent")!.seed).toBe("goodreads:abc123|state");
  });
});

describe("graine d'idempotence sans identifiant", () => {
  it("retombe sur l'ISBN nettoyé plutôt que sur le titre", () => {
    const r = goodreadsAdapter.parse(
      [
        {
          name: "sans-id.csv",
          content:
            'Title,Author,ISBN13,Exclusive Shelf,Date Read\nDune,Frank Herbert,="9780441013593",read,2026-01-05\n',
        },
      ],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events.map((e) => e.seed)).toContain("9780441013593|state");
  });
});

describe("robustesse", () => {
  it("signale un fichier qui n'est pas un export de lectures", () => {
    const r = goodreadsAdapter.parse(
      [{ name: "x.csv", content: "Colonne\nvaleur\n" }],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.level === "error")).toBe(true);
  });

  it("importe quand même sans colonne d'état, en le signalant", () => {
    const r = goodreadsAdapter.parse(
      [{ name: "x.csv", content: "Title,My Rating\nDune,4\n" }],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.message.includes("état de lecture"))).toBe(true);
  });
});
