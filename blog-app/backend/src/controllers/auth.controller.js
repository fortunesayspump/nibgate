const catchAsync = require('../utils/catchAsync');
const authService = require('../services/auth.service');
const { status } = require('http-status');

const register = catchAsync(async (req, res) => {
  const { user, token } = await authService.register(req.body);
  res.status(status.CREATED).json({ success: true, user, token });
});

const login = catchAsync(async (req, res) => {
  const { user, token } = await authService.login(req.body);
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

module.exports = { register, login, me };
