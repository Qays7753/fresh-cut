// worker/src/email.js
// Fire-and-forget lead-notification email via Resend.
//
// Contract (form-submit-order skill): this is best-effort — its failure
// never blocks the lead save or the WhatsApp handoff, and it must never
// throw. If RESEND_API_KEY is not set, we degrade to a silent no-op.
//
// Config (set via `wrangler secret put` / [vars]):
//   RESEND_API_KEY  — required for email to actually send.
//                     `wrangler secret put RESEND_API_KEY`
//   MAIL_FROM       — optional "from" address. Must be on a domain you
//                     have verified in Resend. If unset, we fall back to
//                     Resend's shared sandbox sender, which only delivers
//                     to the address that owns the Resend account.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'ألياف الشمال <onboarding@resend.dev>';

export async function sendLeadNotification(env, { to, ref, lead }) {
  // Degrade safely: no recipient or no API key → never throw, no-op.
  if (!to) return { ok: false, reason: 'no_recipient' };
  if (!env.RESEND_API_KEY) return { ok: false, reason: 'no_api_key' };

  const payload = {
    from: env.MAIL_FROM || DEFAULT_FROM,
    to: [to],
    subject: `طلب جديد — ${ref}`,
    text: buildBody(ref, lead),
  };

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    // NEVER throw. The lead has already been saved; this is best-effort.
    return { ok: false, reason: 'network_error' };
  }
}

function buildBody(ref, lead) {
  const lines = [
    `وصل طلب جديد بمرجع: ${ref}`,
    '',
    `النوع: ${lead.type === 'sample' ? 'عيّنة' : 'توريد'}`,
    `المطعم: ${lead.restaurantName || '-'}`,
    `الشخص: ${lead.contactName || '-'}`,
    `الهاتف: ${lead.contactPhone || '-'}`,
    `المنطقة: ${lead.area || '-'}`,
    '',
    `الأصناف المطلوبة:`,
    lead.itemsText || '-',
    '',
    `أهم ثلاثة أصناف تُستهلك أسبوعياً:`,
    lead.topItemsAr || '-',
    '',
    `المصدر: ${lead.source || '-'}`,
    '',
    `رابط واتساب مباشر: https://wa.me/962${(lead.contactPhone || '').replace(/^0/, '')}`,
  ];
  return lines.join('\n');
}
