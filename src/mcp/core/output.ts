import { formatIST } from "@/lib/date";

/**
 * Everything a tool returns passes through here on its way to the chat.
 *
 * 1. Dates: the chat is read by a person, so every timestamp becomes DD-MM-YYYY HH:MM IST
 *    (formatIST, fixed +05:30 offset). Both Date objects and ISO-8601 strings an action
 *    already serialised are converted, so no tool can forget.
 * 2. Secrets: string values under a key that names a secret are replaced, so a settings read
 *    through the action bridge cannot put an API key or password into a chat transcript.
 *    Booleans such as hasToken are left alone; they are what the agent needs.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const SECRET_KEY_RE = /(secret|password|passwd|apikey|api_key|privatekey|private_key|accesstoken|access_token|authtoken|refresh_token|refreshtoken|webhooksecret|keysecret|tokenhash|^token$|enc$|encrypted)/i;

export function istString(d: Date): string {
  return `${formatIST(d)} IST`;
}

export function toChatValue(v: unknown, key = "", depth = 0): unknown {
  if (depth > 40) return "[nested too deep]";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : istString(v);
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") {
    if (key && SECRET_KEY_RE.test(key) && v.length > 0) return "[redacted]";
    return ISO_RE.test(v) ? istString(new Date(v)) : v;
  }
  if (Array.isArray(v)) return v.map((x) => toChatValue(x, "", depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "function") continue;
      out[k] = toChatValue(x, k, depth + 1);
    }
    return out;
  }
  return v;
}

/** The two keys the MCP layer itself issues, kept out of redaction. */
export function chatJson(v: unknown): string {
  const { preview_token, ...rest } = (v && typeof v === "object" && !Array.isArray(v) ? v : { value: v }) as Record<string, unknown>;
  const safe = toChatValue(rest) as Record<string, unknown>;
  return JSON.stringify(preview_token === undefined ? safe : { ...safe, preview_token }, null, 2);
}
