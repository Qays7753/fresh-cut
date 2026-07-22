// worker/src/index.js
// Cloudflare Worker — public API + admin API.
// All D1 access goes through ./queries.js (query-isolation layer).
// Public endpoints and admin endpoints are namespaced separately;
// the public site bundle imports none of the admin handlers,
// preserving admin-separation.

import {
  getCatalogForPublic, getSettings, createLead, nextLeadRefSeq,
  formatLeadRef, normalizeJoPhone, findRestaurantByNameArea,
  createRestaurant, createContact, computeLeadStatus,
} from './queries.js';
import { sendLeadNotification } from './email.js';
import { handleAdmin } from './handlers/admin.js';

// ---- CORS / headers ----------------------------------------

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

function corsHeaders(env) {
  const allow = env.ADMIN_ORIGIN ? env.ADMIN_ORIGIN : '*';
  return { 'Access-Control-Allow-Origin': allow,
           'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
           'Access-Control-Allow-Headers': 'Content-Type' };
}

// ---- rate limiter (per-IP, in D1, 5 form submits / hour) ---

async function rateLimited(env, ip) {
  if (!ip) return false;
  const key = `submit:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const row = await env.DB.prepare(`SELECT value FROM _kv WHERE key = ?`).bind(key).first();
  const n = row ? Number(row.value) : 0;
  return n >= 5;
}

async function bumpRate(env, ip) {
  if (!ip) return;
  const key = `submit:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const row = await env.DB.prepare(`SELECT value FROM _kv WHERE key = ?`).bind(key).first();
  const n = row ? Number(row.value) + 1 : 1;
  if (row) {
    await env.DB.prepare(`UPDATE _kv SET value = ? WHERE key = ?`).bind(String(n), key).run();
  } else {
    await env.DB.prepare(`INSERT INTO _kv (key, value) VALUES (?, ?)`).bind(key, String(n)).run();
  }
}

// ---- main entry --------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // ---------- public catalog ----------
    if (path === '/api/catalog' && method === 'GET') {
      const [catalog, settings] = await Promise.all([
        getCatalogForPublic(env.DB),
        getSettings(env.DB),
      ]);
      return json({ catalog, settings }, corsHeaders(env));
    }

    // ---------- public lead submit ----------
    if (path === '/api/leads' && method === 'POST') {
      return handleLeadSubmit(request, env, ctx);
    }

    // ---------- admin namespace ----------
    if (path.startsWith('/api/admin/')) {
      // Cloudflare Access protects this namespace at the edge.
      // The worker additionally verifies the Cf-Access-Jwt-Assertion
      // header presence (real verification is done by Access itself).
      const accessJwt = request.headers.get('Cf-Access-Jwt-Assertion');
      if (!accessJwt) {
        return json({ error: 'unauthorized' }, { ...corsHeaders(env), status: 401 });
      }
      // Actor email is set by Cloudflare Access in this header.
      const actor = request.headers.get('Cf-Access-Authenticated-User-Email') || 'admin';
      return handleAdmin(request, env, ctx, actor);
    }

    return json({ error: 'not_found' }, { ...corsHeaders(env), status: 404 });
  },
};

function json(body, headers = {}, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...headers },
  });
}

// ---- lead submit handler (form-submit-order) ---------------
// 1. Save to D1 FIRST (without waiting for WhatsApp or email).
// 2. Open WhatsApp with pre-filled message in the same instant
//    (we return the wa.me URL; the client opens it).
// 3. Return the confirmation screen payload with ref + reply time.
// 4. Email notification is fire-and-forget via ctx.waitUntil —
//    its failure never blocks the lead or the WhatsApp handoff.
// 5. Honeypot: if `company_url` is filled, silently accept-and-drop.
// -------------------------------------------------------------

async function handleLeadSubmit(request, env, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, corsHeaders(env), 400); }

  // Honeypot — silent drop. Bots fill every field.
  if (body.company_url) {
    return json({ ok: true, ref: null, fake: true }, corsHeaders(env));
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (await rateLimited(env, ip)) {
    return json({ error: 'rate_limited' }, corsHeaders(env), 429);
  }

  // Validate required fields.
  const required = ['restaurantName', 'contactName', 'phone', 'area'];
  for (const k of required) {
    if (!body[k] || !String(body[k]).trim()) {
      return json({ error: 'missing_field', field: k }, corsHeaders(env), 400);
    }
  }

  const type = body.type === 'supply' ? 'order' : 'sample';
  const phoneNorm = normalizeJoPhone(body.phone);
  const source = body.source || (new URL(request.url).searchParams.get('src')) || 'web';

  // 1. SAVE TO D1 FIRST.
  //    Find or create the restaurant, then the contact, then the lead.
  let restaurantId = null, contactId = null;
  try {
    const existing = await findRestaurantByNameArea(env.DB, body.restaurantName, body.area);
    restaurantId = existing?.id || await createRestaurant(env.DB, {
      actor: 'public', name: body.restaurantName, area: body.area,
      address: body.address || null, notes: null,
    });
    contactId = await createContact(env.DB, {
      actor: 'public', restaurantId, name: body.contactName,
      phone: phoneNorm, role: body.role || null, isPrimary: true,
    });

    const seq = await nextLeadRefSeq(env.DB);
    const ref = formatLeadRef(seq);

    const { id: leadId } = await createLead(env.DB, {
      actor: 'public', ref, restaurantId, contactId, type,
      items: body.items || null,
      topItemsAr: body.topItems || null,
      source,
      whatsappOpened: false,
    });

    // Bump rate limit only on successful save.
    ctx.waitUntil(bumpRate(env, ip));

    // 2. Build the WhatsApp URL (client opens it next).
    //    Template from settings: Arabic + reference number only.
    const settings = await getSettings(env.DB);
    const tplKey = type === 'sample' ? 'wa_sample_template' : 'wa_supply_template';
    const tpl = settings[tplKey] || 'مرحباً، رقم المرجع: {{ref}}';
    const waText = encodeURIComponent(tpl.replace('{{ref}}', ref));
    const waPhone = '962' + phoneNorm.replace(/^0/, '');
    const waUrl = `https://wa.me/${waPhone}?text=${waText}`;

    // 3. Email notification — fire-and-forget.
    ctx.waitUntil(sendLeadNotification(env, {
      to: settings.notification_email,
      ref,
      lead: {
        type, restaurantName: body.restaurantName,
        contactName: body.contactName, contactPhone: phoneNorm,
        area: body.area,
        itemsText: Array.isArray(body.items) ? body.items.join('، ') : (body.items || ''),
        topItemsAr: body.topItems || '',
        source,
      },
    }));

    // 4. Return confirmation payload (client renders the screen).
    return json({
      ok: true,
      ref,
      leadId,
      whatsappUrl: waUrl,
      replyBy: computeReplyBy(),
    }, corsHeaders(env));
  } catch (err) {
    // The local fallback is the client's responsibility
    // (per form-submit-order skill). We signal failure and let
    // the client open WhatsApp with the same data and store
    // the request locally.
    return json({ ok: false, error: 'save_failed',
      fallback: {
        type, restaurantName: body.restaurantName,
        contactName: body.contactName, phone: phoneNorm,
        area: body.area, items: body.items || null,
        topItems: body.topItems || null, source,
      }}, corsHeaders(env), 500);
  }
}

// "We'll contact you before 10am" — computed from submission time.
function computeReplyBy() {
  const now = new Date();
  const tomorrow10 = new Date(now);
  tomorrow10.setUTCDate(now.getUTCDate() + 1);
  tomorrow10.setUTCHours(7, 0, 0, 0); // 10am Amman = 07:00 UTC
  if (now < tomorrow10) {
    return { label: 'قبل الساعة 10 صباحاً غداً', ts: tomorrow10.toISOString() };
  }
  const next10 = new Date(tomorrow10);
  next10.setUTCDate(tomorrow10.getUTCDate() + 1);
  return { label: 'قبل الساعة 10 صباحاً بعد غد', ts: next10.toISOString() };
}
