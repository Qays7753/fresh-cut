# Alyaf Al-Shamal — Technical Specification (Backend, Data, Dashboard)

> This document is the single source of truth for architecture, data, and the admin system. It pairs with the visual reference file (`alyaf-alshamal-reference-FINAL.md`), which governs everything visual. Where the two touch, the visual file governs appearance and this file governs structure and behavior. Read both fully before building.

---

## 1. What This Is

A polished **company website** for Alyaf Al-Shamal — a supplier of pre-cut, ready-to-use vegetables for restaurants in Amman, Jordan.

**Not an e-commerce store.** No prices shown publicly, no cart, no checkout, no payment. Pricing is "by quantity" — the restaurant asks.

**Its job:** present the company with a professional visual presence, show products elegantly, and drive two actions — requesting a **free sample** and contacting via **WhatsApp**.

**The four problems it solves:**
1. Leave a mark a restaurant can return to (rep leaves a QR card).
2. Convince the restaurant to request a free sample (the most important action).
3. Open a direct contact channel (WhatsApp).
4. Convert interest into a real order.

**A simple CRM** tracks who requested a sample, who converted, and why anyone declined.

---

## 2. Architecture

### Core decision

The **public site is fully static HTML**. Zero database queries on visit.

Flow: the dashboard writes to D1 → triggers a rebuild → Cloudflare Pages publishes fresh HTML.

An update taking one to ten minutes to appear is acceptable. The payoff: the public site never goes down even if the database is unavailable, and it is maximally fast on a weak network. This matters — the site is opened by a chef inside a kitchen on poor 3G.

### Two projects

Two separate Cloudflare Pages projects:

| Project | Domain | Content |
|---|---|---|
| Public site | `[project].pages.dev` (custom domain later) | Static HTML, **zero admin code** |
| Dashboard | `admin.[project].pages.dev` (or a separate project) | Protected app behind Cloudflare Access |

The separation is mandatory: anyone viewing the public site's source must find **no trace** of the dashboard's existence.

### Stack

- **No framework.** Raw HTML + CSS + JS. No React, Vue, Next.
- **No Tailwind.** Raw CSS with custom-property tokens (per the visual reference). Default Tailwind is the clearest "AI-generated" fingerprint in markup.
- **Database:** Cloudflare D1.
- **API / server logic:** Cloudflare Workers.
- **Auth:** Cloudflare Access (three accounts, full permissions, with audit log).
- **Analytics:** Cloudflare Web Analytics. No Google Analytics, no cookies, no consent banner.
- **Font:** IBM Plex Sans Arabic, self-hosted as a woff2 subset. Weights 400/600/700 only. Not from a CDN.

### Everything on D1

Products, settings, leads, restaurants, and the CRM all live in D1 — one platform, one account. The dashboard is the window into the data: it includes a **data-view page** (readable tables with filter and search) and **one-click CSV export**, so the owner can open and download the data like a spreadsheet anytime without depending on any third-party service. This replaces any need for Google Sheets.

### Performance budget (binding)

| Metric | Limit |
|---|---|
| Total JS | < 50KB |
| Total CSS | < 20KB (per visual reference) |
| First paint on 3G | < 1s |
| LCP | < 2.5s |
| CLS | < 0.05 |
| Lighthouse (all axes) | > 95 |

The public site is fully readable **without JavaScript** — content, product grid, links all work. JS is required only for the form, the mobile menu, and light interactions.

---

## 3. URL Structure — Irreversible Decision

```
/                          → permanent redirect to /ar/
/ar/                       → homepage (company site + product grid)
/ar/p/[slug]               → product page (future — see §5)
/ar/spec/[slug].pdf        → downloadable spec sheet (future)
/ar/private/[token]        → private catalog: noindex, expiring link
/en/                       → reserved, unpublished
/api/catalog               → public JSON of the catalog
```

- The **`/ar/` structure is mandatory from day one**, even with no English. Changing it later wipes the domain's search ranking.
- **Moving to a custom domain:** when a domain is bought, `pages.dev` becomes a permanent (301) redirect to the new domain — not a parallel copy. Every old QR keeps working. Duplicate content kills ranking.
- **Tracking params:** QR links carry `?src=qr`, customizable per area (`?src=qr-swf`). Stored with the lead.

---

## 4. Database (D1)

### Global rules on every table

- `id` — TEXT, unique identifier
- `created_at`, `updated_at` — timestamp, mandatory
- `deleted_at` — soft delete. **Never hard-delete any row, ever.**
- Every write is recorded in `audit_log`

### `products`

| Field | Type | Note |
|---|---|---|
| `id` | TEXT | key |
| `slug` | TEXT | unique, stable, never changes after publish |
| `name_ar` | TEXT | mandatory |
| `name_en` | TEXT | optional, for export |
| `category_id` | TEXT | reference |
| `summary_ar` | TEXT | one line for the card |
| `body_ar` | TEXT | long text for the product page |
| `visible` | BOOLEAN | default true |
| `sort_order` | INTEGER | drag ordering |
| `origin` | TEXT | reserved — Ghor, Mafraq |
| `season_months` | TEXT | reserved — months in season |
| `usage_notes_ar` | TEXT | reserved — kitchen uses |
| `storage_temp` | TEXT | reserved |
| `product_code` | TEXT | reserved |

### `variants`

Each row = product + cut type + pack size. This is the Del Monte model: each line is an independent SKU, not a product with options.

| Field | Type | Note |
|---|---|---|
| `id` | TEXT | key |
| `product_id` | TEXT | reference |
| `cut_id` | TEXT | reference |
| `pack_size` | TEXT | default `1kg` — **owner-controlled from dashboard** |
| `shelf_life_days` | INTEGER | |
| `shelf_life_open_days` | INTEGER | shelf life after opening |
| `price` | TEXT | **owner-controlled from dashboard; not shown publicly** (kept for internal reference / private links) |
| `min_order` | TEXT | |
| `availability` | TEXT | `available` / `out_today` / `seasonal` — **owner-controlled from dashboard** |
| `availability_note_ar` | TEXT | e.g. returns in October |
| `visible` | BOOLEAN | independent of the product |

Pack size, price, and availability are the three fields the owner controls live from the dashboard.

### `cuts`

Cut-type list, managed from the dashboard. Prevents "chopped" being written ten different ways.

Initial list (from Del Monte, extendable): chopped, sliced, diced, grated, sticks/batons, julienne, crushed, peeled, cut.

Fields: `id`, `name_ar`, `name_en`, `visible`, `sort_order`.

**A used cut type is never deleted — only hidden.**

### `categories`

Initial list: Leafy Greens, Onion & Garlic, Roots, Mixes. Editable and extendable from the dashboard.

Fields: `id`, `name_ar`, `name_en`, `visible`, `sort_order`.

### `restaurants`

The restaurant is a permanent entity, separate from the order. One restaurant may request a sample three times.

Fields: `id`, `name`, `area`, `address`, `notes`, `first_contact_at`, `status`.

### `contacts`

The chef and the purchasing manager may be two people at the same restaurant.

Fields: `id`, `restaurant_id`, `name`, `phone`, `role`, `is_primary`.

### `leads`

| Field | Note |
|---|---|
| `id` | |
| `ref` | reference number, format `AS-2607-014` |
| `restaurant_id` | linked or created |
| `contact_id` | |
| `type` | `sample` / `order` |
| `items` | JSON — requested items |
| `top_items_ar` | answer to the weekly-consumption question |
| `source` | from `?src=` |
| `whatsapp_opened` | whether WhatsApp actually opened |
| `status` | computed from events |

### `lead_events` — mandatory from day one

**An event log, not a status.** Status is computed from events, not stored.

Fields: `id`, `lead_id`, `event_type`, `note`, `created_at`, `actor`.

Event types: `created`, `contacted`, `sample_sent`, `sample_tried`, `converted`, `rejected`, `reopened`.

On `rejected`, a reason is recorded from a closed list: price, has a supplier, no reply, not interested, quality.

**Why:** data not recorded in the first year is lost forever. After a year this table answers questions you haven't thought to ask yet — days between sample and first order, which area converts fastest, which product opens the restaurant's door, and why those who decline decline.

### `settings`

Key/value. **Every piece of text shown on the site comes from here — not one word is written in code.**

Includes: WhatsApp number, brand name, page title, order cutoff, delivery days, delivery areas, minimum order, replacement policy, payment methods, form text, post-submission message, WhatsApp message templates, notification email.

Seed values known now: WhatsApp `0777717753`, order cutoff `2 days before delivery`, notification email `businesses.access.25@gmail.com`.

### `private_links`

Fields: `id`, `token`, `product_ids`, `note`, `expires_at`, `view_count`, `created_at`.

### `batches` — reserved fields, UI later

Batch number and packing date per order. The first complaint from a restaurant needs tracing back to the exact batch. A prerequisite for dealing with hotels and chains, and a prerequisite for export.

### `audit_log`

Who changed what and when. Fields: `id`, `actor`, `table`, `record_id`, `action`, `diff`, `created_at`.

---

## 5. Public Site

The homepage layout, sections, order, and all appearance are governed by the **visual reference file** (§6 there). This section covers only structure and behavior not in the visual file.

### Homepage

A single page. Section order per the visual reference: sticky header → asymmetric hero → value/trust strip → product grid (all items exposed, no hidden tabs) → "Why Alyaf Al-Shamal" → sample section → contact form → footer. Persistent floating WhatsApp button, and a sticky bottom sample bar on mobile.

Products are split into four categories: Leafy Greens, Onion & Garlic, Roots, Mixes.

### Product card data

Each card shows: product name, cut type, pack size, shelf life, availability status. Availability is text, not a colored dot: "available" / "out today" / "seasonal — returns in October". An unavailable item stays visible in gray — hiding it implies you don't supply it at all.

### Product page `/ar/p/[slug]` (future, structure ready now)

Works even if it contains only the name and cut. Fills in progressively.

**Critical rule: an empty field never appears.** No "not available", no dash. The section disappears entirely. This is what makes a half-complete page look intentional, not lacking.

Long-term purpose: these pages bring search traffic. "chopped parsley wholesale amman" should reach you.

### Spec sheet (future)

Auto-generated from the data, not hand-designed. This is what Baldor and Mann Packing do, and what makes a purchasing manager take you seriously.

### Print

Real `@media print`. The chef prints the catalog and pins it in the kitchen. The printed version: black and white, full table, no buttons or filters, WhatsApp number in the footer of every page.

### Meta

An informative title. Schema.org LocalBusiness + Product. A real OG image, not a logo on white — it's what appears when the chef forwards the link to a partner on WhatsApp, and that is your most important distribution channel.

---

## 6. Forms

Two forms, same structure: **sample request** and **supply request**.

Fields: restaurant name, person name, phone (`type="tel"`, `inputmode="tel"`, `autocomplete`), area, items (auto-filled), and "What are the top 3 items you use weekly?".

### Submission flow — order is binding

1. Save data to D1 **first**, without waiting.
2. Open WhatsApp with a pre-filled message in the same instant.
3. Show the confirmation screen.

**Why:** if WhatsApp opens first and the chef doesn't hit send, the lead is lost forever — no name, no number. In the order above: if they send, you have a conversation and a record; if they don't, you have their data and you call.

### Post-submission screen

**The most important screen, and the most neglected.** A blank page after submission kills the deal.

Must contain: a reference number (`AS-2607-014`), an expected reply time computed from the submission time ("we'll contact you before 10am"), and a direct WhatsApp button carrying the reference number.

### Critical fallback

If saving fails (weak network, outage), the page stores the request locally and opens WhatsApp immediately with the same data. **The request is never lost.**

### Input details

- `inputmode="tel"` to open the number pad directly
- Accept all Jordanian formats (07, +9627, 00962) and normalize to one format before storage
- Correct `autocomplete` on every field
- **Hidden honeypot** against bots — no reCAPTCHA. It adds 300KB and annoys a real, hurried user.
- One human-language line about data use: "We use your number only to contact you about your request." Not a three-page privacy policy.

### Notifications

An immediate email to `businesses.access.25@gmail.com` on every new lead, containing the reference number, the data, the items, and a direct WhatsApp link.

---

## 7. The Dashboard

**A mobile app running in the browser, with a wider laptop version.** Not a shrunken laptop dashboard.

Usage context: standing in a restaurant, one hand, weak network.

### Navigation

A **bottom** bar with four items: Today, Leads, Products, Settings. Bottom, not side — the thumb is at the bottom. Anything extra goes inside.

### Today page

The first screen opened. A tappable task list, not charts:

- how many new leads not yet contacted
- how many promised samples not yet sent
- any items marked "out" for more than three days (forgot to bring them back)

Charts in a project this size are decoration, not a tool.

### Leads

A table (stacked cards on mobile): date, restaurant, person, phone, area, type, items, source, status, last contact.

Each row opens a detail with a full timeline, a notes field, and a direct WhatsApp button.

**Automatic alerts:** a lead in "new" status for over 48 hours turns red. A promised sample not sent within 3 days appears on the Today page.

One-click CSV export.

### Restaurants

Separate from leads. Restaurant data, its people, full dealing history, and the items it consumes. Opened before a visit to know what to say.

### Products

List, search, drag-ordering, and **bulk edit** — tick ten items and change their status to "out" in one tap. This is needed daily.

**A one-tap "out today" action directly from the list**, without opening the item.

**A floating button adds an item with three fields only** (name, category, cut), the rest later. Full entry with fifteen fields means you never add items.

### Cuts & categories

Fully managed lists. Add, edit, hide. Show how many items are linked to each. No deleting a used type.

### Settings

Every piece of text shown on the site, and every operational number. No exception.

### Data view — answers "how do I see what's in the database"

A dedicated page rendering D1 content (leads, products, restaurants) as readable spreadsheet-like tables, with filter and search, and **one-click CSV export**. This is the window into the data — open it, read it, download it, open it in Excel anytime — without any third-party service and while keeping everything on D1.

### Private links

Create a link, choose items, set an expiry, and a view counter.

Use: a special offer for a specific restaurant, or a catalog with agreed prices for a confirmed client. Stronger than a PDF because it updates without sending a new file.

### Interface rules

- Every daily action in two taps maximum
- 48px minimum touch target
- **Swipe-to-delete is forbidden.** Deletion needs explicit confirmation. What gets deleted with a wet finger gets deleted.
- **Offline operation:** reading works offline, edits are stored and synced when the network returns. Restaurant kitchens are basements with no coverage.
- **A single global search** covering products, leads, and restaurants together.

### Permissions

Three accounts, full permissions, via Cloudflare Access. No passwords — login by email.

**A separate account per person is mandatory** even with full trust: to know who changed what, and to revoke one person's access without changing a shared password. (Supplier secrecy has been dropped — the three are partners with the same view — so all three see everything. Separate accounts remain for the audit log.)

---

## 8. Security & Data

- CSP header
- Rate limit on the form from the Worker side
- Subresource Integrity on any external resource
- Restaurant data is a legal responsibility — limited permissions and full one-click export
- All accounts (GitHub, Cloudflare, domain) under the owner's name, not the developer's

---

## 9. Irreversible Decisions

Must be implemented today. Cannot be recovered later without a rebuild or permanent loss.

1. **`/ar/` structure** — changing it later wipes domain ranking
2. **`lead_events`** — unrecorded data is lost forever
3. **`created_at` / `updated_at` / `deleted_at` on every table** — no hard delete
4. **Every text from settings/JSON** — cheap today, painful in a year
5. **Stable `slug` per product** — never changes after publish
6. **Query isolation layer:** every D1 interaction goes through one file. Not complex architecture — one file. Moving to Postgres later becomes editing one file.
7. **`/api/catalog`** — costs an hour today, saves a whole project the day you build an app or WhatsApp automation
8. **Separated HTML templates** (header, footer, product-row) — moving to Astro or Eleventy becomes mechanical
9. **Reserved fields** (`batches`, `origin`, `season_months`, `product_code`, `name_en`, `price`) — present in the schema, their UI later

---

## 10. What Is Not Built Now

Analytics dashboards. A reporting system. A mobile app. Any automation. A published English page. A language switcher.

These are built when the need is actually known, and the data recorded from day one is what guides them.

**Most projects die from an accumulation of features nobody uses.**

---

## 11. Code Rules — Binding

Code exposes itself to any technical person who opens the source.

**Forbidden:**
- Obvious explanatory comments (`// loop through products`)
- Generic variable names (`data`, `item`, `handleClick`, `res`)
- Forgotten `console.log`
- CSS variables named `--primary` / `--secondary`
- Files with dead code
- Commit messages like "update files"
- Any external library without a written justification

**Required:**
- Domain-meaningful names: `catalogRows`, `variantAvailability`, `leadRef`
- CSS variables named from the brand world (per the visual reference)
- Hand-drawn inline SVG icons at a uniform stroke — no Lucide, no Heroicons
- Commit messages that actually describe the change

---

## 12. Content & Data To Be Supplied

Built with editable seed values:

- Final domain (works on `pages.dev` temporarily)
- Real product list with cuts (initial structure from the Del Monte list, to be confirmed against actual products — these are a competitor's items, treated as a starting scaffold, not final)
- Detailed delivery areas
- Delivery days and cadence
- Minimum order
- Replacement policy and payment methods
- Certifications (health license, HACCP)
- Real photos

**Commercial note:** "all of Jordan" and "delivery on request" read to a purchasing manager as "no system". A concrete number ("daily delivery to Amman, governorates three times a week") convinces faster than any design element. Fields are editable, but setting numbers even provisionally is better than leaving them open.

**Another note:** the word "Organic" in the logo is a regulatory claim. It is not used in any text, and no claim is built on it, unless a certificate exists.

---

## 13. Handoff Note

This file pairs with `alyaf-alshamal-reference-FINAL.md` (visual). Together they are the complete brief for the build. The public site is built first from the visual reference; this file adds the data model, the dashboard, and the system behind it. The infrastructure setup (GitHub repo, Cloudflare Pages, D1, Cloudflare Access) is independent of the design and can be done in parallel.
