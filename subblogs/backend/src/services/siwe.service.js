const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/config');
const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const { status } = require('http-status');
const { ARC_TESTNET } = require('@nibgate/wallet');
const {
  createSignInNonce,
  parseSignInMessage,
  validateSignInMessage,
  verifySignature,
} = require('@nibgate/wallet/siwe.js');

const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/' };
if (config.env === 'production') cookieOpts.secure = true;

function newNonceToken(nonce) {
  return jwt.sign({ nonce }, config.jwt.secret, { expiresIn: '10m' });
}

function decodeNonceToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    return typeof payload.nonce === 'string' ? payload.nonce : null;
  } catch {
    return null;
  }
}

function generateSessionToken(user) {
  return jwt.sign(
    { sub: user.id, siteId: user.siteId, role: user.role, kind: 'siwe' },
    config.jwt.secret,
    { expiresIn: `${30 * 24 * 60}m` }
  );
}

async function findOrCreateWalletUser(siteId, walletAddress) {
  const address = walletAddress.toLowerCase();
  const email = `wallet-${address.replace(/^0x/, '')}@wallets.nibgate.xyz`;

  const existing = await prisma.user.findFirst({ where: { siteId, walletAddress: address } });
  if (existing) return existing;

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.walletAddress !== address) {
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { siteId, walletAddress: address },
      });
    }
    return byEmail;
  }

  const password = crypto.randomBytes(24).toString('hex');
  const name = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const user = await prisma.user.create({
    data: {
      siteId,
      name,
      email,
      password,
      role: 'reader',
      walletAddress: address,
    },
  });
  return user;
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    siteId: user.siteId,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    wallets: user.walletAddress ? [{ address: user.walletAddress, isPrimary: true }] : [],
  };
}

async function verifySignInAndLogin(siteId, { message, signature, expectedNonce, expectedDomain }) {
  const parsed = parseSignInMessage(message);
  if (!parsed) throw new ApiError(status.BAD_REQUEST, 'Invalid sign-in message');
  if (!expectedNonce || parsed.nonce !== expectedNonce) {
    throw new ApiError(status.BAD_REQUEST, 'Nonce does not match. Please request a new nonce.');
  }
  const isValid = validateSignInMessage({
    message: parsed,
    expected: { chainId: ARC_TESTNET.id, domain: expectedDomain, time: new Date() },
  });
  if (!isValid) throw new ApiError(status.BAD_REQUEST, 'Sign-in message is invalid or expired.');

  const walletAddress = parsed.address.toLowerCase();
  const validSignature = await verifySignature({ message, signature, address: parsed.address });
  if (!validSignature) throw new ApiError(status.UNAUTHORIZED, 'Invalid signature');

  const user = await findOrCreateWalletUser(siteId, walletAddress);
  const sessionToken = generateSessionToken(user);
  return { user: serializeUser(user), sessionToken };
}

async function getUserBySessionToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.kind !== 'siwe') return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.walletAddress == null) return null;
    return serializeUser(user);
  } catch {
    return null;
  }
}

const cookieName = 'sb_auth_session';
const nonceCookieName = 'sb_auth_nonce';

module.exports = {
  cookieOpts,
  cookieName,
  nonceCookieName,
  createNonce: () => {
    const nonce = createSignInNonce();
    const token = newNonceToken(nonce);
    return { nonce, token };
  },
  decodeNonceToken,
  verifySignInAndLogin,
  getUserBySessionToken,
  generateSessionToken,
  serializeUser,
};
