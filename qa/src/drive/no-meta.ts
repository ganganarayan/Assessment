/**
 * 🔴 NO TEST BROWSER EVER TALKS TO META.
 *
 * On prod the platform has a live pixel. Every /w page loads it and fires a browser
 * PageView, and the sign-up page loads it too, so a signed-in test run would hand Meta
 * a stream of fake visits from a test login. The server-side events are fenced
 * elsewhere (test workspaces carry no ad account, StartTrial is pre-stamped); this is
 * the browser half: Facebook's pixel script and its tracking endpoint are refused before
 * the request leaves the machine, in every context the harness opens.
 *
 * Blocking the script does not change what the funnel DECIDES to report, which is read
 * from the server's own FunnelEventCount rows, so no assertion depends on it.
 */
import type { BrowserContext } from "playwright";

const META = /^https?:\/\/([a-z0-9-]+\.)*(facebook\.net|facebook\.com)\//i;

export async function blockMeta(context: BrowserContext): Promise<BrowserContext> {
  await context.route(META, (route) => route.abort("blockedbyclient"));
  return context;
}
