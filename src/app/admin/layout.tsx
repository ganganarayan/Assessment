import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="px-3 py-2 font-semibold">
              Assess360
            </Link>
            <Link href="/admin/assessments" className="rounded-md px-3 py-2 hover:bg-[var(--muted)]">
              Assessments
            </Link>
            <Link href="/admin/submissions" className="rounded-md px-3 py-2 hover:bg-[var(--muted)]">
              Submissions
            </Link>
            <Link href="/admin/import" className="rounded-md px-3 py-2 hover:bg-[var(--muted)]">
              Import
            </Link>
          </nav>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
