"use client";

import { useState, useTransition } from "react";
import { reportComment, reportContent, reportUser } from "@/actions/report";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
} from "@/lib/moderation";
import type { SocialTarget } from "@/lib/social-target";

export type ReportSubject =
  | { kind: "content"; target: SocialTarget }
  | { kind: "comment"; commentId: string }
  | { kind: "user"; userId: string };

/**
 * Signaler un contenu ou un compte (D25, P4).
 *
 * Un `<details>` natif plutôt qu'une modale : aucun JavaScript pour l'ouvrir,
 * aucun piège de focus à gérer, et le geste reste discret — un signalement ne
 * doit pas être plus visible que le contenu qu'il vise.
 */
export function ReportDialog({
  subject,
  label = "Signaler",
}: {
  subject: ReportSubject;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="text-xs text-muted">
        Signalement transmis à l&apos;administration.
      </p>
    );
  }

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "");
    const details = String(formData.get("details") ?? "") || undefined;
    setError(null);
    start(async () => {
      const res =
        subject.kind === "content"
          ? await reportContent({ target: subject.target, reason, details })
          : subject.kind === "comment"
            ? await reportComment(subject.commentId, reason, details)
            : await reportUser(subject.userId, reason, details);

      if ("error" in res) setError(res.error);
      else setDone(true);
    });
  }

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-muted hover:text-danger">
        ⚑ {label}
      </summary>
      <form action={submit} className="mt-2 flex flex-col gap-2">
        <label htmlFor="report-reason" className="sr-only">
          Motif
        </label>
        <Select id="report-reason" name="reason" defaultValue="SPAM">
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </Select>
        <label htmlFor="report-details" className="sr-only">
          Précisions
        </label>
        <Textarea
          id="report-details"
          name="details"
          rows={2}
          maxLength={2000}
          placeholder="Précisions (facultatif)"
        />
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending}
          className="self-start"
        >
          Envoyer le signalement
        </Button>
      </form>
    </details>
  );
}
