import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_LABELS,
  pointsToTarget,
  shouldNotify,
  type NotifyInput,
} from "./notify-rules";

const input = (over: Partial<NotifyInput> = {}): NotifyInput => ({
  recipientId: "u2",
  actorId: "u1",
  blocked: false,
  hasUnreadIdentical: false,
  ...over,
});

describe("shouldNotify", () => {
  it("notifie un geste ordinaire", () => {
    expect(shouldNotify(input())).toBe(true);
  });

  it("ne notifie jamais ses propres gestes", () => {
    // Aimer sa propre critique ne doit pas faire sonner sa propre cloche.
    expect(shouldNotify(input({ actorId: "u2", recipientId: "u2" }))).toBe(
      false,
    );
  });

  it("ne notifie jamais à travers un blocage", () => {
    expect(shouldNotify(input({ blocked: true }))).toBe(false);
  });

  it("le blocage l'emporte même sur une notification par ailleurs légitime", () => {
    expect(
      shouldNotify(input({ blocked: true, hasUnreadIdentical: false })),
    ).toBe(false);
  });

  it("n'empile pas une notification identique non lue", () => {
    // Retirer puis remettre un j'aime dix fois ne doit pas produire dix lignes.
    expect(shouldNotify(input({ hasUnreadIdentical: true }))).toBe(false);
  });

  it("notifie de nouveau quand la précédente a été lue", () => {
    // Le critère est « non lue » : sinon un second j'aime, des semaines plus
    // tard, ne se verrait jamais.
    expect(shouldNotify(input({ hasUnreadIdentical: false }))).toBe(true);
  });

  it("accepte une notification système, sans acteur", () => {
    // La modération notifie l'auteur d'un contenu masqué : pas d'acteur, donc
    // pas d'auto-notification possible.
    expect(shouldNotify(input({ actorId: null }))).toBe(true);
  });

  it("ne confond pas un acteur nul avec un destinataire nul", () => {
    expect(shouldNotify(input({ actorId: null, recipientId: "u2" }))).toBe(true);
  });
});

describe("libellés", () => {
  it("nomme les sept types en français", () => {
    const types = Object.keys(NOTIFICATION_LABELS);
    expect(types).toHaveLength(7);
    for (const label of Object.values(NOTIFICATION_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("pointsToTarget", () => {
  it("distingue ce qui mène à un contenu de ce qui mène à un profil", () => {
    expect(pointsToTarget("LIKE")).toBe(true);
    expect(pointsToTarget("COMMENT")).toBe(true);
    expect(pointsToTarget("MODERATION")).toBe(true);
    expect(pointsToTarget("FOLLOW")).toBe(false);
    expect(pointsToTarget("FOLLOW_REQUEST")).toBe(false);
    expect(pointsToTarget("FOLLOW_ACCEPTED")).toBe(false);
  });
});
