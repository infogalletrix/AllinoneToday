import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'apps/web_app/package.json'));
const {chromium} = require('playwright');
const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:4179';
const inspect = process.argv.includes('--inspect');
await mkdir(resolve(root, 'artifacts/screenshots'), {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({viewport: {width, height}});
    page.setDefaultTimeout(20000);
    const errors = [], unsafe = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.includes('/api/') || request.url().includes('razorpay.com')) unsafe.push(request.url());
    });
    const screenshot = name => page.screenshot({path: resolve(root, `artifacts/screenshots/preview-${device}-${name}.png`), fullPage: true});
    await page.goto(`${base}/app-previews/`, {waitUntil: 'networkidle'});
    await page.getByRole('link', {name: 'Open public app preview'}).click();
    try {
      await page.getByRole('button', {name: 'Reset preview', exact: true}).waitFor();
    } catch (error) {
      await screenshot('startup-failure');
      console.log('Startup diagnostics', errors, await page.locator('body').innerText());
      console.log((await page.locator('body').innerHTML()).slice(0, 3000));
      throw error;
    }
    await page.getByText('Find your next\ngreat discovery.', {exact: true}).waitFor();
    await screenshot('public');
    if (inspect) {
      console.log(device + ' PUBLIC DOM\n' + await page.locator('body').innerText());
    } else {
      await page.getByRole('tab', {name: 'Login', exact: true}).click();
      await page.getByText('Continue with Google', {exact: true}).waitFor();
      await screenshot('login');
      await page.getByText('New here? Sign up', {exact: true}).click();
      await page.getByText('Join your local marketplace.', {exact: true}).waitFor();
      await screenshot('signup');
      await page.getByRole('button', {name: 'Sample account', exact: true}).click();
      await page.getByRole('tab', {name: 'Messages', exact: true}).click();
      await page.getByText('Your conversations', {exact: true}).waitFor();
      await page.getByRole('button', {name: /Adventure SUV · Sample inquiry/}).click();
      await page.getByRole('textbox', {name: 'Reply', exact: true}).fill('Chrome preview sample reply');
      await page.getByRole('button', {name: 'Send reply', exact: true}).click();
      await page.getByText('Chrome preview sample reply', {exact: true}).waitFor();
      await screenshot('conversation');
    }
    await page.goto(`${base}/app-previews/business/`, {waitUntil: 'networkidle'});
    await page.getByRole('button', {name: 'Reset preview', exact: true}).waitFor();
    await page.getByText('Your shop.\nMore possibilities.', {exact: true}).waitFor();
    await screenshot('business');
    if (inspect) {
      console.log(device + ' BUSINESS DOM\n' + await page.locator('body').innerText());
    } else {
      await page.getByRole('tab', {name: 'Listings', exact: true}).click();
      await page.getByText('Your listings', {exact: true}).waitFor();
      await screenshot('catalogue');
      await page.getByRole('button', {name: 'Payment required', exact: true}).click();
      await page.getByText('Simulate subscription (preview)', {exact: true}).click();
      await page.getByText('Simulate subscription?', {exact: true}).waitFor();
      await screenshot('subscription-confirmation');
      await page.getByText('Confirm', {exact: true}).click();
      await page.getByText('Preview subscription simulated. No money was charged.', {exact: true}).waitFor();
      const nav = await page.getByRole('tablist').boundingBox();
      await page.mouse.move(nav.x + nav.width / 2, nav.y - 150);
      await page.mouse.wheel(0, 300);
      try { await page.getByRole('group', {name: /Subscription active/}).waitFor(); }
      catch (error) {
        await screenshot('subscription-state');
        console.log('Subscription DOM', await page.locator('body').innerText());
        console.log('Subscription labels', await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(n => ({role:n.getAttribute('role'),label:n.getAttribute('aria-label')}))));
        throw error;
      }
      await screenshot('subscription-complete');
      await page.getByText('Reset preview', {exact: true}).click();
      await page.getByText('Simulate subscription (preview)', {exact: true}).waitFor();
      await page.getByRole('button', {name: 'New shop', exact: true}).click();
      await page.getByText('Register your shop', {exact: true}).waitFor();
      await screenshot('registration');
    }
    // Flutter's invisible accessibility spans can extend beyond body bounds;
    // the clipped document viewport must not produce horizontal page overflow.
    assert.equal(await page.locator('html').evaluate(e => e.scrollWidth > innerWidth), false, `${device} overflow`);
    assert.deepEqual(errors, [], `${device} JavaScript errors`);
    assert.deepEqual(unsafe, [], `${device} must not contact any real API/payment endpoint`);
    console.log(`${device}: Chrome previews passed with no real API or Razorpay traffic.`);
    await page.close();
  }
} finally { await browser.close(); }
