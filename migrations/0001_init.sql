-- Alyaf Al-Shamal — D1 schema (initial migration)
-- Source of truth: alyaf-alshamal-technical-spec.md §4
-- Binding rules on EVERY table:
--   * id            TEXT PRIMARY KEY
--   * created_at    TEXT NOT NULL  (ISO 8601 UTC)
--   * updated_at    TEXT NOT NULL
--   * deleted_at    TEXT           (NULL = active; never hard-delete)
--   * every write is mirrored into audit_log

-- =========================================================
-- categories — Leafy Greens, Onion & Garlic, Roots, Mixes
-- =========================================================
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  visible      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_categories_visible ON categories(visible, sort_order);

-- =========================================================
-- cuts — chopped, sliced, diced, grated, sticks/batons,
--        julienne, crushed, peeled, cut
-- A used cut is never deleted — only hidden (deleted_at NULL, visible 0)
-- =========================================================
CREATE TABLE IF NOT EXISTS cuts (
  id           TEXT PRIMARY KEY,
  name_ar      TEXT NOT NULL,
  name_en      TEXT,
  visible      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cuts_visible ON cuts(visible, sort_order);

-- =========================================================
-- products — never hard-deleted, slug is stable forever
-- Reserved fields present from day one (UI later):
--   origin, season_months, usage_notes_ar, storage_temp, product_code
-- =========================================================
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name_ar         TEXT NOT NULL,
  name_en         TEXT,
  category_id     TEXT NOT NULL REFERENCES categories(id),
  summary_ar      TEXT,
  body_ar         TEXT,
  visible         INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  origin          TEXT,
  season_months   TEXT,
  usage_notes_ar  TEXT,
  storage_temp    TEXT,
  product_code    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_visible  ON products(visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug     ON products(slug);

-- =========================================================
-- variants — each row is an independent SKU
-- (product + cut + pack size). Owner controls
-- pack_size, price, availability live from dashboard.
-- =========================================================
CREATE TABLE IF NOT EXISTS variants (
  id                    TEXT PRIMARY KEY,
  product_id            TEXT NOT NULL REFERENCES products(id),
  cut_id                TEXT NOT NULL REFERENCES cuts(id),
  pack_size             TEXT NOT NULL DEFAULT '1kg',
  shelf_life_days       INTEGER,
  shelf_life_open_days  INTEGER,
  price                 TEXT,
  min_order             TEXT,
  availability          TEXT NOT NULL DEFAULT 'available',
  availability_note_ar  TEXT,
  visible               INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id, visible);
CREATE INDEX IF NOT EXISTS idx_variants_avail   ON variants(availability);

-- =========================================================
-- restaurants — permanent entity, separate from leads.
-- One restaurant may request a sample three times.
-- =========================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  area             TEXT,
  address          TEXT,
  notes            TEXT,
  first_contact_at TEXT,
  status           TEXT NOT NULL DEFAULT 'new',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_area   ON restaurants(area);

-- =========================================================
-- contacts — chef and purchasing manager may be two people
-- at the same restaurant
-- =========================================================
CREATE TABLE IF NOT EXISTS contacts (
  id             TEXT PRIMARY KEY,
  restaurant_id  TEXT NOT NULL REFERENCES restaurants(id),
  name           TEXT NOT NULL,
  phone          TEXT,
  role           TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_restaurant ON contacts(restaurant_id, is_primary);

-- =========================================================
-- leads — status is COMPUTED from lead_events, not stored.
-- The `status` column below is a denormalised cache, kept in
-- sync by the query-isolation layer for list rendering only;
-- the source of truth is lead_events.
-- =========================================================
CREATE TABLE IF NOT EXISTS leads (
  id               TEXT PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  restaurant_id    TEXT REFERENCES restaurants(id),
  contact_id       TEXT REFERENCES contacts(id),
  type             TEXT NOT NULL,
  items            TEXT,
  top_items_ar     TEXT,
  source           TEXT,
  whatsapp_opened  INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'new',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ref      ON leads(ref);
CREATE INDEX IF NOT EXISTS idx_leads_restaurant ON leads(restaurant_id);

-- =========================================================
-- lead_events — MANDATORY from day one.
-- Event log, not a status. Status is computed from this.
-- Event types: created, contacted, sample_sent,
--   sample_tried, converted, rejected, reopened
-- On rejected, note carries reason from closed list:
--   price | has_a_supplier | no_reply | not_interested | quality
-- =========================================================
CREATE TABLE IF NOT EXISTS lead_events (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL REFERENCES leads(id),
  event_type  TEXT NOT NULL,
  note        TEXT,
  actor       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_events_type ON lead_events(event_type);

-- =========================================================
-- settings — key/value. Every word shown on the public site
-- comes from here. Not one string in code.
-- =========================================================
CREATE TABLE IF NOT EXISTS settings (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'text',
  updated_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- =========================================================
-- private_links — noindex, expiring links for special
-- offers / confirmed-client catalogs.
-- =========================================================
CREATE TABLE IF NOT EXISTS private_links (
  id           TEXT PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,
  product_ids  TEXT,
  note         TEXT,
  expires_at   TEXT,
  view_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_private_links_token ON private_links(token);

-- =========================================================
-- batches — reserved fields, UI later.
-- First complaint from a restaurant traces back to the
-- exact batch. Prerequisite for hotels/chains and export.
-- =========================================================
CREATE TABLE IF NOT EXISTS batches (
  id             TEXT PRIMARY KEY,
  batch_number   TEXT,
  packing_date   TEXT,
  product_id     TEXT REFERENCES products(id),
  variant_id     TEXT REFERENCES variants(id),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);

-- =========================================================
-- audit_log — who changed what and when.
-- Every write passes through the query-isolation layer,
-- which writes one row here per mutation.
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor      TEXT,
  table_name TEXT NOT NULL,
  record_id  TEXT,
  action     TEXT NOT NULL,
  diff       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor, created_at);
