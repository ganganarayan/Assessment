"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the ROOT layout itself (which the
 * normal error.tsx can't catch). It must render its own <html>/<body>. Kept
 * dependency-free and self-styled so it works even if theme/providers failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#666", maxWidth: 420 }}>
            A temporary error stopped the app from loading. Please try again.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={reset}
              style={{
                background: "#16a34a",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "transparent",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#999" }}>Ref: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
