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
  createImage, listImages, getImage, updateImage, hideImage, softDeleteImage,
  linkImageToProduct, linkImageToCategory, unlinkImage,
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
  return /^(products|variants|cuts|categories|settings|images)(\/|$)/.test(path);
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

  // ---- Images ----
  // Upload is multipart/form-data: file (binary), type, alt_ar, width,
  // height, and optionally product_id or category_id to link.
  if (path === 'images' && method === 'POST') {
    return await handleImageUpload(request, env, actor);
  }
  if (path === 'images' && method === 'GET') {
    const type = url.searchParams.get('type') || undefined;
    return json(await listImages(env.DB, { type }));
  }
  if (path.startsWith('images/') && method === 'GET') {
    const id = path.split('/')[1];
    const img = await getImage(env.DB, id);
    if (!img) return json({ error: 'not_found' }, 404);
    return json(img);
  }
  if (path.startsWith('images/') && method === 'PUT') {
    const id = path.split('/')[1];
    const fields = await request.json();
    await updateImage(env.DB, { actor, id, fields });
    return json({ ok: true });
  }
  if (path.startsWith('images/') && path.endsWith('/hide') && method === 'POST') {
    const id = path.split('/')[1];
    await hideImage(env.DB, { actor, id });
    return json({ ok: true });
  }
  if (path.startsWith('images/') && path.endsWith('/delete') && method === 'POST') {
    const id = path.split('/')[1];
    await softDeleteImage(env.DB, { actor, id });
    return json({ ok: true });
  }
  if (path.startsWith('images/') && path.endsWith('/unlink') && method === 'POST') {
    const id = path.split('/')[1];
    await unlinkImage(env.DB, { actor, imageId: id });
    return json({ ok: true });
  }
  if (path.startsWith('images/') && path.endsWith('/link') && method === 'POST') {
    const id = path.split('/')[1];
    const b = await request.json();
    if (b.productId) {
      await linkImageToProduct(env.DB, { actor, imageId: id, productId: b.productId });
    } else if (b.categoryId) {
      await linkImageToCategory(env.DB, { actor, imageId: id, categoryId: b.categoryId });
    } else {
      return json({ error: 'missing_target' }, 400);
    }
    return json({ ok: true });
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

// ---- image upload (multipart → R2 + images row) -------------
// Degrades safely if env.IMAGES (R2 binding) is absent: returns
// a clear error so the dashboard can tell the owner to configure R2.
async function handleImageUpload(request, env, actor) {
  if (!env.IMAGES) {
    return json({ error: 'r2_not_configured',
      message: 'R2 binding غير مُفعّل. أنشئ الـbucket وفعّل الـbinding في wrangler.toml.' }, 400);
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'no_file' }, 400);
  }

  const type = form.get('type') || 'product';
  const altAr = form.get('alt_ar') || '';
  const width = form.get('width') ? parseInt(form.get('width'), 10) : null;
  const height = form.get('height') ? parseInt(form.get('height'), 10) : null;
  const productId = form.get('product_id') || null;
  const categoryId = form.get('category_id') || null;

  // Derive a stable r2_key: img_<timestamp>_<random>.<ext>
  const ext = (file.name || '').split('.').pop() || 'webp';
  const r2Key = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const filename = file.name || r2Key;

  // Read the file bytes and put to R2.
  const bytes = await file.arrayBuffer();
  await env.IMAGES.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || 'image/webp' },
  });

  // Insert the images row.
  const { id } = await createImage(env.DB, {
    actor, filename, r2Key, type, altAr, width, height,
  });

  // Optionally link to a product or category.
  if (productId) {
    await linkImageToProduct(env.DB, { actor, imageId: id, productId });
  } else if (categoryId) {
    await linkImageToCategory(env.DB, { actor, imageId: id, categoryId });
  }

  return json({ ok: true, id, r2Key, filename });
}
