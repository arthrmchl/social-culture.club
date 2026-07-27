import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ListForm } from "@/components/lists/ListForm";

export const metadata = { title: "Nouvelle liste" };

export default async function NouvelleListePage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <Link href="/listes" className="text-sm text-muted hover:text-accent">
          ← Mes listes
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nouvelle liste</h1>
      </div>
      <ListForm />
    </div>
  );
}
