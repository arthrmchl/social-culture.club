import { describe, it, expect } from "vitest";
import { detectSource, adapterFor, ADAPTERS } from "./index";
import { loadFixture } from "../fixtures";

describe("detectSource", () => {
  it("reconnaît chaque source à partir de son export", () => {
    expect(detectSource(loadFixture("letterboxd"))?.source).toBe("LETTERBOXD");
    expect(detectSource(loadFixture("goodreads"))?.source).toBe("GOODREADS");
    expect(detectSource(loadFixture("literal"))?.source).toBe("GOODREADS");
    expect(detectSource(loadFixture("serializd"))?.source).toBe("SERIALIZD");
  });

  it("rend null sans fichier ou sans indice", () => {
    expect(detectSource([])).toBeNull();
    expect(detectSource([{ name: "x.csv", content: "a,b\n1,2\n" }])).toBeNull();
  });
});

describe("adapterFor", () => {
  it("retrouve chaque adaptateur par sa source", () => {
    for (const a of ADAPTERS) {
      expect(adapterFor(a.source)?.label).toBe(a.label);
    }
  });

  it("rend null pour une source sans adaptateur", () => {
    expect(adapterFor("SCC")).toBeNull();
  });
});
