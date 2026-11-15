"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listApiTokens, mintApiToken, revokeApiToken } from "@/features/api-tokens/actions";
import { API_TOKEN_SCOPES, SCOPE_ENDPOINTS, type ApiTokenRow } from "@/features/api-tokens/scopes";
import { formatIST } from "@/lib/date";

/**
 * Super-admin manager for scoped external API tokens. Mint shows the plaintext
 * ONCE (only the hash is stored); list + revoke for rotation. The endpoint URLs
 * are shown so they can be pasted straight into n8n.
 */
export function ApiTokensManager({
  initialTokens,
  endpointBase,
  allowedScopes,
}: {
  initialTokens: ApiTokenRow[];
  endpointBase: string;
  /** Restrict which scopes are shown/mintable. Omit = all. Tenants get only meta_match
   *  (gita_mentor is the platform's own product, not a tenant feature). */
  allowedScopes?: readonly string[];
}) {
  const scopes = allowedScopes
    ? API_TOKEN_SCOPES.filter((s) => allowedScopes.includes(s.value))
    : API_TOKEN_SCOPES;
  const [tokens, setTokens] = useState<ApiTokenRow[]>(initialTokens);
  // Read and write is the default whenever it is offered: "connect to Claude" exists to
  // let Claude build, and a read-only key leaves it unable to change anything.
  const [scope, setScope] = useState<string>(
    scopes.find((s) => s.value === "mcp_write")?.value ?? scopes[0]?.value ?? API_TOKEN_SCOPES[0].value,
  );
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const base = endpointBase.replace(/\/+$/, "");

  const refresh = async () => {
    const r = await listApiTokens();
    if (r.ok && r.data) setTokens(r.data);
  };

  const mint = () =>
    start(async () => {
      setError(null);
      setMinted(null);
      const r = await mintApiToken(scope, label);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMinted(r.data?.token ?? null);
      setLabel("");
      await refresh();
    });

  const revoke = (id: string) =>
    start(async () => {
      if (!confirm("Revoke this token? Any caller using it will immediately get 401.")) return;
      const r = await revokeApiToken(id);
      if (r.ok) await refresh();
    });

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  return (
    <div className="flex flex-col gap-6">
      {/* Endpoint reference - one block per scope, so each consumer's URLs are clear. */}
      <div className="flex flex-col gap-4 rounded-lg border p-4 text-sm">
        <p className="font-medium">Endpoints</p>
        {scopes.map((s) => {
          const ep = SCOPE_ENDPOINTS[s.value];
          const lookupUrl = `${base}${ep.lookup}`;
          const healthUrl = `${base}${ep.health}`;
          return (
            <div key={s.value} className="flex flex-col gap-1">
              <p className="text-xs font-medium">{ep.title} <span className="font-mono text-[var(--muted-foreground)]">({s.value})</span></p>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[var(--muted-foreground)]">{ep.lookupLabel ?? "Lookup"}</span>
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1 text-xs">{lookupUrl}</code>
                <Button size="sm" variant="outline" onClick={() => copy(lookupUrl)}>Copy</Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[var(--muted-foreground)]">Health</span>
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1 text-xs">{healthUrl}</code>
                <Button size="sm" variant="outline" onClick={() => copy(healthUrl)}>Copy</Button>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-[var(--muted-foreground)]">
          Send the token as <code>Authorization: Bearer &lt;token&gt;</code>. A key only works for
          its own scope. <span className="font-mono">meta_match</span> returns raw marketing match
          fields (hash in n8n before Meta)
          {scopes.some((s) => s.value === "mcp_read" || s.value === "mcp_write") ? (
            <>
              ; the <span className="font-mono">mcp</span> keys connect Claude to this workspace (one MCP key per
              workspace; revoke it to mint a new one)
            </>
          ) : null}
          {scopes.some((s) => s.value === "gita_mentor") ? (
            <>
              ; <span className="font-mono">gita_mentor</span> returns the assessment result snapshot
            </>
          ) : null}
          .
        </p>
      </div>

      {/* Mint */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Generate a token</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Scope</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            >
              {scopes.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label className="text-xs">Label (optional)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. n8n production" />
          </div>
          <Button disabled={pending} onClick={mint}>Generate</Button>
        </div>
        {scope === "mcp_write" ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            <AccessBadge scope={scope} /> Claude can read and make changes. Every change is shown to you first and runs only after you say yes.
          </p>
        ) : scope === "mcp_read" ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            <AccessBadge scope={scope} /> Claude can only look. It cannot build or change anything with this key.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {minted ? (
          <div className="flex flex-col gap-2 rounded-md border border-green-600/40 bg-green-600/10 p-3">
            <p className="text-xs font-medium">Copy this now - it is shown only once.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-[var(--background)] px-2 py-1 text-sm">{minted}</code>
              <Button size="sm" onClick={() => copy(minted)}>Copy</Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)]/40 text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {tokens.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-[var(--muted-foreground)]">No tokens yet.</td></tr>
            ) : (
              tokens.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-mono text-xs">{t.prefix}…</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {t.scope}
                      <AccessBadge scope={t.scope} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{t.label ?? "-"}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {t.lastUsedAt ? formatIST(t.lastUsedAt) : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {t.revokedAt ? (
                      <span className="text-red-500">Revoked</span>
                    ) : (
                      <span className="text-green-600">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.revokedAt ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => revoke(t.id)}
                        className="border-red-500 text-red-600 hover:bg-red-500/10"
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Which access a Claude (MCP) key has, readable at a glance. Other scopes show nothing. */
function AccessBadge({ scope }: { scope: string }) {
  if (scope === "mcp_write") {
    return (
      <span className="inline-flex items-center rounded-full border border-green-600/40 bg-green-600/10 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        Read and write
      </span>
    );
  }
  if (scope === "mcp_read") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        Read only
      </span>
    );
  }
  return null;
}
