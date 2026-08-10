import { nanoid } from 'nanoid';
import { db } from './db.js';
import { ARC_TESTNET } from '@nibgate/wallet/chain.js';
import { createSignInNonce, parseSignInMessage, validateSignInMessage, verifySignature } from '@nibgate/wallet/siwe.js';

export function createNonce() {
  return createSignInNonce();
}

export async function verifySignInAndLogin({ message, signature, expectedNonce, expectedDomain }) {
  const parsed = parseSignInMessage(message);
  if (!parsed) {
    throw new Error('Invalid sign-in message');
  }

  if (!expectedNonce || parsed.nonce !== expectedNonce) {
    throw new Error('Nonce does not match. Please request a new nonce.');
  }

  const isValidMessage = validateSignInMessage({
    message: parsed,
    expected: {
      chainId: ARC_TESTNET.id,
      domain: expectedDomain,
      time: new Date(),
    },
  });
  if (!isValidMessage) {
    throw new Error('Sign-in message is invalid or expired.');
  }

  const walletAddress = parsed.address.toLowerCase();
  const isValidSignature = await verifySignature({ message, signature, address: parsed.address });
  if (!isValidSignature) {
    throw new Error('Invalid signature');
  }

  // Find or create the user through a linked wallet.
  let wallet = await db.wallet.findUnique({
    where: { address: walletAddress },
    include: { user: true }
  });
  let user = wallet?.user;

  if (!user) {
    user = await db.user.findUnique({
      where: { walletAddress: walletAddress }
    });
  }

  if (!user) {
    user = await db.user.create({
      data: {
        walletAddress: walletAddress,
        wallets: {
          create: {
            address: walletAddress,
            isPrimary: true
          }
        }
      }
    });
  } else if (!wallet) {
    wallet = await db.wallet.create({
      data: {
        userId: user.id,
        address: walletAddress,
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
