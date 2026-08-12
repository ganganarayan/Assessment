"use client";

import { useEffect } from "react";

/**
 * App-wide error boundary. Any uncaught error thrown while rendering a route
 * segment (server or client) lands here instead of white-screening with the raw
 * "Application error". Shows a calm retry UI + the digest (so a support/log lookup
 * has a reference). `reset()` re-renders the segment without a full reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console; the server stack is in the platform logs.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        A temporary error stopped this page from loading. This is usually transient —
        please try again.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
        >
          Reload
        </button>
      </div>
      {error.digest ? (
        <p className="text-xs text-[var(--muted-foreground)]">Ref: {error.digest}</p>
      ) : null}
    </main>
  );
}
