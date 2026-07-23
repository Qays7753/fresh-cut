# ألياف الشمال — دليل التشغيل والتسليم (Handover / Ops)

> ملف توثيق لكل تفاصيل النشر المهمة. اقرأه قبل أي تعديل، وسلّمه لأي شخص يستلم المشروع.
> آخر تحديث: 2026-07-22.

---

## 1. الحالة الحالية (Status)

| المكوّن | الحالة |
|---|---|
| قاعدة البيانات D1 | ✅ منشورة + الجداول مبنية + البيانات النائبة محمّلة |
| الـWorker (API) | ✅ منشور وشغّال |
| الموقع العام | ✅ منشور وشغّال — **الفورم يحفظ الطلبات بنجاح** |
| لوحة التحكم (dashboard) | ⚠️ منشورة لكن **غير محميّة بعد** — لازم Cloudflare Access |
| ربط `/api/*` بالموقعين | ✅ شغّال عبر `_worker.js` + Service Binding |
| سرّ الإيميل (Resend) | ⏳ لم يُضبط بعد (الإيميل معطّل بأمان لحين ضبطه) |
| Deploy hook (تحديث تلقائي) | ⏳ لم يُضبط بعد |
| استبدال المحتوى النائب + الصور | ⏳ لم يبدأ |
| **إدارة الصور عبر R2** | ⏳ الكود جاهز، يحتاج: إنشاء bucket + تفعيل binding + تشغيل migration (راجع §11) |

### المتبقّي (Do next)
1. **redeploy the worker from latest `main`** لإزالة نقطة الفحص المؤقتة `/api/debug-write` (إن لم تُزَل بعد).
2. **Cloudflare Access** على `alyaf-alshamal-admin.pages.dev` (راجع §7).
3. ضبط الأسرار: `RESEND_API_KEY`، `PUBLIC_DEPLOY_HOOK_URL` (راجع §5).
4. تنظيف بيانات الفحص من D1 (راجع §8).
5. استبدال الأصناف الـ12 والنصوص النائبة `[[...]]` من لوحة التحكم، ورفع الصور الحقيقية إلى `public/img/`.

---

## 2. المعمارية (Architecture)

```
                         ┌───────────────────────────┐
   الزبون (متصفح) ───────▶│  alyaf-alshamal.pages.dev  │  (الموقع العام - static + _worker.js)
                         │   _worker.js يوجّه /api/*  │
                         └─────────────┬─────────────┘
                                       │ Service Binding (API)
                                       ▼
                         ┌───────────────────────────┐        ┌──────────────┐
                         │   alyaf-alshamal-api       │───────▶│  D1 database │
                         │   (Worker, لا رابط عام)     │        │ alyaf-alshamal│
                         └─────────────▲─────────────┘        └──────────────┘
                                       │ Service Binding (API)
   المالك (بعد Access) ───────────────┐│
                         ┌────────────┴┴────────────────┐
                         │ alyaf-alshamal-admin.pages.dev│ (لوحة التحكم - محميّة بـAccess)
                         │  _worker.js يوجّه /api/*      │
                         └───────────────────────────────┘
```

- الموقعان **static** (ملفات جاهزة). كل موقع فيه `_worker.js` بجذره يوجّه `/api/*` للـWorker عبر **Service Binding** اسمه `API`، ويخدم باقي الملفات عبر `env.ASSETS`.
- الـWorker **مقفول عن الإنترنت** (`workers_dev = false`) — يُوصَل له **فقط** عبر الـbindings. هذا يمنع أي وصول مباشر لأوامر الإدارة.
- الموقع العام **يحجب** `/api/admin/*` (غير مصرّح). لوحة التحكم تمرّر `/api/admin/*` لأنها خلف Cloudflare Access.
- الكاتالوج مطبوع في HTML وقت البناء (لا استعلامات قاعدة بيانات من المتصفح). الفورم يرسل `POST /api/leads`.

---

## 3. الروابط والمعرّفات (URLs & IDs)

| العنصر | القيمة |
|---|---|
| Repo | `Qays7753/fresh-cut` — الفرع الأساسي `main` |
| Cloudflare Account ID | `663413a9a3389b95eb5d970c6a7ef9d5` |
| D1 database name | `alyaf-alshamal` |
| D1 database_id | `4f5e819a-6049-4c1a-afd8-a22c4d4d0396` (مثبّت في `worker/wrangler.toml`) |
| Worker | `alyaf-alshamal-api` (بلا رابط عام — `workers_dev=false`) |
| Public Pages project | `alyaf-alshamal` → https://alyaf-alshamal.pages.dev |
| Admin Pages project | `alyaf-alshamal-admin` → https://alyaf-alshamal-admin.pages.dev |
| Service Binding (على كلا مشروعي Pages) | Variable name: `API` → Service: `alyaf-alshamal-api` |
| إيميل إشعارات الطلبات (في البيانات النائبة) | `businesses.access.25@gmail.com` — يُعدّل من صفحة الإعدادات |

> ملاحظة: `Account ID` و `database_id` معرّفات تشغيلية (ليست أسراراً) وموجودة أصلاً في المستودع. **مفاتيح الـAPI والأسرار لا تُوضع هنا أبداً.**

---

## 4. بنية المستودع (Repo layout)

```
public/            # الموقع العام (static)
  _worker.js       # يوجّه /api/* للـWorker، يحجب /api/admin/*، ويخدم static
  index.html, js/site.js, css/, img/, ar/, api/catalog.json
dashboard/         # لوحة التحكم (static)
  _worker.js       # يمرّر /api/* للـWorker (خلف Access)
  index.html, js/dashboard.js, css/
worker/            # الـWorker (API)
  wrangler.toml    # فيه database_id + workers_dev=false + ADMIN_ORIGIN
  src/index.js     # نقطة الدخول: /api/catalog, /api/leads, /api/admin/*
  src/queries.js   # كل استعلامات D1
  src/handlers/admin.js  # موجّه /api/admin/* + يستدعي deploy hook بعد التعديلات
  src/email.js     # إشعار الإيميل عبر Resend (يصمت بأمان بلا مفتاح)
migrations/        # 0001_init (الجداول), 0002_seed (نائب), 0003_kv_shim
```

---

## 5. الأسرار المطلوبة (Secrets) — تُضبط من لوحة Cloudflare

على مشروع الـWorker `alyaf-alshamal-api`: **Settings → Variables and Secrets → Add (Secret)**
أو من الـCLI: `npx wrangler secret put <NAME>` من مجلد `worker`.

| السرّ | لماذا | إلزامي؟ |
|---|---|---|
| `RESEND_API_KEY` | إشعار إيميل عند كل طلب جديد (عبر resend.com) | اختياري — بدونه الإيميل يصمت، والفورم والطلبات تعمل عادي |
| `PUBLIC_DEPLOY_HOOK_URL` | يعيد بناء الموقع العام تلقائياً بعد تعديل الأصناف/الإعدادات | اختياري |
| `MAIL_FROM` | عنوان المُرسِل بعد توثيق دومين في Resend | اختياري (الافتراضي سندبوكس Resend) |

> ⚠️ عنوان مُرسِل Resend الافتراضي (`onboarding@resend.dev`) يصل فقط لإيميل صاحب حساب Resend. لإرسال لأي عنوان، وثّق دوميناً في Resend واضبط `MAIL_FROM`.

---

## 6. كيف تنشر تعديلات (Deploy)

النشر حالياً **يدوي من Codespace** (أو أي جهاز فيه Node). خطوات لمرة واحدة:

1. افتح Codespace من المستودع (زر `Code` → Codespaces)، أو استخدم جهازك.
2. اضبط مصادقة Cloudflare عبر **API token** (لأن `wrangler login` OAuth لا يعمل داخل Codespaces):
   ```bash
   export CLOUDFLARE_API_TOKEN=<token>
   export CLOUDFLARE_ACCOUNT_ID=663413a9a3389b95eb5d970c6a7ef9d5
   ```
   **صلاحيات التوكن المطلوبة** (Custom Token على dash.cloudflare.com/profile/api-tokens):
   - Account → **Workers Scripts** → Edit
   - Account → **Cloudflare Pages** → Edit
   - Account → **D1** → Edit
   - Account → **Account Settings** → Read
3. النشر:
   ```bash
   # الـWorker
   cd worker && npx wrangler deploy && cd ..
   # الموقع العام (يجب أن يظهر "Compiled Worker successfully")
   npx wrangler pages deploy public    --project-name=alyaf-alshamal       --commit-dirty=true
   # لوحة التحكم
   npx wrangler pages deploy dashboard --project-name=alyaf-alshamal-admin --commit-dirty=true
   ```

> 💡 مستقبلاً يمكن التحويل لنشر تلقائي عبر ربط GitHub، لكنه يحتاج ضبطاً دقيقاً لإعدادات البناء مع `_worker.js`. النشر اليدوي أعلاه موثوق ويكفي.

### تشغيل migrations جديدة (نادراً)
```bash
cd worker
npx wrangler d1 execute alyaf-alshamal --remote --file=../migrations/XXXX.sql
```

---

## 7. حماية لوحة التحكم — Cloudflare Access (إلزامي)

1. dash.cloudflare.com → **Zero Trust** → (أول مرة: team name + خطة **Free**).
2. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `alyaf-admin`
   - Public hostname: `alyaf-alshamal-admin` . `pages.dev`
3. **Policy**: name `allowed-team`, Action **Allow**, Include → **Emails** → الإيميلات الثلاثة المسموحة.
4. Save. اختبر بتبويب خفي: يجب أن يطلب دخولاً بالإيميل (رمز PIN).

**كيف يعمل الأمان:** Access يوثّق المستخدم على الحافة ويحقن ترويسة `Cf-Access-Jwt-Assertion`. الـWorker يتحقق من وجودها في `/api/admin/*`. بما أن الـWorker مقفول عن الإنترنت (§2) والموقع العام يحجب `/api/admin/*`، فالطريق الوحيد لأوامر الإدارة هو عبر لوحة التحكم المحميّة بـAccess.

---

## 8. تنظيف بيانات الفحص (Cleanup)

خلال التشخيص أُنشئت بيانات فحص. نظّفها من **D1 → Console**:
```sql
DELETE FROM lead_events WHERE lead_id IN (SELECT id FROM leads WHERE source IN ('debug'));
DELETE FROM leads WHERE source IN ('debug') OR ref='AS-2607-002';
DELETE FROM contacts WHERE restaurant_id IN (SELECT id FROM restaurants WHERE name='__debug__');
DELETE FROM restaurants WHERE name='__debug__';
DELETE FROM audit_log WHERE actor='debug';
```
(عدّل `ref='AS-2607-002'` حسب أي طلبات تجريبية أرسلتها من الفورم.)

---

## 9. مطبّات مهمة تعلّمناها (Gotchas)

1. **migrations لا تُشغَّل من D1 Console** — الـConsole ينفّذ جملة واحدة فقط. استخدم `wrangler d1 execute --remote --file=...`.
2. **استخدم `_worker.js` لا مجلد `functions/`** — `wrangler pages deploy <dir>` لم يكتشف `<dir>/functions` ورفعه كملف static، فسقطت كل طلبات `/api/*` على الموقع الثابت. الحل: `_worker.js` بجذر مجلد النشر (تكتشفه Pages دائماً — يظهر `Compiled Worker successfully`).
3. **Service Binding إلزامي** — الـWorker مقفول (`workers_dev=false`)، فبدون binding اسمه `API` على كل مشروع Pages تُرجع الدالة `502 api_binding_missing`. البايندنغ يُفعّل بعد أول نشر (أو أعد النشر).
4. **صلاحيات التوكن** — توكن D1 وحده لا ينشر Workers/Pages. راجع §6.
5. **لا تلصق أي token/secret في محادثات أو رسائل** — فقط في الترمينال/لوحة Cloudflare. إذا انكشف، اعمل Roll فوراً.

---

## 10. قائمة تسليم لشخص آخر (Handover checklist)

- [ ] امنح الشخص وصولاً للمستودع `Qays7753/fresh-cut` وحساب Cloudflare (أو Account member).
- [ ] عرّفه على هذا الملف (`HANDOVER.md`) و `README.md`.
- [ ] سلّمه المعرّفات في §3 (ليست أسراراً).
- [ ] هو ينشئ **API token خاص به** (§6) — لا تشارك توكنك.
- [ ] أضف إيميله في سياسة Access (§7) إن احتاج لوحة التحكم.
- [ ] راجع سوياً "المتبقّي" في §1.

---

## 11. إدارة الصور عبر R2 (Image Management)

ميزة إدارة الصور الكاملة من لوحة التحكم: رفع، تحرير، إخفاء، حذف منطقي، وربط صورة بمنتج أو فئة. الصور تُخزَّن في **Cloudflare R2**، والمصفوفات في جدول `images` في D1.

### المعمارية

```
لوحة التحكم ─── POST /api/admin/images (multipart) ──▶ Worker
                                                          ├── env.IMAGES.put(r2Key, bytes)  → R2 bucket
                                                          └── INSERT INTO images (...)      → D1

الموقع العام ─── <img src="/api/images/<id>"> ──▶ Worker
                                                    ├── SELECT * FROM images WHERE id=?
                                                    └── env.IMAGES.get(r2_key)         → R2 bytes
                                                       (Cache-Control: public, max-age=31536000, immutable)
```

- الـWorker يخدم الصور على `/api/images/<id>` (مسار عام، **ليس** تحت `/api/admin/*` الذي يحجبه `public/_worker.js`).
- الصور تُخزَّن بـ`r2_key` فريد (`img_<timestamp>_<random>.<ext>`) — لا يتغيّر أبداً، لذا يُخزَّن مؤقتاً للأبد (`immutable`).
- الحذف **منطقي** فقط: `UPDATE images SET deleted_at = ...`. لا يُحذف أي صف من D1، ولا يُحذف أي كائن من R2.
- كل عملية كتابة تمرّ عبر `audit()` في `queries.js`.

### الإعداد لمرة واحدة (إلزامي لتفعيل الرفع)

> الميزة تتحمّل غياب R2 بأمان: الـWorker يُنشَر دون مشاكل، والقائمة/التحرير/الربط تعمل (D1 فقط)، والرفع يُرجع خطأ واضحاً حتى يُفعَّل R2.

1. **أنشئ R2 bucket:**
   ```bash
   cd worker
   npx wrangler r2 bucket create alyaf-alshamal-images
   ```

2. **فعّل الـbinding في `worker/wrangler.toml`:** أزل التعليق `#` عن هذا المقطع:
   ```toml
   [[r2_buckets]]
   binding       = "IMAGES"
   bucket_name   = "alyaf-alshamal-images"
   ```

3. **أعد نشر الـWorker:**
   ```bash
   cd worker && npx wrangler deploy
   ```
   (أو ادفع على `main` — GitHub Actions سينشر تلقائياً.)

4. **شغّل migration الصور:**
   ```bash
   cd worker
   npx wrangler d1 execute alyaf-alshamal --remote --file=../migrations/0005_images.sql
   ```
   هذا ينشئ جدول `images`، ويضيف عمود `image_id` على `products` و`categories`، ويضيف مفاتيح إعدادات اختيارية (`hero_image_id`, `why_image_id`, `sample_image_id`).

5. **(اختياري) أضف binding الـR2 على مشروعي Pages أيضاً** إذا أردت خدمة الصور مباشرة من R2 عبر Pages مستقبلاً. حالياً خدمة الصور تمرّ عبر الـWorker فقط، فلا حاجة لذلك الآن.

### الاستخدام من لوحة التحكم

- افتح `https://alyaf-alshamal-admin.pages.dev/#images` (أو اضغط على أيقونة + من أي صفحة صور).
- **رفع صورة:** اضغط زر + → اختر ملف → اقرأ المعاينة والأبعاد تلقائياً → اختر النوع (صنف/فئة/رئيسية/شركة) → اكتب نصاً بديلاً عربياً → (اختياري) اربط بمنتج أو فئة → اضغط «رفع».
- **تحرير:** اضغط «تحرير» على أي صورة → عدّل النوع/النص البديل/الأبعاد → احفظ.
- **ربط:** اضغط «ربط» → اختر منتجاً أو فئة → اضغط «ربط». (الربط يضبط `image_id` على المنتج/الفئة، ويفرغ `image` القديم للمنتج.)
- **إخفاء/إظهار:** يضبط `visible=0/1`. الصورة المخفية لا تظهر على الموقع العام (الـendpoint يُرجع 404).
- **حذف (منطقي):** يضبط `deleted_at`. الصورة تختفي من اللوحة لكنها تبقى في D1 و R2 للاسترجاع.
- **فك الربط:** اضغط «ربط» ثم اختر «— بدون ربط —» (أو من تحرير المنتج/الفئة مباشرة).

### كيف تظهر الصور على الموقع العام

- **المنتجات:** إذا ضُبط `image_id`، يصدر الـbuild وسم `<img src="/api/images/<id>">`. إذا لم يكن مضبوطاً، يقع fallback على `image` (المسار الثابت مثل `/img/foo.webp`).
- **الفئات:** نفس المنطق — `image_id` أولاً، ثم fallback على ملف `cat-*.webp` الثابت.
- **Hero / Why / Sample:** حالياً تقرأ من مسارات ثابتة (`/img/hero.webp` إلخ). يمكن ربطها بصور R2 مستقبلاً عبر مفاتيح الإعدادات `hero_image_id` / `why_image_id` / `sample_image_id` (الـmigration 0005 أضافها).

### مبادئ التصميم (لا تُكسر)

1. **الحذف منطقي دائماً:** `UPDATE ... SET deleted_at = ...`. لا `DELETE` في أي مكان.
2. **audit log لكل عملية:** كل كتابة على `images` أو `products.image_id` أو `categories.image_id` تمرّ عبر `audit()`.
3. **الصور غير المرتبطة تبقى في المكتبة:** لا تُضاف منتجات لمطابقة الصور. الصورة تُرفع أولاً، ثم تُربط لاحقاً (أو تبقى غير مرتبطة).
4. **أبعاد صريحة:** الرفع يقرأ `width/height` من المتصفح ويخزّنهما في D1. الـbuild يصدر `width="..." height="..."` صريحين (يمنع CLS).
5. **lazy loading:** كل صورة تحت الطيّة `loading="lazy"` (عدا hero إذا رُبطت لاحقاً).
6. **Caching:** `Cache-Control: public, max-age=31536000, immutable` — لأن `r2_key` فريد لكل رفع.
7. **degrade safely:** غياب `env.IMAGES` لا يكسر النشر؛ الرفع يُرجع `{error:'r2_not_configured'}`، والـendpoint العام يُرجع 404.
8. **المسار العام:** خدمة الصور على `/api/images/*` (ليس `/api/admin/*` الذي يحجبه `public/_worker.js`).
9. **لا حذف من R2:** حتى لو حُذفت الصورة منطقياً من D1، الكائن يبقى في R2 (للاسترجاع). حذف R2 فعلي يتطلب إجراءً يدوياً منفصلاً.
