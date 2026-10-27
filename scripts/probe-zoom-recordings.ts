/**
 * probe:zoom - can a Zoom cloud recording be pulled SERVER SIDE, with no laptop in the
 * byte path?
 *
 * Why this exists: the owner's uplink measured 1.28 Mbps. A one hour recording pushed
 * from a laptop is a two hour upload, and no amount of part size or concurrency changes
 * that. The only real fix is to never let the bytes touch the laptop: Zoom's cloud holds
 * the file already, so the copy should run Zoom to R2 and nothing else. Everything
 * downstream of that idea depends on ONE unknown, and this script settles it:
 *
 *   WHICH CREDENTIAL, IF ANY, LETS A SERVER FETCH THE RECORDING FILE?
 *
 * Zoom's own forum answers this three different ways across five years, so the answer is
 * measured here rather than read. Three candidates are tried against a real recording:
 *
 *   1. the OAuth access token as a Bearer header        (what this app already holds)
 *   2. the same token as an ?access_token= query param  (the older documented way)
 *   3. no credential at all                             (the control)
 *
 * and then, if Zoom answers any of them with a redirect, the redirect target is fetched
 * BARE. That last step is the one that matters most. If the target is a pre-signed URL
 * that serves bytes without a Zoom credential, then the URL can be handed to Cloudflare
 * and the transfer becomes cloud to cloud with nothing of ours in the middle. If it is
 * not, every byte has to stream through our own server and the design is different.
 *
 * 🔴 READ ONLY, AND IT NEVER DOWNLOADS A RECORDING. Every request asks for the first
 * kilobyte with a Range header. The point is to learn which door opens, not to move a
 * file, and a probe that quietly pulled gigabytes over the very link we are trying to
 * avoid would be its own joke.
 *
 * 🟡 The one write it can cause is Zoom's own token rotation, through the app's normal
 * refresh path. That is deliberate: the probe should exercise the real credential the
 * product uses, not a special one, or it proves nothing about the product.
 *
 *   npm run probe:zoom                 the first connected workspace
 *   npm run probe:zoom -- <tenantId>   a particular one
 */
import "./public-db-url";
import { prisma } from "../src/lib/db/prisma";
import { resolveZoomApp, zoomAccessToken } from "../src/lib/zoom/oauth";

const API = "https://api.zoom.us/v2";
/** Enough to identify the bytes, small enough that nobody's data plan notices. */
const SNIFF = "bytes=0-1023";

/* ------------------------------------------------------------------ plumbing --- */

/** Hostname and path only. A presigned URL carries its signature in the query, and a
 *  signature pasted into a terminal is a credential sitting in scrollback. */
function safeUrl(raw: string | null): string {
  if (!raw) return "(none)";
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? " ?<query redacted>" : ""}`;
  } catch {
    return "(unparseable)";
  }
}

/**
 * What came back, in one line a human can judge.
 *
 * 🔴 CONTENT TYPE IS THE WHOLE TEST, NOT THE STATUS CODE. Zoom answers an unauthorised
 * recording request with 200 and its sign-in page, so "it returned 200" is the single
 * most misleading thing this probe could report. HTML means refused no matter what the
 * status line says, and mp4 bytes mean allowed.
 */
function describeBody(bytes: Uint8Array, contentType: string | null): string {
  if (bytes.length === 0) return "empty body";
  const ct = (contentType ?? "").toLowerCase();
  // 'ftyp' at offset 4 is the ISO base media signature every Zoom mp4 and m4a carries.
  const ftyp =
    bytes.length > 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70;
  if (ftyp) return `🟢 real media bytes (ISO/mp4 signature, ${bytes.length}B sniffed)`;
  if (ct.includes("html")) return "🔴 HTML, so this is Zoom's sign-in page and NOT the file";
  const text = new TextDecoder().decode(bytes.slice(0, 160)).replace(/\s+/g, " ").trim();
  return `${bytes.length}B, starts: ${text.slice(0, 140)}`;
}

interface Attempt {
  label: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  location: string | null;
  note: string;
}

async function attempt(
  label: string,
  url: string,
  headers: Record<string, string>,
): Promise<Attempt> {
  try {
    const res = await fetch(url, {
      headers: { Range: SNIFF, ...headers },
      // Manual, because the redirect is the finding. Following it would merge two very
      // different questions (may we ask, and may we fetch) into one answer.
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
    const ct = res.headers.get("content-type");
    const loc = res.headers.get("location");
    let note: string;
    if (res.status >= 300 && res.status < 400) {
      note = `redirects to ${safeUrl(loc)}`;
    } else {
      const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
      note = describeBody(new Uint8Array(buf), ct);
    }
    const allowed = res.status === 200 || res.status === 206;
    return {
      label,
      ok: allowed && !(ct ?? "").toLowerCase().includes("html"),
      status: res.status,
      contentType: ct,
      location: loc,
      note,
    };
  } catch (e) {
    return {
      label,
      ok: false,
      status: null,
      contentType: null,
      location: null,
      note: `request failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function report(a: Attempt): void {
  const mark = a.ok ? "🟢" : "🔴";
  console.log(`   ${mark} ${a.label}`);
  console.log(`        status ${a.status ?? "-"}  type ${a.contentType ?? "-"}`);
  console.log(`        ${a.note}`);
}

/* -------------------------------------------------------------- zoom payloads --- */

interface RecordingFile {
  id?: string;
  file_type?: string;
  file_extension?: string;
  file_size?: number;
  recording_type?: string;
  download_url?: string;
  status?: string;
}
interface Meeting {
  uuid?: string;
  topic?: string;
  start_time?: string;
  duration?: number;
  total_size?: number;
  recording_files?: RecordingFile[];
}
interface RecordingsPage {
  meetings?: Meeting[];
  code?: number;
  message?: string;
}

function mb(bytes: number | undefined): string {
  if (!bytes) return "?";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Walk back a month at a time until a recording turns up.
 *
 * Zoom caps a single query at roughly one month, and an account whose last call was in
 * August would otherwise look like an account with no recordings at all, which is the
 * wrong conclusion to hand back from a probe about downloads.
 */
async function findRecording(
  token: string,
): Promise<{ meeting: Meeting; file: RecordingFile } | { error: string }> {
  for (let back = 0; back < 6; back++) {
    const to = new Date(Date.now() - back * 30 * 86_400_000);
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const url = `${API}/users/me/recordings?page_size=30&from=${ymd(from)}&to=${ymd(to)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as RecordingsPage | null;
    if (!res.ok) {
      // Zoom names the missing scope in this message, which is far more reliable than
      // any list of scope strings written down here would be.
      return { error: `${res.status} ${body?.message ?? "(no message)"}` };
    }
    const meetings = body?.meetings ?? [];
    console.log(`   ${ymd(from)} to ${ymd(to)}: ${meetings.length} meeting(s) with recordings`);
    for (const m of meetings) {
      const file = (m.recording_files ?? []).find(
        (f) => f.download_url && (f.file_type === "MP4" || f.file_extension === "MP4"),
      );
      if (file) return { meeting: m, file };
    }
  }
  return { error: "no MP4 recording found in the last six months" };
}

/* ------------------------------------------------------------------- the run --- */

async function main(): Promise<void> {
  console.log("=== Zoom cloud recording pull probe ===\n");

  console.log("1. The platform's Zoom app");
  const app = await resolveZoomApp();
  if (app) {
    console.log(`   🟢 Configured, client id ends ...${app.clientId.slice(-6)}\n`);
  } else {
    // Deliberately not an early exit. Whether any workspace ever connected is the thing
    // that separates "never set up" from "set up once and the credentials were removed",
    // and those two want completely different next steps.
    console.log("   🔴 Not configured. No client id and secret on the platform settings row.\n");
  }

  console.log("2. Connected workspaces");
  const wanted = process.argv[2];
  const accounts = await prisma.zoomAccount.findMany({
    where: wanted ? { tenantId: wanted } : {},
    select: {
      tenantId: true,
      zoomEmail: true,
      scope: true,
      expiresAt: true,
      lastError: true,
      refreshTokenEnc: true,
      tenant: { select: { name: true, slug: true } },
    },
  });
  if (accounts.length === 0) {
    console.log("   🔴 None. Nobody has pressed Connect on Zoom yet.");
    console.log("      Connect one workspace, then run this again.\n");
    return;
  }
  for (const a of accounts) {
    console.log(`   - ${a.tenant?.slug ?? a.tenantId}  ${a.zoomEmail ?? "(no email)"}`);
    console.log(`     scopes held: ${a.scope ?? "(none recorded)"}`);
    console.log(
      `     refresh token: ${a.refreshTokenEnc ? "yes" : "🔴 MISSING"}  expires: ${a.expiresAt?.toISOString() ?? "-"}`,
    );
    if (a.lastError) console.log(`     🟡 last error: ${a.lastError}`);
  }
  if (!app) {
    console.log("\n   🔴 Stopping here. Without the platform's Zoom app no token can be");
    console.log("      renewed, so nothing below could be trusted even if it answered.\n");
    return;
  }
  const target = accounts[0]!;
  console.log(`\n   Probing: ${target.tenant?.slug ?? target.tenantId}\n`);

  console.log("3. A live access token");
  const token = await zoomAccessToken(target.tenantId);
  if (!token) {
    console.log("   🔴 Could not get one. The connection needs redoing.\n");
    return;
  }
  console.log(`   🟢 Got a token (${token.length} chars, not printed)\n`);

  console.log("4. Listing cloud recordings");
  const found = await findRecording(token);
  if ("error" in found) {
    console.log(`   🔴 ${found.error}`);
    console.log("      If that mentions scopes, the Marketplace app needs the cloud");
    console.log("      recording read scope ticked and the workspace must reconnect.\n");
    return;
  }
  const { meeting, file } = found;
  console.log(`   🟢 Using: "${meeting.topic ?? "(untitled)"}" ${meeting.start_time ?? ""}`);
  console.log(
    `      file ${file.recording_type ?? file.file_type} ${mb(file.file_size)} status ${file.status ?? "-"}`,
  );
  console.log(`      download_url ${safeUrl(file.download_url ?? null)}\n`);

  const dl = file.download_url!;
  console.log("5. Which credential opens the file (first 1 KB only)");
  const bearer = await attempt("Bearer header on download_url", dl, {
    Authorization: `Bearer ${token}`,
  });
  report(bearer);
  const sep = dl.includes("?") ? "&" : "?";
  const query = await attempt(
    "?access_token= query param",
    `${dl}${sep}access_token=${encodeURIComponent(token)}`,
    {},
  );
  report(query);
  const bare = await attempt("no credential (control)", dl, {});
  report(bare);

  console.log("\n6. Is the redirect target fetchable WITHOUT a Zoom credential?");
  const redirect = [bearer, query, bare].find((a) => a.location)?.location ?? null;
  if (!redirect) {
    console.log("   🟡 Nothing redirected, so there is no separate signed URL to test.");
    console.log("      A copy would have to stream through our own server.\n");
  } else {
    const signed = await attempt("redirect target, bare", redirect, {});
    report(signed);
    console.log(
      signed.ok
        ? "\n   🟢 CLOUD TO CLOUD IS POSSIBLE. This URL serves bytes with no Zoom credential,\n      so it can be handed to Cloudflare and the file never touches a laptop."
        : "\n   🟡 The signed URL did not serve bytes bare. A copy has to stream through our\n      own server, which still keeps the laptop out of the path.",
    );
  }

  console.log("\n=== verdict ===");
  const winner = [bearer, query].find((a) => a.ok);
  if (winner) {
    console.log(`🟢 A server CAN fetch the recording, using: ${winner.label}`);
    console.log("   The pull is buildable with the credential this app already stores.");
  } else {
    console.log("🔴 Neither stored-credential method opened the file.");
    console.log("   The remaining route is the download_token on the recording.completed");
    console.log("   webhook, which is short lived, so the pull must start on the webhook.");
  }
  if (bare.ok) {
    console.log("🔴 SECURITY: the control with NO credential also served bytes, so these");
    console.log("   recordings are publicly fetchable by anyone holding the URL.");
  }
  console.log();
}

main()
  .catch((e) => {
    console.error("probe failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
