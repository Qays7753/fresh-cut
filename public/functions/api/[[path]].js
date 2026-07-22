// Cloudflare Pages Function — public site API proxy.
//
// The static public site calls same-origin /api/* paths (e.g. the lead
// form POSTs to /api/leads). We forward those to the API worker over the
// `API` service binding, so the browser stays same-origin (no CORS) and
// the worker needs no public URL.
//
// SECURITY: admin endpoints live only behind Cloudflare Access on the
// dashboard project. The public site is unauthenticated, so we hard-block
// /api/admin/* here — a forged Cf-Access-* header must never reach the
// worker through this origin.

export async function onRequest(context) {
  const { request, env } = context;
  const { pathname } = new URL(request.url);

  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (!env.API) {
    // Service binding not configured yet — fail loudly so it's easy to spot.
    return new Response(
      JSON.stringify({ error: 'api_binding_missing' }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  return env.API.fetch(request);
}
