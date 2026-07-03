"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  API_TOKEN_SCOPES,
  listApiTokens,
  mintApiToken,
  revokeApiToken,
  type ApiTokenRow,
} from "@/features/api-tokens/actions";

/**
 * Super-admin manager for scoped external API tokens. Mint shows the plaintext
 * ONCE (only the hash is stored); list + revoke for rotation. The endpoint URLs
 * are shown so they can be pasted straight into n8n.
 */
export function ApiTokensManager({
  initialTokens,
  endpointBase,
}: {
  initialTokens: ApiTokenRow[];
  endpointBase: string;
}) {
  const [tokens, setTokens] = useState<ApiTokenRow[]>(initialTokens);
  const [scope, setScope] = useState<string>(API_TOKEN_SCOPES[0].value);
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const base = endpointBase.replace(/\/+$/, "");
  const lookupUrl = `${base}/api/meta-match?email={{email}}&phone={{phone}}`;
  const healthUrl = `${base}/api/meta-match/health`;

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
      {/* Endpoint reference */}
      <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
        <p className="font-medium">Endpoints for n8n</p>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[var(--muted-foreground)]">Lookup</span>
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1">{lookupUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(lookupUrl)}>Copy</Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[var(--muted-foreground)]">Health</span>
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1">{healthUrl}</code>
            <Button size="sm" variant="outline" onClick={() => copy(healthUrl)}>Copy</Button>
          </div>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Send the token as <code>Authorization: Bearer &lt;token&gt;</code>. Returns raw
          match fields (email, phone, fbp, fbc, fbclid + timestamp, ip, UA, utms); hash in n8n before Meta.
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
              {API_TOKEN_SCOPES.map((s) => (
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
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {minted ? (
          <div className="flex flex-col gap-2 rounded-md border border-green-600/40 bg-green-600/10 p-3">
            <p className="text-xs font-medium">Copy this now — it is shown only once.</p>
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
                  <td className="px-3 py-2">{t.scope}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{t.label ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "—"}
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
