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

/**
 * Which file holds the standing values. qa/.env.qa by default (staging); QA_ENV_FILE
 * points a run at another one, which is how prod keeps its own login and its own kept
 * test account without ever overwriting the staging ones:
 *
 *   QA_ENV_FILE=qa/.env.qa.prod npm run qa:tenancy -- --i-know-this-is-prod
 *
 * Relative paths are read from the repo root. Every qa/.env.qa* file is gitignored.
 */
export const ENV_FILE_PATH = process.env.QA_ENV_FILE?.trim()
  ? resolve(REPO_ROOT, process.env.QA_ENV_FILE.trim())
  : resolve(QA_ROOT, ".env.qa");
const file = readEnvFile(ENV_FILE_PATH);

function pick(...keys: string[]): string {
  for (const k of keys) {
    // The ENVIRONMENT wins over the file, which is the way round every other tool does
    // it: the file is the standing default, and a variable set for one command is a
    // deliberate override for that run. The other way round, QA_BASE_URL=<prod> in front
    // of the command is silently ignored and the run reads staging instead, with nothing
    // but the printed host to give it away - which is exactly how a "prod" check turned
    // out to have been a staging check.
    const v = process.env[k] ?? file[k];
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
  /**
   * A REAL inbox for the signup cases (prod). When set, the tenancy pass keeps one
   * workspace signed up under this exact address for good, and its throwaway signups
   * use plus-addresses of it, so every welcome email lands in an inbox that is read
   * instead of bouncing. Empty: the QA_EMAIL_DOMAIN addresses, nothing kept.
   */
  signupEmail: string;
  /** The kept account's password, written here by the pass the first time it signs up. */
  keepPassword: string;
  /** Seed the funnel fixtures inside this workspace instead of the platform (prod). */
  fixtureTenantId: string;
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
    signupEmail: pick("QA_SIGNUP_EMAIL").toLowerCase(),
    keepPassword: pick("QA_KEEP_PASSWORD"),
    fixtureTenantId: pick("QA_FIXTURE_TENANT"),
    looksLikeProd: host.length > 0 && !STAGING_HINTS.some((h) => host.includes(h)),
  };
}
