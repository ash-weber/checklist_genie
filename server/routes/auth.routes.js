const express = require('express');
const passport = require('passport');
const router = express.Router();

const ctrl = require('../controllers/auth.controllers');


const REQUIRED = [
  'googleCallback',
  'failure',
  'requestRegistrationOtp',
  'verifyOtpAndRegister',
  'loginUser',
  'requestPasswordResetOtp',
  'verifyOtpAndResetPassword',
];
const missing = REQUIRED.filter((name) => typeof ctrl[name] !== 'function');
if (missing.length) {
  throw new Error(
    `auth.controllers is missing: ${missing.join(', ')}. ` +
    `It currently exports: ${Object.keys(ctrl).join(', ') || '(nothing - circular require or wrong file?)'}`
  );
}

const {
  googleCallback,
  failure,
  requestRegistrationOtp,
  verifyOtpAndRegister,
  loginUser,
  requestPasswordResetOtp,
  verifyOtpAndResetPassword,
} = ctrl;

router.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'], session: false }));
router.get('/google/callback', passport.authenticate('google', { session: false }), googleCallback);
router.get('/failure', failure);

router.post('/register', requestRegistrationOtp);
router.post('/verify', verifyOtpAndRegister);
router.post('/login', loginUser);

router.post('/request-password-reset', requestPasswordResetOtp);
router.post('/reset-password', verifyOtpAndResetPassword);

module.exports = router;