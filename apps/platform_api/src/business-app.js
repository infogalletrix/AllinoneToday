import { Router } from 'express';
import { verifyPassword } from './security.js';
import { loginSchema } from './owner-credentials.js';

export const businessAppClient = 'business-admin';
const denied = res => res.status(403).json({
  success: false,
  code: 'BUSINESS_APP_ADMIN_REQUIRED',
  message: 'Sign in with a shop-owner or platform administrator account.',
});
const canUseBusinessApp = account => ['admin','merchant'].includes(account?.role) && !account.suspended;

// Recheck the database account on every native business request, including
// uploads. A role change or suspension takes effect without waiting for expiry.
export function businessAppClientGuard(accountFor) {
  return async (req, res, next) => {
    if (req.get('x-ait-client') !== businessAppClient) return next();
    if (/^\/api\/billing(?:\/|$)/i.test(req.path)) {
      return res.status(403).json({
        success: false,
        code: 'PAYMENTS_DISABLED',
        message: 'Payments are not available in this app.',
      });
    }
    const publicRequest = (req.method === 'GET' && req.path === '/api/categories') ||
      (req.method === 'POST' && ['/api/business-app/login', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(req.path));
    if (publicRequest) return next();
    if (!canUseBusinessApp(await accountFor(req))) return denied(res);
    next();
  };
}

export function businessAppRouter({ pool, auth, issueSession, publicAccount }) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body),identifier=(input.identifier||input.email).toLowerCase();
    const account = (await pool.query('SELECT * FROM accounts WHERE lower(email)=$1 OR lower(user_id)=$1', [identifier])).rows[0];
    if (!account || account.suspended || !account.password_set || !await verifyPassword(input.password, account.password_hash)) {
      return res.status(401).json({ success: false, message: 'User ID, email or password is incorrect.' });
    }
    if (!canUseBusinessApp(account)) return denied(res);
    res.json({ success: true, data: await issueSession(res, account) });
  });
  router.use(auth, (req, res, next) => canUseBusinessApp(req.account) ? next() : denied(res));
  router.get('/session', (req, res) => res.json({ success: true, data: publicAccount(req.account) }));
  return router;
}
