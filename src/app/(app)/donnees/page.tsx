import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { CSV_ENTITIES, ENTITY_LABELS } from "@/lib/export/shape";

/**
 * Mes données (I4, N9) : ce qui est stocké, comment le récupérer, comment
 * s'en aller. Le tout depuis une seule page, accessible au mobile via le
 * profil.
 */
export default async function DonneesPage() {
  const user = await requireUser();

  const [entries, works, batches, watchlist] = await Promise.all([
    db.journalEntry.count({ where: { userId: user.id } }),
    db.work.count({ where: { createdById: user.id } }),
    db.importBatch.count({ where: { userId: user.id } }),
    db.userWork.count({
      where: { userId: user.id, watchlistedAt: { not: null } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Mes données</h1>
        <p className="mt-1 text-sm text-muted">
          Vos données vous appartiennent et restent récupérables à tout moment,
          dans des formats lisibles sans cette application.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Ce que contient mon compte</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Entrées de journal" value={entries} />
          <Stat label="Fiches créées" value={works} />
          <Stat label="Liste d'envies" value={watchlist} />
          <Stat label="Imports" value={batches} />
        </dl>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Export complet
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="text-sm">
            Un seul fichier JSON contenant tout votre suivi, plus les fiches des
            œuvres concernées. Les saisons, épisodes et tomes y sont désignés
            par leur numéro : le fichier reste compréhensible sans
            l&apos;application.
          </p>
          <div>
            <a href="/api/export" download>
              <Button>Télécharger l&apos;export JSON</Button>
            </a>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Export par entité (CSV)
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          {CSV_ENTITIES.map((entity) => (
            <a
              key={entity}
              href={`/api/export/csv/${entity}`}
              download
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-elevated"
            >
              <span>{ENTITY_LABELS[entity]}</span>
              <span className="text-xs text-muted">{entity}.csv ↓</span>
            </a>
          ))}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Reprendre un historique
        </h2>
        <Card className="flex flex-col gap-3 text-sm">
          <p>
            Vous pouvez importer votre historique Letterboxd, Serializd ou de
            lectures à tout moment. Un même export peut être rejoué sans créer
            de doublon.
          </p>
          <div>
            <Link href="/import">
              <Button variant="secondary">Importer mon historique</Button>
            </Link>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Supprimer mon compte
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            La suppression est définitive et immédiate : suivi, journal, notes,
            critiques et imports disparaissent. Les fiches d&apos;œuvres que
            vous avez créées restent dans le catalogue — il est partagé, et les
            retirer effacerait le suivi des autres membres. Pensez à exporter
            vos données avant.
          </p>
          <DeleteAccountForm expected={user.username ?? user.email} />
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}
