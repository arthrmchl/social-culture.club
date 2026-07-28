"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { addComment, deleteComment } from "@/actions/comment";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Markdown } from "@/lib/markdown";
import { formatDate } from "@/lib/dates";
import { describeComments, MAX_COMMENT_LENGTH } from "@/lib/comments";
import type { CommentData } from "@/lib/social/read";
import type { SocialTarget } from "@/lib/social-target";
import { Avatar } from "./ProfileHeader";

/**
 * Le fil de commentaires d'une cible (P3) — plat en v1.
 *
 * Le corps est rendu par `<Markdown>`, assaini : aucun HTML brut, protocoles
 * restreints, liens en nofollow. C'est ce qui permet d'afficher du texte
 * d'autrui sans autre précaution.
 */
export function CommentThread({
  target,
  comments,
  canInteract,
}: {
  target: SocialTarget;
  comments: CommentData[];
  canInteract: boolean;
}) {
  const [rows, setRows] = useState(comments);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);

  const [last, setLast] = useState(comments);
  if (comments !== last) {
    setLast(comments);
    setRows(comments);
  }

  function submit(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    setError(null);
    start(async () => {
      const res = await addComment(target, body);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // La page se revalide côté serveur ; on vide le champ pour que le geste
      // se sente terminé sans attendre le rafraîchissement.
      if (field.current) field.current.value = "";
    });
  }

  function remove(id: string) {
    if (!confirm("Supprimer ce commentaire ?")) return;
    setError(null);
    const previous = rows;
    setRows((r) => r.filter((c) => c.id !== id));
    start(async () => {
      const res = await deleteComment(id);
      if ("error" in res) {
        setRows(previous);
        setError(res.error);
      }
    });
  }

  return (
    <section className="mt-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {describeComments(rows.length)}
      </h2>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <li
              key={c.id}
              className="rounded-[var(--radius)] border border-border bg-surface p-3"
            >
              <div className="mb-1 flex items-center gap-2 text-sm">
                <Avatar name={c.author.name} image={c.author.image} size="sm" />
                {c.author.username ? (
                  <Link
                    href={`/u/${c.author.username}`}
                    className="font-medium hover:text-accent"
                  >
                    {c.author.name}
                  </Link>
                ) : (
                  <span className="font-medium">{c.author.name}</span>
                )}
                <span className="text-xs text-muted">
                  {formatDate(c.createdAt)}
                </span>
                {c.hiddenAt && (
                  <span className="rounded-full border border-danger/40 px-2 py-0.5 text-[11px] text-danger">
                    Masqué
                  </span>
                )}
                {c.canDelete && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(c.id)}
                    className="ml-auto text-xs text-muted hover:text-danger"
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <div className="text-sm">
                <Markdown>{c.body}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canInteract ? (
        <form action={submit} className="flex flex-col gap-2">
          <label htmlFor="comment-body" className="sr-only">
            Votre commentaire
          </label>
          <Textarea
            id="comment-body"
            name="body"
            ref={field}
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="Votre commentaire… (markdown accepté)"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={pending} className="self-end">
            Publier le commentaire
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted">
          <Link href="/connexion" className="text-accent">
            Connectez-vous
          </Link>{" "}
          pour réagir.
        </p>
      )}
    </section>
  );
}
