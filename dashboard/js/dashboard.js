// dashboard/js/dashboard.js
// =============================================================
// Alyaf Al-Shamal — mobile-first admin app. Single HTML file,
// additive JS. No framework. Spec §7.
//
// Pages: Today, Leads, Products, Settings, Restaurants,
//        Cuts/Categories, Data-view, Private links
// Bottom nav (not side), 48px touch targets, offline read.
// =============================================================

(function () {
  'use strict';

  var API = '/api/admin';
  var state = {
    activePage: 'today',
    online: navigator.onLine,
    products: [],
    categories: [],
    cuts: [],
    selectedProductIds: new Set(),
    settings: {},
    authed: localStorage.getItem('alyaf_admin_authed') === '1',
  };

  // =========================================================
  // Boot
  // =========================================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupLogin();
    setupLogout();
    setupNav();
    setupOnlineToggle();
    setupFab();
    setupSearch();
    setupModal();
    if (state.authed) {
      showApp();
      navigate('today');
    } else {
      showLogin();
    }
  }

  // =========================================================
  // Auth — login overlay + 401 handling
  // =========================================================
  function setupLogin() {
    var form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = document.getElementById('login-password').value;
      var err = document.querySelector('[data-login-error]');
      var btn = document.querySelector('[data-login-submit]');
      if (err) { err.hidden = true; err.textContent = ''; }
      if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الدخول…'; }

      // Direct fetch — bypasses api() because api() throws on 401.
      fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      }).then(function (r) {
        if (r.status === 401) {
          if (err) { err.hidden = false; err.textContent = 'كلمة المرور غير صحيحة'; }
          if (btn) { btn.disabled = false; btn.textContent = 'دخول'; }
          return null;
        }
        if (r.status === 429) {
          if (err) { err.hidden = false; err.textContent = 'محاولات كثيرة. حاول بعد ساعة.'; }
          if (btn) { btn.disabled = false; btn.textContent = 'دخول'; }
          return null;
        }
        return r.json();
      }).then(function (res) {
        if (!res) return;
        if (res.ok) {
          localStorage.setItem('alyaf_admin_authed', '1');
          state.authed = true;
          document.getElementById('login-password').value = '';
          showApp();
          navigate('today');
        } else {
          if (err) { err.hidden = false; err.textContent = res.error || 'تعذّر الدخول'; }
        }
        if (btn) { btn.disabled = false; btn.textContent = 'دخول'; }
      }).catch(function () {
        if (err) { err.hidden = false; err.textContent = 'تعذّر الاتصال بالخادم.'; }
        if (btn) { btn.disabled = false; btn.textContent = 'دخول'; }
      });
    });
  }

  function setupLogout() {
    var btn = document.querySelector('[data-logout]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      fetch(API + '/logout', { method: 'POST' }).catch(function () {}).finally(function () {
        localStorage.removeItem('alyaf_admin_authed');
        state.authed = false;
        showLogin();
      });
    });
  }

  function showLogin() {
    state.authed = false;
    document.body.dataset.authed = 'false';
    document.querySelector('.admin-login').dataset.authed = 'false';
    var pw = document.getElementById('login-password');
    if (pw) pw.focus();
  }

  function showApp() {
    state.authed = true;
    document.body.dataset.authed = 'true';
    document.querySelector('.admin-login').dataset.authed = 'true';
  }

  // =========================================================
  // Navigation (single-page, hash-based)
  // =========================================================
  function setupNav() {
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(el.dataset.nav);
      });
    });
    window.addEventListener('hashchange', function () {
      var page = (location.hash || '#today').slice(1);
      navigate(page);
    });
  }

  function navigate(page) {
    state.activePage = page;
    document.querySelectorAll('.admin-section').forEach(function (s) {
      s.dataset.active = (s.dataset.page === page) ? 'true' : 'false';
    });
    document.querySelectorAll('.admin-bottom-nav__item').forEach(function (n) {
      n.dataset.active = (n.dataset.nav === page) ? 'true' : 'false';
    });
    location.hash = page;

    // Lazy-load each page's data
    if (page === 'today')      loadToday();
    if (page === 'leads')      loadLeads();
    if (page === 'products')   loadProducts();
    if (page === 'settings')   loadSettings();
    if (page === 'restaurants')loadRestaurants();
    if (page === 'cuts')       loadCuts();
    if (page === 'categories') loadCategories();
    if (page === 'data')       loadDataView();
    if (page === 'links')      loadPrivateLinks();
    if (page === 'images')     loadImages();

    // Show FAB on products (quick-add) and images (upload)
    var fab = document.querySelector('.admin-fab');
    if (fab) fab.style.display = (page === 'products' || page === 'images') ? 'inline-flex' : 'none';
  }

  // =========================================================
  // Online / offline
  // =========================================================
  function setupOnlineToggle() {
    window.addEventListener('online', function () {
      state.online = true;
      toast('عاد الاتصال. يتم المزامنة.');
      syncPending();
    });
    window.addEventListener('offline', function () {
      state.online = false;
      toast('أنت غير متصل — القراءة تعمل، التعديلات تُحفظ محلياً.');
    });
  }

  function toast(msg) {
    var t = document.querySelector('.admin-toast');
    if (!t) return;
    t.textContent = msg;
    t.dataset.visible = 'true';
    setTimeout(function () { t.dataset.visible = 'false'; }, 3000);
  }

  function syncPending() {
    try {
      var q = JSON.parse(localStorage.getItem('alyaf_admin_queue') || '[]');
      if (!q.length) return;
      // Best-effort: replay each pending mutation.
      q.forEach(function (job) {
        fetch(job.url, job.opts).catch(function () {});
      });
      localStorage.removeItem('alyaf_admin_queue');
    } catch (e) {}
  }

  // =========================================================
  // API helper — degrades gracefully offline
  // =========================================================
  function api(path, opts) {
    if (!state.online) {
      // Queue the mutation for later sync, return cached data if any.
      if (opts && opts.method && opts.method !== 'GET') {
        try {
          var q = JSON.parse(localStorage.getItem('alyaf_admin_queue') || '[]');
          q.push({ url: API + '/' + path, opts: opts });
          localStorage.setItem('alyaf_admin_queue', JSON.stringify(q));
        } catch (e) {}
        return Promise.reject(new Error('offline'));
      }
      return readFromCache(path);
    }
    return fetch(API + '/' + path, opts).then(function (r) {
      // 401 → session expired or never had one. Show login overlay.
      if (r.status === 401) {
        showLogin();
        throw new Error('unauthorized');
      }
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (data) {
      writeToCache(path, data);
      return data;
    });
  }

  function readFromCache(path) {
    try {
      var v = localStorage.getItem('alyaf_cache:' + path);
      return Promise.resolve(v ? JSON.parse(v) : null);
    } catch (e) { return Promise.resolve(null); }
  }
  function writeToCache(path, data) {
    try { localStorage.setItem('alyaf_cache:' + path, JSON.stringify(data)); } catch (e) {}
  }

  // =========================================================
  // Today page
  // =========================================================
  function loadToday() {
    api('today').then(function (d) {
      if (!d) return;
      var el = document.querySelector('[data-today]');
      if (!el) return;
      el.innerHTML = `
        <a class="today-task" href="#leads">
          <span class="today-task__count">${d.newLeadsOverdue || 0}</span>
          <span class="today-task__label">ليد جديد لم يتم التواصل معه منذ أكثر من 48 ساعة</span>
          <span class="today-task__arrow">←</span>
        </a>
        <a class="today-task" href="#leads">
          <span class="today-task__count">${d.samplesOverdue || 0}</span>
          <span class="today-task__label">عيّنة وعد بها ولم تُرسل منذ أكثر من 3 أيام</span>
          <span class="today-task__arrow">←</span>
        </a>
        <a class="today-task" href="#products">
          <span class="today-task__count">${d.staleOutItems || 0}</span>
          <span class="today-task__label">صنف موسوم «غير متوفّر اليوم» منذ أكثر من 3 أيام</span>
          <span class="today-task__arrow">←</span>
        </a>
      `;
    }).catch(function () {
      var el = document.querySelector('[data-today]');
      if (el) el.innerHTML = '<p class="admin-card">تعذّر تحميل البيانات.</p>';
    });
  }

  // =========================================================
  // Leads
  // =========================================================
  function loadLeads() {
    api('leads').then(function (leads) {
      if (!leads) return;
      var el = document.querySelector('[data-leads]');
      if (!el) return;
      if (!leads.length) {
        el.innerHTML = '<p class="admin-card">لا توجد ليds حالياً.</p>';
        return;
      }
      el.innerHTML = leads.map(function (l) {
        var overdue = (l.status === 'new' && isOverdue(l.created_at, 48)) ? 'true' : 'false';
        var statusLabel = leadStatusLabel(l.status);
        return `
          <a class="lead-card" data-overdue="${overdue}" href="#lead-${l.id}">
            <span class="lead-card__ref">${l.ref || '—'}</span>
            <div class="lead-card__name">${esc(l.restaurant_name || '—')}</div>
            <div class="lead-card__meta">
              <span>${esc(l.contact_name || '—')}</span>
              <span><bdi dir="ltr">${esc(l.contact_phone || '—')}</bdi></span>
              <span>${esc(l.restaurant_area || '—')}</span>
              <span>${formatDate(l.created_at)}</span>
            </div>
            <span class="lead-card__status">${statusLabel}</span>
          </a>
        `;
      }).join('');
    }).catch(function () {
      var el = document.querySelector('[data-leads]');
      if (el) el.innerHTML = '<p class="admin-card">تعذّر تحميل الليds.</p>';
    });
  }

  function leadStatusLabel(s) {
    return ({
      new: 'جديد',
      contacted: 'تم التواصل',
      sample_sent: 'أُرسلت العيّنة',
      sample_tried: 'جُرّبت العيّنة',
      converted: 'تم التحويل',
      rejected: 'مرفوض',
      reopened: 'إعادة فتح',
    })[s] || s;
  }

  // =========================================================
  // Products (bulk edit, three-field quick add)
  // =========================================================
  function loadProducts() {
    api('products').then(function (products) {
      if (!products) return;
      state.products = products;
      renderProducts(products);
    });
  }

  function renderProducts(products) {
    var el = document.querySelector('[data-products]');
    if (!el) return;
    if (!products.length) {
      el.innerHTML = '<p class="admin-card">لا توجد أصناف. استخدم زر + لإضافة صنف جديد.</p>';
      return;
    }
    el.innerHTML = products.map(function (p) {
      return `
        <div class="product-row">
          <input class="product-row__check" type="checkbox" data-product-id="${p.id}">
          <div>
            <div class="product-row__name">${esc(p.name_ar)}</div>
            <div class="product-row__meta">${esc(p.category_name_ar || '—')} · ${p.variant_count} عبوة</div>
          </div>
          <div class="row-actions">
            <button class="row-actions__btn row-actions__btn--primary"
                    onclick="window.__editProduct('${p.id}')">تحرير</button>
            <button class="row-actions__btn row-actions__btn--danger"
                    onclick="window.__deleteProduct('${p.id}', ${JSON.stringify(esc(p.name_ar))})">حذف</button>
          </div>
        </div>
      `;
    }).join('');

    // Wire checkboxes for bulk edit
    el.querySelectorAll('.product-row__check').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) state.selectedProductIds.add(cb.dataset.productId);
        else state.selectedProductIds.delete(cb.dataset.productId);
        var toolbar = document.querySelector('.products-toolbar');
        if (toolbar) toolbar.dataset.selected = state.selectedProductIds.size > 0 ? 'true' : 'false';
      });
    });
  }

  // Full product editor: name, category, slug, summary, visibility,
  // sort order, image (via Media Picker), and variant sub-editor
  // (cut, pack_size, price, min_order, availability, add/delete rows).
  window.__editProduct = function (id) {
    Promise.all([
      api('products').catch(function () { return []; }),
      api('categories').catch(function () { return []; }),
      api('cuts').catch(function () { return []; }),
      api('variants/' + id).catch(function () { return []; }),
    ]).then(function (results) {
      var allProducts = results[0] || [];
      var categories = results[1] || [];
      var cuts = results[2] || [];
      var variants = results[3] || [];
      state.categories = categories;
      state.cuts = cuts;

      var p = allProducts.find(function (x) { return x.id === id; });
      if (!p) { toast('الصنف غير موجود.'); return; }

      var modal = document.querySelector('.admin-modal');
      modal.querySelector('[data-modal-title]').textContent = 'تحرير صنف: ' + (p.name_ar || '');
      var catOptions = categories.map(function (c) {
        return `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name_ar)}</option>`;
      }).join('');
      var cutOptions = cuts.map(function (c) {
        return `<option value="${c.id}">${esc(c.name_ar)}</option>`;
      }).join('');

      function variantRowHtml(v) {
        v = v || {};
        return `
          <div class="editor__variant-row" data-variant-id="${v.id || ''}">
            <div class="field">
              <label class="field__label">نوع القص</label>
              <select class="field__select" data-v-cut>
                <option value="">—</option>
                ${cutOptions}
              </select>
            </div>
            <div class="field">
              <label class="field__label">العبوة</label>
              <input class="field__input" type="text" data-v-pack value="${esc(v.pack_size || '1kg')}">
            </div>
            <div class="field">
              <label class="field__label">السعر</label>
              <input class="field__input" type="text" data-v-price value="${esc(v.price || '')}" placeholder="مثال: 2.5 د.أ">
            </div>
            <div class="field">
              <label class="field__label">التوفّر</label>
              <select class="field__select" data-v-avail>
                <option value="available" ${v.availability === 'available' ? 'selected' : ''}>متوفّر</option>
                <option value="out_today" ${v.availability === 'out_today' ? 'selected' : ''}>غير متوفّر اليوم</option>
                <option value="seasonal" ${v.availability === 'seasonal' ? 'selected' : ''}>موسمي</option>
              </select>
            </div>
            <button class="editor__variant-delete" type="button" data-v-delete aria-label="حذف العبوة">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>
              </svg>
            </button>
          </div>
        `;
      }

      modal.querySelector('[data-modal-body]').innerHTML = `
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ed-name">اسم الصنف</label>
          <input class="settings-row__input" id="ed-name" type="text" value="${esc(p.name_ar || '')}">
        </div>
        <div class="editor__field-group editor__field-group--2">
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ed-cat">الفئة</label>
            <select class="settings-row__input" id="ed-cat">${catOptions}</select>
          </div>
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ed-slug">المعرّف (slug)</label>
            <input class="settings-row__input" id="ed-slug" type="text" value="${esc(p.slug || '')}" dir="ltr">
          </div>
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ed-summary">وصف قصير (للبطاقة)</label>
          <textarea class="settings-row__textarea" id="ed-summary" rows="2">${esc(p.summary_ar || '')}</textarea>
        </div>
        <div class="editor__field-group editor__field-group--2">
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ed-sort">ترتيب الظهور</label>
            <input class="settings-row__input" id="ed-sort" type="number" value="${p.sort_order || 0}">
          </div>
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ed-visible">ظهور الصنف</label>
            <select class="settings-row__input" id="ed-visible">
              <option value="1" ${p.visible ? 'selected' : ''}>ظاهر</option>
              <option value="0" ${!p.visible ? 'selected' : ''}>مخفي</option>
            </select>
          </div>
        </div>

        <div class="admin-modal__row">
          <label class="settings-row__label">صورة الصنف</label>
          <div class="editor__image-pick">
            <div class="editor__image-preview ${p.image_id ? '' : 'editor__image-preview--empty'}" id="ed-img-preview">
              ${p.image_id ? '<img src="/api/images/' + p.image_id + '" alt="">' : 'لا صورة'}
            </div>
            <div style="display:flex;gap:var(--space-2);flex-direction:column">
              <button class="btn btn--secondary" type="button" id="ed-img-pick" style="block-size:40px">اختر صورة</button>
              <button class="btn btn--text" type="button" id="ed-img-clear" style="block-size:36px">إزالة</button>
            </div>
          </div>
        </div>

        <h3 style="font-size:var(--text-base);font-weight:var(--weight-bold);margin-block-start:var(--space-5);margin-block-end:var(--space-3)">العبوات (متغيّرات)</h3>
        <div id="ed-variants">
          ${variants.map(variantRowHtml).join('') || '<p style="font-size:var(--text-xs);color:var(--gray)">لا توجد عبوات بعد.</p>'}
        </div>
        <button class="editor__add-variant" type="button" id="ed-add-variant">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          إضافة عبوة
        </button>

        <div style="display:flex;gap:var(--space-3);margin-block-start:var(--space-5)">
          <button class="btn btn--primary" type="button" data-product-save>حفظ</button>
          <button class="btn btn--text" type="button" data-product-cancel>إلغاء</button>
        </div>
      `;
      modal.dataset.open = 'true';

      // Restore selected cut for each existing variant row
      var rows = modal.querySelectorAll('.editor__variant-row');
      variants.forEach(function (v, i) {
        if (rows[i] && v.cut_id) {
          var sel = rows[i].querySelector('[data-v-cut]');
          if (sel) sel.value = v.cut_id;
        }
      });

      // Image picker wiring
      var currentImageId = p.image_id || null;
      modal.querySelector('#ed-img-pick').addEventListener('click', function () {
        openMediaPicker({
          type: 'product',
          onPick: function (imageId) {
            currentImageId = imageId;
            var prev = modal.querySelector('#ed-img-preview');
            prev.classList.remove('editor__image-preview--empty');
            prev.innerHTML = '<img src="/api/images/' + imageId + '" alt="">';
          },
        });
      });
      modal.querySelector('#ed-img-clear').addEventListener('click', function () {
        currentImageId = null;
        var prev = modal.querySelector('#ed-img-preview');
        prev.classList.add('editor__image-preview--empty');
        prev.innerHTML = 'لا صورة';
      });

      // Add variant row
      modal.querySelector('#ed-add-variant').addEventListener('click', function () {
        var container = modal.querySelector('#ed-variants');
        var empty = container.querySelector('p');
        if (empty) empty.remove();
        container.insertAdjacentHTML('beforeend', variantRowHtml(null));
      });

      // Delete variant row (soft-delete on save if it had an id; just remove if new)
      modal.querySelector('#ed-variants').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-v-delete]');
        if (!btn) return;
        var row = btn.closest('.editor__variant-row');
        var vid = row.dataset.variantId;
        if (!vid) { row.remove(); return; }
        if (!confirm('حذف هذه العبوة؟ (حذف منطقي)')) return;
        api('variants/' + vid + '/delete', { method: 'POST' }).then(function () {
          row.remove();
          toast('حُذفت العبوة.');
        }).catch(function () { toast('تعذّر الحذف — سيتزامن لاحقاً.'); });
      });

      // Cancel
      modal.querySelector('[data-product-cancel]').addEventListener('click', function () {
        modal.dataset.open = 'false';
      });

      // Save
      modal.querySelector('[data-product-save]').addEventListener('click', function () {
        var fields = {
          name_ar: modal.querySelector('#ed-name').value.trim(),
          category_id: modal.querySelector('#ed-cat').value,
          slug: modal.querySelector('#ed-slug').value.trim(),
          summary_ar: modal.querySelector('#ed-summary').value.trim(),
          sort_order: parseInt(modal.querySelector('#ed-sort').value, 10) || 0,
          visible: parseInt(modal.querySelector('#ed-visible').value, 10),
          image_id: currentImageId,
        };
        if (!fields.name_ar) { toast('الاسم مطلوب.'); return; }
        if (!fields.slug) { toast('المعرّف (slug) مطلوب.'); return; }

        // Update product
        var updateP = api('products/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });

        // Update each existing variant row
        var variantUpdates = [];
        modal.querySelectorAll('.editor__variant-row').forEach(function (row) {
          var vid = row.dataset.variantId;
          var vFields = {
            cut_id: row.querySelector('[data-v-cut]').value,
            pack_size: row.querySelector('[data-v-pack]').value.trim() || '1kg',
            price: row.querySelector('[data-v-price]').value.trim() || null,
            availability: row.querySelector('[data-v-avail]').value,
          };
          if (vid) {
            variantUpdates.push(api('variants/' + vid, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(vFields),
            }));
          } else if (vFields.cut_id) {
            // New variant
            variantUpdates.push(api('variants', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign({ productId: id }, vFields)),
            }));
          }
        });

        Promise.all([updateP].concat(variantUpdates)).then(function () {
          modal.dataset.open = 'false';
          toast('حُفظ الصنف.');
          loadProducts();
        }).catch(function () { toast('بعض الحقول لم تُحفظ — سيتزامن لاحقاً.'); });
      });
    });
  };

  window.__deleteProduct = function (id, name) {
    if (!confirm('حذف الصنف «' + name + '»؟\n(حذف منطقي — يبقى في قاعدة البيانات للاسترجاع)')) return;
    api('products/' + id + '/delete', { method: 'POST' }).then(function () {
      toast('حُذف الصنف (حذف منطقي).');
      loadProducts();
    }).catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  // =========================================================
  // FAB + three-field quick-add modal (§7)
  // =========================================================
  function setupFab() {
    var fab = document.querySelector('.admin-fab');
    if (fab) fab.addEventListener('click', function () {
      if (state.activePage === 'images') openImageUpload();
      else openQuickAdd();
    });
  }

  function openQuickAdd() {
    var modal = document.querySelector('.admin-modal');
    if (!modal) return;
    modal.querySelector('[data-modal-title]').textContent = 'إضافة صنف';
    modal.querySelector('[data-modal-body]').innerHTML = `
      <div class="admin-modal__row">
        <label class="settings-row__label" for="qa-name">اسم الصنف</label>
        <input class="settings-row__input" id="qa-name" type="text" autocomplete="off">
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="qa-cat">الفئة</label>
        <select class="settings-row__input" id="qa-cat">
          <option value="cat_leafy">ورقيات</option>
          <option value="cat_onion_garlic">بصل وثوم</option>
          <option value="cat_roots">جذور</option>
          <option value="cat_mixes">خلطات جاهزة</option>
        </select>
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="qa-cut">نوع القص</label>
        <select class="settings-row__input" id="qa-cut">
          <option value="cut_chopped">مفروم</option>
          <option value="cut_sliced">مقطع شرائح</option>
          <option value="cut_diced">مكعبات</option>
          <option value="cut_grated">مبشور</option>
          <option value="cut_sticks">أصابع/باطوني</option>
          <option value="cut_julienne">جوليان</option>
          <option value="cut_crushed">مهرّس</option>
          <option value="cut_peeled">مقشّر</option>
          <option value="cut_cut">مقطّع</option>
        </select>
      </div>
      <button class="btn btn--primary" data-quick-add-save>حفظ</button>
    `;
    modal.dataset.open = 'true';
    modal.querySelector('[data-quick-add-save]').addEventListener('click', function () {
      var name = document.getElementById('qa-name').value.trim();
      var cat  = document.getElementById('qa-cat').value;
      var cut  = document.getElementById('qa-cut').value;
      if (!name) { toast('الاسم مطلوب'); return; }
      api('products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, categoryId: cat, cutId: cut, slug: null }),
      }).then(function () {
        modal.dataset.open = 'false';
        toast('أُضيف الصنف.');
        loadProducts();
      }).catch(function () { toast('تعذّر الحفظ — سيتزامن لاحقاً.'); });
    });
  }

  function setupModal() {
    var modal = document.querySelector('.admin-modal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.dataset.open = 'false';
    });
  }

  // =========================================================
  // Settings — every text on the public site
  // =========================================================
  // Arabic labels for every settings key, grouped by section.
  var SETTING_LABELS = {
    // معلومات الشركة
    brand_name: 'اسم العلامة التجارية',
    brand_name_en: 'الاسم بالإنجليزية',
    page_title: 'عنوان الصفحة (يظهر في التبويب)',
    meta_desc: 'وصف مختصر لمحركات البحث',
    whatsapp_number: 'رقم الواتساب',
    notification_email: 'إيميل استقبال الطلبات',
    // العمليات
    order_cutoff: 'آخر موعد للطلب',
    delivery_days: 'أيام التوصيل',
    delivery_areas: 'مناطق التوصيل',
    minimum_order: 'الحد الأدنى للطلب',
    replacement_policy: 'سياسة الاستبدال',
    payment_methods: 'طرق الدفع',
    // نصوص الواجهة — الهيرو
    hero_title: 'عنوان الهيرو الرئيسي',
    hero_support: 'سطر داعم تحت عنوان الهيرو',
    hero_cta: 'نص زر الهيرو',
    // شريط القيم
    value_point_1: 'نقطة قيمة 1',
    value_point_2: 'نقطة قيمة 2',
    value_point_3: 'نقطة قيمة 3',
    value_point_4: 'نقطة قيمة 4',
    // عناوين الأقسام
    catalog_heading: 'عنوان قسم الكتالوج',
    catalog_sub: 'وصف تحت عنوان الكتالوج',
    why_heading: 'عنوان قسم «لماذا نحن»',
    why_body: 'نص قسم «لماذا نحن»',
    sample_heading: 'عنوان قسم العيّنة',
    sample_body: 'نص قسم العيّنة',
    // الفورم
    form_heading: 'عنوان قسم التواصل',
    form_body: 'وصف قسم التواصل',
    data_use_line: 'سطر استخدام البيانات',
    // شاشة التأكيد
    confirm_title: 'عنوان شاشة التأكيد',
    confirm_body: 'نص شاشة التأكيد',
    confirm_cta: 'نص زر واتساب في التأكيد',
    // قوالب الواتساب
    wa_sample_template: 'قالب رسالة طلب العيّنة',
    wa_supply_template: 'قالب رسالة طلب التوريد',
    // الفوتر
    footer_rights: 'نص حقوق الفوتر',
    // صور الواجهة (image_id)
    hero_image_id: 'معرّف صورة الهيرو (اختياري)',
    why_image_id: 'معرّف صورة قسم «لماذا نحن» (اختياري)',
    sample_image_id: 'معرّف صورة قسم العيّنة (اختياري)',
  };

  // Group settings keys under Arabic headings for the settings page.
  var SETTING_GROUPS = [
    { title: 'معلومات الشركة', keys: ['brand_name','brand_name_en','page_title','meta_desc','whatsapp_number','notification_email'] },
    { title: 'العمليات والتوصيل', keys: ['order_cutoff','delivery_days','delivery_areas','minimum_order','replacement_policy','payment_methods'] },
    { title: 'الهيرو الرئيسي', keys: ['hero_title','hero_support','hero_cta'] },
    { title: 'شريط القيم', keys: ['value_point_1','value_point_2','value_point_3','value_point_4'] },
    { title: 'عناوين الأقسام', keys: ['catalog_heading','catalog_sub','why_heading','why_body','sample_heading','sample_body'] },
    { title: 'الفورم وشاشة التأكيد', keys: ['form_heading','form_body','data_use_line','confirm_title','confirm_body','confirm_cta'] },
    { title: 'قوالب الواتساب', keys: ['wa_sample_template','wa_supply_template'] },
    { title: 'الفوتر', keys: ['footer_rights'] },
    { title: 'صور الواجهة (متقدّم)', keys: ['hero_image_id','why_image_id','sample_image_id'] },
  ];

  function loadSettings() {
    api('settings').then(function (s) {
      if (!s) return;
      state.settings = s;
      var el = document.querySelector('[data-settings]');
      if (!el) return;

      // Render grouped settings; any key not in a group goes under "أخرى".
      var grouped = SETTING_GROUPS.map(function (g) {
        var rows = g.keys.filter(function (k) { return k in s; }).map(function (k) {
          return settingsRowHtml(k, s[k]);
        }).join('');
        if (!rows) return '';
        return '<div class="settings-group"><h3 class="settings-group__title">' + esc(g.title) + '</h3>' + rows + '</div>';
      }).join('');

      // Any keys not covered by SETTING_GROUPS go under "أخرى".
      var covered = {};
      SETTING_GROUPS.forEach(function (g) { g.keys.forEach(function (k) { covered[k] = true; }); });
      var others = Object.keys(s).filter(function (k) { return !covered[k]; }).sort();
      var othersHtml = '';
      if (others.length) {
        othersHtml = '<div class="settings-group"><h3 class="settings-group__title">أخرى</h3>' +
          others.map(function (k) { return settingsRowHtml(k, s[k]); }).join('') +
          '</div>';
      }

      el.innerHTML = grouped + othersHtml + `
        <button class="btn btn--primary" data-settings-save style="margin-block-start:var(--space-5)">حفظ الإعدادات</button>
      `;
      el.querySelector('[data-settings-save]').addEventListener('click', saveSettings);
    });
  }

  function settingsRowHtml(key, value) {
    var label = SETTING_LABELS[key] || key;
    var isImage = key.endsWith('_image_id');
    var hint = isImage ? 'معرّف صورة من المكتبة (ضع رقم الصورة أو اتركه فارغاً).' : 'قيمة نصية تظهر على الموقع العام.';
    return `
      <div class="settings-row">
        <div>
          <div class="settings-row__label">${esc(label)}</div>
          <div class="settings-row__hint">${hint} <code style="color:var(--gray);font-size:var(--text-xs)">${esc(key)}</code></div>
        </div>
        <textarea class="settings-row__textarea" data-setting-key="${esc(key)}">${esc(value || '')}</textarea>
      </div>
    `;
  }

  function saveSettings() {
    var rows = document.querySelectorAll('[data-setting-key]');
    var promises = [];
    rows.forEach(function (row) {
      var k = row.dataset.settingKey;
      var v = row.value;
      if (state.settings[k] !== v) {
        promises.push(api('settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: k, value: v }),
        }));
        state.settings[k] = v;
      }
    });
    Promise.all(promises).then(function () {
      toast('حُفظت الإعدادات.');
      triggerPublicRebuild();
    }).catch(function () { toast('بعض القيم لم تُحفظ — سيتزامن لاحقاً.'); });
  }

  // After settings/products change, fire the Cloudflare Pages
  // deploy hook to rebuild the static public site.
  function triggerPublicRebuild() {
    if (!state.DEPLOY_HOOK_URL) return;
    fetch(state.DEPLOY_HOOK_URL, { method: 'POST' }).catch(function () {});
  }

  // =========================================================
  // Restaurants, cuts, categories
  // =========================================================
  function loadRestaurants() {
    api('restaurants').then(function (r) {
      var el = document.querySelector('[data-restaurants]');
      if (!el || !r) return;
      el.innerHTML = r.map(function (x) {
        return `
          <a class="lead-card" href="#restaurant-${x.id}">
            <div class="lead-card__name">${esc(x.name)}</div>
            <div class="lead-card__meta">
              <span>${esc(x.area || '—')}</span>
              <span>${esc(x.status || '—')}</span>
              <span>${formatDate(x.first_contact_at || x.created_at)}</span>
            </div>
          </a>
        `;
      }).join('');
    });
  }

  function loadCuts() {
    api('cuts').then(function (c) {
      var el = document.querySelector('[data-cuts]');
      if (!el || !c) return;
      state.cuts = c;
      el.innerHTML = c.map(function (x) {
        return `
          <div class="product-row">
            <div>
              <div class="product-row__name">${esc(x.name_ar)} ${x.visible ? '' : '<span style="color:var(--gray);font-size:var(--text-xs)">(مخفي)</span>'}</div>
              <div class="product-row__meta">${x.usage_count} صنف يستخدمه</div>
            </div>
            <div class="row-actions">
              <button class="row-actions__btn row-actions__btn--primary"
                      onclick="window.__editCut('${x.id}')">تحرير</button>
              <button class="row-actions__btn"
                      onclick="window.__hideCut('${x.id}')">${x.visible ? 'إخفاء' : 'إظهار'}</button>
              <button class="row-actions__btn row-actions__btn--danger"
                      onclick="window.__deleteCut('${x.id}', ${JSON.stringify(esc(x.name_ar))})">حذف</button>
            </div>
          </div>
        `;
      }).join('');
    });
  }
  window.__hideCut = function (id) {
    api('cuts/' + id + '/hide', { method: 'POST' }).then(function () {
      toast('أُخفي نوع القص.'); loadCuts();
    }).catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  window.__editCut = function (id) {
    var c = (state.cuts || []).find(function (x) { return x.id === id; });
    if (!c) { toast('النوع غير موجود.'); return; }
    var modal = document.querySelector('.admin-modal');
    modal.querySelector('[data-modal-title]').textContent = 'تحرير نوع القص';
    modal.querySelector('[data-modal-body]').innerHTML = `
      <div class="admin-modal__row">
        <label class="settings-row__label" for="ct-name-ar">الاسم (عربي)</label>
        <input class="settings-row__input" id="ct-name-ar" type="text" value="${esc(c.name_ar || '')}">
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="ct-name-en">الاسم (إنجليزي — اختياري)</label>
        <input class="settings-row__input" id="ct-name-en" type="text" value="${esc(c.name_en || '')}" dir="ltr">
      </div>
      <div class="editor__field-group editor__field-group--2">
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ct-sort">ترتيب الظهور</label>
          <input class="settings-row__input" id="ct-sort" type="number" value="${c.sort_order || 0}">
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ct-visible">الظهور</label>
          <select class="settings-row__input" id="ct-visible">
            <option value="1" ${c.visible ? 'selected' : ''}>ظاهر</option>
            <option value="0" ${!c.visible ? 'selected' : ''}>مخفي</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-block-start:var(--space-5)">
        <button class="btn btn--primary" type="button" data-cut-save>حفظ</button>
        <button class="btn btn--text" type="button" data-cut-cancel>إلغاء</button>
      </div>
    `;
    modal.dataset.open = 'true';
    modal.querySelector('[data-cut-cancel]').addEventListener('click', function () { modal.dataset.open = 'false'; });
    modal.querySelector('[data-cut-save]').addEventListener('click', function () {
      var fields = {
        name_ar: modal.querySelector('#ct-name-ar').value.trim(),
        name_en: modal.querySelector('#ct-name-en').value.trim(),
        sort_order: parseInt(modal.querySelector('#ct-sort').value, 10) || 0,
        visible: parseInt(modal.querySelector('#ct-visible').value, 10),
      };
      if (!fields.name_ar) { toast('الاسم مطلوب.'); return; }
      api('cuts/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then(function () {
        modal.dataset.open = 'false';
        toast('حُفظ نوع القص.');
        loadCuts();
      }).catch(function () { toast('تعذّر الحفظ — سيتزامن لاحقاً.'); });
    });
  };

  window.__deleteCut = function (id, name) {
    if (!confirm('حذف نوع القص «' + name + '»؟\n(حذف منطقي)')) return;
    api('cuts/' + id + '/delete', { method: 'POST' }).then(function () {
      toast('حُذف نوع القص (حذف منطقي).');
      loadCuts();
    }).catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  function loadCategories() {
    api('categories').then(function (c) {
      var el = document.querySelector('[data-categories]');
      if (!el || !c) return;
      state.categories = c;
      el.innerHTML = c.map(function (x) {
        return `
          <div class="product-row">
            <div>
              <div class="product-row__name">${esc(x.name_ar)} ${x.visible ? '' : '<span style="color:var(--gray);font-size:var(--text-xs)">(مخفي)</span>'}</div>
              <div class="product-row__meta">${x.usage_count} صنف فيها</div>
            </div>
            <div class="row-actions">
              <button class="row-actions__btn row-actions__btn--primary"
                      onclick="window.__editCategory('${x.id}')">تحرير</button>
              <button class="row-actions__btn"
                      onclick="window.__hideCategory('${x.id}')">${x.visible ? 'إخفاء' : 'إظهار'}</button>
              <button class="row-actions__btn row-actions__btn--danger"
                      onclick="window.__deleteCategory('${x.id}', ${JSON.stringify(esc(x.name_ar))})">حذف</button>
            </div>
          </div>
        `;
      }).join('');
    });
  }
  window.__hideCategory = function (id) {
    api('categories/' + id + '/hide', { method: 'POST' }).then(function () {
      toast('أُخفيت الفئة.'); loadCategories();
    }).catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  window.__editCategory = function (id) {
    Promise.all([
      api('categories').catch(function () { return []; }),
      api('images?type=category').catch(function () { return []; }),
    ]).then(function (results) {
      var categories = results[0] || [];
      var images = results[1] || [];
      var c = categories.find(function (x) { return x.id === id; });
      if (!c) { toast('الفئة غير موجودة.'); return; }

      var modal = document.querySelector('.admin-modal');
      modal.querySelector('[data-modal-title]').textContent = 'تحرير فئة';
      modal.querySelector('[data-modal-body]').innerHTML = `
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ca-name-ar">الاسم (عربي)</label>
          <input class="settings-row__input" id="ca-name-ar" type="text" value="${esc(c.name_ar || '')}">
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ca-name-en">الاسم (إنجليزي — اختياري)</label>
          <input class="settings-row__input" id="ca-name-en" type="text" value="${esc(c.name_en || '')}" dir="ltr">
        </div>
        <div class="editor__field-group editor__field-group--2">
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ca-sort">ترتيب الظهور</label>
            <input class="settings-row__input" id="ca-sort" type="number" value="${c.sort_order || 0}">
          </div>
          <div class="admin-modal__row">
            <label class="settings-row__label" for="ca-visible">الظهور</label>
            <select class="settings-row__input" id="ca-visible">
              <option value="1" ${c.visible ? 'selected' : ''}>ظاهر</option>
              <option value="0" ${!c.visible ? 'selected' : ''}>مخفي</option>
            </select>
          </div>
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label">صورة الفئة</label>
          <div class="editor__image-pick">
            <div class="editor__image-preview ${c.image_id ? '' : 'editor__image-preview--empty'}" id="ca-img-preview">
              ${c.image_id ? '<img src="/api/images/' + c.image_id + '" alt="">' : 'لا صورة'}
            </div>
            <div style="display:flex;gap:var(--space-2);flex-direction:column">
              <button class="btn btn--secondary" type="button" id="ca-img-pick" style="block-size:40px">اختر صورة</button>
              <button class="btn btn--text" type="button" id="ca-img-clear" style="block-size:36px">إزالة</button>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-3);margin-block-start:var(--space-5)">
          <button class="btn btn--primary" type="button" data-cat-save>حفظ</button>
          <button class="btn btn--text" type="button" data-cat-cancel>إلغاء</button>
        </div>
      `;
      modal.dataset.open = 'true';

      var currentImageId = c.image_id || null;
      modal.querySelector('#ca-img-pick').addEventListener('click', function () {
        openMediaPicker({
          type: 'category',
          onPick: function (imageId) {
            currentImageId = imageId;
            var prev = modal.querySelector('#ca-img-preview');
            prev.classList.remove('editor__image-preview--empty');
            prev.innerHTML = '<img src="/api/images/' + imageId + '" alt="">';
          },
        });
      });
      modal.querySelector('#ca-img-clear').addEventListener('click', function () {
        currentImageId = null;
        var prev = modal.querySelector('#ca-img-preview');
        prev.classList.add('editor__image-preview--empty');
        prev.innerHTML = 'لا صورة';
      });

      modal.querySelector('[data-cat-cancel]').addEventListener('click', function () { modal.dataset.open = 'false'; });
      modal.querySelector('[data-cat-save]').addEventListener('click', function () {
        var fields = {
          name_ar: modal.querySelector('#ca-name-ar').value.trim(),
          name_en: modal.querySelector('#ca-name-en').value.trim(),
          sort_order: parseInt(modal.querySelector('#ca-sort').value, 10) || 0,
          visible: parseInt(modal.querySelector('#ca-visible').value, 10),
          image_id: currentImageId,
        };
        if (!fields.name_ar) { toast('الاسم مطلوب.'); return; }
        api('categories/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        }).then(function () {
          modal.dataset.open = 'false';
          toast('حُفظت الفئة.');
          loadCategories();
        }).catch(function () { toast('تعذّر الحفظ — سيتزامن لاحقاً.'); });
      });
    });
  };

  window.__deleteCategory = function (id, name) {
    if (!confirm('حذف الفئة «' + name + '»؟\n(حذف منطقي — الأصناف بداخلها تبقى لكنها تفقد الفئة)')) return;
    api('categories/' + id + '/delete', { method: 'POST' }).then(function () {
      toast('حُذفت الفئة (حذف منطقي).');
      loadCategories();
    }).catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  // =========================================================
  // Data view (CSV export)
  // =========================================================
  function loadDataView() {
    var el = document.querySelector('[data-data-view]');
    if (!el) return;
    var tables = ['leads','products','variants','restaurants','contacts',
                  'lead_events','categories','cuts','audit_log','private_links','images'];
    el.innerHTML = `
      <div class="data-toolbar">
        <select class="data-toolbar__select" id="dv-table">
          ${tables.map(function (t) { return `<option value="${t}">${t}</option>`; }).join('')}
        </select>
        <button class="btn btn--secondary" id="dv-load">عرض</button>
        <a class="btn btn--primary" id="dv-export" href="${API}/export/leads" download>تصدير CSV</a>
      </div>
      <div class="admin-card" id="dv-output">اختر جدولاً واضغط «عرض».</div>
    `;
    document.getElementById('dv-load').addEventListener('click', function () {
      var t = document.getElementById('dv-table').value;
      document.getElementById('dv-export').href = API + '/export/' + t;
      api(t === 'audit_log' ? 'audit' : t).catch(function () { return []; }).then(function (rows) {
        renderTable('dv-output', rows);
      });
    });
  }

  function renderTable(targetId, rows) {
    var el = document.getElementById(targetId);
    if (!rows || !rows.length) { el.innerHTML = '<p>لا توجد بيانات.</p>'; return; }
    var cols = Object.keys(rows[0]).slice(0, 8);
    el.innerHTML = `
      <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr>${cols.map(function (c) { return `<th>${esc(c)}</th>`; }).join('')}</tr></thead>
        <tbody>
          ${rows.slice(0, 100).map(function (r) {
            return `<tr>${cols.map(function (c) {
              var v = r[c];
              if (v === null || v === undefined) return '<td>—</td>';
              var s = String(v); if (s.length > 60) s = s.slice(0, 57) + '…';
              return `<td>${esc(s)}</td>`;
            }).join('')}</tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <p style="font-size:var(--text-xs);color:var(--gray);margin-block-start:var(--space-3)">
        عرض أول 100 صف. لتصفّح الكل، استخدم «تصدير CSV».
      </p>
    `;
  }

  // =========================================================
  // Private links
  // =========================================================
  function loadPrivateLinks() {
    api('private-links').then(function (links) {
      var el = document.querySelector('[data-private-links]');
      if (!el) return;
      if (!links || !links.length) {
        el.innerHTML = '<p class="admin-card">لا توجد روابط خاصة. استخدم زر + لإنشاء واحد.</p>';
        return;
      }
      el.innerHTML = links.map(function (l) {
        var url = (state.PUBLIC_URL || '') + '/ar/private/' + l.token;
        return `
          <div class="lead-card">
            <span class="lead-card__ref">${esc(l.token)}</span>
            <div class="lead-card__meta">
              <span>مشاهدات: ${l.view_count}</span>
              <span>ينتهي: ${l.expires_at ? formatDate(l.expires_at) : '—'}</span>
            </div>
            <a href="${url}" target="_blank" rel="noopener">فتح الرابط ←</a>
          </div>
        `;
      }).join('');
    });
  }

  // =========================================================
  // Images — grid, upload (with preview), edit, hide, delete, link
  // =========================================================
  function loadImages() {
    api('images').then(function (images) {
      var el = document.querySelector('[data-images]');
      if (!el) return;
      var toolbar = '<div class="images-toolbar">' +
        '<button class="btn btn--primary" type="button" onclick="window.__batchUpload()">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" style="margin-inline-end:var(--space-2)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        'رفع دفعي</button>' +
        '<span style="font-size:var(--text-xs);color:var(--gray);align-self:center">' +
        (images && images.length ? images.length + ' صورة في المكتبة' : '') + '</span>' +
        '</div>';

      if (!images || !images.length) {
        el.innerHTML = toolbar + '<p class="admin-card">لا توجد صور في المكتبة. استخدم زر + لرفع صورة، أو «رفع دفعي» لرفع عدة صور.</p>';
        return;
      }
      el.innerHTML = toolbar + '<div class="images-grid">' + images.map(function (img) {
        var hidden = img.visible === 0 ? 'true' : 'false';
        var typeLabel = imageTypeLabel(img.type);
        var dims = (img.width && img.height) ? (img.width + '×' + img.height) : '—';
        return `
          <div class="image-card" data-hidden="${hidden}">
            <div class="image-card__media">
              <img src="/api/images/${esc(img.id)}" alt="${esc(img.alt_ar || img.filename)}" loading="lazy">
            </div>
            <div class="image-card__body">
              <span class="image-card__type-badge">${typeLabel}</span>
              <div class="image-card__filename" title="${esc(img.filename)}">${esc(img.filename)}</div>
              <div class="image-card__meta">
                <span>${dims}</span>
                <span>${formatDate(img.created_at)}</span>
              </div>
              <div class="image-card__actions">
                <button class="image-card__action image-card__action--primary"
                        onclick="window.__editImage('${esc(img.id)}')">تحرير</button>
                <button class="image-card__action"
                        onclick="window.__linkImage('${esc(img.id)}')">ربط</button>
                <button class="image-card__action"
                        onclick="window.__toggleImageVisibility('${esc(img.id)}', ${img.visible})">
                  ${img.visible === 0 ? 'إظهار' : 'إخفاء'}
                </button>
                <button class="image-card__action image-card__action--danger"
                        onclick="window.__deleteImage('${esc(img.id)}')">حذف</button>
              </div>
            </div>
          </div>
        `;
      }).join('') + '</div>';
    }).catch(function () {
      var el = document.querySelector('[data-images]');
      if (el) el.innerHTML = '<p class="admin-card">تعذّر تحميل الصور.</p>';
    });
  }

  // =========================================================
  // Media Picker — pick an existing image from the library
  // =========================================================
  // Usage: openMediaPicker({ type: 'product', onPick: function(imageId) {...} })
  function openMediaPicker(opts) {
    opts = opts || {};
    var typeFilter = opts.type || null;
    var onPick = opts.onPick || function () {};
    var modal = document.querySelector('.admin-modal');
    modal.querySelector('[data-modal-title]').textContent = 'اختر صورة من المكتبة';
    modal.querySelector('[data-modal-body]').innerHTML = `
      <select class="media-picker__filter" id="mp-filter">
        <option value="">كل الأنواع</option>
        <option value="product">صنف</option>
        <option value="category">فئة</option>
        <option value="hero">رئيسية</option>
        <option value="company">الشركة</option>
      </select>
      <div class="media-picker__grid" id="mp-grid"><p class="media-picker__empty">جارٍ التحميل…</p></div>
      <div class="media-picker__actions">
        <button class="btn btn--text" type="button" id="mp-cancel">إلغاء</button>
        <button class="btn btn--primary" type="button" id="mp-confirm" disabled>تأكيد</button>
      </div>
    `;
    modal.dataset.open = 'true';

    var selectedImageId = null;
    var allImages = [];

    function renderGrid(filter) {
      var grid = document.getElementById('mp-grid');
      var filtered = filter ? allImages.filter(function (i) { return i.type === filter; }) : allImages;
      if (!filtered.length) {
        grid.innerHTML = '<p class="media-picker__empty">لا توجد صور. ارفع صوراً من صفحة الصور أولاً.</p>';
        return;
      }
      grid.innerHTML = filtered.map(function (img) {
        return `
          <div class="media-picker__item" data-image-id="${esc(img.id)}" data-selected="false">
            <img src="/api/images/${esc(img.id)}" alt="${esc(img.alt_ar || img.filename)}" loading="lazy">
            <span class="media-picker__check">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </div>
        `;
      }).join('');
      grid.querySelectorAll('.media-picker__item').forEach(function (item) {
        item.addEventListener('click', function () {
          grid.querySelectorAll('.media-picker__item').forEach(function (i) { i.dataset.selected = 'false'; });
          item.dataset.selected = 'true';
          selectedImageId = item.dataset.imageId;
          document.getElementById('mp-confirm').disabled = false;
        });
      });
    }

    // Pre-set the filter if a type was passed
    if (typeFilter) document.getElementById('mp-filter').value = typeFilter;

    document.getElementById('mp-filter').addEventListener('change', function () {
      renderGrid(this.value);
    });

    document.getElementById('mp-cancel').addEventListener('click', function () { modal.dataset.open = 'false'; });
    document.getElementById('mp-confirm').addEventListener('click', function () {
      if (!selectedImageId) return;
      modal.dataset.open = 'false';
      onPick(selectedImageId);
    });

    api('images').then(function (images) {
      allImages = images || [];
      renderGrid(document.getElementById('mp-filter').value);
    }).catch(function () {
      document.getElementById('mp-grid').innerHTML = '<p class="media-picker__empty">تعذّر تحميل الصور.</p>';
    });
  }

  // =========================================================
  // Batch upload — up to 50 images at once, sequential, with
  // per-file preview + progress bar + per-file status.
  // =========================================================
  window.__batchUpload = function () {
    openBatchUpload();
  };

  function openBatchUpload() {
    var modal = document.querySelector('.admin-modal');
    modal.querySelector('[data-modal-title]').textContent = 'رفع دفعي';
    modal.querySelector('[data-modal-body]').innerHTML = `
      <div class="admin-modal__row">
        <label class="settings-row__label" for="bu-type">نوع الصور</label>
        <select class="settings-row__input" id="bu-type">
          <option value="product">صنف</option>
          <option value="category">فئة</option>
          <option value="hero">رئيسية</option>
          <option value="company">الشركة</option>
        </select>
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="bu-files">اختر حتى 50 صورة (WebP مفضّل)</label>
        <input class="settings-row__input" id="bu-files" type="file" accept="image/webp,image/*" multiple>
      </div>
      <div class="batch-upload__progress-track" id="bu-track" style="display:none">
        <div class="batch-upload__progress-fill" id="bu-fill"></div>
      </div>
      <p class="batch-upload__summary" id="bu-summary"></p>
      <div class="batch-upload__list" id="bu-list"></div>
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn--primary" type="button" id="bu-start" disabled>رفع الكل</button>
        <button class="btn btn--text" type="button" id="bu-close">إغلاق</button>
      </div>
    `;
    modal.dataset.open = 'true';

    var fileInput = document.getElementById('bu-files');
    var list = document.getElementById('bu-list');
    var startBtn = document.getElementById('bu-start');
    var closeBtn = document.getElementById('bu-close');
    var track = document.getElementById('bu-track');
    var fill = document.getElementById('bu-fill');
    var summary = document.getElementById('bu-summary');
    var files = [];

    fileInput.addEventListener('change', function () {
      files = Array.prototype.slice.call(fileInput.files).slice(0, 50);
      if (!files.length) { startBtn.disabled = true; list.innerHTML = ''; return; }
      startBtn.disabled = false;
      list.innerHTML = '';
      var pending = files.length;
      files.forEach(function (file, idx) {
        // Reject files > 10MB client-side
        var tooBig = file.size > 10 * 1024 * 1024;
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          URL.revokeObjectURL(url);
          renderRow(idx, file, w, h, tooBig);
          if (--pending === 0) {}
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          renderRow(idx, file, null, null, tooBig);
          if (--pending === 0) {}
        };
        img.src = url;
      });
    });

    function renderRow(idx, file, w, h, tooBig) {
      var row = document.createElement('div');
      row.className = 'batch-upload__row';
      row.dataset.idx = idx;
      var url = URL.createObjectURL(file);
      var dims = (w && h) ? (w + '×' + h) : '—';
      var status = tooBig
        ? '<span class="batch-upload__status batch-upload__status--err">حجم كبير جداً (أقصى 10MB)</span>'
        : '<span class="batch-upload__status batch-upload__status--pending">بانتظار الرفع</span>';
      row.innerHTML = `
        <img class="batch-upload__thumb" src="${url}" alt="">
        <div>
          <div class="batch-upload__info">${esc(file.name)}</div>
          <div class="batch-upload__info-sub">${dims} · ${Math.round(file.size/1024)}KB</div>
        </div>
        <div data-row-status>${status}</div>
      `;
      if (tooBig) row.dataset.skip = '1';
      list.appendChild(row);
    }

    startBtn.addEventListener('click', function () {
      startBtn.disabled = true;
      track.style.display = 'block';
      var rows = Array.prototype.slice.call(list.querySelectorAll('.batch-upload__row'));
      var total = rows.length;
      var done = 0, okCount = 0, errCount = 0;
      var type = document.getElementById('bu-type').value;

      function next(i) {
        if (i >= rows.length) {
          summary.textContent = 'اكتمل: ' + okCount + ' نجح، ' + errCount + ' فشل من ' + total + '.';
          startBtn.textContent = 'تم';
          startBtn.disabled = false;
          startBtn.onclick = function () { modal.dataset.open = 'false'; loadImages(); };
          return;
        }
        var row = rows[i];
        if (row.dataset.skip === '1') {
          done++;
          fill.style.width = ((done / total) * 100) + '%';
          summary.textContent = done + ' / ' + total;
          next(i + 1);
          return;
        }
        var statusEl = row.querySelector('[data-row-status]');
        statusEl.innerHTML = '<span class="batch-upload__status batch-upload__status--pending">جارٍ الرفع…</span>';
        var file = files[i];
        var fd = new FormData();
        fd.append('file', file);
        fd.append('type', type);
        fd.append('alt_ar', file.name.replace(/\.[^.]+$/, ''));
        // Read dimensions from the thumb if available
        var thumb = row.querySelector('.batch-upload__thumb');
        if (thumb && thumb.naturalWidth) fd.append('width', String(thumb.naturalWidth));
        if (thumb && thumb.naturalHeight) fd.append('height', String(thumb.naturalHeight));

        fetch(API + '/images', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok) {
              statusEl.innerHTML = '<span class="batch-upload__status batch-upload__status--ok">✓ نجح</span>';
              okCount++;
            } else if (res.error === 'r2_not_configured') {
              statusEl.innerHTML = '<span class="batch-upload__status batch-upload__status--err">R2 غير مُهيّأ</span>';
              errCount++;
            } else {
              statusEl.innerHTML = '<span class="batch-upload__status batch-upload__status--err">✗ ' + esc(res.error || 'فشل') + '</span>';
              errCount++;
            }
          })
          .catch(function () {
            statusEl.innerHTML = '<span class="batch-upload__status batch-upload__status--err">✗ خطأ شبكة</span>';
            errCount++;
          })
          .finally(function () {
            done++;
            fill.style.width = ((done / total) * 100) + '%';
            summary.textContent = done + ' / ' + total;
            next(i + 1);
          });
      }
      next(0);
    });

    closeBtn.addEventListener('click', function () { modal.dataset.open = 'false'; });
  }

  function imageTypeLabel(t) {
    return ({ hero: 'رئيسية', category: 'فئة', product: 'صنف', company: 'الشركة' })[t] || t;
  }

  // ---- Upload modal (with preview + dimensions read client-side) ----
  function openImageUpload() {
    var modal = document.querySelector('.admin-modal');
    if (!modal) return;
    modal.querySelector('[data-modal-title]').textContent = 'رفع صورة';
    modal.querySelector('[data-modal-body]').innerHTML = `
      <div class="upload-preview upload-preview--empty" id="up-preview"></div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="up-file">اختر ملف صورة (WebP مفضّل)</label>
        <input class="settings-row__input" id="up-file" type="file" accept="image/*">
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="up-type">النوع</label>
        <select class="settings-row__input" id="up-type">
          <option value="product">صنف</option>
          <option value="category">فئة</option>
          <option value="hero">رئيسية</option>
          <option value="company">الشركة</option>
        </select>
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="up-alt">نص بديل (وصف عربي للصورة)</label>
        <input class="settings-row__input" id="up-alt" type="text" autocomplete="off">
      </div>
      <div class="admin-modal__row">
        <label class="settings-row__label" for="up-link">ربط بمنتج أو فئة (اختياري)</label>
        <select class="settings-row__input" id="up-link">
          <option value="">— بدون ربط —</option>
        </select>
      </div>
      <button class="btn btn--primary" data-upload-save>رفع</button>
    `;
    modal.dataset.open = 'true';

    // File input → preview + read dimensions
    var fileInput = document.getElementById('up-file');
    var preview = document.getElementById('up-preview');
    var width = null, height = null;

    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        width = img.naturalWidth;
        height = img.naturalHeight;
        preview.classList.remove('upload-preview--empty');
        preview.innerHTML = '';
        preview.appendChild(img.cloneNode());
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('تعذّر قراءة الصورة.'); };
      img.src = url;
    });

    // Populate the link dropdown with products (grouped by category)
    Promise.all([
      api('products').catch(function () { return []; }),
      api('categories').catch(function () { return []; }),
    ]).then(function (results) {
      var products = results[0] || [];
      var categories = results[1] || [];
      var sel = document.getElementById('up-link');
      var html = '<option value="">— بدون ربط —</option>';
      if (categories.length) {
        html += '<optgroup label="ربط بفئة">';
        categories.forEach(function (c) {
          html += `<option value="cat:${esc(c.id)}">${esc(c.name_ar)}</option>`;
        });
        html += '</optgroup>';
      }
      if (products.length) {
        html += '<optgroup label="ربط بمنتج">';
        products.forEach(function (p) {
          html += `<option value="prd:${esc(p.id)}">${esc(p.name_ar)}</option>`;
        });
        html += '</optgroup>';
      }
      sel.innerHTML = html;
    });

    modal.querySelector('[data-upload-save]').addEventListener('click', function () {
      var file = fileInput.files[0];
      if (!file) { toast('اختر ملف صورة أولاً.'); return; }
      var type = document.getElementById('up-type').value;
      var alt = document.getElementById('up-alt').value.trim();
      var linkVal = document.getElementById('up-link').value;

      var fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('alt_ar', alt);
      if (width) fd.append('width', String(width));
      if (height) fd.append('height', String(height));
      if (linkVal.startsWith('prd:')) fd.append('product_id', linkVal.slice(4));
      if (linkVal.startsWith('cat:')) fd.append('category_id', linkVal.slice(4));

      // Upload is NOT JSON — bypass the api() helper's JSON assumption.
      fetch(API + '/images', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) {
            modal.dataset.open = 'false';
            toast('رُفعت الصورة.');
            loadImages();
          } else if (res.error === 'r2_not_configured') {
            toast('R2 غير مُهيّأ. راجع HANDOVER.md §11 لإنشاء الـbucket.');
          } else {
            toast('تعذّر الرفع: ' + (res.error || 'خطأ غير معروف'));
          }
        })
        .catch(function () { toast('تعذّر الرفع — تحقق من الشبكة.'); });
    });
  }

  // ---- Edit image metadata ----
  window.__editImage = function (id) {
    api('images/' + id).catch(function () { return null; }).then(function (img) {
      if (!img) { toast('تعذّر تحميل بيانات الصورة.'); return; }
      var modal = document.querySelector('.admin-modal');
      modal.querySelector('[data-modal-title]').textContent = 'تحرير الصورة';
      modal.querySelector('[data-modal-body]').innerHTML = `
        <div class="upload-preview">
          <img src="/api/images/${esc(img.id)}" alt="${esc(img.alt_ar || img.filename)}">
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ed-type">النوع</label>
          <select class="settings-row__input" id="ed-type">
            <option value="product" ${img.type==='product'?'selected':''}>صنف</option>
            <option value="category" ${img.type==='category'?'selected':''}>فئة</option>
            <option value="hero" ${img.type==='hero'?'selected':''}>رئيسية</option>
            <option value="company" ${img.type==='company'?'selected':''}>الشركة</option>
          </select>
        </div>
        <div class="admin-modal__row">
          <label class="settings-row__label" for="ed-alt">نص بديل</label>
          <input class="settings-row__input" id="ed-alt" type="text" value="${esc(img.alt_ar || '')}">
        </div>
        <div class="admin-modal__row" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
          <div>
            <label class="settings-row__label" for="ed-w">العرض</label>
            <input class="settings-row__input" id="ed-w" type="number" value="${img.width || ''}">
          </div>
          <div>
            <label class="settings-row__label" for="ed-h">الارتفاع</label>
            <input class="settings-row__input" id="ed-h" type="number" value="${img.height || ''}">
          </div>
        </div>
        <button class="btn btn--primary" data-edit-save>حفظ</button>
      `;
      modal.dataset.open = 'true';
      modal.querySelector('[data-edit-save]').addEventListener('click', function () {
        var fields = {
          type: document.getElementById('ed-type').value,
          alt_ar: document.getElementById('ed-alt').value.trim(),
        };
        var w = parseInt(document.getElementById('ed-w').value, 10);
        var h = parseInt(document.getElementById('ed-h').value, 10);
        if (w) fields.width = w;
        if (h) fields.height = h;
        api('images/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        }).then(function () {
          modal.dataset.open = 'false';
          toast('حُفظ التعديل.');
          loadImages();
        }).catch(function () { toast('تعذّر الحفظ — سيتزامن لاحقاً.'); });
      });
    });
  };

  // ---- Link image to a product or category ----
  window.__linkImage = function (id) {
    Promise.all([
      api('products').catch(function () { return []; }),
      api('categories').catch(function () { return []; }),
    ]).then(function (results) {
      var products = results[0] || [];
      var categories = results[1] || [];
      var modal = document.querySelector('.admin-modal');
      modal.querySelector('[data-modal-title]').textContent = 'ربط الصورة';
      var html = '<div class="admin-modal__row"><label class="settings-row__label" for="lk-target">اربط بـ</label><select class="settings-row__input" id="lk-target">';
      html += '<option value="">— اختر —</option>';
      if (categories.length) {
        html += '<optgroup label="فئة">';
        categories.forEach(function (c) { html += `<option value="cat:${esc(c.id)}">${esc(c.name_ar)}</option>`; });
        html += '</optgroup>';
      }
      if (products.length) {
        html += '<optgroup label="منتج">';
        products.forEach(function (p) { html += `<option value="prd:${esc(p.id)}">${esc(p.name_ar)}</option>`; });
        html += '</optgroup>';
      }
      html += '</select></div>';
      html += '<button class="btn btn--primary" data-link-save>ربط</button>';
      modal.querySelector('[data-modal-body]').innerHTML = html;
      modal.dataset.open = 'true';
      modal.querySelector('[data-link-save]').addEventListener('click', function () {
        var val = document.getElementById('lk-target').value;
        if (!val) { toast('اختر هدفاً.'); return; }
        var body = {};
        if (val.startsWith('prd:')) body.productId = val.slice(4);
        if (val.startsWith('cat:')) body.categoryId = val.slice(4);
        api('images/' + id + '/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function () {
          modal.dataset.open = 'false';
          toast('رُبطت الصورة.');
          loadImages();
        }).catch(function () { toast('تعذّر الربط — سيتزامن لاحقاً.'); });
      });
    });
  };

  // ---- Toggle visibility (hide/show) ----
  window.__toggleImageVisibility = function (id, currentlyVisible) {
    if (currentlyVisible === 0) {
      // Currently hidden → show by setting visible=1 via PUT
      api('images/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: 1 }),
      }).then(function () { toast('أُظهرت الصورة.'); loadImages(); })
        .catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
    } else {
      // Currently visible → hide via /hide
      api('images/' + id + '/hide', { method: 'POST' })
        .then(function () { toast('أُخفيت الصورة.'); loadImages(); })
        .catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
    }
  };

  // ---- Soft-delete (with confirmation, no swipe-to-delete per §7) ----
  window.__deleteImage = function (id) {
    if (!confirm('حذف هذه الصورة؟ (حذف منطقي — يمكن استرجاعها من قاعدة البيانات لاحقاً)')) return;
    api('images/' + id + '/delete', { method: 'POST' })
      .then(function () { toast('حُذفت الصورة (حذف منطقي).'); loadImages(); })
      .catch(function () { toast('تعذّر — سيتزامن لاحقاً.'); });
  };

  // =========================================================
  // Global search (products, leads, restaurants together)
  // =========================================================
  function setupSearch() {
    var s = document.querySelector('.admin-header__search');
    if (!s) return;
    var timer;
    s.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = s.value.trim().toLowerCase();
        if (!q) return;
        // Search the currently-loaded list. The worker doesn't have a
        // unified search endpoint; for simplicity we filter client-side.
        if (state.activePage === 'products' && state.products.length) {
          renderProducts(state.products.filter(function (p) {
            return p.name_ar.toLowerCase().includes(q) ||
                   (p.name_en || '').toLowerCase().includes(q);
          }));
        }
      }, 220);
    });
  }

  // =========================================================
  // Helpers
  // =========================================================
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  function isOverdue(iso, hours) {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() > hours * 3600 * 1000;
  }
})();
