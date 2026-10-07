// Test credentials may only be used with a separately deployed test database.
// Production defaults to live and fails closed if a test key is supplied.
export function billingConfiguration(environment = process.env) {
  const expected = environment.BILLING_ENVIRONMENT || 'live';
  const key = environment.RAZORPAY_KEY_ID || '';
  const mode = /^rzp_test_[A-Za-z0-9]+$/.test(key) ? 'test'
    : /^rzp_live_[A-Za-z0-9]+$/.test(key) ? 'live' : 'disabled';
  const valid = ['live', 'test'].includes(expected) && mode === expected
    && Boolean(environment.RAZORPAY_KEY_SECRET)
    && (environment.RAZORPAY_WEBHOOK_SECRET || '').length >= 32;
  return { environment: expected, mode: valid ? mode : 'disabled', valid };
}

export function requireBillingConfiguration() {
  if (!billingConfiguration().valid) {
    throw Object.assign(new Error('Payments are not configured for this environment.'), { status: 503 });
  }
}
