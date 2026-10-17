// Auth0 middleware: works out which user is calling the API from their access token.
//
// - AUTH0_DOMAIN not set   → auth is off; everyone is the "local" user (handy for development).
// - AUTH0_AUDIENCE set     → the token is a JWT for our Auth0 API; we verify its signature locally.
// - only AUTH0_DOMAIN set  → we ask Auth0's /userinfo endpoint who the token belongs to.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;
export const AUTH_ENABLED = Boolean(domain);

const jwks = domain && audience
  ? createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`))
  : null;

// Auth0 rate-limits /userinfo, and the browser reuses one token for many requests,
// so remember each token's user for a while.
const userinfoCache = new Map(); // token → { sub, expires }
const CACHE_MS = 10 * 60 * 1000;

async function userFromToken(token) {
  if (jwks) {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${domain}/`, audience });
    return payload.sub;
  }
  const hit = userinfoCache.get(token);
  if (hit && hit.expires > Date.now()) return hit.sub;

  const res = await fetch(`https://${domain}/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`userinfo returned ${res.status}`);
  const { sub } = await res.json();
  if (userinfoCache.size > 1000) userinfoCache.clear();
  userinfoCache.set(token, { sub, expires: Date.now() + CACHE_MS });
  return sub;
}

// Sets req.userId (the Auth0 `sub`, e.g. "auth0|abc123") or answers 401.
export async function requireUser(req, res, next) {
  if (!AUTH_ENABLED) {
    req.userId = 'local';
    return next();
  }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try {
    req.userId = await userFromToken(token);
    next();
  } catch (err) {
    console.error('Auth failed:', err.message);
    res.status(401).json({ error: 'Your login expired. Please log in again.' });
  }
}
