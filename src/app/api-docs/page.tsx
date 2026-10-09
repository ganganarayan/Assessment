import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { platformPageMetadata } from "@/lib/seo/site";
import { MARKETING } from "@/lib/marketing/content";

/**
 * Public API documentation.
 *
 * 🔴 It says plainly, at the top, that this is NOT a general-purpose API. The Agency tier
 * advertises "API access" and the API is two read endpoints built for one job - feeding
 * server-side conversion events to an external automation. Documenting those two as
 * though they were a platform API would turn a thin claim into a misleading one, and the
 * person who discovers the gap would be a paying Agency customer mid-integration.
 *
 * Everything documented here is read from the handlers rather than imagined: the field
 * list is buildMetaMatchResponse's return shape, field for field.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "API documentation",
    description:
      "The Assess360 API: scoped bearer tokens, the meta-match lookup for server-side conversion events, and the purchase event-id endpoint for browser and server deduplication.",
    path: "/api-docs",
  });
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border bg-[var(--muted)] p-4 text-xs leading-relaxed">
      {children}
    </pre>
  );
}

const FIELDS: ReadonlyArray<[string, string]> = [
  ["found", "false when nothing matched. The response is still 200, so a caller can carry on with whatever it already knew."],
  ["email, phone", "as the respondent entered them, unhashed. Hash them yourself before sending to Meta."],
  ["fbclid, fbclid_timestamp", "the click id captured at opt-in, and when."],
  ["fbp, fbc", "the browser cookies, captured server-side at opt-in."],
  ["optin_timestamp", "epoch milliseconds, the moment they opted in."],
  ["client_ip, user_agent", "as recorded at opt-in. Meta needs both for a good match."],
  ["external_id", "the durable first-party id that rides on every Pixel and CAPI event for this person."],
  ["utm_source, utm_medium, utm_campaign, utm_term, utm_content", "last-touch attribution from the opt-in."],
];

export default async function ApiDocsPage() {
  if (await getCurrentTenant()) notFound();

  return (
    <>
      <Nav anchorBase="/" />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          API documentation
        </h1>

        <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 leading-relaxed">
          <p className="font-semibold">Read this first: it is not a general-purpose API.</p>
          <p className="mt-2 text-sm">
            There is no endpoint to create an assessment, list your submissions or write a
            result. The API is two <strong>read</strong> endpoints built for one job: giving an
            external automation the match data it needs to fire a server-side conversion event.
            If you need your leads out, use the webhook or the CSV export, both of which are on
            every plan.
          </p>
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Authentication</h2>
          <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
            A bearer token, minted in your workspace under API tokens and shown once. Each token
            is bound to one scope and one workspace, so a <strong>meta_match</strong> token can
            read nothing else and can never see another workspace&apos;s data. Requests are rate
            limited and every response is sent no-store.
          </p>
          <Code>{`Authorization: Bearer <your token>`}</Code>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            401 means the token is missing, wrong or revoked. 429 means you are over the rate
            limit. Neither distinguishes further, on purpose.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            GET /api/v1/meta-match
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
            Scope <strong>meta_match</strong>. Looks a person up by email, by the last ten digits
            of their phone, or both, and returns the match keys Meta wants on a Conversions API
            event. This is what makes an external purchase, recorded somewhere else entirely,
            attributable to the funnel that produced the lead.
          </p>
          <Code>{`curl -H "Authorization: Bearer $TOKEN" \\
  "${MARKETING.domain}/api/v1/meta-match?email=someone@example.com&phone=9876543210"`}</Code>
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Email is the primary key and phone is the fallback. Supplying neither is a 400. No
            match is <strong>200 with found:false</strong>, not a 404, so an automation can still
            fire a minimal event from whatever it already had.
          </p>
          <dl className="mt-5 flex flex-col gap-3">
            {FIELDS.map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3">
                <dt className="text-sm font-semibold">{k}</dt>
                <dd className="mt-1 text-sm text-[var(--muted-foreground)]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Values come back <strong>raw, not hashed</strong>. Meta expects email and phone
            hashed, so hash them at the point you build the event rather than storing the hashes.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            GET /api/v1/purchase-eventid/latest
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
            Public, no token. Returns the event id of the most recent purchase event in a time
            window and amount band, so a browser Pixel event and a server-side event for the same
            purchase can carry the same id and Meta deduplicates them instead of counting two.
          </p>
          <Code>{`curl "${MARKETING.domain}/api/v1/purchase-eventid/latest?window=600&min=400&max=600"`}</Code>
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            It is public because the browser has to call it, and it returns an opaque event id
            and nothing else. CORS preflight is handled.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Health checks</h2>
          <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
            Every endpoint has a sibling <strong>/health</strong> that needs no token and touches
            no data, for uptime monitoring that does not spend a rate limit.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Versioning</h2>
          <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
            Build against the <strong>/api/v1/</strong> paths. The unversioned{" "}
            <strong>/api/meta-match</strong> alias still answers for consumers wired before
            versioning existed, and will not gain new fields.
          </p>
        </section>

        <p className="mt-12 border-t pt-8 text-sm text-[var(--muted-foreground)]">
          Something you need that is not here?{" "}
          <Link href="/build" className="underline underline-offset-4">
            Tell us what you are building
          </Link>
          . The API is small because it was built for one job, and the next endpoint will be
          whichever one somebody actually needs.
        </p>
      </main>
      <Footer />
    </>
  );
}
