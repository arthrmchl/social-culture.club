"use client";

import { useState, useTransition } from "react";
import { createInvitation } from "@/actions/invitation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function InvitationManager({ appUrl }: { appUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await createInvitation();
      if (res.ok) setLastCode(res.code);
      else setError(res.error);
    });
  }

  const link = lastCode
    ? `${appUrl}/inscription?code=${encodeURIComponent(lastCode)}`
    : null;

  return (
    <Card className="mb-6 p-6">
      <Button onClick={generate} disabled={pending}>
        {pending ? "…" : "Générer une invitation"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {lastCode && (
        <div className="mt-4 rounded-[var(--radius)] bg-elevated p-4 text-sm">
          <p className="font-mono text-base font-semibold text-accent">
            {lastCode}
          </p>
          {link && (
            <p className="mt-2 break-all text-muted">
              Lien d'inscription :{" "}
              <a href={link} className="underline">
                {link}
              </a>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
