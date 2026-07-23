# ألياف الشمال — دليل التشغيل والتسليم (Handover / Ops)

> توثيق صادق وكامل للحالة الفعلية. اقرأه بالكامل قبل أي عمل.
> آخر تحديث: 2026-07-23.

---

## 0. ملخّص صادق بجملة واحدة

**الموقع العام (للزباين) شغّال تماماً؛ لكن لوحة التحكم (الأدمن) غير جاهزة للاستخدام حالياً** —
لسببين: (1) لا توجد آلية دخول فعّالة، و(2) migration `0004` لم يُطبَّق على القاعدة الحيّة فتفشل
استعلامات المنتجات. التفاصيل في §1 و§2.

---

## 1. الحالة الفعلية (Status) — بصدق

| المكوّن | الحالة الحقيقية |
|---|---|
| الموقع العام `alyaf-alshamal.pages.dev` | ✅ شغّال — hero + 16 صنف بصورهم + شبكة الفئات + قسم الشركة |
| فورم الطلبات → D1 → واتساب | ✅ شغّال ومختبَر (رقم مرجع AS-2607-…) |
| قاعدة D1 | ⚠️ migrations 0001,0002,0003,**0005** مطبّقة. **0004 غير مطبّق** (انظر §2) |
| الـWorker (API) | ✅ منشور (آخر نشر تلقائي نجح). **لكن استعلامات المنتجات تفشل بسبب نقص 0004** |
| لوحة التحكم `alyaf-alshamal-admin.pages.dev` | ❌ **غير قابلة للاستخدام الآن**: لا دخول فعّال + استعلامات مكسورة |
| ربط `/api/*` بالموقعين | ✅ عبر `_worker.js` + Service Binding `API` |
| النشر التلقائي (GitHub Actions) | ✅ يعمل على كل push إلى `main` (بعد ضبط سرّ `CLOUDFLARE_API_TOKEN`) |
| حماية الأدمن (Cloudflare Access) | ❌ **لم تُفعَّل، والقرار: استبدالها بتسجيل دخول داخلي بكلمة سر (لم يُبنَ بعد)** |
| مكتبة الصور R2 | ⚠️ الكود موجود، لكن **الـbucket غير منشأ والـbinding معلّق** — الرفع لا يعمل |
| سرّ الإيميل (Resend) | ⏳ غير مضبوط (الإيميل يصمت بأمان) |
| تحديث الموقع العام بعد تعديل اللوحة | ❌ **غير موصول** (انظر §9 — فجوة مهمة) |

---

## 2. المشكلة الحرجة الحالية: migration 0004 غير مطبّق

- سجل workflow "Run D1 migration" يُظهر تشغيلاً **واحداً فقط** = `0005_images.sql`.
  أي أن `0004_catalog_real.sql` **لم يُشغَّل على القاعدة الحيّة**.
- نتيجة ذلك في القاعدة الحيّة: جدول `products` فيه **12 صنف نائب** (لا 16)، **بلا عمود `image`**،
  لكن **مع عمود `image_id`** (من 0005).
- استعلامات الـWorker (`getCatalogForPublic`, `listProducts` في `queries.js`) تختار
  `p.image, p.image_id` معاً → العمود `image` غير موجود → **الاستعلام يفشل** →
  `/api/catalog` ولوحة المنتجات تعطي خطأ.
- **الموقع العام لا يتأثر** لأنه static (مطبوع من `generateFromSqlSeed` = 16 صنف بمسارات ثابتة).
- **الإصلاح**: شغّل `0004` عبر workflow (§7)، مدخلاً `0004_catalog_real.sql`. آمن: يضيف عمود
  `image`، يستبدل الـ12 النائبة بالـ16 الحقيقية (بيانات seed فقط؛ لا يمسّ الطلبات/الزباين).
  الترتيب 0005-ثم-0004 سليم (يلمسان أعمدة مختلفة).

---

## 3. المعمارية (Architecture)

```
  الزبون ──▶ alyaf-alshamal.pages.dev  (static + public/_worker.js)
                    │ Service Binding "API"  (public يحجب /api/admin/*)
                    ▼
            alyaf-alshamal-api (Worker, workers_dev=false) ──▶ D1: alyaf-alshamal
                    ▲                                          └▶ R2: IMAGES (معلّق حالياً)
                    │ Service Binding "API"
  المالك ──▶ alyaf-alshamal-admin.pages.dev  (static + dashboard/_worker.js يمرّر كل /api/*)
```

- الموقعان static؛ كل واحد فيه `_worker.js` بجذره يوجّه `/api/*` للـWorker عبر Service Binding
  `API`، ويخدم الباقي عبر `env.ASSETS`.
- الـWorker مقفول عن الإنترنت (`workers_dev=false`) — يُوصَل له **فقط** عبر الـbindings.
- `public/_worker.js` **يحجب** `/api/admin/*`. `dashboard/_worker.js` يمرّر كل `/api/*`.
- خدمة الصور العامة `GET /api/images/<id>` (غير admin) تمرّ عبر الموقع العام أيضاً.

---

## 4. الروابط والمعرّفات (ليست أسراراً)

| العنصر | القيمة |
|---|---|
| Repo | `Qays7753/fresh-cut` (public) — الفرع `main` |
| Cloudflare Account ID | `663413a9a3389b95eb5d970c6a7ef9d5` |
| D1 name / id | `alyaf-alshamal` / `4f5e819a-6049-4c1a-afd8-a22c4d4d0396` |
| Worker | `alyaf-alshamal-api` (بلا رابط عام) |
| Public Pages | `alyaf-alshamal` → https://alyaf-alshamal.pages.dev |
| Admin Pages | `alyaf-alshamal-admin` → https://alyaf-alshamal-admin.pages.dev |
| Service Binding (كلا مشروعي Pages) | `API` → `alyaf-alshamal-api` |
| إيميل إشعارات الطلبات (seed) | `businesses.access.25@gmail.com` |
| R2 bucket (مخطّط، غير منشأ) | `alyaf-alshamal-images` |

> الأسرار (توكنات/كلمات سر) لا تُوضع هنا إطلاقاً.

---

## 5. بنية المستودع

```
public/    _worker.js (يوجّه /api/*، يحجب /api/admin/*) + index.html, ar/index.html (مولّد),
           js/site.js, css/{tokens,site}.css, img/*.webp, api/catalog.json
dashboard/ _worker.js (يمرّر /api/*) + index.html, js/dashboard.js, css/dashboard.css
worker/    wrangler.toml (D1 DB, R2 IMAGES معلّق, workers_dev=false, ADMIN_ORIGIN)
           src/index.js (توجيه: /api/catalog, /api/leads, /api/images/<id>, /api/admin/*)
           src/queries.js (كل استعلامات D1 + audit()) · src/handlers/admin.js · src/email.js
migrations/ 0001_init · 0002_seed · 0003_kv_shim · 0004_catalog_real · 0005_images
build/     build-public.js (يولّد public/ar/index.html من generateFromSqlSeed أو D1) + templates/
.github/workflows/ deploy.yml (نشر تلقائي على push) · migrate.yml (تشغيل migration يدوي)
```

---

## 6. النشر (تلقائي عبر GitHub Actions)

- أي `push` إلى `main` → workflow `deploy.yml` ينشر: الـWorker + الموقع العام + لوحة التحكم.
- يتطلب سرّ مستودع واحد: **`CLOUDFLARE_API_TOKEN`** (مضبوط) بصلاحيات:
  Workers Scripts:Edit · Cloudflare Pages:Edit · D1:Edit · Account Settings:Read.
- Account ID مضمّن في ملفّي الـworkflow.
- ⚠️ **`deploy.yml` ينشر ملفات `public/` المُلتزَمة كما هي — لا يشغّل البناء** (انظر §9).

---

## 7. تشغيل migrations (بضغطة زر، بدون Codespace)

Actions → **Run D1 migration** → Run workflow → أدخِل اسم الملف (مثلاً `0004_catalog_real.sql`)
→ Run. يشغّل `wrangler d1 execute alyaf-alshamal --remote --file=migrations/<الملف>`.

**المطبّق فعلاً:** 0001, 0002, 0003 (عبر Codespace مبكراً)، 0005 (عبر الـworkflow).
**غير مطبّق:** **0004** (يجب تشغيله — §2).

---

## 8. الأسرار (تُضبط على الـWorker: Settings → Variables and Secrets، أو `wrangler secret put`)

| السرّ | الغرض | الحالة |
|---|---|---|
| `RESEND_API_KEY` | إشعار إيميل للطلبات (resend.com) | غير مضبوط (اختياري) |
| `PUBLIC_DEPLOY_HOOK_URL` | إعادة بناء الموقع بعد تعديل | غير مضبوط (وغير كافٍ وحده — §9) |
| `MAIL_FROM` | مُرسِل Resend بعد توثيق دومين | غير مضبوط |
| (قادم) `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` | لتسجيل الدخول الداخلي | عند بناء الميزة |

---

## 9. فجوة مهمة: تعديلات اللوحة لا تظهر على الموقع العام تلقائياً

- الموقع العام static ومطبوع وقت البناء. `deploy.yml` ينشر `public/ar/index.html` المُلتزَم
  **كما هو، دون تشغيل `npm run build`**.
- حتى لو شُغِّل البناء، `build-public.js` بلا متغيرات بيئة يستخدم `generateFromSqlSeed()`
  (16 صنف ثابتة) **لا القاعدة الحيّة**. لجلب تعديلات D1 يلزم تشغيل البناء بمتغيرات
  `D1_DATABASE_ID` + `CF_API_TOKEN` + `CF_ACCOUNT_ID` (المسار `build:live`).
- **النتيجة الصادقة:** لو عدّل المالك صنفاً/سعراً/نصاً من اللوحة (يُكتب في D1)، **لن يظهر على
  الموقع العام** بالوضع الحالي. حلقة «عدّل في اللوحة → يظهر على الموقع» **غير موصولة**.
- الحل المطلوب مستقبلاً: إما بناء بمتغيرات D1 في CI مع deploy hook، أو جعل الموقع يقرأ
  الكاتالوج وقت التشغيل من `/api/catalog` عبر البروكسي.

---

## 10. حالة تسجيل الدخول / الأمان (قرار متّخذ، غير منفّذ)

- Cloudflare Access **لم يُفعَّل**. الـWorker حالياً يتحقق من وجود ترويسة
  `Cf-Access-Jwt-Assertion` في `/api/admin/*`؛ وبما أن لا Access يحقنها، **كل طلبات الأدمن
  تُرجع 401** → اللوحة لا تحمّل بيانات.
- **القرار النهائي للمالك:** إلغاء Access واستبداله بـ**تسجيل دخول داخلي بكلمة سر** (خوفاً من
  طلب بطاقة عند تفعيل Zero Trust). هذه الميزة **لم تُبنَ بعد** — وهي المهمة الكبيرة القادمة
  (تشمل: نقطة `/api/admin/login`، session token موقّع، شاشة دخول باللوحة، وأسرار
  `ADMIN_PASSWORD_HASH` + `SESSION_SECRET`).
- مع إلغاء Access، **يجب تغيير تحقق الـWorker** من "وجود الترويسة" إلى "التحقق من session token"،
  وإلا يبقى الأدمن مكسوراً/غير آمن.

---

## 11. مكتبة الصور (R2) — الكود جاهز، البنية غير مفعّلة

- الكود (من commit `2a7a360`): جدول `images` (حذف منطقي)، أعمدة `image_id` على products/categories،
  رفع `POST /api/admin/images` (multipart → R2 + D1)، خدمة عامة `GET /api/images/<id>`، وقسم
  "الصور" في اللوحة (شبكة، رفع بمعاينة، تعديل، إخفاء، حذف منطقي، ربط بمنتج/فئة).
- **غير مفعّل:** الـR2 bucket `alyaf-alshamal-images` **غير منشأ**، والـbinding `[[r2_buckets]]`
  في `wrangler.toml` **معلّق**. الرفع يُرجع خطأ آمن، والخدمة العامة تُرجع 404 حتى التفعيل.
- التفعيل (لمرة واحدة): أنشئ الـbucket → أزل التعليق عن الـbinding → أعد النشر (push).
- الأصناف الـ16 الحالية تستخدم مسارات ثابتة `/img/<slug>.webp` (image_id فارغ) حتى تُربط بصور R2.

---

## 12. المهمة الكبيرة القادمة (مخطّطة)

بناء (عبر وكيل خارجي على `main`): **تسجيل دخول داخلي بكلمة سر** (يستبدل Access) +
**تحكم CMS كامل**: تحرير الأسعار (`variants.price`, `min_order`)، كشف كل النصوص/العناوين،
**منتقي صور (media picker)** داخل محرّر المنتج/الفئة/الهيرو، **رفع بالدفعة** (حتى ~50 صورة)،
مع التقيّد بالهوية البصرية (`alyaf-alshamal-reference-FINAL.md` + tokens)، والحذف المنطقي،
وaudit، وأفضل ممارسات UX/أداء/إتاحة.

---

## 13. قائمة تسليم لوكيل/شخص جديد

- [ ] اقرأ هذا الملف بالكامل، وابدأ من آخر `main` (`git pull`).
- [ ] **أولاً أصلِح §2**: شغّل migration `0004` عبر الـworkflow، وتحقّق أن جدول products صار 16 صفاً
      وفيه العمودان `image` و`image_id`.
- [ ] الأمان: نفّذ تسجيل الدخول الداخلي (§10) — بدونه اللوحة غير قابلة للاستخدام.
- [ ] لتفعيل رفع الصور: خطوة R2 (§11).
- [ ] عالج فجوة الحلقة (§9) إن أردت أن تظهر تعديلات اللوحة على الموقع.
- [ ] لا حذف فعلي (deleted_at فقط)، وكل تعديل عبر `audit()`، والتزم بالهوية البصرية.
- [ ] كل تغيير على `main` ينشر تلقائياً على الموقع الحي — تحقّق من البناء قبل الدفع.
