import { SignInForm } from "@/components/auth/AuthForms";

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return <SignInForm resetDone={reset === "1"} />;
}
