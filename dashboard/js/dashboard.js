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
    selectedProductIds: new Set(),
    settings: {},
  };

  // =========================================================
  // Boot
  // =========================================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupNav();
    setupOnlineToggle();
    setupFab();
    setupSearch();
    setupModal();
    navigate('today');
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

    // Show FAB only on products page
    var fab = document.querySelector('.admin-fab');
    if (fab) fab.style.display = (page === 'products') ? 'inline-flex' : 'none';
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
          <button class="product-row__availability-toggle"
                  data-variant-id="${p.id}"
                  data-state="available"
                  onclick="window.__setOutToday('${p.id}', this)">متوفّر</button>
          <a href="#products">←</a>
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

  // Expose for inline onclick (avoids adding listeners per row)
  window.__setOutToday = function (productId, btn) {
    var newState = btn.dataset.state === 'available' ? 'out_today' : 'available';
    api('variants/bulk-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantIds: [productId],
        availability: newState,
        note: null,
      }),
    }).then(function () {
      btn.dataset.state = newState;
      btn.textContent = newState === 'out_today' ? 'غير متوفّر' : 'متوفّر';
      toast('تم التحديث.');
    }).catch(function () { toast('تعذّر التحديث — سيتزامن لاحقاً.'); });
  };

  // =========================================================
  // FAB + three-field quick-add modal (§7)
  // =========================================================
  function setupFab() {
    var fab = document.querySelector('.admin-fab');
    if (fab) fab.addEventListener('click', openQuickAdd);
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
  function loadSettings() {
    api('settings').then(function (s) {
      if (!s) return;
      state.settings = s;
      var el = document.querySelector('[data-settings]');
      if (!el) return;
      var keys = Object.keys(s).sort();
      el.innerHTML = keys.map(function (k) {
        return `
          <div class="settings-row">
            <div>
              <div class="settings-row__label">${esc(k)}</div>
              <div class="settings-row__hint">قيمة نصية تظهر على الموقع العام.</div>
            </div>
            <textarea class="settings-row__textarea" data-setting-key="${esc(k)}">${esc(s[k] || '')}</textarea>
          </div>
        `;
      }).join('') + `
        <button class="btn btn--primary" data-settings-save style="margin-block-start:var(--space-5)">حفظ الإعدادات</button>
      `;
      el.querySelector('[data-settings-save]').addEventListener('click', saveSettings);
    });
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
      el.innerHTML = c.map(function (x) {
        return `
          <div class="product-row">
            <div>
              <div class="product-row__name">${esc(x.name_ar)}</div>
              <div class="product-row__meta">${x.usage_count} صنف يستخدمه</div>
            </div>
            ${x.usage_count > 0
              ? `<button class="product-row__availability-toggle" onclick="window.__hideCut('${x.id}')">إخفاء</button>`
              : `<button class="product-row__availability-toggle" onclick="window.__hideCut('${x.id}')">إخفاء</button>`}
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

  function loadCategories() {
    api('categories').then(function (c) {
      var el = document.querySelector('[data-categories]');
      if (!el || !c) return;
      el.innerHTML = c.map(function (x) {
        return `
          <div class="product-row">
            <div>
              <div class="product-row__name">${esc(x.name_ar)}</div>
              <div class="product-row__meta">${x.usage_count} صنف فيها</div>
            </div>
            <button class="product-row__availability-toggle" onclick="window.__hideCategory('${x.id}')">إخفاء</button>
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

  // =========================================================
  // Data view (CSV export)
  // =========================================================
  function loadDataView() {
    var el = document.querySelector('[data-data-view]');
    if (!el) return;
    var tables = ['leads','products','variants','restaurants','contacts',
                  'lead_events','categories','cuts','audit_log','private_links'];
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
