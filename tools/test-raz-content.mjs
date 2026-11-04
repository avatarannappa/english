// E2E：自制 PDF / 图片验证按实际内容生成；可通过 RAZ_SAMPLE_PACKAGE 验证私有书籍包。
// 不把用户的原版书页或原文作为仓库测试素材。
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.RAZ_PLAYWRIGHT_MODULE || 'playwright');
const shots = process.env.RAZ_SCREENSHOTS || '/tmp/little-english-raz-content';
await mkdir(shots, { recursive: true });
function samplePdf() {
  const texts = ['Written by Example Author', 'A purple robot can dance.', 'We can build a silver canoe.', 'Copyright Example Publisher'];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>`];
  for (let i = 0; i < 4; i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 7 0 R >> >> /Contents ${8 + i} 0 R >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const text of texts) {
    const s = `BT /F1 25 Tf 30 250 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  }
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${pdf}trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`);
}
const browser = process.env.RAZ_BROWSER === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const page = await context.newPage(); const errors = [], uploads = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (r.method() !== 'GET') uploads.push(r.url());
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:8792/')) external.push(r.url());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('little-english:v1')) localStorage.setItem('little-english:v1', JSON.stringify({ tts: 'system' }));
    window.__said = [];
    speechSynthesis.speak = u => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
  });
  const gate = async () => {
    const nums = (await page.locator('.gate .q').textContent()).match(/\d+/g).map(Number);
    await page.locator('.gate .btn').filter({ hasText: new RegExp(`^${nums[0] + nums[1]}$`) }).click();
  };
  const waitMessage = async text => page.waitForFunction(text => [...document.querySelectorAll('.overlay [role=status]')].some(e => e.textContent.includes(text)), text, { timeout: 60000 });
  const close = () => page.locator('.raz-dialog button').filter({ hasText: /^返回$/ }).click();
  const home = async () => { while (await page.locator('#back').isVisible()) await page.locator('#back').click(); };
  const openBook = async () => {
    await page.locator('.tile.c-read').click(); await page.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
    await page.locator('[data-book="raz-a8"]').click();
  };
  await page.goto('http://127.0.0.1:8792/'); await openBook();
  await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click(); await gate();
  await page.locator('input[type=file]').setInputFiles({ name: 'actual-content.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await waitMessage('已保存 4 页');
  assert.equal(await page.locator('.raz-review textarea').count(), 4);
  assert.equal(await page.getByRole('checkbox', { name: 'Include page 1', exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('checkbox', { name: 'Include page 4', exact: true }).isChecked(), false);
  await page.getByRole('textbox', { name: 'Page 2 text', exact: true }).fill('A purple robot can sing.');
  await page.getByRole('button', { name: '更新词表' }).click();
  for (const checkbox of await page.locator('.raz-vocabulary input').all()) await checkbox.setChecked(false);
  for (const w of ['robot', 'purple']) await page.getByRole('checkbox', { name: `Practice word ${w}`, exact: true }).check();
  await page.locator('[data-action="save-content"]').click(); await waitMessage('已按书页生成 2 句');
  await page.screenshot({ path: `${shots}/review.png` }); await close();
  assert.match(await page.locator('[data-action="practice"]').textContent(), /Book practice/);
  assert.deepEqual((await page.locator('.raz-detail .raz-word-list .raz-word').allTextContents()).sort(), ['purple', 'robot']);
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-page-count').textContent(), '1 / 2');
  await page.locator('.raz-token').filter({ hasText: /^robot$/ }).click();
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'robot');
  await page.locator('[data-action="listen"]').click();
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'A purple robot can sing.');
  await page.screenshot({ path: `${shots}/generated-reading.png` }); await page.locator('#back').click();
  await page.locator('[data-action="write"]').click();
  await page.locator('.write-target').first().waitFor();
  assert.deepEqual((await page.locator('.write-target').evaluateAll(els => els.map(e => e.dataset.word))).sort(), ['purple', 'robot']);
  await page.locator('#back').click(); await page.locator('[data-action="speak"]').click();
  await page.locator('.seg button').filter({ hasText: 'Sentence' }).click();
  await page.waitForFunction(() => window.__said.at(-1) === 'A purple robot can sing.');
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'A purple robot can sing.');
  await page.locator('.book-scene').evaluate(img => img.decode());
  await page.locator('.stage .btn').last().click();
  await page.waitForFunction(() => window.__said.at(-1) === 'We can build a silver canoe.');
  assert.equal((await page.evaluate(() => window.__said)).at(-1), 'We can build a silver canoe.');
  await page.locator('#back').click();
  await page.locator('[data-action="quiz"]').click();
  assert.match((await page.evaluate(() => window.__said)).at(-1), /^Find the word (robot|purple)\.$/);
  await page.locator('#back').click();

  // 无效校对不能清空已保存内容。
  const revision = await page.evaluate(async () => (await RAZ_LIBRARY.get('raz-a8')).revision);
  await page.getByRole('button', { name: '校对文字和练习词' }).click(); await gate();
  for (const checkbox of await page.locator('.raz-vocabulary input').all()) await checkbox.setChecked(false);
  await page.locator('[data-action="save-content"]').click(); await waitMessage('请选择 1–16');
  assert.equal(await page.evaluate(async () => (await RAZ_LIBRARY.get('raz-a8')).revision), revision);
  await close();
  const packed = await page.evaluate(() => RAZ_LIBRARY.exportPackage('raz-a8'));
  await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click(); await gate();
  await page.locator('input[type=file]').setInputFiles({ name: 'test.razbook.json', mimeType: 'application/json', buffer: Buffer.from(packed) });
  await waitMessage('已保存 4 页');
  assert.equal(await page.evaluate(async () => (await RAZ_LIBRARY.get('raz-a8')).pages[1].method), 'package');
  await close(); await home();
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload(); await openBook();
  await page.locator('[data-action="practice"]:enabled').waitFor();
  assert.match(await page.locator('[data-action="practice"]').textContent(), /Book practice/);

  // 离线识别一张自制文字图片，并验证不是目录里的默认词。
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 300;
    const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 900, 300);
    ctx.fillStyle = 'black'; ctx.font = '48px Arial'; ctx.fillText('A silver robot can jump.', 30, 120);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click(); await gate();
  await page.locator('input[type=file]').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await waitMessage('已保存 1 页');
  const ocr = await page.evaluate(async () => { const b = await RAZ_LIBRARY.get('raz-a8'); return { method: b.pages[0].method, text: b.pages[0].text, words: b.analysis.words.map(x => x.w) }; });
  if (!ocr.words.includes('silver')) console.log('OCR diagnostic:', ocr);
  assert.equal(ocr.method, 'ocr'); assert.ok(ocr.words.includes('robot')); assert.ok(ocr.words.includes('silver'));
  await close();
  if (process.env.RAZ_SAMPLE_PACKAGE) {
    const sample = await readFile(process.env.RAZ_SAMPLE_PACKAGE);
    await page.getByRole('button', { name: '导入我的 PDF / 图片' }).click(); await gate();
    await page.locator('input[type=file]').setInputFiles({ name: 'sample.razbook.json', mimeType: 'application/json', buffer: sample });
    await waitMessage('已保存 11 页'); await close();
    await page.locator('[data-action="practice"]').click();
    assert.equal(await page.locator('.raz-page-count').textContent(), '1 / 8');
    await page.locator('.raz-page-image').evaluate(img => img.decode());
    await page.screenshot({ path: `${shots}/private-sample-reading.png` });
  }
  assert.deepEqual(errors, []); assert.deepEqual(uploads, []); assert.deepEqual(external, []);
  console.log('PASS: actual-PDF vocabulary and sentences, cover exclusion, parent edits, generated read/speak/quiz/write, no empty overwrite, package round trip, offline OCR and persistence, no uploads/external requests');
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
