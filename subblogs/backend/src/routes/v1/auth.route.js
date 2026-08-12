const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middlewares/auth');
const { authLimiter } = require('../../middlewares/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, validate(authValidation.register), authController.register);
router.post('/login', authLimiter, validate(authValidation.login), authController.login);
router.get('/me', authenticate, authController.me);
router.get('/nonce', authController.siweNonce);
router.post('/verify', authLimiter, authController.siweVerify);
router.get('/session', authController.siweSession);
router.post('/logout', authController.siweLogout);

module.exports = router;
