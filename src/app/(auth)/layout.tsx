import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <span className="text-2xl font-bold tracking-tight">
            Social Culture Club
          </span>
          <span className="mt-1 block text-sm text-muted">
            Votre journal culturel unifié
          </span>
        </Link>
        {children}
      </div>
    </main>
  );
}
