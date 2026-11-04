// 浏览器流程测试，使用独立临时浏览器和自己生成的 PDF / 图片，不需要 RAZ 账号。
// 先启动 python3 -m http.server 8792 --bind 127.0.0.1，再运行：
// RAZ_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node tools/test-raz.mjs
// RAZ_BROWSER=webkit 可测试 WebKit；默认 Chromium。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.RAZ_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.RAZ_TEST_URL || 'http://127.0.0.1:8792/';
const shots = process.env.RAZ_SCREENSHOTS || '/tmp/little-english-raz-tests';
await mkdir(shots, { recursive: true });

// 有标准字体和可提取英文文字的两页 PDF，特意覆盖本机导入和朗读。
function samplePdf() {
  const streams = ['I can see a puppy.', 'We can see a rainbow.'].map(text => `BT /F1 30 Tf 40 250 Td (${text}) Tj ET`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 350] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 350] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...streams.map(s => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, obj] of objects.entries()) { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${obj}\nendobj\n`; }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

const browser = process.env.RAZ_BROWSER === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  const uploads = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => { if (req.method() !== 'GET') uploads.push(req.url()); });
  // 快速完成 TTS，验证翻题/取消等状态；真实录音单独验证。
  await page.addInitScript(() => {
    if (!localStorage.getItem('little-english:v1')) localStorage.setItem('little-english:v1', JSON.stringify({ tts: 'system' }));
    window.__said = [];
    speechSynthesis.speak = u => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
  });
  const waitText = async (selector, text) => {
    try {
      await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.textContent.includes(text)), { selector, text });
    } catch (err) {
      console.error('Current UI:', await page.locator('body').innerText());
      console.error('Page errors:', errors);
      await page.screenshot({ path: `${shots}/failure.png` });
      throw err;
    }
  };
  const gate = async () => {
    const nums = (await page.locator('.gate .q').textContent()).match(/\d+/g).map(Number);
    await page.locator('.gate .btn').filter({ hasText: new RegExp(`^${nums[0] + nums[1]}$`) }).click();
  };
  const home = async () => { while (await page.locator('#back').isVisible()) await page.locator('#back').click(); };
  const openShelf = async () => {
    await page.locator('.tile.c-read').click();
    await page.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
  };
  await page.goto(url);
  assert.equal(await page.locator('.tile').count(), 4);
  await openShelf();
  assert.equal(await page.locator('.raz-book').count(), 12);
  await page.locator('.raz-tabs button').filter({ hasText: 'Set B' }).click();
  assert.equal(await page.locator('.raz-book').count(), 12);
  await page.locator('.raz-tabs button').filter({ hasText: 'Set C' }).click();
  assert.equal(await page.locator('.raz-book').count(), 11);
  await page.locator('.raz-tabs button').filter({ hasText: 'Set A' }).click();
  await page.screenshot({ path: `${shots}/shelf-landscape.png` });

  // 只有一个目标词时，选项仍有多个，题目始终只考目标词。
  await page.locator('[data-book="raz-a1"]').click();
  await page.locator('[data-action="quiz"]').click();
  for (let r = 0; r < 3; r++) {
    assert.equal(await page.locator('.opt').count(), 3);
    assert.ok((await page.evaluate(() => window.__said)).includes('Find the word a.'));
    await page.locator('.opt').filter({ hasText: /^a$/ }).click();
    if (r < 2) await page.waitForFunction(n => document.querySelectorAll('.dots i.on').length === n, r + 2);
    else await waitText('.overlay', 'Done');
  }
  await page.locator('.overlay .btn').filter({ hasText: 'Done' }).click();
  await page.locator('#back').click();
  await page.locator('[data-book="raz-a4"]').click();
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '1 / 3');
  assert.ok(await page.locator('.raz-token.focus').filter({ hasText: /^I$/ }).count());
  await page.locator('.raz-token').filter({ hasText: /^rainbow$/ }).click();
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'rainbow');
  await page.locator('[data-action="next"]').click();
  await page.locator('#back').click();
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '2 / 3');
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-action="finish"]').click();
  const stars = await page.evaluate(() => JSON.parse(localStorage.getItem('little-english:v1')).stars);
  await page.locator('#back').click();
  await page.locator('[data-action="practice"]').click();
  await page.locator('[data-action="finish"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('little-english:v1')).stars), stars);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: `${shots}/reader-portrait.png` });
  const countBox = await page.locator('.raz-controls').boundingBox();
  assert.ok(countBox.y >= 0 && countBox.y + countBox.height <= 1180);
  await page.locator('#back').click();

  // 站外入口藏在家长验证后；此测试不会访问 RAZ 官网。
  await page.getByRole('button', { name: 'RAZ 官方书页 ↗' }).click();
  assert.equal(await page.locator('a[href*="raz-plus"]').count(), 0);
  await gate();
  assert.equal(await page.locator('a[href*="raz-plus"]').getAttribute('href'), 'https://www.raz-plus.com/book.php?id=381');
  await page.locator('.raz-dialog button').click();

  // 导入 PDF：本机保存文字和图片；损坏的输入不能覆盖原书。
  await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click();
  await gate();
  await page.locator('input[type=file]').setInputFiles({ name: 'local-test.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await waitText('.overlay [role=status]', '已保存 2 页');
  const stored = await page.evaluate(async () => {
    const b = await RAZ_LIBRARY.get('raz-a4');
    return b.pages.map(p => ({ text: p.text, bytes: p.image.size }));
  });
  assert.deepEqual(stored.map(p => p.text), ['I can see a puppy.', 'We can see a rainbow.']);
  assert.ok(stored.every(p => p.bytes > 0));
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid PDF') });
  await waitText('.overlay [role=status]', '导入失败');
  assert.equal(await page.evaluate(async () => (await RAZ_LIBRARY.get('raz-a4')).pages.length), 2);
  await page.locator('.raz-dialog button').click();
  await page.locator('[data-action="local-read"]').click();
  await page.locator('[data-action="listen"]').click();
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'I can see a puppy.');
  await page.screenshot({ path: `${shots}/local-pdf.png` });
  await page.locator('[data-action="next"]').click();
  await home();

  // SW 准备好后断网重载：书架、PDF 渲染器及本机书页都应可用。
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await openShelf();
  await page.locator('[data-book="raz-a4"]').click();
  await page.locator('[data-action="local-read"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '2 / 2');
  await page.locator('.raz-page-image').evaluate(img => img.decode());
  await page.locator('#back').click();

  // 离线也能导入 PDF（包括 renderer / worker / 标准字体）。
  await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click();
  await gate();
  await page.locator('input[type=file]').setInputFiles({ name: 'offline.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await waitText('.overlay [role=status]', '已保存 2 页');

  // 图片文件自然排序与无文字状态。
  const pngs = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 10;
    return ['blue', 'red'].map(color => {
      c.getContext('2d').fillStyle = color;
      c.getContext('2d').fillRect(0, 0, 10, 10);
      return c.toDataURL('image/png').split(',')[1];
    });
  });
  await page.locator('input[type=file]').setInputFiles(['page-10.png', 'page-2.png'].map((name, i) => ({ name, mimeType: 'image/png', buffer: Buffer.from(pngs[i], 'base64') })));
  await waitText('.overlay [role=status]', '已保存 2 页');
  await page.locator('.raz-dialog button').click();
  await page.locator('[data-action="local-read"]').click();
  const firstPixel = await page.locator('.raz-page-image').evaluate(async img => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 1;
    c.getContext('2d').drawImage(img, 0, 0, 1, 1);
    return [...c.getContext('2d').getImageData(0, 0, 1, 1).data];
  });
  assert.deepEqual(firstPixel, [255, 0, 0, 255]); // page-2 红色排在 page-10 蓝色前。
  assert.equal(await page.locator('[data-action="listen"]').isDisabled(), true);
  assert.equal(await page.locator('[data-action="auto"]').isDisabled(), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  console.log('PASS: 35-book shelf, focus-word quiz, reading/resume/rewards, parent links, local PDF/images, corrupt-input preservation, offline import/read, no uploads');
  console.log(`Screenshots: ${shots}`);
} finally {
  await browser.close();
}
