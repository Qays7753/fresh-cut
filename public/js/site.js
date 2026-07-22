// public/js/site.js
// Minimal, additive-only JS. Site is fully readable without it.
// Responsibilities: mobile menu, sticky bar visibility, form submit
// with save→WhatsApp→confirm order, local fallback, honeypot.
// Budget: < 50KB.

(function () {
  'use strict';

  var SETTINGS = window.__ALYAF_SETTINGS__ || {};
  var CATALOG  = window.__ALYAF_CATALOG__  || { products: [], categories: [] };

  // =========================================================
  // Header scroll state (only shows border when scrolled)
  // =========================================================
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.dataset.scrolled = window.scrollY > 4 ? 'true' : 'false';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // =========================================================
  // Mobile hamburger — full-screen overlay (§9)
  // =========================================================
  var menuBtn = document.querySelector('[data-menu-open]');
  var menuOverlay = document.querySelector('.menu-overlay');
  var menuClose = document.querySelector('[data-menu-close]');

  function openMenu() {
    if (!menuOverlay) return;
    menuOverlay.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    var links = menuOverlay.querySelectorAll('a');
    if (links.length) links[0].focus();
  }
  function closeMenu() {
    if (!menuOverlay) return;
    menuOverlay.dataset.open = 'false';
    document.body.style.overflow = '';
    if (menuBtn) menuBtn.focus();
  }
  if (menuBtn) menuBtn.addEventListener('click', openMenu);
  if (menuClose) menuClose.addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOverlay && menuOverlay.dataset.open === 'true') {
      closeMenu();
    }
  });

  // =========================================================
  // Sticky sample bar — appears after hero, hides when menu open
  // =========================================================
  var sampleBar = document.querySelector('.sample-bar');
  var heroEl = document.querySelector('.hero');
  if (sampleBar && heroEl) {
    document.body.dataset.bar = 'true';
    var io = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      // Show bar when hero is mostly out of view
      sampleBar.dataset.visible = entry.isIntersecting ? 'false' : 'true';
    }, { rootMargin: '-60% 0px 0px 0px', threshold: 0 });
    io.observe(heroEl);
  }

  // =========================================================
  // Form submission — save→WhatsApp→confirm order (spec §6)
  // =========================================================
  var form = document.querySelector('[data-lead-form]');
  var confirmEl = document.querySelector('[data-confirm]');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitLead(form);
  });

  function submitLead(form) {
    // Honeypot: if filled, silently "succeed" without sending.
    var hp = form.querySelector('[name="company_url"]');
    if (hp && hp.value) {
      showConfirm({ ref: '(تم)', whatsappUrl: null, replyBy: { label: '' } });
      return;
    }

    var data = collectFormData(form);
    var validationError = validate(data);
    if (validationError) {
      showFieldError(validationError.field, validationError.message);
      return;
    }

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    // Try saving to D1 first.
    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(function (r) { return r.json(); }).then(function (result) {
      if (result.ok) {
        // Save succeeded — open WhatsApp, show confirmation.
        openWhatsApp(result.whatsappUrl);
        showConfirm(result);
      } else if (result.fallback) {
        // Save failed — local fallback: store + open WhatsApp.
        localFallback(result.fallback);
      } else {
        showFormError(result.error || 'unknown');
        if (submitBtn) submitBtn.disabled = false;
      }
    }).catch(function () {
      // Network error — local fallback.
      localFallback(data);
    });
  }

  function collectFormData(form) {
    var fd = new FormData(form);
    var items = [];
    // Items come from a hidden field pre-filled by the "order sample" flow
    var itemsStr = fd.get('items');
    if (itemsStr) items = itemsStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    return {
      type: fd.get('type') || 'sample',
      restaurantName: (fd.get('restaurant_name') || '').toString().trim(),
      contactName: (fd.get('contact_name') || '').toString().trim(),
      phone: (fd.get('phone') || '').toString().trim(),
      area: (fd.get('area') || '').toString().trim(),
      address: (fd.get('address') || '').toString().trim(),
      role: (fd.get('role') || '').toString().trim(),
      items: items,
      topItems: (fd.get('top_items') || '').toString().trim(),
      source: fd.get('source') || new URLSearchParams(location.search).get('src') || 'web',
      company_url: (fd.get('company_url') || '').toString().trim(),
    };
  }

  function validate(d) {
    if (!d.restaurantName) return { field: 'restaurant_name', message: 'اسم المطعم مطلوب' };
    if (!d.contactName)   return { field: 'contact_name',    message: 'اسم الشخص مطلوب' };
    if (!d.phone)         return { field: 'phone',           message: 'رقم الهاتف مطلوب' };
    if (!d.area)          return { field: 'area',            message: 'المنطقة مطلوبة' };
    return null;
  }

  function showFieldError(name, msg) {
    var field = form.querySelector('[data-field="' + name + '"]');
    if (!field) return;
    field.dataset.error = 'true';
    var err = field.querySelector('.field__error');
    if (err) err.textContent = msg;
    var input = field.querySelector('input, textarea, select');
    if (input) input.focus();
  }

  function showFormError(msg) {
    var err = form.querySelector('[data-form-error]');
    if (err) {
      err.textContent = 'تعذّر الإرسال الآن. حاول مرة أخرى أو راسلنا على واتساب.';
      err.style.display = 'block';
    }
  }

  function openWhatsApp(url) {
    if (!url) return;
    // Open in same tab to avoid popup blockers; the chef hits "send" manually.
    window.location.href = url;
  }

  function showConfirm(result) {
    // Hide the form, show the confirmation screen.
    form.style.display = 'none';
    if (confirmEl) {
      confirmEl.dataset.open = 'true';
      var refEl = confirmEl.querySelector('[data-confirm-ref]');
      var replyEl = confirmEl.querySelector('[data-confirm-reply]');
      var waBtn = confirmEl.querySelector('[data-confirm-whatsapp]');
      if (refEl && result.ref) refEl.textContent = result.ref;
      if (replyEl && result.replyBy && result.replyBy.label) replyEl.textContent = result.replyBy.label;
      if (waBtn && result.whatsappUrl) waBtn.href = result.whatsappUrl;
      confirmEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function localFallback(data) {
    // Spec §6 critical fallback: store locally + open WhatsApp immediately.
    try {
      var queue = JSON.parse(localStorage.getItem('alyaf_lead_queue') || '[]');
      var tempRef = 'AS-LOCAL-' + Date.now().toString(36).toUpperCase();
      queue.push({ ref: tempRef, data: data, ts: Date.now() });
      localStorage.setItem('alyaf_lead_queue', JSON.stringify(queue));
    } catch (e) { /* localStorage may be unavailable */ }

    // Open WhatsApp with a minimal pre-filled message including the local ref.
    var waNumber = SETTINGS.whatsapp_number || '0777717753';
    var waPhone = '962' + waNumber.replace(/^0/, '');
    var text = encodeURIComponent(
      'مرحباً، أرغب بطلب ' + (data.type === 'supply' ? 'توريد' : 'عيّنة') +
      '. رقم المرجع: ' + (data.ref || 'AS-LOCAL')
    );
    openWhatsApp('https://wa.me/' + waPhone + '?text=' + text);

    // Show a confirmation that mentions local save.
    showConfirm({
      ref: (data.ref || 'سيُسجّل عند توفّر الشبكة'),
      whatsappUrl: null,
      replyBy: { label: 'سنردّ عليك على واتساب بأقرب وقت' },
    });
  }

  // =========================================================
  // "Order sample" buttons — pre-fill items into the form
  // =========================================================
  document.querySelectorAll('[data-order-sample]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var items = btn.dataset.items || '';
      var itemsField = form.querySelector('[name="items"]');
      if (itemsField && items) itemsField.value = items;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // =========================================================
  // Private link view counter (optional — calls worker on visit)
  // =========================================================
  var privateToken = document.body.dataset.privateToken;
  if (privateToken) {
    fetch('/api/private/' + privateToken + '/view', { method: 'POST' }).catch(function () {});
  }
})();
