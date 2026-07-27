"use client";

import { useTransition } from "react";
import { deleteJournalEntry } from "@/actions/journal";

/** Suppression d'une entrée de journal (par son auteur). */
export function DeleteEntryButton({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Supprimer cette entrée du journal ?")) {
          start(async () => {
            await deleteJournalEntry(entryId);
          });
        }
      }}
      className="text-xs text-muted transition-colors hover:text-danger"
    >
      Supprimer
    </button>
  );
}
