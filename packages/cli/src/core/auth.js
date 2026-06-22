import { verifyMessage } from 'viem';
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
  const message = constructSignMessage(expectedNonce);
  
  // Verify the cryptographic signature using viem
  const isValid = await verifyMessage({
    address: walletAddress,
    message,
    signature,
  });

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Find or create the user in the database
  let user = await db.user.findUnique({
    where: { walletAddress }
  });

  if (!user) {
    user = await db.user.create({
      data: { walletAddress }
    });
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
    include: { user: true }
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Delete expired session
    await db.session.delete({ where: { token: sessionToken } });
    return null;
  }

  return session.user;
}

export async function logoutSession(sessionToken) {
  if (!sessionToken) return;
  try {
    await db.session.delete({ where: { token: sessionToken } });
  } catch (error) {
    // Ignore if session already deleted
  }
}
