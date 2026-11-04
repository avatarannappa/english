// E2E：网站内置 A8 无需手动导入；个人版本优先；未访问过的书也可离线打开。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.RAZ_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.RAZ_SITE_URL || 'http://127.0.0.1:8792/';
const shots = process.env.RAZ_SCREENSHOTS || '/tmp/little-english-raz-site';
await mkdir(shots, { recursive: true });
const browser = process.env.RAZ_BROWSER === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  await context.addInitScript(() => {
    speechSynthesis.speak = u => setTimeout(() => u.onend?.(), 10);
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const openA8 = async () => {
    await page.locator('.tile.c-read').click();
    await page.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
    await page.locator('[data-book="raz-a8"]').click();
    await page.locator('[data-action="practice"]:enabled').waitFor({ timeout: 60000 });
  };
  await page.goto(url); await openA8();
  assert.match(await page.locator('[data-action="practice"]').textContent(), /Book practice/);
  assert.match(await page.locator('.raz-parent .raz-status').textContent(), /网站内置/);
  assert.equal(await page.locator('.raz-detail .raz-word').count(), 16);
  const siteBook = await page.evaluate(async () => {
    const b = await RAZ_LIBRARY.get('raz-a8');
    return { origin: b.origin, pages: b.pages.length, sentences: b.analysis.sentences.length, revision: b.revision };
  });
  assert.equal(siteBook.origin, 'site'); assert.equal(siteBook.pages, 11); assert.equal(siteBook.sentences, 8);
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '1 / 8');
  await page.locator('.raz-page-image').evaluate(img => img.decode());
  await page.screenshot({ path: `${shots}/built-in-reading.png` });
  await page.locator('[data-action="next"]').click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true); await page.reload(); await openA8();
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '2 / 8');
  await page.locator('.raz-page-image').evaluate(img => img.decode());
  await page.locator('#back').click();

  // 修改内置书后成为个人版本，重新打开不能被网站内容覆盖。
  await page.evaluate(async () => {
    const b = await RAZ_LIBRARY.get('raz-a8');
    const edits = b.pages.map(p => ({ text: p.text, include: p.include }));
    await RAZ_LIBRARY.updateContents('raz-a8', edits, ['kite']);
  });
  const custom = await page.evaluate(async () => {
    const b = await RAZ_LIBRARY.open('raz-a8'); return { origin: b.origin, words: b.analysis.words.map(x => x.w) };
  });
  assert.deepEqual(custom, { origin: 'personal', words: ['kite'] });
  await page.evaluate(() => RAZ_LIBRARY.remove('raz-a8'));
  assert.equal(await page.evaluate(async () => (await RAZ_LIBRARY.open('raz-a8')).origin), 'site');
  assert.deepEqual(errors, []);

  // 新浏览器只访问首页、完成缓存；不曾进入 A8，也能离线首次打开。
  const fresh = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const offline = await fresh.newPage(); await offline.goto(url);
  await offline.evaluate(() => navigator.serviceWorker.ready);
  assert.equal(await offline.evaluate(async () => !!(await RAZ_LIBRARY.get('raz-a8'))), false);
  await fresh.setOffline(true);
  await offline.reload();
  await offline.locator('.tile.c-read').click();
  await offline.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
  await offline.locator('[data-book="raz-a8"]').click();
  await offline.locator('[data-action="practice"]:enabled').waitFor({ timeout: 60000 });
  assert.match(await offline.locator('[data-action="practice"]').textContent(), /Book practice/);
  await offline.locator('[data-action="practice"]').click();
  assert.equal(await offline.locator('.raz-page-count').textContent(), '1 / 8');
  await offline.locator('.raz-page-image').evaluate(img => img.decode());
  console.log('PASS: built-in book auto-load, 11 pages/8 sentences/16 words, resume offline, personal-version priority, site fallback, offline first-open from homepage cache');
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
