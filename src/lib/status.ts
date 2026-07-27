// Machine à états par œuvre (S8), déclinée par média (T2 séries/animés, L1 lectures).
// Le libellé de « à voir » varie selon le média (à voir / à lire / envie de lire).

import type { WorkType, WorkStatusState } from "@/generated/prisma/enums";

/** États proposés pour un média, dans l'ordre d'affichage. */
export function allowedStates(type: WorkType): WorkStatusState[] {
  switch (type) {
    case "FILM":
      return ["WANT", "COMPLETED", "DROPPED"];
    case "SERIES":
    case "ANIME":
      return [
        "WANT",
        "IN_PROGRESS",
        "CAUGHT_UP",
        "ON_HOLD",
        "DROPPED",
        "COMPLETED",
      ];
    case "BOOK":
    case "ONE_SHOT":
    case "BD_SERIES":
    case "MANGA_SERIES":
      return ["WANT", "IN_PROGRESS", "ON_HOLD", "DROPPED", "COMPLETED"];
  }
}

export function isStateAllowed(
  type: WorkType,
  state: WorkStatusState,
): boolean {
  return allowedStates(type).includes(state);
}

function isScreenSerial(type: WorkType): boolean {
  return type === "SERIES" || type === "ANIME";
}

function wantLabel(type: WorkType): string {
  switch (type) {
    case "FILM":
    case "SERIES":
    case "ANIME":
      return "À voir";
    case "BOOK":
    case "ONE_SHOT":
      return "Envie de lire";
    case "BD_SERIES":
    case "MANGA_SERIES":
      return "À lire";
  }
}

/** Libellé français d'un état pour un média donné (accords inclus). */
export function stateLabel(type: WorkType, state: WorkStatusState): string {
  switch (state) {
    case "WANT":
      return wantLabel(type);
    case "IN_PROGRESS":
      return "En cours";
    case "ON_HOLD":
      return "En pause";
    case "CAUGHT_UP":
      return "À jour";
    case "DROPPED":
      return isScreenSerial(type) ? "Abandonnée" : "Abandonné";
    case "COMPLETED":
      return isScreenSerial(type) ? "Terminée" : "Terminé";
  }
}

/** États considérés « actifs » (en cours de consommation) pour l'accueil. */
export function isActiveState(
  state: WorkStatusState | null | undefined,
): boolean {
  return state === "IN_PROGRESS";
}
