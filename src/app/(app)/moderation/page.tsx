import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportActions } from "@/components/social/ReportActions";
import { Card, EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { isAdmin, requireUser } from "@/lib/session";
import {
  parseModerationTab,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
} from "@/lib/moderation";
import { targetHref } from "@/lib/social-target";

export const metadata = { title: "Modération" };

/**
 * La file de modération (D25, P4).
 *
 * Réservée à l'administrateur, et fermée par `notFound()` plutôt que par un
 * 403 ou une redirection : la page ne doit rien dire d'elle-même à qui n'y a
 * pas droit — la même discipline que sur les profils.
 *
 * Aucun filtrage automatique n'a lieu ici ni ailleurs : un signalement décrit,
 * un humain décide.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();

  const { statut } = await searchParams;
  const tab = parseModerationTab(statut);

  const reports = await db.report.findMany({
    where: tab === "ouverts" ? { status: "OPEN" } : { status: { not: "OPEN" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      targetKind: true,
      targetLabel: true,
      targetExcerpt: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolution: true,
      journalEntryId: true,
      listId: true,
      userWorkId: true,
      workId: true,
      commentId: true,
      reporter: { select: { name: true, username: true } },
      reportedUser: { select: { name: true, username: true } },
      list: { select: { slug: true } },
      userWork: { select: { workId: true } },
    },
  });

  const [openCount, corrections] = await Promise.all([
    db.report.count({ where: { status: "OPEN" } }),
    // D30 : l'administration voit toutes les propositions en attente, y
    // compris celles dont le créateur ne s'occupe pas — c'est précisément le
    // cas que le bouton « proposer une correction » doit couvrir (R8).
    db.correctionSuggestion.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        field: true,
        message: true,
        createdAt: true,
        author: { select: { name: true, username: true } },
        work: { select: { id: true, titleFr: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Modération</h1>
        <p className="text-sm text-muted">
          {openCount} signalement{openCount > 1 ? "s" : ""} en attente
        </p>
      </div>

      {corrections.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Propositions de correction ({corrections.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {corrections.map((c) => (
              <li key={c.id}>
                <Card className="p-3">
                  <p className="text-xs text-muted">
                    {c.author.name}
                    {c.author.username && ` · @${c.author.username}`} ·{" "}
                    {formatDate(c.createdAt)}
                    {c.field && ` · ${c.field}`}
                  </p>
                  <p className="mt-1 text-sm">{c.message}</p>
                  <Link
                    href={`/oeuvre/${c.work.id}`}
                    className="mt-1 inline-block text-xs text-accent"
                  >
                    {c.work.titleFr} →
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Elles se traitent depuis la fiche concernée, là où l&apos;édition a
            lieu.
          </p>
        </section>
      )}

      {/* Onglets en liens : chaque état de la file est une URL. */}
      <nav aria-label="Filtrer la file" className="flex gap-2 text-sm">
        <Link
          href="/moderation"
          className={
            tab === "ouverts"
              ? "rounded-full border border-accent bg-elevated px-3 py-1 text-accent"
              : "rounded-full border border-border px-3 py-1 text-muted hover:bg-elevated"
          }
        >
          En attente
        </Link>
        <Link
          href="/moderation?statut=traites"
          className={
            tab === "traites"
              ? "rounded-full border border-accent bg-elevated px-3 py-1 text-accent"
              : "rounded-full border border-border px-3 py-1 text-muted hover:bg-elevated"
          }
        >
          Traités
        </Link>
      </nav>

      {reports.length === 0 ? (
        <EmptyState
          title={
            tab === "ouverts"
              ? "Aucun signalement en attente"
              : "Aucun signalement traité"
          }
          description="Rien ne réclame votre attention."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => {
            const username = r.reportedUser?.username ?? null;
            // Le lien n'existe que si la clé étrangère a survécu : après une
            // suppression, seul l'instantané figé reste.
            const href = username
              ? r.journalEntryId
                ? targetHref(
                    { kind: "entry", id: r.journalEntryId },
                    { username },
                  )
                : r.listId
                  ? targetHref(
                      { kind: "list", id: r.listId },
                      { username, slug: r.list?.slug },
                    )
                  : r.userWorkId
                    ? targetHref(
                        { kind: "review", id: r.userWorkId },
                        { username, workId: r.userWork?.workId },
                      )
                    : r.workId
                      ? `/oeuvre/${r.workId}`
                      : `/u/${username}`
              : null;

            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {REPORT_TARGET_LABELS[r.targetKind]}
                    </span>
                    <span className="rounded-full border border-danger/40 px-2 py-0.5 text-danger">
                      {REPORT_REASON_LABELS[r.reason]}
                    </span>
                    <span>{formatDate(r.createdAt)}</span>
                    {r.status !== "OPEN" && (
                      <span className="rounded-full border border-border px-2 py-0.5">
                        {r.status === "ACCEPTED" ? "Retenu" : "Rejeté"}
                        {r.resolvedAt && ` · ${formatDate(r.resolvedAt)}`}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 font-medium">
                    {href ? (
                      <Link href={href} className="hover:text-accent">
                        {r.targetLabel}
                      </Link>
                    ) : (
                      <>
                        {r.targetLabel}{" "}
                        <span className="text-xs font-normal text-muted">
                          (contenu supprimé)
                        </span>
                      </>
                    )}
                  </p>

                  {r.targetExcerpt && (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted">
                      {r.targetExcerpt}
                    </blockquote>
                  )}

                  <p className="mt-2 text-xs text-muted">
                    Signalé par {r.reporter?.name ?? "un compte supprimé"}
                    {r.reportedUser && ` · visant ${r.reportedUser.name}`}
                  </p>

                  {r.details && (
                    <p className="mt-1 text-sm text-muted">« {r.details} »</p>
                  )}

                  {r.resolution && (
                    <p className="mt-1 text-xs text-muted">
                      Note : {r.resolution}
                    </p>
                  )}

                  {r.status === "OPEN" && (
                    <ReportActions
                      reportId={r.id}
                      // Une critique se masque seulement : le UserWork porte
                      // aussi le statut, la note et la progression du membre.
                      canDelete={r.userWorkId === null && r.targetKind !== "USER"}
                    />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
