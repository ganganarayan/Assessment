"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAdAccount,
  updateAdAccount,
  clearAdAccountToken,
  setDefaultAdAccount,
  deleteAdAccount,
  type AdAccountRow,
} from "@/features/admin/actions/ad-account";

/**
 * The Ad accounts screen: name each Meta configuration this workspace runs funnels
 * against, hold its pixel id and Conversions API token, and say which one a funnel
 * that names none reports to.
 *
 * One card per account rather than a picker and an editor (the shape the Audiences
 * screen uses): an account has two fields, the thing people come here to do is compare
 * them, and a workspace has single digits of them, not hundreds.
 */
export function AdAccountManager({
  accounts,
  limit,
  canEdit,
}: {
  accounts: AdAccountRow[];
  limit: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const atCap = accounts.length >= limit;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
        <span>
          <strong>{accounts.length}</strong> of <strong>{limit}</strong> ad account
          {limit === 1 ? "" : "s"} on your plan
        </span>
        {atCap ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            At your plan&apos;s limit. Upgrade to add another.
          </span>
        ) : null}
      </div>

      {accounts.map((a) => (
        <AccountCard key={a.id} account={a} canEdit={canEdit} total={accounts.length} onChanged={() => router.refresh()} />
      ))}

      {canEdit && !atCap ? <NewAccount onChanged={() => router.refresh()} /> : null}
    </div>
  );
}

/** One account: name, credentials, default marker, and what it would take to delete. */
function AccountCard({
  account,
  canEdit,
  total,
  onChanged,
}: {
  account: AdAccountRow;
  canEdit: boolean;
  total: number;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(account.label);
  const [pixelId, setPixelId] = useState(account.pixelId);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Both halves of the pair, because one without the other is the state that looks
  // configured and reports nothing: a pixel with no token sends no server-side events,
  // and a token with no pixel has no dataset to send them to.
  const incomplete = !account.pixelId || !account.hasCapiToken;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      setError(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done);
        setToken("");
        onChanged();
      } else {
        setError(r.error ?? "Something went wrong.");
      }
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{account.label}</p>
        {account.isDefault ? (
          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Default
          </span>
        ) : null}
        {incomplete ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Incomplete
          </span>
        ) : null}
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {account.assessmentCount === 0
            ? account.isDefault
              ? "Used by every funnel that names no account"
              : "Not used by any funnel yet"
            : `${account.assessmentCount} funnel${account.assessmentCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={label}
            disabled={!canEdit || pending}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Acme - AU"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Meta Pixel ID</Label>
          <Input
            value={pixelId}
            disabled={!canEdit || pending}
            onChange={(e) => setPixelId(e.target.value)}
            placeholder="e.g. 1129238316012161"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">
          Conversions API token{" "}
          {account.hasCapiToken ? (
            <span className="text-green-600">(saved - leave blank to keep)</span>
          ) : (
            <span className="text-amber-700">(not set - this account sends no server-side events)</span>
          )}
        </Label>
        <Input
          type="password"
          value={token}
          disabled={!canEdit || pending}
          onChange={(e) => setToken(e.target.value)}
          placeholder={account.hasCapiToken ? "••••••••" : "Paste this account's token"}
        />
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateAdAccount(account.id, label, pixelId, token), "Saved.")}
          >
            Save
          </Button>
          {!account.isDefault ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setDefaultAdAccount(account.id), "This is now your default.")}
            >
              Make default
            </Button>
          ) : null}
          {account.hasCapiToken ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => clearAdAccountToken(account.id), "Token cleared.")}
            >
              Clear token
            </Button>
          ) : null}
          {/* Delete is offered even when it will be refused: the refusal names the
              funnels to move, which is the only way to find out what is in the way. */}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-red-600"
            disabled={pending || (total === 1 && account.assessmentCount > 0)}
            onClick={() => {
              if (!confirm(`Delete ${account.label}? Funnels reporting to it must be moved first.`)) return;
              run(() => deleteAdAccount(account.id), "Deleted.");
            }}
          >
            Delete
          </Button>
        </div>
      ) : null}

      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

/** Add another account. Hidden at the plan's cap, where the meter above explains why. */
function NewAccount({ onChanged }: { onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setError(null);
      const r = await createAdAccount(label, pixelId, token);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      setLabel("");
      setPixelId("");
      setToken("");
      onChanged();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <p className="text-sm font-medium">Add an ad account</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input value={label} disabled={pending} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Acme - AU" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Meta Pixel ID</Label>
          <Input value={pixelId} disabled={pending} onChange={(e) => setPixelId(e.target.value)} placeholder="Digits only" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Conversions API token</Label>
        <Input
          type="password"
          value={token}
          disabled={pending}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste this account's token"
        />
      </div>
      <div>
        <Button size="sm" disabled={pending} onClick={create}>
          Add ad account
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
