// Cloudflare Pages advanced-mode Worker for the PUBLIC site.
//
// A single _worker.js at the root of the deployed directory is always
// detected by Pages (unlike a functions/ folder, whose location is
// ambiguous with `wrangler pages deploy`). It routes /api/* to the API
// worker over the `API` service binding and serves everything else from
// the static assets via env.ASSETS.
//
// SECURITY: the public site is unauthenticated, so /api/admin/* is hard
// blocked here — a forged Cf-Access-* header must never reach the worker
// through this origin.

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/api' || p.startsWith('/api/')) {
      if (p === '/api/admin' || p.startsWith('/api/admin/')) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: JSON_HEADERS });
      }
      if (!env.API) {
        return new Response(JSON.stringify({ error: 'api_binding_missing' }), { status: 502, headers: JSON_HEADERS });
      }
      return env.API.fetch(request);
    }

    // Everything else: static assets.
    return env.ASSETS.fetch(request);
  },
};
