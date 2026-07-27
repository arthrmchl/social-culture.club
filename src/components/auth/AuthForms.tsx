"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signInAction,
  signUpAction,
  requestResetAction,
  resetPasswordAction,
  type FormState,
} from "@/actions/auth";
import { Card } from "@/components/ui/Card";
import { Input, Label, FieldHint } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

function ErrorText({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  );
}

export function SignInForm({ resetDone }: { resetDone?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(
    signInAction,
    undefined,
  );
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Connexion</h1>
      {resetDone && (
        <p className="mb-3 text-sm text-accent">
          Mot de passe réinitialisé. Vous pouvez vous connecter.
        </p>
      )}
      <form action={action} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <ErrorText state={state} />
        <SubmitButton className="w-full">Se connecter</SubmitButton>
      </form>
      <div className="mt-4 flex justify-between text-sm text-muted">
        <Link href="/mot-de-passe-oublie" className="hover:text-foreground">
          Mot de passe oublié ?
        </Link>
        <Link href="/inscription" className="hover:text-foreground">
          Créer un compte
        </Link>
      </div>
    </Card>
  );
}

export function SignUpForm({ initialCode }: { initialCode?: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    signUpAction,
    undefined,
  );
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Créer un compte</h1>
      <p className="mb-4 text-sm text-muted">
        L'inscription se fait sur invitation (cercle privé).
      </p>
      <form action={action} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="code">Code d'invitation</Label>
          <Input
            id="code"
            name="code"
            defaultValue={initialCode}
            placeholder="SCC-XXXX-XXXX"
            required
          />
        </div>
        <div>
          <Label htmlFor="name">Nom d'affichage</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div>
          <Label htmlFor="username">Nom d'utilisateur</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            pattern="[a-z0-9_]+"
            required
          />
          <FieldHint>Lettres minuscules, chiffres et « _ ».</FieldHint>
        </div>
        <div>
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FieldHint>8 caractères minimum.</FieldHint>
        </div>
        <ErrorText state={state} />
        <SubmitButton className="w-full">S'inscrire</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Déjà membre ?{" "}
        <Link href="/connexion" className="hover:text-foreground">
          Se connecter
        </Link>
      </p>
    </Card>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(
    requestResetAction,
    undefined,
  );
  const submitted = state !== undefined;
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Mot de passe oublié</h1>
      <p className="mb-4 text-sm text-muted">
        Nous vous enverrons un lien de réinitialisation.
      </p>
      {submitted && !state?.error ? (
        <p className="text-sm text-accent">
          Si un compte correspond à cette adresse, un e-mail a été envoyé.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <ErrorText state={state} />
          <SubmitButton className="w-full">Envoyer le lien</SubmitButton>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/connexion" className="hover:text-foreground">
          Retour à la connexion
        </Link>
      </p>
    </Card>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    resetPasswordAction,
    undefined,
  );
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Nouveau mot de passe</h1>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FieldHint>8 caractères minimum.</FieldHint>
        </div>
        <ErrorText state={state} />
        <SubmitButton className="w-full">Réinitialiser</SubmitButton>
      </form>
    </Card>
  );
}
