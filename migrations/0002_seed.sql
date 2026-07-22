-- Alyaf Al-Shamal — seed migration
-- Categories + cuts are stable structure. Products are PLACEHOLDERS
-- marked [[...]] for owner replacement via dashboard. No invented
-- statistics or certifications — settings text uses clearly-marked
-- placeholders where the owner must supply final copy.

-- Stable timestamp for seed rows; updated_at will move on first edit.
-- All times ISO 8601 UTC.

-- =========================================================
-- categories
-- =========================================================
INSERT INTO categories (id, name_ar, name_en, visible, sort_order, created_at, updated_at) VALUES
  ('cat_leafy',        'ورقيات',          'Leafy Greens',     1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cat_onion_garlic', 'بصل وثوم',        'Onion & Garlic',   1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cat_roots',        'جذور',            'Roots',            1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cat_mixes',        'خلطات جاهزة',     'Mixes',            1, 40, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- =========================================================
-- cuts — Del Monte starting list, extendable
-- =========================================================
INSERT INTO cuts (id, name_ar, name_en, visible, sort_order, created_at, updated_at) VALUES
  ('cut_chopped',  'مفروم',          'chopped',        1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_sliced',   'مقطع شرائح',     'sliced',         1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_diced',    'مكعبات',         'diced',          1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_grated',   'مبشور',          'grated',         1, 40, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_sticks',   'أصابع/باطوني',   'sticks/batons',  1, 50, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_julienne', 'جوليان',         'julienne',       1, 60, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_crushed',  'مهرّس',          'crushed',        1, 70, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_peeled',   'مقشّر',          'peeled',         1, 80, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('cut_cut',      'مقطّع',          'cut',            1, 90, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- =========================================================
-- products — 12 PLACEHOLDERS, 3 per category.
-- Names marked [[...]] for easy find-and-replace by owner.
-- Slugs are stable forever once published.
-- =========================================================
INSERT INTO products (id, slug, name_ar, name_en, category_id, summary_ar, body_ar, visible, sort_order, created_at, updated_at) VALUES
  -- Leafy Greens
  ('prd_leafy_01', 'leafy-01', '[[اسم الصنف]]', '[[product name]]', 'cat_leafy', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_leafy_02', 'leafy-02', '[[اسم الصنف]]', '[[product name]]', 'cat_leafy', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_leafy_03', 'leafy-03', '[[اسم الصنف]]', '[[product name]]', 'cat_leafy', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  -- Onion & Garlic
  ('prd_onion_01', 'onion-01', '[[اسم الصنف]]', '[[product name]]', 'cat_onion_garlic', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_02', 'onion-02', '[[اسم الصنف]]', '[[product name]]', 'cat_onion_garlic', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_onion_03', 'onion-03', '[[اسم الصنف]]', '[[product name]]', 'cat_onion_garlic', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  -- Roots
  ('prd_roots_01', 'roots-01', '[[اسم الصنف]]', '[[product name]]', 'cat_roots', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_roots_02', 'roots-02', '[[اسم الصنف]]', '[[product name]]', 'cat_roots', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_roots_03', 'roots-03', '[[اسم الصنف]]', '[[product name]]', 'cat_roots', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  -- Mixes
  ('prd_mixes_01', 'mixes-01', '[[اسم الصنف]]', '[[product name]]', 'cat_mixes', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 10, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_mixes_02', 'mixes-02', '[[اسم الصنف]]', '[[product name]]', 'cat_mixes', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 20, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('prd_mixes_03', 'mixes-03', '[[اسم الصنف]]', '[[product name]]', 'cat_mixes', '[[وصف قصير للصنف — يستبدل من لوحة التحكم]]', NULL, 1, 30, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- =========================================================
-- variants — one default variant per placeholder product,
-- owner fills real pack_size/availability from dashboard.
-- =========================================================
INSERT INTO variants (id, product_id, cut_id, pack_size, shelf_life_days, shelf_life_open_days, price, min_order, availability, availability_note_ar, visible, created_at, updated_at) VALUES
  ('var_leafy_01', 'prd_leafy_01', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_leafy_02', 'prd_leafy_02', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_leafy_03', 'prd_leafy_03', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_01', 'prd_onion_01', 'cut_diced',   '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_02', 'prd_onion_02', 'cut_sliced',  '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_onion_03', 'prd_onion_03', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_roots_01', 'prd_roots_01', 'cut_sticks',  '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_roots_02', 'prd_roots_02', 'cut_julienne','1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_roots_03', 'prd_roots_03', 'cut_diced',   '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_mixes_01', 'prd_mixes_01', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_mixes_02', 'prd_mixes_02', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('var_mixes_03', 'prd_mixes_03', 'cut_chopped', '1kg', NULL, NULL, NULL, NULL, 'available', NULL, 1, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');

-- =========================================================
-- settings — every word on the public site lives here.
-- Placeholder copy is clearly marked [[...]] where the
-- owner must supply final text. No invented statistics
-- or certifications.
-- =========================================================
INSERT INTO settings (id, key, value, kind, created_at, updated_at) VALUES
  -- Identity
  ('set_brand_name',     'brand_name',      'ألياف الشمال',                                    'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_brand_name_en',  'brand_name_en',   'Alyaf Al-Shamal',                                  'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_page_title',     'page_title',      'ألياف الشمال — خضار مقطّعة جاهزة للمطاعم',          'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_meta_desc',      'meta_desc',       '[[وصف مختصر للموقع لنتائج البحث — يستبدل من الإعدادات]]', 'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Contact channels
  ('set_whatsapp',       'whatsapp_number', '0777717753',                                       'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_notify_email',   'notification_email', 'businesses.access.25@gmail.com',                'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Operations
  ('set_order_cutoff',   'order_cutoff',    'قبل يومين من التوصيل',                              'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_delivery_days',  'delivery_days',   '[[أيام التوصيل — يستبدل من الإعدادات]]',             'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_delivery_areas', 'delivery_areas',  '[[مناطق التوصيل — يستبدل من الإعدادات]]',            'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_min_order',      'minimum_order',   '[[الحد الأدنى للطلب — يستبدل من الإعدادات]]',        'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_replacement',    'replacement_policy', '[[سياسة الاستبدال — تستبدل من الإعدادات]]',       'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_payment',        'payment_methods', '[[طرق الدفع — تستبدل من الإعدادات]]',                'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Hero
  ('set_hero_title',     'hero_title',      'خضار مقطّعة طازجة، جاهزة للطهي، تصلك يومياً',         'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_hero_support',   'hero_support',    '[[سطر داعم تحت العنوان — يستبدل من الإعدادات]]',      'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_hero_cta',       'hero_cta',        'اطلب عيّنة مجانية',                                  'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Value strip
  ('set_value_1',        'value_point_1',   'توصيل يومي للمطاعم في عمّان',                        'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_value_2',        'value_point_2',   'تقطيع حسب الطلب — جاهز للطهي مباشرة',                'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_value_3',        'value_point_3',   '[[نقطة قيمة ثالثة — تستبدل من الإعدادات]]',           'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_value_4',        'value_point_4',   '[[نقطة قيمة رابعة — تستبدل من الإعدادات]]',           'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Section headings
  ('set_cat_heading',    'catalog_heading', 'الأصناف',                                            'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_cat_sub',        'catalog_sub',     'كل الأصناف مكشوفة — لا تبويب يخفي شيئاً',             'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_why_heading',    'why_heading',     'لماذا ألياف الشمال',                                 'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_why_body',       'why_body',        '[[نص قسم «لماذا نحن» — يستبدل من الإعدادات]]',        'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_sample_heading', 'sample_heading',  'اطلب عيّنة مجانية',                                  'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_sample_body',    'sample_body',     '[[نص قسم العيّنة — يستبدل من الإعدادات]]',            'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Form
  ('set_form_heading',   'form_heading',    'تواصل معنا',                                         'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_form_body',      'form_body',       'املأ الطلب وسنردّ عليك على واتساب خلال ساعات',          'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_data_use_line',  'data_use_line',   'نستخدم رقمك للتواصل معك بخصوص طلبك فقط',             'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Post-submission
  ('set_confirm_title',  'confirm_title',   'وصلنا طلبك',                                         'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_confirm_body',   'confirm_body',    'سنردّ عليك على واتساب قبل الساعة 10 صباحاً',          'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_confirm_cta',    'confirm_cta',     'افتح واتساب',                                        'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- WhatsApp templates — Arabic + reference number only (per build decision)
  ('set_wa_sample_tpl',  'wa_sample_template', 'مرحباً، أرغب بطلب عيّنة. رقم المرجع: {{ref}}',    'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
  ('set_wa_supply_tpl',  'wa_supply_template', 'مرحباً، أرغب بطلب توريد. رقم المرجع: {{ref}}',    'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),

  -- Footer
  ('set_footer_rights',  'footer_rights',   '© ألياف الشمال — جميع الحقوق محفوظة',                'text', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
