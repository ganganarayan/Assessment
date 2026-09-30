"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveStorageSettings,
  testStorage,
  type StorageSettingsView,
} from "@/features/platform/storage-settings";

/**
 * File storage (Cloudflare R2) — platform scope, so it lives on /platform.
 *
 * The secret is write-only: the form shows whether one is stored and leaves it alone
 * unless you type a replacement. That is what lets the bucket name or public URL be
 * corrected without re-pasting the key.
 */
export function StorageSettingsCard({ initial }: { initial: StorageSettingsView }) {
  const [accountId, setAccountId] = useState(initial.accountId);
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId);
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucketName, setBucketName] = useState(initial.bucketName);
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl);
  const [hasSecret, setHasSecret] = useState(initial.hasSecret);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      setOk(null);
      const r = await saveStorageSettings({ accountId, accessKeyId, secretAccessKey, bucketName, publicUrl });
      if (!r.ok) return setError(r.error);
      if (secretAccessKey.trim()) setHasSecret(true);
      setSecretAccessKey("");
      setOk("Saved.");
    });

  const test = () =>
    start(async () => {
      setError(null);
      setOk(null);
      const r = await testStorage();
      if (!r.ok) return setError(r.error);
      setOk(`Storage works — wrote and deleted a test file in ${r.data?.ms ?? 0}ms.`);
    });

  const field = (
    id: string,
    label: string,
    hint: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    type: "text" | "password" = "text",
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">File storage (Cloudflare R2)</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          One bucket for the whole platform. Each workspace&apos;s files are kept under its own
          path inside it, so no tenant can reach another&apos;s — and there is a single set of keys
          to rotate. Nothing is stored on the app server, so generated files never consume its
          disk or memory.
        </p>
      </div>

      {field(
        "r2-account",
        "Account ID",
        "Cloudflare dashboard → R2 → Overview, shown beside the API dropdown.",
        accountId,
        setAccountId,
        "e.g. 8f14e45fceea167a5a36dedd4bea2543",
      )}
      {field(
        "r2-key",
        "Access key ID",
        "R2 → Manage API tokens → Create token, with Object Read & Write.",
        accessKeyId,
        setAccessKeyId,
        "",
      )}
      {field(
        "r2-secret",
        hasSecret ? "Secret access key (stored — type to replace)" : "Secret access key",
        hasSecret
          ? "Leave blank to keep the stored key. Cloudflare shows a secret once, so if it was lost, create a new token."
          : "Shown once by Cloudflare when the token is created. Stored encrypted.",
        secretAccessKey,
        setSecretAccessKey,
        hasSecret ? "••••••••  (unchanged)" : "",
        "password",
      )}
      {field(
        "r2-bucket",
        "Bucket name",
        "The bucket these files go in. Create it in R2 first.",
        bucketName,
        setBucketName,
        "assess360",
      )}
      {field(
        "r2-public-url",
        "Public URL",
        "The bucket's public or custom-domain base URL. Only used for files meant to be world-readable; private files are served through short-lived signed links.",
        publicUrl,
        setPublicUrl,
        "https://files.yourdomain.com",
      )}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {ok ? <p className="text-sm text-green-600">{ok}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save storage settings"}
        </Button>
        <Button variant="outline" onClick={test} disabled={pending}>
          Test connection
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Test writes a tiny file and deletes it again — it proves the keys, the bucket name and
        write permission together, which a credential-shape check cannot.
      </p>
    </section>
  );
}
