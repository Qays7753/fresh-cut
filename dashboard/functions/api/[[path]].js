// Cloudflare Pages Function — dashboard API proxy.
//
// The entire dashboard project sits behind Cloudflare Access. Access
// authenticates the user at the edge and injects a verified
// Cf-Access-Jwt-Assertion header (stripping any client-supplied one), so
// every request that reaches this Function is already authenticated.
//
// We forward every /api/* request — including /api/admin/* — to the API
// worker over the `API` service binding, carrying the Access headers
// through so the worker can identify the actor.

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.API) {
    // Service binding not configured yet — fail loudly so it's easy to spot.
    return new Response(
      JSON.stringify({ error: 'api_binding_missing' }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  return env.API.fetch(request);
}
