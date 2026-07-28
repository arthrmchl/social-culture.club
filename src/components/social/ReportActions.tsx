"use client";

import { useState, useTransition } from "react";
import { resolveReport, type ReportDecision } from "@/actions/report";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/**
 * Les gestes de l'administrateur sur un signalement (D25, P4).
 *
 * Quatre issues, jamais automatiques. « Supprimer » demande confirmation parce
 * qu'il détruit un écrit ; le signalement, lui, survit — ses clés étrangères
 * sont en SetNull et son instantané est figé.
 */
export function ReportActions({
  reportId,
  canDelete,
}: {
  reportId: string;
  /** Une critique se masque seulement : le UserWork porte aussi le suivi. */
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function run(decision: ReportDecision, question?: string) {
    if (question && !confirm(question)) return;
    setError(null);
    start(async () => {
      const res = await resolveReport(reportId, decision, note || undefined);
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor={`note-${reportId}`} className="sr-only">
        Note de modération
      </label>
      <Input
        id={`note-${reportId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note de modération (facultative)"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run("HIDE")}>
          Masquer le contenu
        </Button>
        {canDelete && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(
                "DELETE",
                "Supprimer définitivement ce contenu ? Le signalement, lui, restera dans l'historique.",
              )
            }
          >
            Supprimer
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run("REJECT")}
        >
          Rejeter le signalement
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
