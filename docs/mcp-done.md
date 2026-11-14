# MCP: what was built

Date: 14-11-2026. Branch: staging. Read with docs/mcp-review.md, docs/mcp-plan.md and
docs/mcp-blockers.md.

## 1. What it is

An MCP server inside the app at **/api/mcp**. Claude connects with one key per workspace and
can then read stats, leads, funnels (every gate and assessment question) and templates, and do
anything else the app can do, by chat.

How it stays safe: the key acts as the login that minted it, inside one workspace. The app's
own checks run on every call (workspace ownership, staff permissions, plan limits, paused
plans, release switches). MCP adds no new permission. Every change previews first and needs a
confirm.

## 2. Who can connect, and what they reach

| Key minted by | Reaches |
|---|---|
| A workspace owner on a paid plan | that workspace only |
| An agency owner | the agency workspace and its client workspaces (one key for all of them) |
| You, the platform owner | every workspace on the platform, like the super-admin console |

- 🟢 One active MCP key per workspace. Revoke it to mint a new one.
- 🟢 Every paid plan. Trialing, paused, suspended and client workspaces cannot mint one.
- 🟡 Customers only get it once you switch on **Claude connection (MCP)** under Feature
  releases. You and internal workspaces are exempt, so you can test now.
- Two key types: **read only** and **read and write**.

## 3. Tools

| Tool | Read or write | What it does |
|---|---|---|
| connection_status | read | key, login, workspace, plan, reach |
| list_workspaces | read | workspaces this key can act on (ids for workspace_id) |
| list_assessments | read | funnels with status, public link, lead counts |
| get_assessment | read | one funnel in full: audience gate, qualification gate questions with points and outcomes, exits, every category, question, option, points, routing, result bands |
| get_funnel_stats | read | visits, gate passed, disqualified by exit, opt-ins, completed, payments, Meta events; by date range, one ad id, or broken down by ad id; test runs shown apart |
| get_traffic_sources | read | page views by utm source, medium, campaign, term, content |
| list_leads | read | leads with filters (funnel, dates, status, band, search, ad id), test runs excluded unless asked |
| get_lead | read | one lead: every answer, category scores, band, gate result, attribution, AI statement |
| list_gate_qualified | read | split-capture leads who gave an email at the gate |
| list_templates | read | template library this workspace can use |
| get_template | read | one template's gate and assessment questions |
| create_assessment_from_template | write | new DRAFT funnel from a template, Meta reporting off |
| list_app_actions | read | search 374 app actions with exact argument types |
| run_app_action_read | read | run one read action |
| run_app_action | write | run any action (builder, settings, contacts, calendar, workflows, nurture, webhooks, domains, staff, and for you the platform console) |

Every tool except list_workspaces takes an optional **workspace_id**. All dates come back as
DD-MM-YYYY HH:MM IST. Secrets in action results are replaced with [redacted].

## 4. Test results (14-11-2026)

| Suite | Result |
|---|---|
| Unit (schemas, preview tokens, dates, redaction) | 🟢 8 of 8 pass |
| Static scans (no all-tenant reads, every query scoped, catalog fresh, no excluded action offered) | 🟢 6 of 6 pass |
| Isolation, on staging with fixture workspaces | 🟢 13 of 13 pass, 0 fixture rows left |
| Typecheck, eslint (0 errors), client bundle, all 28 build verify scripts | 🟢 pass |

The isolation suite proves: workspace A cannot list, open or count workspace B's funnels,
leads, stats or private templates, by id or by workspace_id; ad-filtered stats do not count
B's traffic; test runs stay out of real leads; A's app actions see only A's rows; a preview
cannot be forged or reused by another key; an agency key reaches its own client and nothing
else; a workspace key cannot reach an agency's client; a revoked key stops at once.

Run them again:

```bash
npm run test:mcp
```

```bash
MCP_DB_TEST=1 railway run -- npx tsx --conditions=react-server --test tests/mcp/isolation.test.ts
```

## 5. Deploy

- Pushed to **staging**, which deploys to https://orbitq-assess.applygitawisdom.com.
- No migration. The key types are new values in an existing column.
- Production: only on your word ("push to main"), then the same steps on
  https://assess360.divineleads.guru.
- When the app changes, run npm run mcp:actions so new actions reach the bridge. The test
  suite fails if you forget.

## 6. Connect Claude (staging)

**Get a key**

1. Sign in at https://orbitq-assess.applygitawisdom.com as the owner.
2. In the left menu, click **API Tokens**.
3. In **Scope**, pick **Claude (MCP), read and write**.
4. In **Label**, type **Claude**.
5. Click **Generate**.
6. Copy the key that starts with **mcp_**. It is shown once.

**Claude Code (this app, or a terminal)**

7. Run this, with your key in place of mcp_YOUR_KEY:

```bash
claude mcp add --transport http assess360 https://orbitq-assess.applygitawisdom.com/api/mcp --header "Authorization: Bearer mcp_YOUR_KEY"
```

8. Start a new session. Type **/mcp** and check that **assess360** shows as connected.
9. Ask: "Run connection_status on assess360."

**Claude Desktop (chat app)**

7. Open Settings, then Developer, then **Edit Config**.
8. Add this inside the file, with your key in place of mcp_YOUR_KEY, and save:

```json
{
  "mcpServers": {
    "assess360": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://orbitq-assess.applygitawisdom.com/api/mcp", "--header", "Authorization:${AUTH}"],
      "env": { "AUTH": "Bearer mcp_YOUR_KEY" }
    }
  }
}
```

9. Quit Claude Desktop fully and reopen it. assess360 appears under the tools icon.

**Check a key without Claude**

```bash
curl -H "Authorization: Bearer mcp_YOUR_KEY" https://orbitq-assess.applygitawisdom.com/api/mcp/health
```

**Give a customer access (when you are ready)**

1. Go to **Feature releases** in the left menu.
2. Turn on **Claude connection (MCP)**.
3. The workspace owner opens **API tokens** in their workspace and follows steps 3 to 6 above.

## 7. Things to try first

- "List my workspaces, then show stats for the last 30 days in each."
- "Show every gate and assessment question in funnel X."
- "List this week's completed leads with band HIGH."
- "Create a draft funnel from template Y." (it previews first)
- "Find the app action that adds a question, then add one to funnel X." (previews first)
