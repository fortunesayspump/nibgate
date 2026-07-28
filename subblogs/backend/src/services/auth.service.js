const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { status } = require('http-status');
const prisma = require('../lib/prisma');

const register = async ({ name, email: rawEmail, password, siteId }) => {
  const email = (rawEmail || '').toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(status.CONFLICT, 'Email already registered');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, siteId },
  });

  const token = generateToken(user);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId }, token };
};

const login = async ({ email: rawEmail, username, password }) => {
  const email = rawEmail ? (rawEmail || '').toLowerCase() : null;
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : username ? await prisma.user.findFirst({ where: { username } }) : null;
  if (!user) throw new ApiError(status.UNAUTHORIZED, 'Invalid email or password');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(status.UNAUTHORIZED, 'Invalid email or password');

  const token = generateToken(user);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId }, token };
};

const generateToken = (user) => {
  const payload = { sub: user.id, siteId: user.siteId, role: user.role };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: `${config.jwt.accessExpirationMinutes}m`,
  });
};

module.exports = { register, login };
