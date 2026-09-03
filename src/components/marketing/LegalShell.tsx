import Link from "next/link";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";

/** Frame for the public policy pages — marketing Nav + Footer around a prose column. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <nav className="mb-8 flex gap-4 text-sm">
          <Link href="/terms" className="text-[var(--muted-foreground)] hover:underline">Terms</Link>
          <Link href="/privacy" className="text-[var(--muted-foreground)] hover:underline">Privacy</Link>
          <Link href="/refund" className="text-[var(--muted-foreground)] hover:underline">Refunds</Link>
        </nav>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Last updated: {updated}</p>
        <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-[var(--foreground)]">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Section heading inside a policy page. */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-lg font-semibold tracking-tight">{children}</h2>;
}

/** Body paragraph. */
export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--muted-foreground)]">{children}</p>;
}

/** Bulleted list. */
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-6 text-[var(--muted-foreground)]">{children}</ul>;
}
