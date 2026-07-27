import { describe, it, expect } from "vitest";
import { parseCsvGrid, parseCsv, toRecords, detectHeaderLine } from "./csv";

describe("parseCsvGrid", () => {
  it("découpe une grille simple", () => {
    expect(parseCsvGrid("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("accepte la dernière ligne sans retour final", () => {
    expect(parseCsvGrid("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gère le CRLF et le BOM", () => {
    expect(parseCsvGrid("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("conserve une virgule encapsulée dans un titre", () => {
    expect(parseCsvGrid('Title\n"Berserk, Vol. 12"\n')).toEqual([
      ["Title"],
      ["Berserk, Vol. 12"],
    ]);
  });

  it("conserve un saut de ligne dans une critique", () => {
    const grid = parseCsvGrid('Review\n"Premier paragraphe.\n\nSecond."\n');
    expect(grid[1][0]).toBe("Premier paragraphe.\n\nSecond.");
  });

  it("déchiffre les guillemets doublés", () => {
    expect(parseCsvGrid('Name\n"L\'homme dit ""non"""\n')[1][0]).toBe(
      `L'homme dit "non"`,
    );
  });

  it("rend une grille vide pour un fichier vide", () => {
    expect(parseCsvGrid("")).toEqual([]);
  });

  it("préserve les champs vides en fin de ligne", () => {
    expect(parseCsvGrid("a,b,c\n1,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });
});

describe("parseCsv", () => {
  it("sépare l'en-tête des lignes et ignore les lignes vides", () => {
    const table = parseCsv("Name,Year\n\nDune,2021\n\n");
    expect(table.headers).toEqual(["Name", "Year"]);
    expect(table.rows).toEqual([["Dune", "2021"]]);
  });

  it("rend une table vide quand le fichier ne contient qu'un en-tête", () => {
    expect(parseCsv("Name,Year\n").rows).toEqual([]);
  });

  it("rend une table vide pour un fichier vide", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("saute un préambule avec skipLines", () => {
    const text = "Ma liste\nDescription libre\n\nPosition,Name\n1,Dune\n";
    const table = parseCsv(text, { skipLines: 3 });
    expect(table.headers).toEqual(["Position", "Name"]);
    expect(table.rows).toEqual([["1", "Dune"]]);
  });
});

describe("toRecords", () => {
  it("complète les lignes plus courtes que l'en-tête", () => {
    const table = { headers: ["a", "b", "c"], rows: [["1", "2"]] };
    expect(toRecords(table)).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});

describe("detectHeaderLine", () => {
  it("trouve l'en-tête après un préambule de liste Letterboxd", () => {
    const text =
      "Date,Name,Tags,URL,Description\n2026-01-01,Ma liste,,https://x,Une liste\n\nPosition,Name,Year,Letterboxd URI\n1,Dune,2021,https://y\n";
    expect(detectHeaderLine(text, ["Position", "Name", "Year"])).toBe(3);
  });

  it("rend -1 quand aucune ligne ne correspond", () => {
    expect(detectHeaderLine("a,b\n1,2\n", ["Position"])).toBe(-1);
  });

  it("ignore la casse et les espaces", () => {
    expect(detectHeaderLine(" position , name \n1,Dune\n", ["Position", "Name"])).toBe(0);
  });
});
