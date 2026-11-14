# MCP blockers and decisions

Date: 14-11-2026. Nothing blocked the build. These are the places where I chose the safest
option and kept going, so you can overrule any of them.

| # | Topic | What I did | Why |
|---|---|---|---|
| 1 | 🟡 Meta ad id | Read from **utm_content** by default (any utm parameter via ad_param) | fbclid and fbc are opaque click tokens; they do not contain the ad id. Ads need utm_content={{ad.id}} in Meta's URL parameters. Until then, by-ad numbers show "(no ad id)". |
| 2 | 🟡 Test runs in "disqualified" | Reported with a note, not split | Gate rejections and page views carry no preview flag in the database. Opt-ins, completed and gate passed ARE split into real and test runs. Splitting the rest needs a new column (additive migration), not done here. |
| 3 | 🟢 MCP SDK | Not used; JSON-RPC written by hand in src/mcp/core/protocol.ts | The SDK's HTTP transport targets Node req/res, not the web Request an App Router route gets. Four methods (initialize, tools/list, tools/call, ping) are small. No new dependency. |
| 4 | 🟢 Two-step connect (15-11-2026) | Standard MCP OAuth: add by URL, then paste the key on /mcp/connect; Claude stores it | Stateless: signed client ids, encrypted 5-minute PKCE-bound codes, the access token is the MCP key itself, so no table and no migration. Codes are not single-use (no storage); PKCE makes a stolen code useless without the verifier. |
| 5 | 🟢 Release switch | New switch "mcp", OFF | Same pattern as every other feature: the owner and internal workspaces are exempt, so you can test now; customers get it when you flip it on Feature releases. |
| 6 | 🟢 Owner key home | The owner's MCP key is always stamped on the Platform workspace, even if minted while inside a customer workspace | It reaches every workspace anyway. It is listed on /admin/api-tokens. |
| 7 | 🟢 Action bridge exclusions | 55 actions excluded (respondent funnel, checkout and payment verification, impersonation cookie, secret reveal, key minting, file uploads) | A visitor's actions are not an operator's, a person pays in a browser, and a key must not mint keys or print secrets into a chat. Full list with reasons: EXCLUDED_ACTIONS in src/mcp/actions/catalog.generated.ts. |
| 8 | 🟢 Isolation test database | Runs on **staging** with fixture workspaces it creates and deletes (your answer "exclusive") | Verified 0 leftover rows after the run. It refuses to run against production. |
| 9 | 🟢 Tests outside Next.js | tests/mcp/env.ts points next/navigation at Next's own server build | Plain Node loads the browser build, which crashes under the react-server condition. Test-only, the app is untouched. |
