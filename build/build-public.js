// build/build-public.js
// =============================================================
// Build script: reads catalog + settings from D1 (or local seed
// JSON for offline dev), composes public/ar/index.html from
// templates. No framework, no Tailwind — raw HTML.
//
// Usage:
//   node build/build-public.js              # uses ./seed.json
//   D1_DATABASE_ID=... node build/build-public.js
//                                           # fetches live from D1
// =============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- template loader ---------------------------------------

function loadTemplate(name) {
  return readFileSync(join(ROOT, 'build', 'templates', `${name}.html`), 'utf8');
}

function render(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ---- data loader (D1 or local seed) ------------------------

async function loadData() {
  // If D1 is configured via env, fetch live data.
  if (process.env.D1_DATABASE_ID && process.env.CF_API_TOKEN) {
    return await loadFromD1();
  }
  // Otherwise, use the local seed JSON (committed for offline dev).
  const seedPath = join(ROOT, 'build', 'seed.json');
  try {
    return JSON.parse(readFileSync(seedPath, 'utf8'));
  } catch {
    console.warn('[build] no seed.json found — generating from migrations seed values');
    return generateFromSqlSeed();
  }
}

async function loadFromD1() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const dbId = process.env.D1_DATABASE_ID;
  const token = process.env.CF_API_TOKEN;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;

  async function sql(q) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: q }),
    });
    const j = await r.json();
    return j.result?.[0]?.results || [];
  }

  const [categories, products, settings] = await Promise.all([
    sql(`SELECT id, name_ar, name_en FROM categories WHERE visible=1 AND deleted_at IS NULL ORDER BY sort_order`),
    sql(`SELECT p.id, p.slug, p.name_ar, p.summary_ar, p.category_id, p.sort_order, p.image,
                v.id AS variant_id, v.cut_id, v.pack_size, v.shelf_life_days,
                v.availability, v.availability_note_ar,
                c.name_ar AS cut_name_ar
         FROM products p
         LEFT JOIN variants v ON v.product_id=p.id AND v.visible=1 AND v.deleted_at IS NULL
         LEFT JOIN cuts c ON c.id=v.cut_id
         WHERE p.visible=1 AND p.deleted_at IS NULL
         ORDER BY p.sort_order`),
    sql(`SELECT key, value FROM settings WHERE deleted_at IS NULL`),
  ]);

  const settingsMap = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  return { categories, products, settings: settingsMap };
}

// Fallback generator that produces the same shape from the SQL seed.
// Used when running build locally with no D1 connection.
function generateFromSqlSeed() {
  // This mirrors migrations/0002_seed.sql exactly. If the seed
  // changes, regenerate build/seed.json with `npm run seed:json`.
  const categories = [
    { id: 'cat_leafy',        name_ar: 'ورقيات',      name_en: 'Leafy Greens' },
    { id: 'cat_onion_garlic', name_ar: 'بصل وثوم',    name_en: 'Onion & Garlic' },
    { id: 'cat_roots',        name_ar: 'جذور',        name_en: 'Roots' },
    { id: 'cat_mixes',        name_ar: 'خلطات جاهزة', name_en: 'Mixes' },
  ];
  // Real catalog: 16 products, image per product (file = slug).
  const P = (catKey, slug, nameAr, cutAr, sort) => ({
    id: `prd_${slug.replace(/-/g, '_')}`,
    slug,
    name_ar: nameAr,
    summary_ar: `${nameAr} طازج، مقطّع بعناية وجاهز للطهي مباشرة.`,
    category_id: `cat_${catKey}`,
    sort_order: sort,
    image: `/img/${slug}.webp`,
    variant_id: `var_${slug.replace(/-/g, '_')}`,
    cut_id: null,
    pack_size: '1kg',
    shelf_life_days: null,
    availability: 'available',
    availability_note_ar: null,
    cut_name_ar: cutAr,
  });
  const products = [
    // بصل وثوم
    P('onion_garlic', 'garlic-crushed',      'ثوم مهروس',        'مهروس',   10),
    P('onion_garlic', 'garlic-peeled',       'ثوم مقشّر',        'مقشّر',   20),
    P('onion_garlic', 'onion-red-chopped',   'بصل أحمر مفروم',   'مفروم',   30),
    P('onion_garlic', 'onion-red-sliced',    'بصل أحمر شرائح',   'شرائح',   40),
    P('onion_garlic', 'onion-white-chopped', 'بصل أبيض مفروم',   'مفروم',   50),
    P('onion_garlic', 'onion-white-sliced',  'بصل أبيض شرائح',   'شرائح',   60),
    // جذور
    P('roots', 'carrot-sticks', 'جزر أصابع',   'أصابع',   10),
    P('roots', 'carrot-grated', 'جزر مبشور',   'مبشور',   20),
    P('roots', 'carrot-sliced', 'جزر شرائح',   'شرائح',   30),
    P('roots', 'pumpkin-diced', 'قرع مكعّبات', 'مكعّبات', 40),
    // ورقيات
    P('leafy', 'parsley-chopped',        'بقدونس مفروم',     'مفروم', 10),
    P('leafy', 'cabbage-red-shredded',   'ملفوف أحمر مبشور', 'مبشور', 20),
    P('leafy', 'cabbage-white-shredded', 'ملفوف أبيض مبشور', 'مبشور', 30),
    P('leafy', 'celery-sticks',          'كرفس أصابع',       'أصابع', 40),
    // مخاليط
    P('mixes', 'cauliflower-florets', 'زهرة مقسّمة',   'زهيرات', 10),
    P('mixes', 'coconut-grated',      'جوز هند مبشور', 'مبشور',  20),
  ];
  const settings = {
    brand_name: 'ألياف الشمال', brand_name_en: 'Alyaf Al-Shamal',
    page_title: 'ألياف الشمال — خضار مقطّعة جاهزة للمطاعم',
    meta_desc: '[[وصف مختصر للموقع لنتائج البحث — يستبدل من الإعدادات]]',
    whatsapp_number: '0777717753',
    notification_email: 'businesses.access.25@gmail.com',
    order_cutoff: 'قبل يومين من التوصيل',
    delivery_days: '[[أيام التوصيل — يستبدل من الإعدادات]]',
    delivery_areas: '[[مناطق التوصيل — يستبدل من الإعدادات]]',
    minimum_order: '[[الحد الأدنى للطلب — يستبدل من الإعدادات]]',
    replacement_policy: '[[سياسة الاستبدال — تستبدل من الإعدادات]]',
    payment_methods: '[[طرق الدفع — تستبدل من الإعدادات]]',
    hero_title: 'خضار مقطّعة طازجة، جاهزة للطهي، تصلك يومياً',
    hero_support: '[[سطر داعم تحت العنوان — يستبدل من الإعدادات]]',
    hero_cta: 'اطلب عيّنة مجانية',
    value_point_1: 'توصيل يومي للمطاعم في عمّان',
    value_point_2: 'تقطيع حسب الطلب — جاهز للطهي مباشرة',
    value_point_3: '[[نقطة قيمة ثالثة — تستبدل من الإعدادات]]',
    value_point_4: '[[نقطة قيمة رابعة — تستبدل من الإعدادات]]',
    catalog_heading: 'الأصناف',
    catalog_sub: 'كل الأصناف مكشوفة — لا تبويب يخفي شيئاً',
    why_heading: 'لماذا ألياف الشمال',
    why_body: '[[نص قسم «لماذا نحن» — يستبدل من الإعدادات]]',
    sample_heading: 'اطلب عيّنة مجانية',
    sample_body: '[[نص قسم العيّنة — يستبدل من الإعدادات]]',
    form_heading: 'تواصل معنا',
    form_body: 'املأ الطلب وسنردّ عليك على واتساب خلال ساعات',
    data_use_line: 'نستخدم رقمك للتواصل معك بخصوص طلبك فقط',
    confirm_title: 'وصلنا طلبك',
    confirm_body: 'سنردّ عليك على واتساب قبل الساعة 10 صباحاً',
    confirm_cta: 'افتح واتساب',
    wa_sample_template: 'مرحباً، أرغب بطلب عيّنة. رقم المرجع: {{ref}}',
    wa_supply_template: 'مرحباً، أرغب بطلب توريد. رقم المرجع: {{ref}}',
    footer_rights: '© ألياف الشمال — جميع الحقوق محفوظة',
  };
  return { categories, products, settings };
}

// ---- availability mapping (§7.4) ---------------------------

function availabilityClass(status) {
  if (status === 'available') return 'available';
  if (status === 'out_today') return 'out_today';
  if (status === 'seasonal')  return 'seasonal';
  return 'available';
}

function availabilityLabel(status, note) {
  if (status === 'available') return 'متوفّر';
  if (status === 'out_today') return 'غير متوفّر اليوم';
  if (status === 'seasonal')  return note || 'موسمي';
  return 'متوفّر';
}

function shelfLifeLabel(days) {
  if (!days) return '—';
  return `${days} يوم`;
}

// ---- composer ----------------------------------------------

async function build() {
  const { categories, products, settings: S } = await loadData();

  const waDisplay = S.whatsapp_number || '0777717753';
  const waDigits  = waDisplay.replace(/\D/g, '').replace(/^0/, '');

  // Assemble header vars
  const headerVars = {
    PAGE_TITLE: S.page_title || 'ألياف الشمال',
    META_DESC: S.meta_desc || '',
    BRAND_NAME: S.brand_name || 'ألياف الشمال',
    WHATSAPP_DISPLAY: waDisplay,
    WHATSAPP_DIGITS: waDigits,
    SITE_URL: process.env.SITE_URL || 'https://alyaf-alshamal.pages.dev',
    HERO_CTA: S.hero_cta || 'اطلب عيّنة مجانية',
  };

  // Group products by category
  const productsByCat = {};
  for (const p of products) {
    if (!productsByCat[p.category_id]) productsByCat[p.category_id] = [];
    productsByCat[p.category_id].push(p);
  }

  // Render product cards
  const cardTemplate = loadTemplate('product-row');
  const cardHtml = categories.map(cat => {
    const items = productsByCat[cat.id] || [];
    if (!items.length) return '';
    const cards = items.map(p => render(cardTemplate, {
      SLUG: p.slug,
      IMG_SRC: p.image || `/img/${p.slug}.webp`,
      NAME_AR: p.name_ar,
      SUMMARY_AR: p.summary_ar || '',
      AVAILABILITY_CLASS: availabilityClass(p.availability),
      AVAILABILITY_LABEL: availabilityLabel(p.availability, p.availability_note_ar),
      CUT_NAME_AR: p.cut_name_ar || '—',
      PACK_SIZE: p.pack_size || '1kg',
      SHELF_LIFE: shelfLifeLabel(p.shelf_life_days),
    })).join('\n');
    return `
      <div class="catalog__category-head">
        <span class="catalog__category-name">${cat.name_ar}</span>
        <span class="catalog__category-count">${items.length} صنف</span>
      </div>
      ${cards}
    `;
  }).join('\n');

  // Category grid (homepage) — one 1:1 image per category
  const catImage = {
    cat_leafy: 'cat-leafy-greens',
    cat_onion_garlic: 'cat-onion-garlic',
    cat_roots: 'cat-roots',
    cat_mixes: 'cat-mixes',
  };
  const categoryGridHtml = categories.map(cat => {
    const imgSlug = catImage[cat.id];
    if (!imgSlug) return '';
    const count = (productsByCat[cat.id] || []).length;
    return `
        <a class="category-card" href="#catalog">
          <div class="category-card__media">
            <img src="/img/${imgSlug}.webp" alt="فئة ${cat.name_ar} — خضار مقطّعة طازجة"
                 width="600" height="600" loading="lazy" decoding="async">
          </div>
          <div class="category-card__label">
            <span class="category-card__name">${cat.name_ar}</span>
            <span class="category-card__count">${count} صنف</span>
          </div>
        </a>`;
  }).join('\n');

  // Hero, value strip, why, sample, contact, form
  const body = `
    <!-- Hero (§6.2) — asymmetric, 85vh mobile / 90vh desktop, NOT 100vh -->
    <section class="hero">
      <div class="container hero__inner" style="display:contents;">
        <div class="hero__text">
          <span class="hero__eyebrow">ألياف الشمال</span>
          <h1 class="hero__title">${S.hero_title || ''}</h1>
          <p class="hero__support">${S.hero_support || ''}</p>
          <a href="#sample" class="btn btn--primary hero__cta" data-order-sample>
            ${S.hero_cta || 'اطلب عيّنة مجانية'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
        </div>
        <div class="hero__visual">
          <img class="hero__image"
               src="/img/hero.webp"
               alt="تشكيلة خضار طازجة مقطّعة وجاهزة للطهي من ألياف الشمال"
               width="1280" height="720"
               fetchpriority="high" loading="eager" decoding="async">
        </div>
      </div>
    </section>

    <!-- Value strip (§6.3) -->
    <section class="value-strip">
      <div class="container">
        <ul class="value-strip__grid">
          <li class="value-item">
            <svg class="value-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="8" width="13" height="10" rx="2"/>
              <path d="M16 11h3l2 3v4h-5"/>
              <circle cx="7" cy="19" r="1.5"/>
              <circle cx="17" cy="19" r="1.5"/>
            </svg>
            <span class="value-item__text">${S.value_point_1 || ''}</span>
          </li>
          <li class="value-item">
            <svg class="value-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 3v6M11 3v6M15 3v6"/>
              <path d="M4 9h16l-1 12H5L4 9z"/>
            </svg>
            <span class="value-item__text">${S.value_point_2 || ''}</span>
          </li>
          <li class="value-item">
            <svg class="value-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 2"/>
            </svg>
            <span class="value-item__text">${S.value_point_3 || ''}</span>
          </li>
          <li class="value-item">
            <svg class="value-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12l4 4L19 6"/>
            </svg>
            <span class="value-item__text">${S.value_point_4 || ''}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Categories grid — 1:1 image per category -->
    <section class="section categories" id="categories">
      <div class="container">
        <div class="section-head">
          <span class="section-head__eyebrow">فئاتنا</span>
          <h2 class="section-head__title">تصفّح حسب الفئة</h2>
        </div>
        <div class="category-grid">
          ${categoryGridHtml}
        </div>
      </div>
    </section>

    <!-- Catalog (§6.4) — all items exposed, no hidden tabs -->
    <section class="section" id="catalog">
      <div class="container">
        <div class="section-head">
          <span class="section-head__eyebrow">الكتالوج</span>
          <h2 class="section-head__title">${S.catalog_heading || 'الأصناف'}</h2>
          <p class="section-head__sub">${S.catalog_sub || ''}</p>
        </div>
        <div class="catalog__grid">
          ${cardHtml}
        </div>
      </div>
    </section>

    <!-- Why us (§6.5) — asymmetric block with full-bleed left -->
    <section class="section why" id="why">
      <div class="container">
        <div class="why__inner">
          <div class="why__media">
            <img src="/img/facility-interior.webp"
                 alt="داخل منشأة ألياف الشمال — بيئة تحضير وتقطيع نظيفة"
                 width="1280" height="720"
                 loading="lazy" decoding="async">
          </div>
          <div class="why__text">
            <span class="section-head__eyebrow">لماذا نحن</span>
            <h2 class="section-head__title">${S.why_heading || ''}</h2>
            <p class="section-head__sub">${S.why_body || ''}</p>
            <ul class="why__points">
              <li class="why__point">
                <svg class="why__point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3v18M5 7c3 2 4 4 7 4s4-2 7-4"/>
                </svg>
                <span>تقطيع طازج حسب الطلب — يصل جاهزاً للطهي مباشرة</span>
              </li>
              <li class="why__point">
                <svg class="why__point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="8" width="13" height="10" rx="2"/>
                  <path d="M16 11h3l2 3v4h-5"/>
                </svg>
                <span>توصيل يومي للمطاعم في عمّان</span>
              </li>
              <li class="why__point">
                <svg class="why__point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12l4 4L21 6"/>
                </svg>
                <span>معايير ثابتة — نفس الجودة والكمية كل يوم</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Sample section (§6.6) -->
    <section class="section sample" id="sample">
      <div class="container">
        <div class="sample__inner">
          <div class="sample__text">
            <h2 class="sample__title">${S.sample_heading || ''}</h2>
            <p class="sample__body">${S.sample_body || ''}</p>
            <a href="#contact" class="btn btn--primary" data-order-sample>${S.hero_cta || 'اطلب عيّنة'}</a>
          </div>
          <div class="sample__media">
            <img src="/img/vacuum-pack.webp"
                 alt="عبوة خضار مقطّعة مغلّفة بتفريغ الهواء للحفاظ على الطزاجة وسلسلة التبريد"
                 width="1280" height="720"
                 loading="lazy" decoding="async">
          </div>
        </div>
      </div>
    </section>

    <!-- Contact form (§6.7, §5.7, §7.2) -->
    <section class="section" id="contact">
      <div class="container">
        <div class="section-head">
          <span class="section-head__eyebrow">تواصل</span>
          <h2 class="section-head__title">${S.form_heading || ''}</h2>
          <p class="section-head__sub">${S.form_body || ''}</p>
        </div>

        <div class="contact__inner">
          <div class="contact__info">
            <div class="contact__info-row">
              <svg class="contact__info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z"/>
              </svg>
              <div>
                <strong>واتساب</strong><br>
                <bdi>${waDisplay}</bdi>
              </div>
            </div>
            <div class="contact__info-row">
              <svg class="contact__info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="8" width="13" height="10" rx="2"/>
                <path d="M16 11h3l2 3v4h-5"/>
                <circle cx="7" cy="19" r="1.5"/>
                <circle cx="17" cy="19" r="1.5"/>
              </svg>
              <div>
                <strong>التوصيل</strong><br>
                ${S.delivery_areas || ''}<br>
                ${S.delivery_days || ''}
              </div>
            </div>
            <div class="contact__info-row">
              <svg class="contact__info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 7v5l3 2"/>
              </svg>
              <div>
                <strong>آخر موعد للطلب</strong><br>
                ${S.order_cutoff || ''}
              </div>
            </div>
          </div>

          <!-- Form + confirmation screen side by side -->
          <div>
            <form class="form" data-lead-form novalidate>
              <input type="hidden" name="type" value="sample">
              <input type="hidden" name="source" value="">
              <!-- Honeypot: bots fill this; humans never see it -->
              <div class="field__honeypot" aria-hidden="true">
                <label>لا تملأ هذا الحقل
                  <input type="text" name="company_url" tabindex="-1" autocomplete="off">
                </label>
              </div>

              <div class="form__row form__row--2">
                <div class="field" data-field="restaurant_name">
                  <label class="field__label" for="f-rest">اسم المطعم</label>
                  <input class="field__input" id="f-rest" name="restaurant_name"
                         type="text" required autocomplete="organization">
                  <span class="field__error"></span>
                </div>
                <div class="field" data-field="contact_name">
                  <label class="field__label" for="f-name">اسم الشخص</label>
                  <input class="field__input" id="f-name" name="contact_name"
                         type="text" required autocomplete="name">
                  <span class="field__error"></span>
                </div>
              </div>

              <div class="form__row form__row--2">
                <div class="field" data-field="phone">
                  <label class="field__label" for="f-phone">رقم الهاتف</label>
                  <input class="field__input" id="f-phone" name="phone"
                         type="tel" inputmode="tel" required autocomplete="tel"
                         placeholder="07XXXXXXXX" dir="ltr">
                  <span class="field__error"></span>
                </div>
                <div class="field" data-field="area">
                  <label class="field__label" for="f-area">المنطقة</label>
                  <input class="field__input" id="f-area" name="area"
                         type="text" required autocomplete="address-level2">
                  <span class="field__error"></span>
                </div>
              </div>

              <div class="field">
                <label class="field__label" for="f-items">الأصناف المطلوبة</label>
                <textarea class="field__textarea" id="f-items" name="items"
                          placeholder="مثال: بقدونس مفروم، نعناع مفروم، بصل مكعبات"></textarea>
                <span class="field__hint">يُعبّأ تلقائياً عند الضغط على «اطلب عيّنة» من أي صنف.</span>
              </div>

              <div class="field">
                <label class="field__label" for="f-top">ما أهم ثلاثة أصناف تستهلكها أسبوعياً؟</label>
                <textarea class="field__textarea" id="f-top" name="top_items"
                          rows="2"></textarea>
              </div>

              <p class="form__data-use">${S.data_use_line || ''}</p>

              <button class="btn btn--primary form__submit" type="submit">
                إرسال الطلب
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>

              <div data-form-error role="alert" style="display:none;"></div>
            </form>

            <!-- Confirmation screen (post-submit) -->
            <div class="confirm" data-confirm>
              <h2 class="confirm__title">${S.confirm_title || 'وصلنا طلبك'}</h2>
              <p class="confirm__body">${S.confirm_body || ''}</p>
              <p class="confirm__ref" data-confirm-ref></p>
              <p class="confirm__body" data-confirm-reply></p>
              <a class="btn btn--primary confirm__whatsapp" data-confirm-whatsapp target="_blank" rel="noopener">
                ${S.confirm_cta || 'افتح واتساب'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Compose final HTML
  const headerHtml = render(loadTemplate('header'), headerVars);
  const footerVars = {
    BRAND_NAME: S.brand_name || 'ألياف الشمال',
    WHATSAPP_DISPLAY: waDisplay,
    WHATSAPP_DIGITS: waDigits,
    DELIVERY_AREAS: S.delivery_areas || '',
    DELIVERY_DAYS: S.delivery_days || '',
    ORDER_CUTOFF: S.order_cutoff || '',
    FOOTER_RIGHTS: S.footer_rights || '',
    HERO_CTA: S.hero_cta || 'اطلب عيّنة',
    WHATSAPP_DEFAULT_TEXT: encodeURIComponent('مرحباً، أرغب بالاستفسار'),
  };
  const footerHtml = render(loadTemplate('footer'), footerVars);

  // Inline catalog as JSON for /api/catalog parity (and offline dev)
  const catalogJson = JSON.stringify({
    categories: categories.map(c => ({ id: c.id, name_ar: c.name_ar, name_en: c.name_en })),
    products: products.map(p => ({
      id: p.id, slug: p.slug, name_ar: p.name_ar, name_en: p.name_en,
      summary_ar: p.summary_ar, category_id: p.category_id, image: p.image,
      cut: p.cut_name_ar, pack_size: p.pack_size, availability: p.availability,
      availability_note_ar: p.availability_note_ar,
    })),
  });
  const settingsJson = JSON.stringify(S);

  // Inline a small bootstrap script for client-side settings/catalog.
  // This is critical-CSS-equivalent for the form (avoids a flash).
  const bootstrap = `
    <script>window.__ALYAF_SETTINGS__=${settingsJson};window.__ALYAF_CATALOG__=${catalogJson};</script>
  `;

  const finalHtml = headerHtml + body + bootstrap + footerHtml;

  // Write to public/ar/index.html
  const outDir = join(ROOT, 'public', 'ar');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), finalHtml, 'utf8');
  console.log('[build] wrote public/ar/index.html (%d bytes)', finalHtml.length);

  // Also write /api/catalog as a static JSON file (for clients that
  // fetch directly when the worker is unreachable).
  const apiDir = join(ROOT, 'public', 'api');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(join(apiDir, 'catalog.json'),
    JSON.stringify({ catalog: JSON.parse(catalogJson), settings: JSON.parse(settingsJson) }),
    'utf8');
  console.log('[build] wrote public/api/catalog.json');

  // Root index.html → redirect to /ar/ (spec §3 irreversible decision)
  writeFileSync(join(ROOT, 'public', 'index.html'),
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="refresh" content="0;url=/ar/">' +
    '<link rel="canonical" href="/ar/">' +
    '<title>ألياف الشمال</title></head><body>' +
    '<a href="/ar/">ألياف الشمال — الصفحة الرئيسية</a></body></html>', 'utf8');
  console.log('[build] wrote public/index.html (redirect to /ar/)');
}

build().catch(err => { console.error(err); process.exit(1); });
