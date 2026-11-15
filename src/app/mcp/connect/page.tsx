import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkAuthorizeParams } from "@/mcp/oauth/core";

/**
 * Step 2 of connecting Claude: the person pastes their workspace's MCP key here, and
 * Claude receives and stores it itself. Opened by Claude, never linked from the app.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect Claude", robots: { index: false, follow: false } };

type SP = Record<string, string | string[] | undefined>;

export default async function McpConnectPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : null;
  };
  const check = checkAuthorizeParams(get);
  const error = get("error");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Claude to Assess360</CardTitle>
          <CardDescription>
            {check.ok ? (
              <>
                <strong>{check.req.clientName}</strong> is asking to work in your workspace. It will return to{" "}
                <strong>{new URL(check.req.redirectUri).host}</strong>.
              </>
            ) : (
              "This page is opened by Claude while it connects."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          {check.ok ? (
            <form method="post" action="/api/mcp/oauth/authorize" className="flex flex-col gap-4">
              <input type="hidden" name="response_type" value="code" />
              <input type="hidden" name="client_id" value={check.req.clientId} />
              <input type="hidden" name="redirect_uri" value={check.req.redirectUri} />
              <input type="hidden" name="code_challenge" value={check.req.codeChallenge} />
              <input type="hidden" name="code_challenge_method" value="S256" />
              <input type="hidden" name="state" value={check.req.state} />
              <input type="hidden" name="scope" value={check.req.scope} />
              <input type="hidden" name="resource" value={check.req.resource} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="key">Your MCP key</Label>
                <Input id="key" name="key" type="password" autoComplete="off" required placeholder="mcp_..." />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Make one in Assess360 under <strong>API tokens</strong>: pick <strong>Claude (MCP), read and write</strong>
                  and click Generate. A read only key lets Claude look but not build. The key decides which workspace
                  Claude works in.
                </p>
              </div>
              <Button type="submit">Connect</Button>
            </form>
          ) : (
            <p className="text-sm">{check.error}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
