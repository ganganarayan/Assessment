# Assess360 — Marketing Landing Page

A static, mobile-first landing page for Assess360, built with **Astro + Tailwind CSS**.
No backend, no database. It builds to plain HTML/CSS and is served by a tiny Node server on Railway.

---

## 1. The only file you edit: `src/config.ts`

Open **src/config.ts** and change these values. Nothing else needs editing.

| Setting | What it is | Default |
|---|---|---|
| `domain` | Your live URL (no trailing slash) | `https://assess.divineleads.guru` |
| `signupUrl` | Where every "Start free" button goes | `https://assess.divineleads.guru/signup` |
| `webhookUrl` | *(optional)* n8n webhook pinged on CTA clicks. Leave `''` to disable. | `''` |
| `TIERS` | The 4 pricing cards (prices, limits, features) | Free / Starter / Growth / Scale |

> If you change `domain`, also update the one `site:` line in **astro.config.mjs** so the
> sitemap matches. (The default is already correct, so normally you skip this.)

## 2. Add the hero image

Save your scorecard render (from nano banana) as:

```
public/hero-scorecard.png
```

Optionally add a social share image at `public/og-image.png` (1200×630).

---

## 3. Deploy to Railway (step by step)

1. Push this repo to GitHub (the landing page lives in the **`landing/`** folder).
2. In Railway → **New Project → Deploy from GitHub repo** → pick the repo.
3. Open the service → **Settings → Root Directory** → set it to **`landing`**.
   *(This is essential — it tells Railway to build the landing folder, not the main app.)*
4. Railway auto-detects Node. It will run:
   - **Build:** `npm run build`  → outputs static files to `dist/`
   - **Start:** `npm start`       → serves `dist/` on Railway's `$PORT`
5. **Settings → Networking → Generate Domain** (or add a custom domain), then point
   **assess.divineleads.guru** at it via a CNAME in your DNS.
6. Open the URL and confirm the page loads.

No environment variables are required. If you later set a `webhookUrl` in `src/config.ts`,
just redeploy — Railway rebuilds automatically on each push.

---

## 4. Local commands (optional — you do not need to run these)

```bash
npm install
npm run dev      # preview at http://localhost:4321
npm run build    # produce the static dist/ folder
npm start        # serve the built dist/ folder
```

---

## What's included

- 10 sections: nav, hero, problem, how-it-works, capabilities, use cases, pricing, FAQ, final CTA, footer.
- SEO: OpenGraph + Twitter meta, JSON-LD (SoftwareApplication + Organization), `sitemap.xml`, `robots.txt`, `llms.txt`, favicon.
- Accessible, WCAG-AA contrast, keyboard-focusable, mobile-first.
- One accent color (`#4F46E5`) — change it in **tailwind.config.mjs** if you ever want to recolor.
