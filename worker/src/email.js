// worker/src/email.js
// Fire-and-forget notification email. Per form-submit-order skill:
// "email notification is fire-and-forget and its failure never
// blocks the lead or the WhatsApp handoff."
//
// Secrets ( MailChannels / Resend / any provider ) are configurable
// via wrangler secrets. If absent, we degrade silently: log only.

const MAILCHANNELS_ENDPOINT = 'https://api.mailchannels.net/tx/v1/send';

export async function sendLeadNotification(env, { to, ref, lead }) {
  // Degrade safely: if no API key or no recipient, never throw.
  if (!to) return { ok: false, reason: 'no_recipient' };

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: 'no-reply@alyaf-alshamal.pages.dev', name: 'ألياف الشمال' },
    subject: `طلب جديد — ${ref}`,
    content: [{ type: 'text/plain', value: buildBody(ref, lead) }],
  };

  try {
    if (env.MAILCHANNELS_KEY) {
      // Authenticated path — secret is set in wrangler.
      const r = await fetch(MAILCHANNELS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': env.MAILCHANNELS_KEY,
        },
        body: JSON.stringify(payload),
      });
      return { ok: r.ok, status: r.status };
    }
    // Unauthenticated path: MailChannels allows Cloudflare Workers
    // to send without an API key from verified origins. If it fails,
    // we swallow the error — the lead is already saved to D1.
    const r = await fetch(MAILCHANNELS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
