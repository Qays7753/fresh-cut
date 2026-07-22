// worker/src/queries.js
// =============================================================
// QUERY-ISOLATION LAYER — the single file every D1 interaction
// passes through. Spec §9.6: "every D1 interaction goes through
// one file. Moving to Postgres later becomes editing one file."
//
// Responsibilities:
//   * All SQL lives here. Handlers never write raw SQL.
//   * Every mutation writes one row into audit_log.
//   * Soft-delete only: deleted_at set, row never removed.
//   * Timestamps (created_at/updated_at) set centrally.
//   * IDs are ULID-like (timestamp-prefixed, sortable).
// =============================================================

// ---- helpers ------------------------------------------------

const nowIso = () => new Date().toISOString();

// Generate an ID that is sortable and collision-resistant.
// Layout: 13-digit ms timestamp + 8-char random base36.
export function makeId(prefix) {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

// Generate a reference number AS-YYMM-NNN (spec §4 leads.ref).
// Caller passes a sequence counter; we format + zero-pad.
export function formatLeadRef(seq) {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const nnn = String(seq).padStart(3, '0');
  return `AS-${yy}${mm}-${nnn}`;
}

// Normalize Jordanian phone numbers to a single canonical form
// (local 07XXXXXXXX). Accepts 07, +9627, 009627.
export function normalizeJoPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+9627')) return '0' + digits.slice(4);
  if (digits.startsWith('009627')) return '0' + digits.slice(6);
  if (digits.startsWith('9627')) return '0' + digits.slice(3);
  if (digits.startsWith('07')) return digits.slice(0, 10);
  return digits;
}

// Wrap a value for SQL binding (JSON stringify objects/arrays).
function bind(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ---- audit log ----------------------------------------------

async function audit(db, { actor, table, recordId, action, diff }) {
  const now = nowIso();
  await db.prepare(
    `INSERT INTO audit_log (id, actor, table_name, record_id, action, diff, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('aud'),
    actor || 'system',
    table,
    recordId || null,
    action,
    diff ? JSON.stringify(diff) : null,
    now, now
  ).run();
}

// ---- settings -----------------------------------------------

export async function getSettings(db) {
  const { results } = await db.prepare(
    `SELECT key, value FROM settings WHERE deleted_at IS NULL`
  ).all();
  const out = {};
  for (const row of results) out[row.key] = row.value;
  return out;
}

export async function getSetting(db, key) {
  const row = await db.prepare(
    `SELECT value FROM settings WHERE key = ? AND deleted_at IS NULL`
  ).bind(key).first();
  return row ? row.value : null;
}

export async function updateSetting(db, { actor, key, value }) {
  const now = nowIso();
  await db.prepare(
    `UPDATE settings SET value = ?, updated_at = ? WHERE key = ? AND deleted_at IS NULL`
  ).bind(value, now, key).run();
  await audit(db, { actor, table: 'settings', action: 'update',
    diff: { key, value } });
}

// ---- catalog (public) ---------------------------------------

export async function getCatalogForPublic(db) {
  const cats = await db.prepare(
    `SELECT id, name_ar, name_en FROM categories
     WHERE visible = 1 AND deleted_at IS NULL
     ORDER BY sort_order`
  ).all();

  const products = await db.prepare(
    `SELECT p.id, p.slug, p.name_ar, p.name_en, p.summary_ar, p.category_id,
            v.id AS variant_id, v.cut_id, v.pack_size,
            v.shelf_life_days, v.availability, v.availability_note_ar,
            c.name_ar AS cut_name_ar
     FROM products p
     LEFT JOIN variants v ON v.product_id = p.id AND v.visible = 1 AND v.deleted_at IS NULL
     LEFT JOIN cuts c ON c.id = v.cut_id AND c.deleted_at IS NULL
     WHERE p.visible = 1 AND p.deleted_at IS NULL
     ORDER BY p.sort_order`
  ).all();

  return { categories: cats.results, products: products.results };
}

// ---- leads --------------------------------------------------

export async function nextLeadRefSeq(db) {
  // Count leads created this month to derive the sequence.
  const prefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM leads
     WHERE created_at LIKE ? || '%'`
  ).bind(prefix + '-').first();
  return (row?.n || 0) + 1;
}

export async function createLead(db, {
  actor, ref, restaurantId, contactId, type,
  items, topItemsAr, source, whatsappOpened
}) {
  const id = makeId('lead');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO leads
       (id, ref, restaurant_id, contact_id, type, items, top_items_ar,
        source, whatsapp_opened, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  ).bind(
    id, ref, restaurantId || null, contactId || null, type,
    bind(items), topItemsAr || null, source || null,
    whatsappOpened ? 1 : 0, now, now
  ).run();

  // First event: created.
  await db.prepare(
    `INSERT INTO lead_events (id, lead_id, event_type, note, actor, created_at, updated_at)
     VALUES (?, ?, 'created', ?, ?, ?, ?)`
  ).bind(makeId('lev'), id, 'Lead created from public form', actor || 'public', now, now).run();

  await audit(db, { actor: actor || 'public', table: 'leads', recordId: id,
    action: 'create', diff: { ref, type, source } });

  return { id, ref };
}

export async function computeLeadStatus(db, leadId) {
  // Status is the latest non-`created` event; falls back to `new`.
  const row = await db.prepare(
    `SELECT event_type FROM lead_events
     WHERE lead_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`
  ).bind(leadId).first();
  return row && row.event_type !== 'created' ? row.event_type : 'new';
}

export async function listLeads(db, { limit = 100, offset = 0 } = {}) {
  const { results } = await db.prepare(
    `SELECT l.id, l.ref, l.type, l.status, l.source, l.created_at,
            r.name AS restaurant_name, r.area AS restaurant_area,
            c.name AS contact_name, c.phone AS contact_phone
     FROM leads l
     LEFT JOIN restaurants r ON r.id = l.restaurant_id
     LEFT JOIN contacts c ON c.id = l.contact_id
     WHERE l.deleted_at IS NULL
     ORDER BY l.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return results;
}

export async function getLead(db, leadId) {
  const lead = await db.prepare(
    `SELECT l.*, r.name AS restaurant_name, r.area AS restaurant_area,
            r.address AS restaurant_address, r.notes AS restaurant_notes,
            c.name AS contact_name, c.phone AS contact_phone, c.role AS contact_role
     FROM leads l
     LEFT JOIN restaurants r ON r.id = l.restaurant_id
     LEFT JOIN contacts c ON c.id = l.contact_id
     WHERE l.id = ? AND l.deleted_at IS NULL`
  ).bind(leadId).first();
  if (!lead) return null;

  const { results: events } = await db.prepare(
    `SELECT id, event_type, note, actor, created_at
     FROM lead_events WHERE lead_id = ?
     ORDER BY created_at ASC, id ASC`
  ).bind(leadId).all();

  return { ...lead, events };
}

export async function listToday(db) {
  // New leads not yet contacted
  const newLeads = await db.prepare(
    `SELECT COUNT(*) AS n FROM leads l
     WHERE l.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM lead_events e
         WHERE e.lead_id = l.id AND e.event_type IN ('contacted','sample_sent','converted','rejected')
       )
       AND l.created_at <= datetime('now','-48 hours')`
  ).first();

  // Promised samples not sent within 3 days
  const overdueSamples = await db.prepare(
    `SELECT COUNT(*) AS n FROM leads l
     WHERE l.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM lead_events e
                   WHERE e.lead_id = l.id AND e.event_type = 'contacted')
       AND NOT EXISTS (SELECT 1 FROM lead_events e
                       WHERE e.lead_id = l.id AND e.event_type = 'sample_sent')
       AND l.created_at <= datetime('now','-3 days')`
  ).first();

  // Items marked "out" more than 3 days ago
  const staleOut = await db.prepare(
    `SELECT COUNT(*) AS n FROM variants v
     WHERE v.deleted_at IS NULL
       AND v.availability = 'out_today'
       AND v.updated_at <= datetime('now','-3 days')`
  ).first();

  return {
    newLeadsOverdue: newLeads?.n || 0,
    samplesOverdue:  overdueSamples?.n || 0,
    staleOutItems:   staleOut?.n || 0,
  };
}

// ---- restaurants + contacts --------------------------------

export async function findRestaurantByNameArea(db, name, area) {
  if (!name) return null;
  return await db.prepare(
    `SELECT id FROM restaurants
     WHERE name = ? AND (area = ? OR (? IS NULL AND area IS NULL))
       AND deleted_at IS NULL LIMIT 1`
  ).bind(name, area, area).first();
}

export async function createRestaurant(db, { actor, name, area, address, notes }) {
  const id = makeId('res');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO restaurants (id, name, area, address, notes, first_contact_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  ).bind(id, name, area || null, address || null, notes || null, now, now, now).run();
  await audit(db, { actor, table: 'restaurants', recordId: id, action: 'create',
    diff: { name, area } });
  return id;
}

export async function createContact(db, { actor, restaurantId, name, phone, role, isPrimary }) {
  const id = makeId('con');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO contacts (id, restaurant_id, name, phone, role, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, restaurantId, name, phone || null, role || null, isPrimary ? 1 : 0, now, now).run();
  await audit(db, { actor, table: 'contacts', recordId: id, action: 'create',
    diff: { restaurantId, name } });
  return id;
}

export async function listRestaurants(db, { limit = 100, offset = 0 } = {}) {
  const { results } = await db.prepare(
    `SELECT id, name, area, status, first_contact_at, created_at
     FROM restaurants WHERE deleted_at IS NULL
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return results;
}

// ---- products (admin) --------------------------------------

export async function listProducts(db) {
  const { results } = await db.prepare(
    `SELECT p.id, p.slug, p.name_ar, p.name_en, p.visible, p.sort_order,
            c.name_ar AS category_name_ar,
            (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS variant_count
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.sort_order`
  ).all();
  return results;
}

export async function createProduct(db, { actor, name, categoryId, cutId, slug }) {
  const id = makeId('prd');
  const now = nowIso();
  const finalSlug = slug || (id.replace('prd_', ''));
  await db.prepare(
    `INSERT INTO products (id, slug, name_ar, category_id, visible, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 0, ?, ?)`
  ).bind(id, finalSlug, name, categoryId, now, now).run();

  if (cutId) {
    const vid = makeId('var');
    await db.prepare(
      `INSERT INTO variants (id, product_id, cut_id, pack_size, availability, visible, created_at, updated_at)
       VALUES (?, ?, ?, '1kg', 'available', 1, ?, ?)`
    ).bind(vid, id, cutId, now, now).run();
  }

  await audit(db, { actor, table: 'products', recordId: id, action: 'create',
    diff: { name, categoryId, slug: finalSlug } });
  return id;
}

export async function updateProduct(db, { actor, id, fields }) {
  const now = nowIso();
  const allowed = ['name_ar','name_en','summary_ar','body_ar','visible','sort_order',
                   'origin','season_months','usage_notes_ar','storage_temp','product_code','slug'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); vals.push(bind(fields[k])); }
  }
  if (!sets.length) return;
  sets.push(`updated_at = ?`);
  vals.push(now, id);
  await db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...vals).run();
  await audit(db, { actor, table: 'products', recordId: id, action: 'update', diff: fields });
}

// Bulk edit: tick N items, change one field in one tap.
export async function bulkUpdateVariantAvailability(db, { actor, variantIds, availability, note }) {
  const now = nowIso();
  const placeholders = variantIds.map(() => '?').join(',');
  await db.prepare(
    `UPDATE variants SET availability = ?, availability_note_ar = ?, updated_at = ?
     WHERE id IN (${placeholders}) AND deleted_at IS NULL`
  ).bind(availability, note || null, now, ...variantIds).run();
  await audit(db, { actor, table: 'variants', action: 'bulk_update',
    diff: { variantIds, availability, note } });
}

// ---- variants ----------------------------------------------

export async function listVariants(db, productId) {
  const { results } = await db.prepare(
    `SELECT v.*, c.name_ar AS cut_name_ar
     FROM variants v
     LEFT JOIN cuts c ON c.id = v.cut_id
     WHERE v.product_id = ? AND v.deleted_at IS NULL
     ORDER BY v.created_at`
  ).bind(productId).all();
  return results;
}

export async function updateVariant(db, { actor, id, fields }) {
  const now = nowIso();
  const allowed = ['pack_size','shelf_life_days','shelf_life_open_days',
                   'price','min_order','availability','availability_note_ar','visible'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); vals.push(bind(fields[k])); }
  }
  if (!sets.length) return;
  sets.push(`updated_at = ?`);
  vals.push(now, id);
  await db.prepare(`UPDATE variants SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...vals).run();
  await audit(db, { actor, table: 'variants', recordId: id, action: 'update', diff: fields });
}

// ---- cuts + categories (admin) -----------------------------

export async function listCuts(db) {
  const { results } = await db.prepare(
    `SELECT c.id, c.name_ar, c.name_en, c.visible, c.sort_order,
            (SELECT COUNT(*) FROM variants v WHERE v.cut_id = c.id AND v.deleted_at IS NULL) AS usage_count
     FROM cuts c WHERE c.deleted_at IS NULL ORDER BY c.sort_order`
  ).all();
  return results;
}

export async function listCategories(db) {
  const { results } = await db.prepare(
    `SELECT c.id, c.name_ar, c.name_en, c.visible, c.sort_order,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS usage_count
     FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort_order`
  ).all();
  return results;
}

export async function createCut(db, { actor, nameAr, nameEn }) {
  const id = makeId('cut');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO cuts (id, name_ar, name_en, visible, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order),0)+10 FROM cuts), ?, ?)`
  ).bind(id, nameAr, nameEn || null, now, now).run();
  await audit(db, { actor, table: 'cuts', recordId: id, action: 'create', diff: { nameAr } });
  return id;
}

export async function createCategory(db, { actor, nameAr, nameEn }) {
  const id = makeId('cat');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO categories (id, name_ar, name_en, visible, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order),0)+10 FROM categories), ?, ?)`
  ).bind(id, nameAr, nameEn || null, now, now).run();
  await audit(db, { actor, table: 'categories', recordId: id, action: 'create', diff: { nameAr } });
  return id;
}

// Hide, never delete (spec §4).
export async function hideCut(db, { actor, id }) {
  const now = nowIso();
  await db.prepare(
    `UPDATE cuts SET visible = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
  ).bind(now, id).run();
  await audit(db, { actor, table: 'cuts', recordId: id, action: 'hide', diff: {} });
}

export async function hideCategory(db, { actor, id }) {
  const now = nowIso();
  await db.prepare(
    `UPDATE categories SET visible = 0, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
  ).bind(now, id).run();
  await audit(db, { actor, table: 'categories', recordId: id, action: 'hide', diff: {} });
}

// ---- private links -----------------------------------------

export async function createPrivateLink(db, { actor, productIds, note, expiresAt }) {
  const id = makeId('plk');
  const token = makeId('tok').replace('tok_', '');
  const now = nowIso();
  await db.prepare(
    `INSERT INTO private_links (id, token, product_ids, note, expires_at, view_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, token, bind(productIds), note || null, expiresAt || null, now, now).run();
  await audit(db, { actor, table: 'private_links', recordId: id, action: 'create', diff: { note } });
  return { id, token };
}

export async function listPrivateLinks(db) {
  const { results } = await db.prepare(
    `SELECT id, token, product_ids, note, expires_at, view_count, created_at
     FROM private_links WHERE deleted_at IS NULL
     ORDER BY created_at DESC`
  ).all();
  return results;
}

export async function consumePrivateLinkView(db, token) {
  await db.prepare(
    `UPDATE private_links SET view_count = view_count + 1, updated_at = ?
     WHERE token = ? AND deleted_at IS NULL`
  ).bind(nowIso(), token).run();
}

// ---- data view (CSV export) --------------------------------

export async function exportTable(db, table) {
  const allowed = ['leads','products','variants','restaurants','contacts',
                   'lead_events','categories','cuts','audit_log','private_links'];
  if (!allowed.includes(table)) throw new Error('table not exportable');

  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 5000`).all();
  return results;
}
