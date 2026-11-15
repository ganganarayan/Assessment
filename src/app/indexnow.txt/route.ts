import { indexNowKey } from "@/lib/indexnow/key";

/**
 * The IndexNow key file. Served on every host this app answers (the platform domain and each
 * workspace's custom domain), because a search engine checks the key on the same host as the
 * URLs it was sent.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(indexNowKey(), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
