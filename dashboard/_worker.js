// Cloudflare Pages advanced-mode Worker for the DASHBOARD.
//
// The whole dashboard project sits behind Cloudflare Access, which
// authenticates the user at the edge and injects a verified
// Cf-Access-Jwt-Assertion header (stripping any client-supplied one).
// We forward every /api/* request — including /api/admin/* — to the API
// worker over the `API` service binding, and serve everything else from
// the static assets via env.ASSETS.

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === '/api' || p.startsWith('/api/')) {
      if (!env.API) {
        return new Response(JSON.stringify({ error: 'api_binding_missing' }), { status: 502, headers: JSON_HEADERS });
      }
      return env.API.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
