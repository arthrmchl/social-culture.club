"use client";

import { useActionState, useState } from "react";
import { deleteMyAccount } from "@/actions/account";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldHint } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

/** Suppression de compte (N9) — repliée par défaut, confirmation explicite. */
export function DeleteAccountForm({ expected }: { expected: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteMyAccount, undefined);

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Supprimer mon compte
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="confirmation">
          Saisissez « {expected} » pour confirmer
        </Label>
        <Input id="confirmation" name="confirmation" autoComplete="off" />
        <FieldHint>
          Votre suivi, votre journal et vos imports sont supprimés
          définitivement. Les fiches d&apos;œuvres que vous avez créées restent
          dans le catalogue partagé, sans votre nom.
        </FieldHint>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <SubmitButton variant="danger">Supprimer définitivement</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
