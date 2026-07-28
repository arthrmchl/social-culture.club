"use client";

import { useActionState } from "react";
import { suggestCorrection, type CorrectionState } from "@/actions/correction";
import { Input, Textarea } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * Proposer une correction sur une fiche qu'on n'a pas créée (D30).
 *
 * Un `<details>` natif : le geste est rare, il n'a pas à occuper la fiche tant
 * qu'on ne le demande pas, et il fonctionne sans JavaScript pour s'ouvrir.
 */
export function CorrectionDialog({ workId }: { workId: string }) {
  const action = suggestCorrection.bind(null, workId);
  const [state, formAction] = useActionState<CorrectionState, FormData>(
    action,
    undefined,
  );

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm text-accent">
        Proposition transmise au créateur de la fiche et à l&apos;administration.
      </p>
    );
  }

  return (
    <details className="w-full">
      <summary className="cursor-pointer select-none text-sm text-muted hover:text-accent">
        ✎ Proposer une correction
      </summary>
      <form action={formAction} className="mt-2 flex max-w-md flex-col gap-2">
        <label htmlFor="correction-field" className="text-xs text-muted">
          Champ concerné (facultatif)
        </label>
        <Input
          id="correction-field"
          name="field"
          maxLength={60}
          placeholder="Année, titre original, visuel…"
        />
        <label htmlFor="correction-message" className="text-xs text-muted">
          Votre proposition
        </label>
        <Textarea
          id="correction-message"
          name="message"
          rows={3}
          maxLength={2000}
          placeholder="L'année est 1985, pas 1986."
          required
        />
        {state && "error" in state && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <SubmitButton size="sm" variant="secondary" className="self-start">
          Envoyer la proposition
        </SubmitButton>
      </form>
    </details>
  );
}
