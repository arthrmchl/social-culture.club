import { SignUpForm } from "@/components/auth/AuthForms";

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return <SignUpForm initialCode={code} />;
}
