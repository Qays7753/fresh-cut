// worker/src/handlers/admin.js
// Admin namespace router. Every /api/admin/* route lands here.
// Cloudflare Access already verified the JWT at the edge; we
// receive the actor's email in a header and pass it down to
// the query-isolation layer for audit logging.

import {
  listLeads, getLead, computeLeadStatus, listToday,
  listProducts, createProduct, updateProduct, bulkUpdateVariantAvailability,
  listVariants, updateVariant,
  listCuts, listCategories, createCut, createCategory, hideCut, hideCategory,
  listRestaurants, getSettings, updateSetting,
  listPrivateLinks, createPrivateLink, exportTable,
} from '../queries.js';

export async function handleAdmin(request, env, ctx, actor) {
  const res = await routeAdmin(request, env, ctx, actor);

  // After a successful mutation to catalog/settings, trigger a rebuild of
  // the public site (Cloudflare Pages deploy hook). Fire-and-forget: a
  // failed trigger must never turn a successful save into an error.
  const method = request.method;
  const path = new URL(request.url).pathname.replace(/^\/api\/admin\//, '');
  if (method !== 'GET' && res.status >= 200 && res.status < 300 && affectsPublicSite(path)) {
    ctx?.waitUntil?.(triggerRebuild(env));
  }
  return res;
}

// Routes whose changes are reflected on the public site.
function affectsPublicSite(path) {
  return /^(products|variants|cuts|categories|settings)(\/|$)/.test(path);
}

async function triggerRebuild(env) {
  const hook = env.PUBLIC_DEPLOY_HOOK_URL;
  if (!hook) return; // Not configured yet — nothing to do.
  try {
    await fetch(hook, { method: 'POST' });
  } catch (_) {
    // Best-effort — swallow. The edit is already persisted in D1.
  }
}

async function routeAdmin(request, env, ctx, actor) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin\//, '');
  const method = request.method;

  // ---- Today page ----
  if (path === 'today' && method === 'GET') {
    return json(await listToday(env.DB));
  }

  // ---- Leads ----
  if (path === 'leads' && method === 'GET') {
    return json(await listLeads(env.DB, { limit: 200 }));
  }
  if (path.startsWith('leads/') && method === 'GET') {
    const id = path.split('/')[1];
    const lead = await getLead(env.DB, id);
    if (!lead) return json({ error: 'not_found' }, 404);
    return json(lead);
  }

  // ---- Products ----
  if (path === 'products' && method === 'GET') {
    return json(await listProducts(env.DB));
  }
  if (path === 'products' && method === 'POST') {
    const b = await request.json();
    const id = await createProduct(env.DB, { actor, ...b });
    return json({ id });
  }
  if (path.startsWith('products/') && method === 'PUT') {
    const id = path.split('/')[1];
    const fields = await request.json();
    await updateProduct(env.DB, { actor, id, fields });
    return json({ ok: true });
  }

  // ---- Variants ----
  if (path.startsWith('variants/') && method === 'GET') {
    const productId = path.split('/')[1];
    return json(await listVariants(env.DB, productId));
  }
  if (path.startsWith('variants/') && method === 'PUT') {
    const id = path.split('/')[1];
    const fields = await request.json();
    await updateVariant(env.DB, { actor, id, fields });
    return json({ ok: true });
  }
  if (path === 'variants/bulk-availability' && method === 'POST') {
    const b = await request.json();
    await bulkUpdateVariantAvailability(env.DB, { actor, ...b });
    return json({ ok: true });
  }

  // ---- Cuts & categories ----
  if (path === 'cuts' && method === 'GET') {
    return json(await listCuts(env.DB));
  }
  if (path === 'cuts' && method === 'POST') {
    const b = await request.json();
    const id = await createCut(env.DB, { actor, ...b });
    return json({ id });
  }
  if (path.startsWith('cuts/') && path.endsWith('/hide') && method === 'POST') {
    const id = path.split('/')[1];
    await hideCut(env.DB, { actor, id });
    return json({ ok: true });
  }
  if (path === 'categories' && method === 'GET') {
    return json(await listCategories(env.DB));
  }
  if (path === 'categories' && method === 'POST') {
    const b = await request.json();
    const id = await createCategory(env.DB, { actor, ...b });
    return json({ id });
  }
  if (path.startsWith('categories/') && path.endsWith('/hide') && method === 'POST') {
    const id = path.split('/')[1];
    await hideCategory(env.DB, { actor, id });
    return json({ ok: true });
  }

  // ---- Restaurants ----
  if (path === 'restaurants' && method === 'GET') {
    return json(await listRestaurants(env.DB, { limit: 200 }));
  }

  // ---- Settings ----
  if (path === 'settings' && method === 'GET') {
    return json(await getSettings(env.DB));
  }
  if (path === 'settings' && method === 'PUT') {
    const b = await request.json();
    await updateSetting(env.DB, { actor, key: b.key, value: b.value });
    return json({ ok: true });
  }

  // ---- Private links ----
  if (path === 'private-links' && method === 'GET') {
    return json(await listPrivateLinks(env.DB));
  }
  if (path === 'private-links' && method === 'POST') {
    const b = await request.json();
    const r = await createPrivateLink(env.DB, { actor, ...b });
    return json(r);
  }

  // ---- Data view / CSV export ----
  if (path.startsWith('export/') && method === 'GET') {
    const table = path.split('/')[1];
    const rows = await exportTable(env.DB, table);
    const csv = toCsv(rows);
    return new Response(csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${table}.csv"`,
      'Access-Control-Allow-Origin': env.ADMIN_ORIGIN || '*',
    }});
  }

  return json({ error: 'not_found' }, 404);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => escape(r[c])).join(','));
  return lines.join('\n');
}
