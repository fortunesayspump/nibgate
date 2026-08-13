import { createNonce, verifySignInAndLogin, getUserBySession, logoutSession } from '@nibgate/internal/auth.js';

// In-memory SIWE brute-force guard: the verify endpoint gets a tight cap (20
// attempts per IP per 15 min); the nonce endpoint is fetched on every
// wallet-connect modal open, so it gets a generous cap (300/15 min) to avoid
// locking out legit users behind shared NAT/VPN. Mirrors the tracking-rate-limit
// bucket pattern; resets on restart, which is acceptable for an auth throttle.
const authBuckets = new Map();
const AUTH_LIMITS = { nonce: 300, verify: 20 };
function checkAuthRateLimit(req, kind) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const key = `${kind}:${ip}`;
  const bucket = authBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    authBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  const max = AUTH_LIMITS[kind] || 20;
  return bucket.count > max ? { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) } : { ok: true };
}

export function registerAuthRoutes(app) {
  const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/' };
  if (process.env.NODE_ENV === 'production') { cookieOpts.secure = true; cookieOpts.domain = '.nibgate.xyz'; }
  
  // 1. Generate Nonce
  app.get('/api/auth/nonce', (req, res) => {
    const rate = checkAuthRateLimit(req, 'nonce');
    if (!rate.ok) return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rate.retryAfter });
    const nonce = createNonce();
    res.cookie('auth_nonce', nonce, { ...cookieOpts, maxAge: 1000 * 60 * 10 });
    
    res.json({ nonce });
  });

  // 2. Verify Signature & Login
  app.post('/api/auth/verify', async (req, res) => {
    const rate = checkAuthRateLimit(req, 'verify');
    if (!rate.ok) return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rate.retryAfter });
    try {
      const { message, signature } = req.body;
      const expectedNonce = req.cookies.auth_nonce;
      const expectedDomain = req.body?.domain || req.headers['x-forwarded-host'] || req.headers.host;

      if (!expectedNonce) {
        return res.status(400).json({ error: 'Session expired. Please request a new nonce.' });
      }

      const { user, sessionToken } = await verifySignInAndLogin({ message, signature, expectedNonce, expectedDomain });

      res.clearCookie('auth_nonce', { ...cookieOpts });
      res.cookie('auth_session', sessionToken, { ...cookieOpts, maxAge: 1000 * 60 * 60 * 24 * 30 });

      res.json({ success: true, user });
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
  });

  // 3. Get Current User
  app.get('/api/auth/me', async (req, res) => {
    try {
      const sessionToken = req.cookies.auth_session;
      const user = await getUserBySession(sessionToken);
      
      if (!user) {
        return res.status(401).json({ authenticated: false });
      }
      
      res.json({ authenticated: true, user });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // 4. Logout
  app.post('/api/auth/logout', async (req, res) => {
    const sessionToken = req.cookies.auth_session;
    await logoutSession(sessionToken);
    
    res.clearCookie('auth_session');
    res.json({ success: true });
  });
}
