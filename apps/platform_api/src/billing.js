import { randomUUID } from 'node:crypto';
import { matchesSignature } from './security.js';
import { readPricing, quote } from './pricing.js';
import { shopQuote } from './assessments.js';
import { billingConfiguration, requireBillingConfiguration } from './billing-config.js';

export const billingEnabled = () => billingConfiguration().valid && Boolean(readPricing().approved);
async function provider(path, body) {
  requireBillingConfiguration();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error('The payment provider could not complete this request.');
  return value;
}
export async function createCheckout(pool, account, shopId, acceptedAmountMinor) {
  if (!billingEnabled()) throw Object.assign(new Error('Shop subscriptions are not open yet. Please contact All in One Today support.'), { status: 503 });
  const client = await pool.connect();
  let sent = false;
  let requestId;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [shopId]);
    const shop = (await client.query('SELECT * FROM shops WHERE id=$1 AND owner_id=$2', [shopId, account.id])).rows[0];
    if (!shop) throw Object.assign(new Error('Shop not found.'), { status: 404 });
    const previous = (await client.query("SELECT * FROM subscriptions WHERE shop_id=$1 AND status NOT IN ('cancelled','completed','expired','failed') ORDER BY created_at DESC LIMIT 1", [shopId])).rows[0];
    if (previous) {
      if(previous.amount_minor !== acceptedAmountMinor) throw Object.assign(new Error('The subscription amount changed. Refresh and review it before continuing.'),{status:409});
      if (!previous.provider_id) throw Object.assign(new Error('Checkout creation is awaiting confirmation. Contact support before retrying.'), { status: 409 });
      await client.query('COMMIT');
      return checkoutResult(previous, shop, account);
    }
    const price = await shopQuote(client, shop);
    if(price.requiresReview) throw Object.assign(new Error(price.message),{status:409});
    if(price.amountMinor !== acceptedAmountMinor) throw Object.assign(new Error('The subscription amount changed. Refresh and review it before continuing.'),{status:409});
    const priceKey = `${price.version}:${price.period}:${price.amountMinor}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan:${priceKey}`]);
    let plan = (await client.query('SELECT provider_plan_id FROM billing_plans WHERE price_key=$1', [priceKey])).rows[0]?.provider_plan_id;
    if (!plan) {
      const created = await provider('plans', { period: price.period === 'month' ? 'monthly' : 'yearly', interval: 1, item: { name: 'All in One Today shop subscription', amount: price.amountMinor, currency: 'INR', description: `${shop.category} · ${shop.branches} branch(es)` } });
      plan = created.id;
      await client.query('INSERT INTO billing_plans VALUES ($1,$2)', [priceKey, plan]);
    }
    requestId = randomUUID();
    await client.query('INSERT INTO subscriptions(id,shop_id,account_id,amount_minor,period,quote) VALUES($1,$2,$3,$4,$5,$6)', [requestId, shopId, account.id, price.amountMinor, price.period, price]);
    // Reserve before the provider call so a timeout cannot silently create a duplicate mandate.
    await client.query('COMMIT');
    sent = true;
    const created = await provider('subscriptions', { plan_id: plan, total_count: price.period === 'month' ? 120 : 10, quantity: 1, customer_notify: 1, notes: { marketplace: 'allinonetoday', shop_id: shopId, request_id: requestId } });
    const subscription = (await client.query("UPDATE subscriptions SET provider_id=$1,status='created' WHERE id=$2 RETURNING *", [created.id, requestId])).rows[0];
    return checkoutResult(subscription, shop, account);
  } catch (error) {
    if (!sent) await client.query('ROLLBACK').catch(() => {});
    if (sent && requestId) await client.query("UPDATE subscriptions SET status='review_required' WHERE id=$1 AND provider_id IS NULL", [requestId]);
    throw error;
  } finally { client.release(); }
}
function checkoutResult(subscription, shop, account) {
  const test = billingConfiguration().mode === 'test';
  return { key: process.env.RAZORPAY_KEY_ID, subscriptionId: subscription.provider_id, requestId: subscription.id, amountMinor: subscription.amount_minor, currency: 'INR', period: subscription.period, status: subscription.status, paymentMode: test ? 'test' : 'live', name: test ? 'All in One Today TEST' : 'All in One Today', description: `${test ? 'TEST ONLY: ' : ''}${shop.name} shop subscription`, prefill: { name: account.name, email: account.email, contact: account.phone }, checkoutUrl: `${process.env.PUBLIC_URL || 'https://allinonetoday.galletrix.com'}/merchant?checkout=${subscription.id}` };
}
export async function verifyCheckout(pool, account, input) {
  requireBillingConfiguration();
  const subscription = (await pool.query('SELECT * FROM subscriptions WHERE id=$1 AND account_id=$2 AND provider_id=$3', [input.requestId, account.id, input.subscriptionId])).rows[0];
  if (!subscription || !matchesSignature(`${input.paymentId}|${subscription.provider_id}`, input.signature, process.env.RAZORPAY_KEY_SECRET)) throw Object.assign(new Error('Payment signature verification failed.'), { status: 400 });
  const [remote, payment] = await Promise.all([provider(`subscriptions/${subscription.provider_id}`), provider(`payments/${input.paymentId}`)]);
  const paid = payment.status === 'captured' && payment.currency === 'INR' && Number(payment.amount) >= subscription.amount_minor && payment.invoice_id;
  if (paid) {
    const invoice = await provider(`invoices/${payment.invoice_id}`);
    if (invoice.subscription_id !== subscription.provider_id) throw Object.assign(new Error('Payment does not belong to this shop subscription.'), { status: 400 });
  }
  if (!paid || !['active','authenticated'].includes(remote.status) || !remote.current_end) return { verified: false, message: 'Your payment is awaiting provider confirmation. Check status shortly; do not pay again.' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE subscriptions SET status=CASE WHEN status IN ('cancelled','completed') THEN status ELSE 'active' END,payment_id=$1,paid_until=GREATEST(paid_until,to_timestamp($2)) WHERE id=$3", [input.paymentId, remote.current_end, subscription.id]);
    await client.query("UPDATE shops SET status='active' WHERE id=$1", [subscription.shop_id]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return { verified: true, message: 'Your shop subscription is active.' };
}
export async function handleWebhook(pool, raw, signature, eventId) {
  requireBillingConfiguration();
  if (!matchesSignature(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) throw Object.assign(new Error('Invalid webhook signature.'), { status: 400 });
  const event = JSON.parse(raw.toString('utf8'));
  const remote = event.payload?.subscription?.entity;
  if (!remote?.id || !event.event?.startsWith('subscription.')) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subscription = (await client.query('SELECT * FROM subscriptions WHERE provider_id=$1 FOR UPDATE', [remote.id])).rows[0];
    if (!subscription) { await client.query('ROLLBACK'); throw Object.assign(new Error('Subscription is not yet recorded; retry delivery.'),{status:503}); }
    const recorded = await client.query('INSERT INTO webhook_events(id,event) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id', [eventId || `${event.event}:${remote.id}:${event.created_at}`, event.event]);
    if (!recorded.rowCount) { await client.query('COMMIT'); return; }
    if (event.event === 'subscription.charged') {
      const payment = event.payload?.payment?.entity;
      if (!payment || payment.status !== 'captured' || payment.currency !== 'INR' || payment.amount < subscription.amount_minor || !remote.current_end) throw new Error('Webhook payment amount/status mismatch.');
      await client.query("UPDATE subscriptions SET status=CASE WHEN status IN ('cancelled','completed') THEN status ELSE 'active' END,payment_id=$1,paid_until=GREATEST(paid_until,to_timestamp($2)) WHERE id=$3", [payment.id, remote.current_end, subscription.id]);
      if(Number(remote.current_end)*1000>Date.now())await client.query("UPDATE shops SET status='active' WHERE id=$1", [subscription.shop_id]);
    } else if (['subscription.cancelled','subscription.completed','subscription.halted','subscription.expired'].includes(event.event)) {
      await client.query('UPDATE subscriptions SET status=$1 WHERE id=$2', [remote.status, subscription.id]);
      if (!subscription.paid_until || new Date(subscription.paid_until) <= new Date()) await client.query("UPDATE shops SET status='inactive' WHERE id=$1", [subscription.shop_id]);
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function cancelSubscription(pool, account, requestId, immediate=false) {
  const subscription = (await pool.query('SELECT * FROM subscriptions WHERE id=$1 AND account_id=$2', [requestId, account.id])).rows[0];
  if (!subscription?.provider_id) throw Object.assign(new Error('Subscription not found.'), { status: 404 });
  const remote = await provider(`subscriptions/${subscription.provider_id}/cancel`, { cancel_at_cycle_end: !immediate && subscription.paid_until && new Date(subscription.paid_until)>new Date()?1:0 });
  await pool.query('UPDATE subscriptions SET status=$1 WHERE id=$2', [remote.status, subscription.id]);
  return { status:remote.status,message:immediate?'AutoPay canceled.':'AutoPay cancellation requested. Access continues through the paid subscription period.' };
}
