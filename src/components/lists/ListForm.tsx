"use client";

import { useActionState } from "react";
import { createList, editList, type ListFormState } from "@/actions/list";
import { CoverUpload } from "@/components/CoverUpload";
import { Card } from "@/components/ui/Card";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type ListFormInitial = {
  id: string;
  title: string;
  description: string | null;
  isRanked: boolean;
  coverImageId: string | null;
};

/** Création et édition d'une liste (S9, D11). */
export function ListForm({ initial }: { initial?: ListFormInitial }) {
  const action = initial
    ? editList.bind(null, initial.id)
    : (createList as (
        state: ListFormState,
        formData: FormData,
      ) => Promise<ListFormState>);

  const [state, formAction] = useActionState<ListFormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-4 p-4">
        <div>
          <Label htmlFor="title">Titre</Label>
          <Input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title}
            placeholder="Mes indispensables"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            maxLength={5000}
            defaultValue={initial?.description ?? ""}
            placeholder="Ce qui réunit ces œuvres…"
          />
        </div>

        <CoverUpload
          name="coverImageId"
          defaultImageId={initial?.coverImageId}
          label="Visuel de couverture"
          aspect="square"
        />

        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isRanked"
              value="true"
              defaultChecked={initial?.isRanked}
              className="size-4 accent-[var(--accent)]"
            />
            Liste ordonnée (classement)
          </label>
          <FieldHint>
            Les éléments sont numérotés et peuvent être réordonnés. Sinon, ils
            restent dans leur ordre d&apos;ajout.
          </FieldHint>
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <div>
          <SubmitButton>
            {initial ? "Enregistrer" : "Créer la liste"}
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}
