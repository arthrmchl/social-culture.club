// Formatage des dates de journal selon leur précision (S4).

import type { DatePrecision } from "@/generated/prisma/enums";

const FR_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const FR_MONTH = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Date simple, toujours connue (création d'un lot d'import, horodatages). */
export function formatDate(date: Date): string {
  return FR_DAY.format(date);
}

/** Date précise, approximative (mois/année) ou inconnue. */
export function formatLoggedDate(
  loggedAt: Date | null,
  precision: DatePrecision,
): string {
  if (!loggedAt || precision === "UNKNOWN") return "Date inconnue";
  if (precision === "YEAR") return String(loggedAt.getUTCFullYear());
  if (precision === "MONTH") return FR_MONTH.format(loggedAt);
  return FR_DAY.format(loggedAt);
}
