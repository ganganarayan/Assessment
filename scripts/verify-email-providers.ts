/**
 * The ten email providers, held to what the settings screen promises about them.
 *
 * 🔴 WHY THIS IS A BUILD GATE AND NOT A TRUSTED FILE. Railway blocks outbound SMTP.
 * Every provider here except the last one exists so that mail leaves over HTTPS on 443,
 * and the failure mode when that slips is the worst kind: a save that reports success, a
 * ten-second hang, and a connection timeout that reads exactly like a wrong password.
 * Somebody then re-types a perfectly good credential for an hour. Nothing about a
 * provider row makes that visible at review time, so it is asserted here instead.
 *
 * What it holds in place, in the order the faults actually happen:
 *
 *   1. The catalog and the senders agree BOTH WAYS. providers.ts already throws on boot
 *      for a catalog row with no sender; the reverse - a sender nobody can select - is
 *      checked here, because it is a dead branch that silently never runs.
 *   2. A provider's region is never inferred. A ZeptoMail token issued on .com answers
 *      api.zeptomail.in with a 401 that is indistinguishable from a wrong key, and the
 *      same is true of Mailgun US against the EU host. The host per id is pinned by
 *      DRIVING the sender against a stubbed fetch and reading back the URL it chose,
 *      which is the only check that cannot be fooled by a tidy-looking refactor.
 *   3. Nothing reaches the wire without a credential, and nothing reaches it over
 *      http:// or an SMTP port.
 *   4. A 200 is not always a send. Postmark and SMTP2GO both answer 200 with the
 *      failure inside the body; collapsing either to res.ok reports a silent success
 *      and the owner never learns their sender signature is unconfirmed.
 *   5. The lookup functions never return undefined. Both are called straight into
 *      `.label` and `.send` on a screen and in the queue.
 *
 * No network: global fetch is replaced for the duration, so this is deterministic and
 * runs in the Railway build.
 *
 *   npx tsx --conditions=react-server scripts/verify-email-providers.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PROVIDER_ID,
  EMAIL_PROVIDER_OPTIONS,
  emailProviderOption,
} from "../src/lib/email/catalog";
import { emailProviderById, type EmailCredentials, type EmailMessage } from "../src/lib/email/providers";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Email provider verification\n");

/* -------------------------------------------------------------------------- */
/* 1. The catalog                                                              */
/* -------------------------------------------------------------------------- */

const ids = EMAIL_PROVIDER_OPTIONS.map((p) => p.id);
expect("there are providers at all", ids.length > 0);
expect(
  "every id is unique",
  new Set(ids).size === ids.length,
  "two rows with one id means the second is unreachable: the find() in both lookups stops at the first",
);
const labels = EMAIL_PROVIDER_OPTIONS.map((p) => p.label);
expect(
  "no two providers share a label",
  new Set(labels).size === labels.length,
  "a dropdown with the same words twice cannot be used - this is how the two ZeptoMail regions get picked wrongly",
);

for (const p of EMAIL_PROVIDER_OPTIONS) {
  expect(
    `${p.id} is drawable`,
    p.label.trim().length > 0 && p.keyLabel.trim().length > 0 && p.keyHint.trim().length > 0,
    "the settings screen renders all three; an empty hint is a field nobody can fill in, because the provider's console calls it something else",
  );
}

expect(
  "the default provider is one of them",
  ids.includes(DEFAULT_PROVIDER_ID),
  "every row written before this screen existed backfills to the default - if it names nothing, every one of those tenants silently has no sender",
);

const smtpRows = EMAIL_PROVIDER_OPTIONS.filter((p) => p.transport === "SMTP");
expect(
  "exactly one provider is SMTP",
  smtpRows.length === 1,
  "a second SMTP row is a provider that will time out on Railway while claiming to be an API",
);
expect(
  "the SMTP provider is last in the list",
  EMAIL_PROVIDER_OPTIONS[EMAIL_PROVIDER_OPTIONS.length - 1]?.transport === "SMTP",
  "the order IS the dropdown, and the one choice that does not work on this host has to be the one at the bottom",
);

/* -------------------------------------------------------------------------- */
/* 2. The lookups never hand back undefined                                    */
/* -------------------------------------------------------------------------- */

expect("an unknown id still yields an option", emailProviderOption("NOPE_NOT_A_PROVIDER").id === DEFAULT_PROVIDER_ID);
expect("a null id still yields an option", emailProviderOption(null).id === DEFAULT_PROVIDER_ID);
expect("an unknown id still yields a sender", emailProviderById("NOPE_NOT_A_PROVIDER").id === DEFAULT_PROVIDER_ID);
expect(
  "a null id still yields a sender",
  emailProviderById(null).id === DEFAULT_PROVIDER_ID,
  "an unknown id is a normal few seconds of any rollout, when a newer deploy has written a row an older one is reading. It must degrade, not throw - a throw here takes down the whole send queue, not one message.",
);

for (const p of EMAIL_PROVIDER_OPTIONS) {
  expect(
    `${p.id} has a sender of its own`,
    emailProviderById(p.id).id === p.id,
    "it resolved to the fallback instead, so choosing it in the settings screen would quietly send over SMTP - which on Railway means mail that simply stops",
  );
}

/* -------------------------------------------------------------------------- */
/* 3. No sender exists that nobody can choose                                  */
/* -------------------------------------------------------------------------- */

const src = readFileSync(join(process.cwd(), "src", "lib", "email", "providers.ts"), "utf8");
const registry = /const EMAIL_PROVIDERS: readonly EmailProvider\[\] = \[([\s\S]*?)\n\];/.exec(src)?.[1] ?? "";
expect("the sender registry was found", registry.trim().length > 0, "the regex above needs updating, not the code");

// Two shapes of entry: a factory call carrying its id as the second argument, and a
// constant whose id is declared where it is defined.
const factoryIds = [...registry.matchAll(/\w+\(\s*"[^"]+"\s*,\s*"([A-Z0-9_]+)"\s*\)/g)].map((m) => m[1]);
const constNames = [...registry.matchAll(/^\s*([A-Z][A-Z0-9_]*),/gm)].map((m) => m[1]);
const constIds = constNames.map((name) => {
  const re = new RegExp(`const ${name}: EmailProvider = \\{\\s*\\n\\s*id: "([^"]+)"`);
  return re.exec(src)?.[1];
});
const registryIds = [...factoryIds, ...constIds].filter((v): v is string => !!v);

expect("every registry entry was read", registryIds.length === factoryIds.length + constIds.length);
for (const id of registryIds) {
  expect(
    `${id} is offered in the settings screen`,
    ids.includes(id),
    "a sender with no catalog row can never be selected, so it is code that never runs and nobody notices it rotting",
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Driving every sender against a stubbed fetch                             */
/* -------------------------------------------------------------------------- */

interface Call {
  url: string;
  method: string;
}
let calls: Call[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true } };
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const msg: EmailMessage = {
  to: "someone@example.com",
  subject: "QA",
  html: "<p>QA</p>",
  fromEmail: "sender@example.com",
  fromName: "QA",
  replyTo: null,
};
const withKey: EmailCredentials = {
  apiKey: "qa-not-a-real-key",
  host: null,
  port: null,
  secure: false,
  user: null,
  pass: null,
};
const noKey: EmailCredentials = { ...withKey, apiKey: null };

/** The host each region-sensitive id MUST reach. A wrong one is an unreadable 401. */
const EXPECTED_HOST: Record<string, string> = {
  ZEPTOMAIL_IN: "api.zeptomail.in",
  ZEPTOMAIL_COM: "api.zeptomail.com",
  MAILGUN: "api.mailgun.net",
  MAILGUN_EU: "api.eu.mailgun.net",
  RESEND: "api.resend.com",
  BREVO: "api.brevo.com",
  SENDGRID: "api.sendgrid.com",
  POSTMARK: "api.postmarkapp.com",
  SMTP2GO: "api.smtp2go.com",
};

const httpsRows = EMAIL_PROVIDER_OPTIONS.filter((p) => p.transport === "HTTPS");

async function run(): Promise<void> {
  for (const row of httpsRows) {
    const provider = emailProviderById(row.id);

    // 3a. Nothing reaches the wire without a credential.
    calls = [];
    const refused = await provider.send(noKey, msg);
    expect(
      `${row.id} refuses to send with no key`,
      typeof refused === "string" && refused.length > 0,
      "it returned success, so a workspace with no credential would see sends marked delivered that never left",
    );
    expect(
      `${row.id} does not call out with no key`,
      calls.length === 0,
      "a request with no credential spends a rate limit and teaches the owner nothing",
    );

    // 3b. The right host, over HTTPS, by POST.
    calls = [];
    reply = { status: 200, body: { ok: true, data: { succeeded: 1 } } };
    const sent = await provider.send(withKey, msg);
    const call = calls[0];
    expect(`${row.id} makes exactly one request`, calls.length === 1, `made ${calls.length}`);
    if (!call) continue;

    const url = (() => {
      try {
        return new URL(call.url);
      } catch {
        return null;
      }
    })();
    expect(`${row.id} sends over https`, url?.protocol === "https:", `called ${call.url}`);
    expect(
      `${row.id} uses no port of its own`,
      url?.port === "",
      `called ${call.url} - 443 is the only port that is never blocked, and naming any other is how this becomes a timeout`,
    );
    expect(`${row.id} posts`, call.method === "POST", `used ${call.method}`);

    const want = EXPECTED_HOST[row.id];
    if (want) {
      expect(
        `${row.id} reaches ${want}`,
        url?.hostname === want,
        `called ${url?.hostname ?? call.url}. A key is issued for ONE region and answers the other with a 401 that reads exactly like a typo, which is a genuinely horrible hour to spend.`,
      );
    } else {
      expect(`${row.id} has an expected host in this check`, false, "add it to EXPECTED_HOST");
    }

    expect(
      `${row.id} reports a 200 as sent`,
      sent === null,
      `returned ${String(sent)} for a success, which would mark every delivered message as failed`,
    );

    // 3c. Meta's own refusal is passed through rather than flattened.
    calls = [];
    reply = { status: 401, body: { error: "Invalid key", message: "Invalid key" } };
    const err = await provider.send(withKey, msg);
    expect(
      `${row.id} turns a 401 into something readable`,
      typeof err === "string" && /401/.test(err),
      "the status has to survive: a bare 'failed' sends somebody hunting for a typo in a key that is fine",
    );
  }

  /* 4. The two providers that hide a failure inside a 200. --------------------- */

  reply = { status: 200, body: { ErrorCode: 300, Message: "Sender signature not confirmed" } };
  calls = [];
  const postmark = await emailProviderById("POSTMARK").send(withKey, msg);
  expect(
    "Postmark reports an error inside a 200",
    typeof postmark === "string" && /300|signature/i.test(postmark),
    "Postmark answers 200 with ErrorCode for an unconfirmed sender signature. Treating res.ok as success means the owner is told the mail went and it did not.",
  );

  reply = { status: 200, body: { data: { succeeded: 0 } } };
  calls = [];
  const smtp2go = await emailProviderById("SMTP2GO").send(withKey, msg);
  expect(
    "SMTP2GO reports zero succeeded as a failure",
    typeof smtp2go === "string" && smtp2go.length > 0,
    "the same trap: a 2xx that sent nothing",
  );

  reply = { status: 200, body: { MessageID: "ok" } };
  const postmarkOk = await emailProviderById("POSTMARK").send(withKey, msg);
  expect("Postmark still reports a real send as sent", postmarkOk === null, String(postmarkOk));

  /* 5. The SMTP row, which is allowed to be SMTP and nothing else. ------------- */

  calls = [];
  const smtp = emailProviderById("SMTP");
  const unset = await smtp.send({ ...noKey, host: null, port: null }, msg);
  expect(
    "the SMTP provider says plainly that it is not configured",
    typeof unset === "string" && /host|port/i.test(unset),
    "this is the default for every pre-existing row, so its unconfigured message is the one most owners will ever see",
  );
  expect("the SMTP provider makes no HTTP call", calls.length === 0);
}

/* -------------------------------------------------------------------------- */
/* 5. Source invariants that no amount of driving can observe                   */
/* -------------------------------------------------------------------------- */

function sourceInvariants(): void {
  /**
   * The same file with its prose removed, because this module EXPLAINS the traps it
   * avoids: the comments name api.zeptomail.in and nodemailer while warning about them.
   * Counting those as endpoints would fail a file that is right for the reason it is
   * right. Block comments and whole-line comments only - stripping trailing `//` would
   * eat the `//` in every https:// URL, which is the thing being counted.
   */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  expect(
    "no sender speaks plain http",
    !/["'`]http:\/\//.test(code),
    "an http:// endpoint puts a sending credential on the wire in clear text",
  );

  for (const host of Object.values(EXPECTED_HOST)) {
    const seen = code.split(host).length - 1;
    expect(
      `${host} appears once`,
      seen === 1,
      `found ${seen} times. Two ids sharing one region host is the bug this file exists for: one of them was a guess.`,
    );
  }

  const smtpBlock = /const SMTP: EmailProvider = \{([\s\S]*?)\n\};/.exec(code)?.[1] ?? "";
  expect("the SMTP sender was found", smtpBlock.trim().length > 0);
  expect(
    "nodemailer is only in the SMTP sender",
    code.split("nodemailer").length - 1 === smtpBlock.split("nodemailer").length - 1,
    "an HTTPS provider that reaches for nodemailer is an HTTPS provider that times out on Railway",
  );
  expect(
    "nodemailer is imported where it is used, not at the top",
    !/^import .*nodemailer/m.test(code),
    "a top-level import makes every cold start pay for a transport most deployments never use",
  );
  expect(
    "the SMTP timeout is named rather than passed through",
    /blocks outbound SMTP/.test(src),
    "'Connection timeout' sends people back to check a password that is fine. The one error everybody hits here has to say what it is.",
  );

  const sendSrc = readFileSync(join(process.cwd(), "src", "lib", "nurture", "send.ts"), "utf8");
  expect(
    "the sender dispatches through the registry",
    /emailProviderById\(/.test(sendSrc),
    "sixteen call sites send mail and none of them should know which provider is configured - a second opinion here is how one path keeps using SMTP after the switch",
  );
  expect(
    "the sender has no transport of its own",
    !/nodemailer|createTransport/.test(sendSrc),
    "a direct transport beside the registry is a path the settings screen cannot change",
  );
}

async function main(): Promise<void> {
  await run();
  globalThis.fetch = realFetch;
  sourceInvariants();

  console.log(
    failures === 0
      ? "\n🟢 Every provider is selectable, reaches its own region over HTTPS, and refuses to send without a key.\n"
      : `\n🔴 ${failures} check(s) failed. Mail could be silently going nowhere.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify:email-providers crashed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

export {};
