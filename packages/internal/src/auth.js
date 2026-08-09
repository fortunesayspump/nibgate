import { hashMessage, recoverAddress } from 'viem';
import { db } from './db.js';
import { nanoid } from 'nanoid';

export function createNonce() {
  return nanoid(32);
}

export function constructSignMessage(nonce) {
  return `Welcome to Nibgate!

Click to sign in and accept the Terms of Service.
This request will not trigger a blockchain transaction or cost any gas fees.

Nonce: ${nonce}`;
}

export async function verifySignatureAndLogin(walletAddress, signature, expectedNonce) {
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const message = constructSignMessage(expectedNonce);
  
  // Verify the cryptographic signature locally (no RPC needed)
  const hash = hashMessage(message);
  const recoveredAddress = await recoverAddress({ hash, signature });
  const isValid = recoveredAddress.toLowerCase() === normalizedWalletAddress;

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Find or create the user through a linked wallet.
  let wallet = await db.wallet.findUnique({
    where: { address: normalizedWalletAddress },
    include: { user: true }
  });
  let user = wallet?.user;

  if (!user) {
    user = await db.user.findUnique({
      where: { walletAddress: normalizedWalletAddress }
    });
  }

  if (!user) {
    user = await db.user.create({
      data: {
        walletAddress: normalizedWalletAddress,
        wallets: {
          create: {
            address: normalizedWalletAddress,
            isPrimary: true
          }
        }
      }
    });
  } else if (!wallet) {
    wallet = await db.wallet.create({
      data: {
        userId: user.id,
        address: normalizedWalletAddress,
        isPrimary: true
      },
      include: { user: true }
    });
  } else if (!wallet.isPrimary) {
    const primaryWallet = await db.wallet.findFirst({
      where: { userId: user.id, isPrimary: true }
    });

    if (!primaryWallet) {
      await db.wallet.update({
        where: { id: wallet.id },
        data: { isPrimary: true }
      });
    }
  }

  // Create a new secure session
  const sessionToken = nanoid(64);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await db.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt
    }
  });

  return { user, sessionToken };
}

export async function getUserBySession(sessionToken) {
  if (!sessionToken) return null;

  const session = await db.session.findUnique({
    where: { token: sessionToken },
    include: {
      user: {
        include: {
          wallets: {
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'asc' }
            ]
          }
        }
      }
    }
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Delete expired session
    await db.session.delete({ where: { token: sessionToken } });
    return null;
  }

  return session.user;
}

export async function requireAuth(req, res, next) {
  const sessionToken = req.cookies?.auth_session;
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  next();
}

export async function logoutSession(sessionToken) {
  if (!sessionToken) return;
  try {
    await db.session.delete({ where: { token: sessionToken } });
  } catch (error) {
    // Ignore if session already deleted
  }
}
