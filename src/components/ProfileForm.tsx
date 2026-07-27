"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/actions/profile";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Label, FieldHint } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CoverUpload } from "@/components/CoverUpload";

export function ProfileForm({
  initial,
}: {
  initial: {
    name: string;
    username: string;
    email: string;
    bio: string;
    avatarImageId: string | null;
  };
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined,
  );

  return (
    <Card className="p-6">
      <form action={action} className="flex flex-col gap-5">
        <CoverUpload
          name="avatarImageId"
          defaultImageId={initial.avatarImageId}
          aspect="square"
          label="Avatar"
        />
        <div>
          <Label htmlFor="name">Nom d'affichage</Label>
          <Input id="name" name="name" defaultValue={initial.name} required />
        </div>
        <div>
          <Label htmlFor="username">Nom d'utilisateur</Label>
          <Input
            id="username"
            name="username"
            defaultValue={initial.username}
            pattern="[a-z0-9_]+"
            required
          />
          <FieldHint>
            Utilisé dans l'URL de votre profil public (lot 4).
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" value={initial.email} disabled />
        </div>
        <div>
          <Label htmlFor="bio">Biographie</Label>
          <Textarea
            id="bio"
            name="bio"
            defaultValue={initial.bio}
            maxLength={500}
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-sm text-accent">Profil enregistré.</p>
        )}
        <div>
          <SubmitButton>Enregistrer</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
