import { getUserBySession, sessionCookieName } from '@nibgate/internal/auth.js';

// Dr. Nib has no account system. A Dr. Nib project belongs to whoever is signed
// in to the hub, so "who am I" is answered by the hub's own session table —
// same cookie, same lookup, same code path as every other hub page. There is no
// second sign-in and no second user table to drift.
export const SESSION_COOKIE = sessionCookieName();

export async function currentUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return await getUserBySession(token);
  } catch {
    // An unreachable hub database is not a signed-in user.
    return null;
  }
}

export async function requireUser(req, res, next) {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to Nibgate to use Dr. Nib.', code: 'unauthenticated' });
  req.user = user;
  next();
}

// Routers call this at request time (not at import time) so tests can stand in
// for a hub session without a wallet. Swapping it changes who a request belongs
// to, so nothing but a test should ever call __setAuthMiddleware.
export let middleware = requireUser;

export function __setAuthMiddleware(fn) { middleware = fn; }

// Ownership gate for a run. A project that isn't yours reads as not-found
// rather than forbidden: no leaking of which run ids exist.
export function isOwner(user, run) {
  return Boolean(run) && run.userId === user.id;
}