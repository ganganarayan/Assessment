import { getTenantContext } from "@/lib/tenant/context";

export default async function HomePage() {
  const { slug, source } = await getTenantContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="rounded-full border px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
          Phase 1 · Foundation
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Assessment Engine SaaS Foundation Ready
        </h1>
        <p className="max-w-md text-sm text-[var(--muted-foreground)] sm:text-base">
          Multi-tenant foundation is up: authentication, tenant resolution,
          storage, and database schema are configured.
        </p>
      </div>

      <div className="rounded-lg border bg-[var(--muted)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
        Tenant context · source:{" "}
        <span className="font-mono text-[var(--foreground)]">{source}</span>
        {slug ? (
          <>
            {" "}· slug:{" "}
            <span className="font-mono text-[var(--foreground)]">{slug}</span>
          </>
        ) : null}
      </div>
    </main>
  );
}
