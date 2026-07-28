import type { Prisma } from "@/generated/prisma/client";
import { normalizeTitle } from "./text";

type Tx = Prisma.TransactionClient;

/**
 * Les personnes d'une saisie libre, créées au besoin (lot 0, lot 5).
 *
 * L'identité d'une personne est son **nom normalisé**, pas son libellé : « Alan
 * Moore » et « alan moore » sont la même. Le premier libellé rencontré est
 * conservé, comme pour les étiquettes.
 */
export async function upsertPersonIds(
  tx: Tx,
  names: readonly string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const nameNormalized = normalizeTitle(name);
    if (!nameNormalized) continue;
    const person = await tx.person.upsert({
      where: { nameNormalized },
      update: {},
      create: { name, nameNormalized },
    });
    ids.push(person.id);
  }
  return ids;
}
