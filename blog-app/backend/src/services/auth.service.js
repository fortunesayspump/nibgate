const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const { status } = require('http-status');

const prisma = new PrismaClient();

const register = async ({ name, email, password, siteId }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(status.CONFLICT, 'Email already registered');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, siteId },
  });

  const token = generateToken(user);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, token };
};

const login = async ({ email, password, siteId }) => {
  const user = await prisma.user.findFirst({ where: { email, siteId } });
  if (!user) throw new ApiError(status.UNAUTHORIZED, 'Invalid email or password');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(status.UNAUTHORIZED, 'Invalid email or password');

  const token = generateToken(user);
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, token };
};

const generateToken = (user) => {
  const payload = { sub: user.id, siteId: user.siteId, role: user.role };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: `${config.jwt.accessExpirationMinutes}m`,
  });
};

const generateAuthToken = async (user) => {
  const token = generateToken(user);
  await prisma.token.create({
    data: {
      token,
      userId: user.id,
      type: 'ACCESS',
      expires: moment().add(config.jwt.accessExpirationMinutes, 'minutes').toDate(),
    },
  });
  return token;
};

module.exports = { register, login, generateAuthToken };
