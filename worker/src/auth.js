// worker/src/auth.js
// =============================================================
// Internal session auth — replaces Cloudflare Access.
//
// Token format (JWT-like, HMAC-SHA256):
//   <header>.<payload>.<signature>
//   header  = base64url({"alg":"HS256","typ":"JWT"})  (fixed)
//   payload = base64url({ sub, iat, exp, jti })
//   sig     = base64url(HMAC-SHA256(SESSION_SECRET, header + "." + payload))
//
// Secrets (set via `wrangler secret put`, never committed):
//   ADMIN_PASSWORD_HASH = base64(SHA-256(owner_password))  (32 raw bytes → 44 b64 chars)
//   SESSION_SECRET      = 32+ random bytes (any string; used as HMAC key)
//
// Session lifetime: 12 hours. Stateless — no DB table, no revocation
// list. Logout = clear the cookie (the token itself stays valid until
// exp, but the browser no longer sends it).
// =============================================================

const enc = new TextEncoder();
const SESSION_TTL_SEC = 12 * 3600; // 43200s = 12h
const COOKIE_NAME = 'alyaf_admin_session';

const HEADER_B64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

// ---- HMAC key import (cached per-request via env) -----------

async function hmacKey(env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET not configured');
  return crypto.subtle.importKey(
    'raw',
    enc.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// ---- token mint / verify ------------------------------------

export async function mintSession(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin',
    iat: now,
    exp: now + SESSION_TTL_SEC,
    jti: Math.random().toString(36).slice(2, 10),
  };
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = enc.encode(`${HEADER_B64}.${payloadB64}`);
  const sigBuf = await crypto.subtle.sign('HMAC', await hmacKey(env), data);
  const token = `${HEADER_B64}.${payloadB64}.${b64url(new Uint8Array(sigBuf))}`;
  return { token, exp: payload.exp };
}

export async function verifySessionToken(env, tokenStr) {
  if (!tokenStr) return null;
  const parts = tokenStr.split('.');
  if (parts.length !== 3) return null;
  const [header, payloadB64, sigB64] = parts;
  if (header !== HEADER_B64) return null;

  // Constant-time signature verification (Web Crypto's verify is already
  // constant-time internally; this is the canonical path).
  let ok = false;
  try {
    const key = await hmacKey(env);
    const data = enc.encode(`${header}.${payloadB64}`);
    const sig = b64urlDecode(sigB64);
    ok = await crypto.subtle.verify('HMAC', key, sig, data);
  } catch { return null; }
  if (!ok) return null;

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))); }
  catch { return null; }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload; // { sub, iat, exp, jti }
}

// ---- password verify (constant-time) ------------------------

export async function verifyPassword(env, plain) {
  if (!env.ADMIN_PASSWORD_HASH || !plain) return false;
  const inHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(plain)));
  let stored;
  try { stored = b64urlDecode(env.ADMIN_PASSWORD_HASH); }
  catch { return false; }
  if (inHash.length !== stored.length) return false;
  // Manual constant-time XOR compare over the 32-byte SHA-256 digests.
  let diff = 0;
  for (let i = 0; i < inHash.length; i++) diff |= inHash[i] ^ stored[i];
  return diff === 0;
}

// ---- cookie helpers -----------------------------------------

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SEC}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function extractToken(request) {
  // Cookie first (browser path), then Authorization: Bearer (API/curl path).
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)alyaf_admin_session=([^;]+)/);
  if (m) return m[1];
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

// ---- base64url helpers (URL-safe, no padding) --------------

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
