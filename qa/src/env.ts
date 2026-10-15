/**
 * Harness configuration: where to point, and with what identity.
 *
 * Reads qa/.env.qa when it exists and otherwise falls back to the process
 * environment, which is what makes `railway run npm run qa -- --slug=x` work with no
 * file at all: Railway injects DATABASE_URL (internal host) and DATABASE_PUBLIC_URL
 * (reachable from a laptop) for the Postgres service, and the second one is the one
 * that works from here.
 *
 * No dotenv dependency on purpose. This folder keeps exactly one runtime dependency,
 * Playwright, so that adding the harness can never change what the app installs.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const QA_ROOT = resolve(HERE, "..");
export const REPO_ROOT = resolve(QA_ROOT, "..");

/** Minimal KEY=VALUE reader: no interpolation, no export keyword, quotes stripped. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const file = readEnvFile(resolve(QA_ROOT, ".env.qa"));

function pick(...keys: string[]): string {
  for (const k of keys) {
    const v = file[k] ?? process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/** Hosts that are allowed to be driven without an explicit override. */
const STAGING_HINTS = ["orbitq", "staging", "localhost", "127.0.0.1"];

export interface QaEnv {
  baseUrl: string;
  databaseUrl: string;
  adminEmail: string;
  adminPassword: string;
  emailDomain: string;
  mobilePrefix: string;
  webhookCatcher: string;
  /** True when the base URL does not look like a staging or local host. */
  looksLikeProd: boolean;
}

export function loadQaEnv(): QaEnv {
  const baseUrl = (pick("QA_BASE_URL") || "https://orbitq-assess.applygitawisdom.com").replace(/\/+$/, "");
  // DATABASE_PUBLIC_URL first: under `railway run` DATABASE_URL is the internal host,
  // which does not resolve from a laptop, and a confusing connection error at that
  // point reads like a broken harness rather than a wrong host.
  const databaseUrl = pick("QA_DATABASE_URL", "DATABASE_PUBLIC_URL", "DATABASE_URL");
  const host = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return {
    baseUrl,
    databaseUrl,
    adminEmail: pick("QA_ADMIN_EMAIL"),
    adminPassword: pick("QA_ADMIN_PASSWORD"),
    emailDomain: pick("QA_EMAIL_DOMAIN") || "qa.invalid",
    mobilePrefix: pick("QA_MOBILE_PREFIX") || "99900",
    webhookCatcher: pick("QA_WEBHOOK_CATCHER"),
    looksLikeProd: host.length > 0 && !STAGING_HINTS.some((h) => host.includes(h)),
  };
}
