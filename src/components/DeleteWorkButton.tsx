"use client";

import { useTransition } from "react";
import { deleteWork } from "@/actions/work";
import { Button } from "@/components/ui/Button";

/** Suppression d'une fiche d'œuvre (réservée à l'administrateur). */
export function DeleteWorkButton({
  workId,
  title,
}: {
  workId: string;
  title: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          confirm(
            `Supprimer définitivement « ${title} » ?\n\nCette action supprime aussi les saisons, tomes, ainsi que le suivi et le journal de tous les utilisateurs pour cette œuvre. Elle est irréversible.`,
          )
        ) {
          start(async () => {
            await deleteWork(workId);
          });
        }
      }}
    >
      Supprimer la fiche
    </Button>
  );
}
