-- Alyaf Al-Shamal — image management (R2-backed).
--
-- Creates the `images` table (metadata for every image in the R2 bucket),
-- adds an `image_id` reference column to `products` and `categories` so
-- they point to images.id (not a hard-coded path), and adds optional
-- settings keys for the hero/why/sample images.
--
-- Run ONCE on the live D1:
--   wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0005_images.sql
--
-- Design rules:
--   * Soft-delete only (deleted_at). No hard DELETE anywhere.
--   * Every write goes through the query-isolation layer + audit_log.
--   * An image can exist in the library with NO product pointing to it
--     (unlinked). Images are linked to products, not the other way around.
--   * r2_key is the unique key inside the R2 bucket. Stable forever.

-- =========================================================
-- images — metadata for every file in R2
-- =========================================================
CREATE TABLE IF NOT EXISTS images (
  id          TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,          -- original/display name, e.g. "parsley-chopped.webp"
  r2_key      TEXT NOT NULL UNIQUE,   -- key inside the R2 bucket, e.g. "img_abc123.webp"
  type        TEXT NOT NULL,          -- hero | category | product | company
  alt_ar      TEXT,                   -- descriptive Arabic alt text
  width       INTEGER,                -- explicit width (CLS prevention)
  height      INTEGER,                -- explicit height
  visible     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_images_type    ON images(type, visible);
CREATE INDEX IF NOT EXISTS idx_images_r2_key  ON images(r2_key);
CREATE INDEX IF NOT EXISTS idx_images_visible ON images(visible, deleted_at);

-- =========================================================
-- products.image_id — reference to images.id (nullable).
-- If NULL, the build script falls back to products.image (the
-- legacy static path like /img/foo.webp). This preserves
-- backward compatibility with the 16 existing products.
-- =========================================================
ALTER TABLE products ADD COLUMN image_id TEXT;

-- =========================================================
-- categories.image_id — reference to images.id (nullable).
-- If NULL, the build script falls back to the hard-coded
-- category-image map (cat-leafy-greens.webp etc.).
-- =========================================================
ALTER TABLE categories ADD COLUMN image_id TEXT;

-- =========================================================
-- Settings keys for the hero/why/sample images. The value is
-- an images.id, or empty string (= fall back to static path).
-- =========================================================
INSERT OR IGNORE INTO settings (id, key, value, kind, created_at, updated_at) VALUES
  ('set_hero_image_id',   'hero_image_id',   '', 'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_why_image_id',    'why_image_id',    '', 'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_sample_image_id', 'sample_image_id', '', 'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
