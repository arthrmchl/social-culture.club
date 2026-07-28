"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  deleteNotification,
  markAllNotificationsRead,
} from "@/actions/notification";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { NOTIFICATION_LABELS } from "@/lib/notify-rules";
import type { NotificationData } from "@/lib/social/read";
import { Avatar } from "./ProfileHeader";

/** La boîte de réception (P3), groupée par jour. */
export function NotificationList({
  initial,
}: {
  initial: NotificationData[];
}) {
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(initial);
  if (initial !== last) {
    setLast(initial);
    setRows(initial);
  }

  const unread = rows.filter((n) => n.readAt === null).length;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucune notification"
        description="Les abonnements, j'aime et commentaires apparaîtront ici."
      />
    );
  }

  // Groupement par jour : `formatDate` est la seule façon d'écrire une date
  // dans l'application, et elle sert donc aussi de clé de regroupement.
  const groups = new Map<string, NotificationData[]>();
  for (const n of rows) {
    const key = formatDate(n.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  return (
    <div className="flex flex-col gap-5">
      {unread > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {unread} non {unread === 1 ? "lue" : "lues"}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await markAllNotificationsRead();
                if ("error" in res) setError(res.error);
                else
                  setRows((r) =>
                    r.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
                  );
              });
            }}
          >
            Tout marquer comme lu
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {[...groups.entries()].map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {day}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-[var(--radius)] border border-border bg-surface">
            {items.map((n) => (
              <li
                key={n.id}
                className={
                  n.readAt === null
                    ? "flex items-center gap-3 bg-elevated/40 px-4 py-3"
                    : "flex items-center gap-3 px-4 py-3"
                }
              >
                {n.actor ? (
                  <Avatar name={n.actor.name} image={n.actor.image} size="sm" />
                ) : (
                  <span aria-hidden className="text-lg">
                    🛡️
                  </span>
                )}

                <div className="min-w-0 flex-1 text-sm">
                  {n.href ? (
                    <Link href={n.href} className="hover:text-accent">
                      <Body notification={n} />
                    </Link>
                  ) : (
                    <Body notification={n} />
                  )}
                </div>

                <button
                  type="button"
                  disabled={pending}
                  aria-label="Supprimer la notification"
                  className="text-xs text-muted hover:text-danger"
                  onClick={() => {
                    setError(null);
                    const previous = rows;
                    setRows((r) => r.filter((x) => x.id !== n.id));
                    start(async () => {
                      const res = await deleteNotification(n.id);
                      if ("error" in res) {
                        setRows(previous);
                        setError(res.error);
                      }
                    });
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Body({ notification }: { notification: NotificationData }) {
  const { actor, type, label } = notification;
  return (
    <>
      {actor && <span className="font-medium">{actor.name} </span>}
      <span className={actor ? "text-muted" : "font-medium"}>
        {NOTIFICATION_LABELS[type]}
      </span>
      {label && <span className="text-muted"> · {label}</span>}
    </>
  );
}
