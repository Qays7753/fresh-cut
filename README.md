# Alyaf Al-Shamal — خضار مقطّعة جاهزة للمطاعم

Production-ready company website + CRM for Alyaf Al-Shamal, a supplier of pre-cut vegetables for restaurants in Amman, Jordan. Built per two source-of-truth documents in this repo:

- **Visual reference:** `alyaf-alshamal-reference-FINAL.md` — color, type, motion, layout, components, anti-AI checklist
- **Technical spec:** `alyaf-alshamal-technical-spec.md` — architecture, D1 schema, dashboard, CRM

No framework. No Tailwind. Raw HTML + CSS + JS, self-hosted fonts, Cloudflare D1 + Workers.

---

## Repository layout

```
.
├── alyaf-alshamal-reference-FINAL.md   # visual source of truth (read-only)
├── alyaf-alshamal-technical-spec.md    # technical source of truth (read-only)
├── public/                             # PUBLIC SITE (separate Cloudflare Pages project)
│   ├── index.html                      # redirect → /ar/
│   ├── ar/index.html                   # homepage (built from templates)
│   ├── api/catalog.json                # static catalog JSON (parity with worker /api/catalog)
│   ├── css/
│   │   ├── tokens.css                  # ALL design tokens — single source
│   │   └── site.css                    # public site styles (<20KB gzipped)
│   ├── js/site.js                      # additive JS (<50KB) — form, menu, sample bar
│   ├── fonts/                          # self-hosted IBM Plex Sans Arabic woff2 subset
│   │   ├── IBM-Plex-Sans-Arabic-400.woff2
│   │   ├── IBM-Plex-Sans-Arabic-600.woff2
│   │   └── IBM-Plex-Sans-Arabic-700.woff2
│   └── img/                            # placeholder SVGs (clearly labeled)
├── dashboard/                          # DASHBOARD (separate Cloudflare Pages project)
│   ├── index.html                      # admin SPA
│   ├── css/dashboard.css
│   └── js/dashboard.js
├── worker/                             # Cloudflare Worker — public + admin API
│   ├── src/
│   │   ├── index.js                    # routing, lead submit handler
│   │   ├── queries.js                  # QUERY-ISOLATION LAYER (single file, all SQL)
│   │   ├── email.js                    # fire-and-forget notification
│   │   └── handlers/admin.js           # admin namespace router
│   ├── wrangler.toml
│   └── package.json
├── migrations/                         # D1 migrations
│   ├── 0001_init.sql                   # all 11 tables, soft-delete, audit_log
│   ├── 0002_seed.sql                   # categories, cuts, 12 placeholder products, settings
│   └── 0003_kv_shim.sql                # rate-limiter table
├── build/
│   ├── build-public.js                 # reads D1 → composes public/ar/index.html
│   └── templates/                      # header, footer, product-row (separated HTML)
└── package.json                        # build script entry
```

---

## How the system works

1. Owner edits products or settings in the **dashboard** (`alyaf-alshamal-admin.pages.dev`).
2. Dashboard writes to **D1** through the worker (`/api/admin/*`).
3. Worker fires the **Cloudflare Pages Deploy Hook** for the public site project.
4. Pages runs the build script (`node build/build-public.js`), which reads D1 and composes fresh static HTML.
5. Public site (`alyaf-alshamal.pages.dev`) serves the new HTML — no client-side database calls.

The public site never goes down even if D1 is unavailable. A 1–10 minute delay between dashboard edit and public-site update is acceptable (spec §2).

---

## First-time setup

### 1. Install dependencies

```bash
npm install
cd worker && npm install
```

### 2. Create the D1 database and run migrations

```bash
cd worker
npx wrangler login
npx wrangler d1 create alyaf-alshamal
# Copy the database_id from the output into worker/wrangler.toml

# Apply migrations in order:
npx wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0001_init.sql
npx wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0002_seed.sql
npx wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0003_kv_shim.sql
```

### 3. Deploy the worker (API)

```bash
cd worker
# Optional: set MailChannels API key for email notifications
npx wrangler secret put MAILCHANNELS_KEY
npx wrangler deploy
```

Note the worker URL (e.g. `https://alyaf-alshamal-api.your-account.workers.dev`).

### 4. Build and deploy the public site

```bash
# From repo root:
# Set env vars for live D1 fetch (or omit to use the seed JSON baked into the build)
export D1_DATABASE_ID="<from step 2>"
export CF_ACCOUNT_ID="<your account id>"
export CF_API_TOKEN="<token with D1 read>"

npm run build
# Output: public/ar/index.html, public/api/catalog.json, public/index.html

# Deploy as a Cloudflare Pages project named "alyaf-alshamal"
npx wrangler pages deploy public --project-name=alyaf-alshamal
```

### 5. Deploy the dashboard

```bash
npx wrangler pages deploy dashboard --project-name=alyaf-alshamal-admin
```

### 6. Configure Cloudflare Access (auth for the dashboard)

The dashboard must be protected by Cloudflare Access — there is no in-app password system. Spec §7: three accounts, full permissions, login by email.

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications**.
2. Add an application for the dashboard hostname (`alyaf-alshamal-admin.pages.dev`).
3. Add three email addresses as allowed users.
4. Under **Settings → Authentication**, keep email OTP as the only method (no SSO complexity).
5. The worker's `/api/admin/*` namespace verifies the `Cf-Access-Jwt-Assertion` header on every request — Cloudflare Access itself validates the JWT at the edge before the worker runs.

### 7. Wire the deploy hook

So that dashboard edits trigger a public-site rebuild:

1. In Cloudflare Pages → `alyaf-alshamal` project → **Settings → Builds & deployments → Deploy hooks**.
2. Create a hook named `dashboard-edit`.
3. Copy the hook URL.
4. Add it as a worker secret: `npx wrangler secret put PUBLIC_DEPLOY_HOOK_URL`.
5. Set `ADMIN_ORIGIN` in `worker/wrangler.toml` to the dashboard URL.

---

## Replacing placeholder content

The site ships with clearly-marked placeholders. Everything is editable from the dashboard **Settings** page — no code changes needed.

### Product names and descriptions

The 12 seed products are all named `[[اسم الصنف]]` and described as `[[وصف قصير للصنف — يستبدل من لوحة التحكم]]`. To replace:

1. Open the dashboard → **الأصناف**.
2. Tap any product row to edit.
3. Replace the placeholder name with the real product name (e.g. `بقدونس مفروم`).
4. The product's `slug` is stable forever — do not change it after publish (spec §9.5).

### Product photos

Placeholder SVGs live in `public/img/`:

| File | Aspect ratio | Replaces with |
|---|---|---|
| `hero-placeholder.svg` | 16:9 desktop / 4:5 mobile | Real hero photo (1280×720) |
| `why-placeholder.svg` | 4:3 | Photo of the kitchen / processing area |
| `placeholder-cat_*.svg` | 3:2 (368×245) | Real product photos |

To replace: drop real photos into `public/img/` with the same filenames (or update the build script's `IMG_SRC` mapping). Photos keep their natural colors — no saturation adjustment (spec §5.8).

### Settings text

Every word on the public site lives in the `settings` table. Edit from dashboard → **الإعدادات**. Look for keys still containing `[[...]]`:

- `meta_desc` — page description for search results
- `hero_support` — supporting line under the hero title
- `value_point_3`, `value_point_4` — third/fourth value-strip items
- `why_body` — body text under the "Why us" heading
- `sample_body` — body text under the sample CTA
- `delivery_areas`, `delivery_days`, `minimum_order`, `replacement_policy`, `payment_methods` — operational details

Be concrete (spec §12): "daily delivery to Amman, governorates three times a week" is more convincing than "delivery on request".

### WhatsApp number, notification email, order cutoff

Already seeded with the real values:

- WhatsApp: `0777717753`
- Notification email: `businesses.access.25@gmail.com`
- Order cutoff: `2 days before delivery`

Edit from dashboard → **الإعدادات** if these change.

---

## Hard rules enforced by this build

These were non-negotiable in the source-of-truth documents. Breaking any of them is a regression.

1. **No framework, no Tailwind** — raw HTML/CSS/JS only.
2. **No hardcoded hex or px** outside `public/css/tokens.css`. Every color, spacing, radius, shadow, motion value resolves to a CSS custom property.
3. **All site text sourced from settings/data** — not one word is hardcoded in templates.
4. **Semantic, brand-derived names** — `catalogRows`, `variantAvailability`, `leadRef`, `--green`, `--amber-action`, `--space-6`. Never `data`, `item`, `--color-1`.
5. **Hand-drawn inline SVG icons** at uniform stroke (1.75px). No icon libraries.
6. **Soft delete only** — every table has `deleted_at`, no `DELETE` statements anywhere.
7. **`lead_events` event log** — status is computed from events, not stored.
8. **`audit_log` wired** — every write through the query-isolation layer writes one row.
9. **Query-isolation layer** — every D1 interaction goes through `worker/src/queries.js`. No raw SQL in handlers.
10. **`/ar/` URL structure** — mandatory from day one (spec §9.1).
11. **`/api/catalog`** — public JSON endpoint (spec §9.7).
12. **Separated HTML templates** — header, footer, product-row (spec §9.8).
13. **Reserved fields present** — `batches`, `origin`, `season_months`, `product_code`, `name_en`, `price` all in the schema (spec §9.9).
14. **Two separate Cloudflare Pages projects** — the public site's source contains zero trace of the dashboard.
15. **Form submit order** — D1 save first → WhatsApp opens → confirmation screen → email fire-and-forget.
16. **Honeypot, no reCAPTCHA** — hidden `company_url` field; bots fill it, humans never see it.
17. **Mobile-first admin** — bottom nav, 48px touch targets, offline read.
18. **Performance budget** — JS < 50KB, CSS < 20KB gzipped, LCP < 2.5s, CLS < 0.05.
19. **Arabic-native RTL** — `dir="rtl"` and `lang="ar"` on root, logical properties only, IBM Plex Sans Arabic self-hosted, `letter-spacing: 0` always.
20. **Anti-AI checklist** — visual reference §13 enforced; no default motion, no symmetric auto-spacing, no uniform corners, no Tailwind look.

---

## Verifying the build

### Token discipline

```bash
# Should return nothing — all hex/px live in tokens.css only:
grep -rE '#[0-9a-fA-F]{3,6}|[0-9]+px' public/css/site.css public/ar/index.html dashboard/
grep -rE '#[0-9a-fA-F]{3,6}|[0-9]+px' public/css/site.css
```

(The only matches should be inside `tokens.css` and inside inline SVG `stroke-width` attributes which are unitless.)

### Performance budgets

```bash
# Gzipped JS size:
gzip -c public/js/site.js | wc -c     # < 50000

# Gzipped CSS size (tokens + site):
cat public/css/tokens.css public/css/site.css | gzip | wc -c   # < 20000
```

### Admin separation

```bash
# Public site source should contain zero admin references:
grep -i "admin\|dashboard" public/ar/index.html public/js/site.js public/css/site.css
# (only expected match: the JSON-LL schema URL or none at all)
```

### Irreversibles checklist (spec §9)

Run `grep` for each:

1. `/ar/` structure — `grep -r '/ar/' public/`
2. `lead_events` — `grep 'lead_events' migrations/0001_init.sql worker/src/queries.js`
3. Timestamps + soft-delete — `grep -E 'created_at|updated_at|deleted_at' migrations/0001_init.sql | wc -l` (should be ≥ 3 × number of tables)
4. Text from settings — `grep -c 'S\.' build/build-public.js` (every visible string sourced from settings)
5. Stable slug — `grep 'slug' migrations/0001_init.sql`
6. Query isolation — `grep -L 'import.*queries' worker/src/handlers/*.js` (handlers should import queries, not write SQL)
7. `/api/catalog` — `grep '/api/catalog' worker/src/index.js`
8. Separated templates — `ls build/templates/`
9. Reserved fields — `grep -E 'origin|season_months|product_code|batches|name_en|price' migrations/0001_init.sql`

---

## Local development

```bash
# Run the build with the seed JSON (no D1 connection needed):
npm run build

# Serve the public site locally:
npx wrangler pages dev public --port 8788

# Serve the dashboard locally:
npx wrangler pages dev dashboard --port 8789

# Run the worker locally:
cd worker && npx wrangler dev
```

---

## Commit history

Each commit describes a real change. No "update files" commits. The build was structured in phases:

1. **Infrastructure** — repo skeleton, D1 schema, worker, query isolation
2. **Design tokens** — single source of truth for color/type/space/motion
3. **Public site** — homepage, all sections, mobile menu, sticky bar, form
4. **Forms & CRM** — submit order, reference numbers, fallback, honeypot
5. **Dashboard** — admin SPA, bottom nav, all pages
6. **Deploy** — README, deploy config, push to GitHub

---

## License

Code: proprietary to Alyaf Al-Shamal.
Font: IBM Plex Sans Arabic — SIL Open Font License 1.1 (self-hosted subset).
