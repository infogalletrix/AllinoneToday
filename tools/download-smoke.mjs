import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'apps/web_app/package.json'));
const { chromium } = require('playwright');
const origin = 'https://allinonetoday.galletrix.com';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/download`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByText('64-bit ARM phones', { exact: false }).count(), 1);
    for (const filename of ['allinonetoday-public.apk', 'allinonetoday-business.apk']) {
      const href = `/downloads/${filename}`;
      assert.equal(await page.locator(`a[href="${href}"]`).count(), 1);
      const response = await page.request.head(`${origin}${href}`);
      assert.equal(response.status(), 200, filename);
      assert.ok(Number(response.headers()['content-length']) > 10_000_000, filename);
      assert.notEqual(response.headers()['content-type'], 'text/html', filename);
    }
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(root, `artifacts/screenshots/download-${name}.png`), fullPage: true });
    await page.close();
    console.log(`${name} download page passed: compatibility notice, layout and both APK links.`);
  }
} finally {
  await browser.close();
}
