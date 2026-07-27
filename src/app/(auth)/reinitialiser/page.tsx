import Link from "next/link";
import { ResetForm } from "@/components/auth/AuthForms";
import { Card } from "@/components/ui/Card";

export default async function ReinitialiserPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <Card className="p-6 text-sm">
        <p className="mb-3">Lien de réinitialisation manquant ou invalide.</p>
        <Link href="/mot-de-passe-oublie" className="text-accent">
          Refaire une demande
        </Link>
      </Card>
    );
  }
  return <ResetForm token={token} />;
}
