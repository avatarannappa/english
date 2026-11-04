// E2E：使用真实 Pointer Events 验证整词描写、漏写判定、奖励和离线入口。
// 用法与 tools/test-raz.mjs 相同，先启动 127.0.0.1:8792 上的静态服务。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.RAZ_PLAYWRIGHT_MODULE || 'playwright');
const shots = process.env.RAZ_SCREENSHOTS || '/tmp/little-english-raz-write';
await mkdir(shots, { recursive: true });
const browser = process.env.RAZ_BROWSER === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('little-english:v1')) localStorage.setItem('little-english:v1', JSON.stringify({ tts: 'system' }));
    window.__said = [];
    speechSynthesis.speak = u => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
  });
  const home = async () => { while (await page.locator('#back').isVisible()) await page.locator('#back').click(); };
  const openBooks = async () => {
    await page.locator('.tile.c-read').click();
    await page.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
  };
  const stars = () => page.evaluate(() => JSON.parse(localStorage.getItem('little-english:v1')).stars || 0);
  const erase = () => page.locator('.toolbar button').filter({ hasText: '🧽' }).click();
  // 从可见字形取得横向描线，实际用鼠标按下/移动/抬起走应用的 Pointer Events。
  const trace = async (word, omitLast = false) => {
    const rows = await page.evaluate(({ word, omitLast }) => {
      const c = document.querySelector('.paper canvas');
      const r = c.getBoundingClientRect(), k = c.width / r.width;
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const left = r.width / 2 - ctx.measureText(word).width / 2;
      const cutoff = left + ctx.measureText(word.slice(0, -1)).width;
      const rows = [];
      for (let y = 0; y < c.height; y += Math.max(1, Math.round(8 * k))) {
        const xs = [];
        for (let x = 0; x < c.width; x += Math.max(1, Math.round(4 * k))) {
          const i = (y * c.width + x) * 4;
          if (data[i] === 239 && data[i + 1] === 231 && data[i + 2] === 248 && (!omitLast || x / k < cutoff - 16)) xs.push(x / k + r.left);
        }
        if (!xs.length) continue;
        let start = xs[0], prev = xs[0];
        const segments = [];
        for (const x of xs.slice(1)) {
          if (x - prev > 6) { segments.push([start, prev]); start = x; }
          prev = x;
        }
        segments.push([start, prev]);
        rows.push({ y: y / k + r.top, segments });
      }
      return rows;
    }, { word, omitLast });
    for (const { y, segments } of rows) for (const [a, b] of segments) {
      await page.mouse.move(a, y); await page.mouse.down();
      await page.mouse.move(b + 0.5, y); await page.mouse.up();
    }
  };
  const passed = async () => (await page.locator('.paper').getAttribute('class')).includes('ok');
  await page.goto(process.env.RAZ_TEST_URL || 'http://127.0.0.1:8792/');
  await openBooks();
  await page.locator('[data-book="raz-a4"]').click();
  await page.locator('[data-action="write"]').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.write-target').count(), 3);
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'I');
  await page.screenshot({ path: `${shots}/write-I-landscape.png` });
  await trace('I');
  assert.equal(await passed(), true);
  assert.equal(await stars(), 1);
  await erase(); await trace('I');
  assert.equal(await stars(), 1); // 重写不刷星。
  await page.locator('[data-word="can"]').click();
  await page.waitForTimeout(250);
  await trace('can', true);
  assert.equal(await passed(), false); // 漏了 n，不能完成。
  assert.equal(await stars(), 1);
  await erase();
  // 大面积乱涂不能通过。
  const box = await page.locator('.paper').boundingBox();
  for (let y = box.y + 60; y < box.y + box.height - 20; y += 25) {
    await page.mouse.move(box.x + 30, y); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 30, y); await page.mouse.up();
  }
  assert.equal(await passed(), false);
  await erase(); await trace('can');
  assert.equal(await passed(), true);
  assert.equal(await stars(), 2);
  await page.locator('[data-word="see"]').click();
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/write-see-portrait.png` });
  await trace('see');
  assert.equal(await passed(), true);
  assert.equal(await stars(), 3);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('little-english:v1')).done['raz:write:raz-a4']), true);
  await page.locator('#back').click();
  assert.ok((await page.locator('[data-action="write"]').textContent()).includes('✓'));
  await page.locator('[data-action="write"]').click();
  assert.ok((await page.locator('[data-word="I"]').textContent()).includes('✓'));
  await home();
  // 长词也能适应竖屏，不挤出画布。
  await openBooks(); await page.locator('.raz-tabs button').filter({ hasText: 'Set B' }).click();
  await page.locator('[data-book="raz-b11"]').click(); await page.locator('[data-action="write"]').click();
  await page.locator('[data-word="orange"]').click(); await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/write-orange-portrait.png` });
  await trace('orange'); assert.equal(await passed(), true);
  const toolbar = await page.locator('.toolbar').boundingBox();
  assert.ok(toolbar.y + toolbar.height <= 1180);
  await home();
  // 原来的单字母描红仍能完成。
  await page.locator('.tile.c-write').click();
  await page.locator('.letters .choice').first().click(); await page.waitForTimeout(250);
  await trace('A'); assert.equal(await passed(), true);
  await home();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true); await page.reload();
  await openBooks(); await page.locator('.raz-tabs button').filter({ hasText: 'Set A' }).click();
  await page.locator('[data-book="raz-a4"]').click(); await page.locator('[data-action="write"]').click();
  await page.waitForTimeout(250); await trace('I');
  assert.equal(await passed(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: full-word tracing, missing-letter/overpainting rejection, one-time rewards, saved completion, long-word portrait layout, legacy letter tracing, offline write');
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
