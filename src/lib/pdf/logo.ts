/**
 * A tenant's logo as a data URI for the PDF report (react-pdf).
 *
 * Fetched by the report ROUTE, not by the renderer: react-pdf would fetch a remote URL
 * with no timeout and no size cap, and a slow or huge logo would hang the report. Here
 * it gets 3 seconds and 1 MB, and only the two formats react-pdf can draw (PNG, JPEG).
 * Anything else, or any failure, prints the report without a logo. Never throws.
 */
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 3000;

function sniff(b: Uint8Array): "image/png" | "image/jpeg" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export async function logoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    const mime = sniff(bytes);
    return mime ? `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` : null;
  } catch {
    return null;
  }
}
