import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { GOAL_SCOPES } from "@/lib/goals";
import { countForGoals } from "@/lib/goal-count";
import { Card } from "@/components/ui/Card";
import { GoalRow } from "@/components/goals/GoalRow";

export const metadata = { title: "Mes objectifs" };

/** Objectifs annuels (L5, D12) — paramétrables par portée. */
export default async function ObjectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const user = await requireUser();
  const { annee } = await searchParams;

  const currentYear = new Date().getFullYear();
  const parsed = Number(annee);
  const year =
    Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2200
      ? parsed
      : currentYear;

  const [goals, counts] = await Promise.all([
    db.goal.findMany({
      where: { userId: user.id, year },
      select: { scope: true, target: true },
    }),
    countForGoals(user.id, year, GOAL_SCOPES),
  ]);

  const targets = new Map(goals.map((g) => [g.scope, g.target]));

  // Les portées déjà dotées d'un objectif remontent en tête, le reste garde
  // l'ordre de GOAL_SCOPES (lectures d'abord, par défaut — D12).
  const ordered = [
    ...GOAL_SCOPES.filter((s) => targets.has(s)),
    ...GOAL_SCOPES.filter((s) => !targets.has(s)),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Mes objectifs {year}</h1>
        <p className="mt-1 text-sm text-muted">
          Une cible par portée. Mettre 0 retire l&apos;objectif. Est compté ce
          qui est consigné au journal dans l&apos;année.
        </p>
      </div>

      <div className="flex gap-2">
        {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
          <Link
            key={y}
            href={`/objectifs?annee=${y}`}
            className={
              y === year
                ? "rounded-full border border-accent bg-accent px-3 py-1 text-sm text-accent-foreground"
                : "rounded-full border border-border px-3 py-1 text-sm hover:bg-elevated"
            }
          >
            {y}
          </Link>
        ))}
      </div>

      <Card className="flex flex-col divide-y divide-border p-0">
        {ordered.map((scope) => (
          <GoalRow
            key={scope}
            year={year}
            scope={scope}
            target={targets.get(scope) ?? 0}
            done={counts[scope] ?? 0}
          />
        ))}
      </Card>
    </div>
  );
}
