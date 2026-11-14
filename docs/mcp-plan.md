# MCP plan (Phase 2)

Date: 14-11-2026. Status: **waiting for APPROVED**. No code written. Read docs/mcp-review.md first.

## 1. Tools

All tools take only the inputs below. The workspace is NEVER an input: it comes from the token.
Dates in inputs are YYYY-MM-DD, read as IST days (same as the Stats page). Every human-read date
in an output is DD-MM-YYYY HH:MM IST via formatIST; each also carries an ISO-8601 UTC twin for
machines.

| # | Tool | R/W | Inputs | Output |
|---|---|---|---|---|
| 1 | connection_status | R | none | workspace name and id, plan, token label and prefix, scopes, server version (commit SHA), time now |
| 2 | list_assessments | R | status? (DRAFT, PUBLISHED, all), limit? (default 50, max 200) | id, title, slug, status, public URL, created, submission count |
| 3 | get_funnel_stats | R | assessment_id?, from?, to?, ad_id?, breakdown? (none, ad) | visits (total, unique, humans only), gate passed, disqualified (by exit), opt-ins, completed, paid count; with breakdown=ad, the same five core counts per ad id; the date window actually applied |
| 4 | list_leads | R | assessment_id?, from?, to?, band?, status? (STARTED, COMPLETED), ad_id?, include_preview? (default false), limit? (default 50, max 200), cursor? | id, name, email, mobile, assessment, status, score, band, ad id, utm source/campaign, created; next_cursor |
| 5 | get_lead | R | lead_id | the lead plus category scores, band, gate answers summary, attribution, AI statement if any, result link |
| 6 | list_templates | R | category? | id, title, category, summary, shape, has result pages |
| 7 | create_assessment_from_template | W | template_id, result_page_kind? (RESULTS, VSL), confirm? (default false), preview_token? | confirm=false: a preview (template, question and category counts, result pages, slots left on the plan, "will be created as DRAFT, Meta reporting OFF") and a preview_token. confirm=true plus a matching preview_token: the new assessment id, slug, builder URL |

### Added, with reasons

- **list_templates**: the agent cannot pick a template_id for tool 7 without it.

### Removed

- None. Considered and left out for now: publish_assessment, edit questions, delete anything,
  send messages. All are write paths with live-traffic or money consequences; they belong in a
  later round once the confirm pattern has proven itself.

### Notes on specific tools

- **get_funnel_stats** without ad_id calls the existing getAnalyticsStats with
  tenantOnly(tenantId), so its numbers equal the Stats page exactly. With ad_id it counts the
  five core numbers in a new MCP-side query: PageView and GateDisqualification filter their flat
  utm column, GateEntry and Submission filter attribution JSON. No ad id column exists today, so
  the ad id is read from **utm_content** by default (open question 1).
- Stats include preview submissions, same as the Stats page (review finding 3). The output says
  so in a note field rather than silently differing from the screen.
- **Write rule**: tool 7 never writes without confirm=true AND the preview_token from a preview
  made in the last 10 minutes for the same token, template and inputs. The token is an HMAC
  signed with the existing BETTER_AUTH_SECRET, so no new env var. The create also runs the same
  gates as the UI: parked plan refused, assessment cap checked under the cap lock, template
  visibility rule (published and approved, or the workspace's own private ones). Each confirmed
  write is recorded in the existing AuditLog table.

## 2. Authentication

- New ApiToken scopes **mcp_read** and **mcp_write** (write includes read). Strings only, so
  **no migration**. Token prefix "mcp_".
- Minted from the existing API keys screen (/w/api and /admin/api-tokens), which gains the two
  scope options. Mint for these scopes stamps configTenantOf(acting), never the raw nullable id,
  so the owner's token belongs to the Platform workspace (review gap 4 avoided).
- 🔴 A token with tenantId null is **refused** by the MCP. Every tool builds its scope as
  tenantOnly(token.tenantId); nothing in the module may import ALL_TENANTS or call a data function
  without a scope argument. A static scan test enforces this.
- Any id passed in (assessment_id, lead_id, template_id) is looked up with the tenant in the
  where clause, so a foreign id returns "not found", never a row.
- Same plan gate as today's tokens: minting needs the apiAccess feature (Agency), owner exempt
  (open question 6).
- Held behind a **feature release switch** "mcp" (catalog default false). Platform and internal
  tenants are exempt, so the owner can test while nobody else sees it.
- Rate limit per token (60 calls a minute) using the existing rateLimit.
- Transport auth: Authorization: Bearer header. OAuth (needed for the claude.ai web connector
  UI) is out of this round (open question 5).

## 3. Where the code lives

```
src/mcp/                      the module, no Next.js imports below this line except route
  core/types.ts               McpContext { tenantId, tokenId, scopes }, Tool definition type
  core/registry.ts            the tool list; one array a gateway can import or proxy
  core/protocol.ts            JSON-RPC: initialize, tools/list, tools/call, ping
  core/auth.ts                bearer -> McpContext, refuses null-tenant and wrong-scope tokens
  core/confirm.ts             preview_token sign and verify
  core/format.ts              DD-MM-YYYY IST plus ISO twins
  tools/<tool-name>.ts        one file per tool: zod input schema, handler(ctx, input)
  data/                       the few new scoped queries (ad-filtered stats, lead lookup)
src/app/api/mcp/route.ts      thin POST handler: auth, then protocol, nothing else
tests/mcp/*.test.ts           node:test via tsx
```

- Streamable HTTP, stateless, JSON responses (no SSE, no sessions): one POST per request, which
  suits Railway and a future gateway.
- I will try @modelcontextprotocol/sdk first for the protocol layer. If its HTTP transport will
  not run cleanly inside an App Router handler, I fall back to the hand-written JSON-RPC in
  core/protocol.ts (the four methods above are small) and log it in docs/mcp-blockers.md.
- **Gateway later**: each tool is a plain function of (McpContext, input). A gateway MCP can
  either import src/mcp/core/registry.ts directly or forward to /api/mcp with the workspace's
  token. Nothing in a tool knows how it was called.

## 4. Tests

Runner: node:test through tsx (no new test dependency). New script npm run test:mcp.

1. **Auth**: no header, bad token, revoked token, wrong scope, null-tenant token all refused;
   mcp_read cannot call the write tool.
2. **Input validation**: bad dates, limit over max, unknown enum values rejected with a clear
   error, never a stack trace.
3. **Confirm flow**: confirm=false writes nothing; confirm=true without a token, with an expired
   token, with a token from another workspace or for another template is refused.
4. **Formatting**: every human date in every output matches DD-MM-YYYY HH:MM.
5. **Static isolation scan**: no file under src/mcp imports ALL_TENANTS, calls a defaulting data
   function without a scope, or touches prisma without tenantId in the where.
6. 🔴 **Workspace A cannot read workspace B** (integration, needs a database): create fixture
   tenants mcp_test_a and mcp_test_b with one assessment, one page view, one lead each; give A a
   token; call every read tool as A, including with B's assessment_id and lead_id; assert only A's
   rows ever appear and B's ids return not found; call the write tool with B's template; then
   delete only the fixture rows it created. The test refuses to run if the database URL points at
   production. Which database it runs on is open question 2.
7. Protocol: initialize and tools/list return valid MCP shapes; tools/list for a read token omits
   the write tool.

Before every commit: npx next typegen, npx tsc --noEmit, npx eslint ., npm run
verify:client-bundle, npm run test:mcp. No build, no server start.

## 5. Build order

Branch: **mcp-server**, cut from staging. Never main. No deploy. One commit per milestone.

| M | Delivers | Tests run |
|---|---|---|
| M1 | src/mcp core, /api/mcp route, auth, connection_status, release switch key | 1, 2, 7 |
| M2 | list_assessments, list_templates, get_funnel_stats (with ad filter) | 2, 4, 5 |
| M3 | list_leads, get_lead | 2, 4, 5 |
| M4 | create_assessment_from_template with preview and confirm, AuditLog entry | 3 |
| M5 | mcp_read / mcp_write scopes on the API keys screen, isolation integration test | 6, all |
| M6 | docs/mcp-done.md: what was built, results, blockers, deploy steps, Claude connect steps | - |

No migrations are expected. If one turns out to be needed it will be additive only.

## 6. Open questions for you

1. **Ad id**: which URL parameter do your Meta ads put the ad id in? I will default to
   utm_content ({{ad.id}}), with an optional ad_param input to override per call.
2. **Isolation test database**: may it create and then delete two fixture workspaces on the
   **staging** database? If not, I run it only where you give me a throwaway database URL, and
   until then it is skipped and logged as a blocker.
3. **Lead contact details**: full email and phone in list_leads, or masked in the list and full
   only in get_lead? Default: full in both (it is the workspace's own data).
4. **Branch push**: commit locally only, or also push the mcp-server branch to origin (Railway
   does not deploy it)? Default: local only.
5. **claude.ai web**: the web connector screen needs OAuth. This round supports Claude Code and
   Claude Desktop via bearer token. Want an OAuth milestone after this?
6. **Plan gate**: MCP tokens Agency-only like other API keys, or open to every plan?
7. **Owner reach**: one token per workspace (the owner's token sees only the Platform
   workspace). Cross-workspace reach is left to the future gateway. OK?
