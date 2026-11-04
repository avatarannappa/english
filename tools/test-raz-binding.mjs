// E2E：PDF 原句/图示在听、跟读、找词、写词中一致，旧扫描缓存不回退目录词表。
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.RAZ_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.RAZ_SITE_URL || 'http://127.0.0.1:8792/';
const shots = process.env.RAZ_SCREENSHOTS || '/tmp/little-english-raz-binding';
await mkdir(shots, { recursive: true });
const catalog = JSON.parse(await readFile(new URL('../books/index.json', import.meta.url)));
const original = JSON.parse(await readFile(new URL(`../books/${catalog['raz-a8'].file}`, import.meta.url)));
const story = original.pages.map((p, i) => ({ ...p, number: i + 1 })).filter(p => p.include);
const browser = process.env.RAZ_BROWSER === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('little-english:v1', JSON.stringify({ tts: 'system' }));
    window.__said = []; window.__asked = null;
    speechSynthesis.speak = u => {
      window.__said.push(u.text);
      const m = u.text.match(/^Find the word (.+)\.$/); if (m) window.__asked = m[1];
      setTimeout(() => u.onend?.(), 10);
    };
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  const home = async () => { while (await page.locator('#back').isVisible()) await page.locator('#back').click(); };
  const openA8 = async (entry = 'read') => {
    await page.locator(`.tile.c-${entry}`).click();
    await page.locator(entry === 'read' ? '.grid .choice' : '.raz-shortcut .choice').filter({ hasText: 'RAZ Books' }).click();
    await page.locator('[data-book="raz-a8"]').click();
    await page.locator('[data-action="practice"]:enabled').waitFor();
  };
  const gate = async () => {
    const nums = (await page.locator('.gate .q').textContent()).match(/\d+/g).map(Number);
    await page.locator('.gate .btn').filter({ hasText: new RegExp(`^${nums[0] + nums[1]}$`) }).click();
  };
  await page.goto(url); await openA8('listen');
  await page.locator('[data-action="listen-book"]').click();
  assert.equal(await page.locator('.pdf-source').textContent(), `PDF · ${story[0].number}`);
  await page.waitForFunction(text => window.__said.includes(text), story[0].text);
  await page.locator('[data-action="auto"]').click();
  await page.locator('.raz-page-image').evaluate(img => img.decode());
  await page.screenshot({ path: `${shots}/listen.png` }); await page.locator('#back').click();

  await page.locator('[data-action="speak"]').click();
  assert.match(await page.locator('.seg .on').textContent(), /Sentence/);
  assert.equal(await page.locator('.card .word').textContent(), story[0].text);
  assert.equal(await page.locator('.card .sent').textContent(), `PDF · ${story[0].number}`);
  await page.locator('.book-scene').evaluate(img => img.decode());
  await page.screenshot({ path: `${shots}/follow.png` });
  await page.locator('.stage .btn').last().click();
  assert.equal(await page.locator('.card .word').textContent(), story[1].text);
  assert.equal(await page.locator('.card .sent').textContent(), `PDF · ${story[1].number}`);
  await page.locator('#back').click();

  await page.locator('[data-action="quiz"]').click();
  for (let r = 0; r < 8; r++) {
    await page.waitForFunction(() => window.__asked);
    const target = await page.evaluate(() => window.__asked);
    const scene = story.find(p => new RegExp(`\\b${target}\\b`, 'i').test(p.text));
    assert.ok(original.selectedWords.includes(target));
    assert.equal(await page.locator('.book-exercise-context .pdf-source').textContent(), `PDF · ${scene.number}`);
    assert.equal(await page.locator('.book-exercise-context p').textContent(), scene.text);
    for (const option of await page.locator('.opt').allTextContents()) assert.ok(original.selectedWords.includes(option));
    assert.equal(await page.locator('.opt').evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth)), true);
    await page.locator('.book-exercise-context img').evaluate(img => img.decode());
    if (r === 0) {
      await page.screenshot({ path: `${shots}/find.png` });
      await page.locator('.book-exercise-context .book-preview').click();
      await page.locator('.pdf-preview').evaluate(img => img.decode());
      await page.locator('.overlay .btn').filter({ hasText: '返回' }).click();
    }
    await page.evaluate(() => { window.__asked = null; });
    await page.locator('.opt').filter({ hasText: new RegExp(`^${target}$`) }).click();
    if (r < 7) await page.waitForFunction(n => document.querySelectorAll('.dots i.on').length === n, r + 2);
  }
  await page.locator('.overlay .btn').filter({ hasText: 'Again' }).click();
  await page.locator('.book-exercise-context img').evaluate(img => img.decode()); // 重玩不能复用已撤销的 URL。
  await page.locator('#back').click();
  await page.locator('[data-action="write"]').click();
  await page.locator('[data-word="kite"]').click(); await page.waitForTimeout(250);
  assert.equal(await page.locator('.write-book-context .pdf-source').textContent(), 'PDF · 3');
  assert.equal(await page.locator('.write-book-context p').textContent(), story[0].text);
  await page.locator('.write-book-context img').evaluate(img => img.decode());
  await page.screenshot({ path: `${shots}/write.png` });
  await page.locator('[data-word="truck"]').click();
  assert.equal(await page.locator('.write-book-context .pdf-source').textContent(), 'PDF · 6');
  await home();
  for (const entry of ['speak', 'write']) {
    await page.locator(`.tile.c-${entry}`).click();
    assert.equal(await page.locator('.raz-shortcut .choice').count(), 1);
    await home();
  }

  // 旧版缓存只有扫描图片：PDF 可读，但练习不能使用默认 for / they。
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('little-english-library'); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => {
      const tx = db.transaction('books', 'readwrite'), s = tx.objectStore('books'), r = s.get('raz-a8');
      r.onsuccess = () => { const b = r.result; delete b.origin; delete b.analysis; b.pages.forEach(p => { p.text = ''; delete p.include; }); s.put(b); };
      tx.oncomplete = resolve;
    });
  });
  await page.locator('.tile.c-read').click(); await page.locator('.grid .choice').filter({ hasText: 'RAZ Books' }).click();
  await page.locator('[data-book="raz-a8"]').click();
  await page.waitForFunction(() => document.querySelector('.raz-detail .raz-intro').textContent.includes('尚未识别出正文'));
  assert.equal(await page.locator('.raz-detail .raz-word').count(), 0);
  for (const action of ['practice', 'speak', 'quiz', 'write', 'listen-book']) assert.equal(await page.locator(`[data-action="${action}"]`).isDisabled(), true);
  assert.equal(await page.locator('[data-action="local-read"]').isVisible(), true);
  await page.screenshot({ path: `${shots}/legacy.png` });
  await page.locator('[data-action="restore-site"]').click(); await gate();
  await page.locator('[data-action="practice"]:enabled').waitFor();
  assert.equal(await page.locator('.raz-detail .raz-word').count(), 16);
  assert.equal(await page.evaluate(async () => (await RAZ_LIBRARY.get('raz-a8:backup')).pages.every(p => !p.text)), true);
  await page.locator('[data-action="practice"]').click();
  assert.equal(await page.locator('.raz-sentence').textContent(), story[0].text);
  assert.deepEqual(errors, []);
  console.log('PASS: PDF-aligned listen/follow/quiz/write, only book-word options, PDF page cues, retry image cleanup, homepage shortcuts, legacy-image guard and backed-up site recovery');
  console.log(`Screenshots: ${shots}`);
} finally { await browser.close(); }
