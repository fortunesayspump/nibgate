const catchAsync = require('../utils/catchAsync');
const authService = require('../services/auth.service');
const siweService = require('../services/siwe.service');
const ApiError = require('../utils/ApiError');
const { status } = require('http-status');

const register = catchAsync(async (req, res) => {
  const { user, token } = await authService.register({ ...req.body, siteId: req.siteId });
  res.status(status.CREATED).json({ success: true, user, token });
});

const login = catchAsync(async (req, res) => {
  const { user, token } = await authService.login({ ...req.body });
  res.json({ success: true, user, token });
});

const me = catchAsync(async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      bio: req.user.bio,
      avatarUrl: req.user.avatarUrl,
    },
  });
});

const siweNonce = catchAsync(async (req, res) => {
  const { nonce, token } = siweService.createNonce();
  res.cookie(siweService.nonceCookieName, token, { ...siweService.cookieOpts, maxAge: 10 * 60 * 1000 });
  res.json({ nonce });
});

const siweVerify = catchAsync(async (req, res) => {
  const { message, signature, domain } = req.body || {};
  const nonceToken = req.cookies?.[siweService.nonceCookieName];
  const expectedNonce = nonceToken ? siweService.decodeNonceToken(nonceToken) : null;
  if (!expectedNonce) {
    throw new ApiError(status.BAD_REQUEST, 'Session expired. Please request a new nonce.');
  }
  const expectedDomain = domain || req.get('x-forwarded-host') || req.get('host');
  const { user, sessionToken } = await siweService.verifySignInAndLogin(req.siteId, {
    message,
    signature,
    expectedNonce,
    expectedDomain,
  });
  res.clearCookie(siweService.nonceCookieName, siweService.cookieOpts);
  res.cookie(siweService.cookieName, sessionToken, { ...siweService.cookieOpts, maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user, token: sessionToken });
});

const siweLogout = catchAsync(async (req, res) => {
  res.clearCookie(siweService.cookieName, siweService.cookieOpts);
  res.clearCookie(siweService.nonceCookieName, siweService.cookieOpts);
  res.json({ success: true });
});

const siweSession = catchAsync(async (req, res) => {
  const token = req.cookies?.[siweService.cookieName] || '';
  const user = await siweService.getUserBySessionToken(token);
  if (!user) {
    return res.status(status.UNAUTHORIZED).json({ authenticated: false });
  }
  res.json({ authenticated: true, user });
});

module.exports = {
  register,
  login,
  me,
  siweNonce,
  siweVerify,
  siweLogout,
  siweSession,
};
