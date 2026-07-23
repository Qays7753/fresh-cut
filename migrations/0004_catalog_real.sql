-- Alyaf Al-Shamal — real catalog (replaces the 12 placeholders with 16
-- real products) and adds an `image` column to products.
--
-- Run ONCE on the live D1 (the public site is already built from these
-- values; this keeps the dashboard/DB in sync):
--   wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0004_catalog_real.sql
--
-- Each product's image is /img/<slug>.webp (files live in public/img/).

-- 1) image column on products (run once; re-running errors on "duplicate column").
ALTER TABLE products ADD COLUMN image TEXT;

-- 2) a cut used by cauliflower that wasn't in the seed.
INSERT OR IGNORE INTO cuts (id, name_ar, name_en, visible, sort_order, created_at, updated_at)
VALUES ('cut_florets', 'زهيرات', 'florets', 1, 100, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- 3) clear the placeholder catalog (variants first — they reference products).
DELETE FROM variants;
DELETE FROM products;

-- 4) the 16 real products.
INSERT INTO products (id, slug, name_ar, category_id, summary_ar, visible, sort_order, image, created_at, updated_at) VALUES
  ('prd_garlic_crushed',         'garlic-crushed',         'ثوم مهروس',        'cat_onion_garlic', 'ثوم مهروس طازج، مقطّع بعناية وجاهز للطهي مباشرة.',        1, 10, '/img/garlic-crushed.webp',         '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_garlic_peeled',          'garlic-peeled',          'ثوم مقشّر',        'cat_onion_garlic', 'ثوم مقشّر طازج، جاهز للاستخدام مباشرة.',                  1, 20, '/img/garlic-peeled.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_red_chopped',      'onion-red-chopped',      'بصل أحمر مفروم',   'cat_onion_garlic', 'بصل أحمر مفروم طازج، جاهز للطهي مباشرة.',                 1, 30, '/img/onion-red-chopped.webp',      '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_red_sliced',       'onion-red-sliced',       'بصل أحمر شرائح',   'cat_onion_garlic', 'بصل أحمر شرائح طازج، جاهز للطهي مباشرة.',                 1, 40, '/img/onion-red-sliced.webp',       '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_white_chopped',    'onion-white-chopped',    'بصل أبيض مفروم',   'cat_onion_garlic', 'بصل أبيض مفروم طازج، جاهز للطهي مباشرة.',                 1, 50, '/img/onion-white-chopped.webp',    '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_white_sliced',     'onion-white-sliced',     'بصل أبيض شرائح',   'cat_onion_garlic', 'بصل أبيض شرائح طازج، جاهز للطهي مباشرة.',                 1, 60, '/img/onion-white-sliced.webp',     '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_carrot_sticks',          'carrot-sticks',          'جزر أصابع',        'cat_roots',        'جزر أصابع طازج، مقطّع بعناية وجاهز للطهي مباشرة.',        1, 10, '/img/carrot-sticks.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_carrot_grated',          'carrot-grated',          'جزر مبشور',        'cat_roots',        'جزر مبشور طازج، جاهز للاستخدام مباشرة.',                  1, 20, '/img/carrot-grated.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_carrot_sliced',          'carrot-sliced',          'جزر شرائح',        'cat_roots',        'جزر شرائح طازج، جاهز للطهي مباشرة.',                      1, 30, '/img/carrot-sliced.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_pumpkin_diced',          'pumpkin-diced',          'قرع مكعّبات',      'cat_roots',        'قرع مكعّبات طازج، جاهز للطهي مباشرة.',                    1, 40, '/img/pumpkin-diced.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_parsley_chopped',        'parsley-chopped',        'بقدونس مفروم',     'cat_leafy',        'بقدونس مفروم طازج، جاهز للاستخدام مباشرة.',               1, 10, '/img/parsley-chopped.webp',        '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_cabbage_red_shredded',   'cabbage-red-shredded',   'ملفوف أحمر مبشور', 'cat_leafy',        'ملفوف أحمر مبشور طازج، جاهز للاستخدام مباشرة.',           1, 20, '/img/cabbage-red-shredded.webp',   '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_cabbage_white_shredded', 'cabbage-white-shredded', 'ملفوف أبيض مبشور', 'cat_leafy',        'ملفوف أبيض مبشور طازج، جاهز للاستخدام مباشرة.',           1, 30, '/img/cabbage-white-shredded.webp', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_celery_sticks',          'celery-sticks',          'كرفس أصابع',       'cat_leafy',        'كرفس أصابع طازج، مقطّع بعناية وجاهز للطهي مباشرة.',       1, 40, '/img/celery-sticks.webp',          '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_cauliflower_florets',    'cauliflower-florets',    'زهرة مقسّمة',      'cat_mixes',        'زهرة مقسّمة إلى زهيرات طازجة، جاهزة للطهي مباشرة.',       1, 10, '/img/cauliflower-florets.webp',    '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_coconut_grated',         'coconut-grated',         'جوز هند مبشور',    'cat_mixes',        'جوز هند مبشور طازج، جاهز للاستخدام مباشرة.',              1, 20, '/img/coconut-grated.webp',         '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- 5) one variant per product (cut + 1kg pack, available).
INSERT INTO variants (id, product_id, cut_id, pack_size, availability, visible, created_at, updated_at) VALUES
  ('var_garlic_crushed',         'prd_garlic_crushed',         'cut_crushed', '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_garlic_peeled',          'prd_garlic_peeled',          'cut_peeled',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_red_chopped',      'prd_onion_red_chopped',      'cut_chopped', '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_red_sliced',       'prd_onion_red_sliced',       'cut_sliced',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_white_chopped',    'prd_onion_white_chopped',    'cut_chopped', '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_white_sliced',     'prd_onion_white_sliced',     'cut_sliced',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_carrot_sticks',          'prd_carrot_sticks',          'cut_sticks',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_carrot_grated',          'prd_carrot_grated',          'cut_grated',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_carrot_sliced',          'prd_carrot_sliced',          'cut_sliced',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_pumpkin_diced',          'prd_pumpkin_diced',          'cut_diced',   '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_parsley_chopped',        'prd_parsley_chopped',        'cut_chopped', '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_cabbage_red_shredded',   'prd_cabbage_red_shredded',   'cut_grated',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_cabbage_white_shredded', 'prd_cabbage_white_shredded', 'cut_grated',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_celery_sticks',          'prd_celery_sticks',          'cut_sticks',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_cauliflower_florets',    'prd_cauliflower_florets',    'cut_florets', '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_coconut_grated',         'prd_coconut_grated',         'cut_grated',  '1kg', 'available', 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
