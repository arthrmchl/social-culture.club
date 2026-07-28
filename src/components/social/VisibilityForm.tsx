"use client";

import { useActionState } from "react";
import { updateVisibility, type VisibilityState } from "@/actions/visibility";
import { Card } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  VISIBILITY_ORDER,
} from "@/lib/visibility";
import type { ProfileVisibility } from "@/generated/prisma/enums";

/**
 * Les réglages de visibilité (P5).
 *
 * Des boutons radio et non un `<select>` : les trois niveaux demandent chacun
 * une phrase d'explication, et un menu déroulant les cacherait au moment
 * précis où l'utilisateur choisit.
 */
export function VisibilityForm({
  initial,
  hasUsername,
}: {
  initial: {
    visibility: ProfileVisibility;
    showJournalPublicly: boolean;
    showStatsPublicly: boolean;
  };
  hasUsername: boolean;
}) {
  const [state, action] = useActionState<VisibilityState, FormData>(
    updateVisibility,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Qui peut voir mon profil
        </legend>
        {VISIBILITY_ORDER.map((v) => (
          <Card key={v} className="p-3">
            <label className="flex cursor-pointer gap-3">
              <input
                type="radio"
                name="visibility"
                value={v}
                defaultChecked={initial.visibility === v}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">
                  {VISIBILITY_LABELS[v]}
                </span>
                <span className="block text-xs text-muted">
                  {VISIBILITY_HINTS[v]}
                </span>
              </span>
            </label>
          </Card>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Ce que je montre
        </legend>
        <p className="mb-1 text-xs text-muted">
          Ces réglages ne peuvent que restreindre : ils n&apos;ouvrent jamais
          plus que la visibilité du compte ci-dessus.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="showJournalPublicly"
            defaultChecked={initial.showJournalPublicly}
            className="mt-1"
          />
          <span>
            Mon journal et mes critiques
            <span className="block text-xs text-muted">
              Décoché, seuls les listes et les favoris restent visibles.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="showStatsPublicly"
            defaultChecked={initial.showStatsPublicly}
            className="mt-1"
          />
          <span>
            Mes statistiques
            <span className="block text-xs text-muted">
              Nombre d&apos;œuvres suivies, d&apos;entrées et de listes.
            </span>
          </span>
        </label>
      </fieldset>

      {!hasUsername && (
        <p className="rounded-[var(--radius)] border border-border bg-elevated px-3 py-2 text-xs text-muted">
          Sans nom d&apos;utilisateur, votre profil n&apos;a pas
          d&apos;adresse : seul le réglage « Privé » est possible.
        </p>
      )}

      {state && "error" in state && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p role="status" className="text-sm text-accent">
          Réglages enregistrés.
        </p>
      )}

      <SubmitButton>Enregistrer la confidentialité</SubmitButton>
    </form>
  );
}
