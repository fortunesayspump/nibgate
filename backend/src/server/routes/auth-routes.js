import { createNonce, verifySignatureAndLogin, getUserBySession, logoutSession, constructSignMessage } from '@nibgate/internal/auth.js';

export function registerAuthRoutes(app) {
  const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/' };
  if (process.env.NODE_ENV === 'production') { cookieOpts.secure = true; cookieOpts.domain = '.nibgate.xyz'; }
  
  // 1. Generate Nonce
  app.get('/api/auth/nonce', (req, res) => {
    const nonce = createNonce();
    res.cookie('auth_nonce', nonce, { ...cookieOpts, maxAge: 1000 * 60 * 10 });
    
    res.json({ nonce, messageTemplate: constructSignMessage(nonce) });
  });

  // 2. Verify Signature & Login
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const { walletAddress, signature } = req.body;
      const expectedNonce = req.cookies.auth_nonce;

      if (!expectedNonce) {
        return res.status(400).json({ error: 'Session expired. Please request a new nonce.' });
      }

      const { user, sessionToken } = await verifySignatureAndLogin(walletAddress, signature, expectedNonce);

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
