import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

/**
 * Preview then confirm, for every write tool.
 *
 * A write called without confirm=true changes nothing and returns a preview plus a
 * preview_token. The confirm call must send that token back, made in the last 10 minutes by
 * the SAME key, for the SAME tool, workspace and arguments. So an agent cannot skip the
 * preview, reuse one preview for different arguments, or carry it to another workspace.
 *
 * Signed with the existing BETTER_AUTH_SECRET under its own label, so there is no new
 * environment variable and the signature cannot be mistaken for anything auth signs.
 */

const TTL_MS = 10 * 60 * 1000;

/** Stable JSON: object keys sorted, so the same arguments always sign the same way. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function sign(payload: string): string {
  return createHmac("sha256", `assess360-mcp-preview:${env.BETTER_AUTH_SECRET}`).update(payload).digest("base64url");
}

interface Binding {
  tokenId: string;
  tool: string;
  workspaceId: string;
  args: unknown;
}

function payloadOf(b: Binding, exp: number): string {
  return [b.tokenId, b.tool, b.workspaceId, canonicalJson(b.args), String(exp)].join("|");
}

export function issuePreviewToken(b: Binding, now = Date.now()): { token: string; expiresAt: Date } {
  const exp = now + TTL_MS;
  return { token: `${exp}.${sign(payloadOf(b, exp))}`, expiresAt: new Date(exp) };
}

export type PreviewCheck = { ok: true } | { ok: false; error: string };

export function checkPreviewToken(b: Binding, token: string | undefined, now = Date.now()): PreviewCheck {
  if (!token) return { ok: false, error: "Call this tool first without confirm to get a preview and its preview_token." };
  const dot = token.indexOf(".");
  const exp = Number(token.slice(0, dot));
  if (dot <= 0 || !Number.isFinite(exp)) return { ok: false, error: "That preview_token is not valid. Preview again." };
  if (exp < now) return { ok: false, error: "That preview has expired (10 minutes). Preview again." };
  const want = Buffer.from(sign(payloadOf(b, exp)));
  const got = Buffer.from(token.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { ok: false, error: "That preview_token was made for different arguments, a different tool or workspace. Preview again." };
  }
  return { ok: true };
}
