// 离线缓存：页面文件网络优先（拿到最新版本），没网时用缓存；
// 录音文件名带内容哈希、不会变，缓存优先，安装时全部预下载。
// 改了 FILES 列表时把 VERSION 加 1。
const VERSION = 'v6';
const CACHE = `little-english-${VERSION}`;
const AUDIO = 'little-english-audio';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'words.js',
  'raz.js',
  'phrases.js',
  'raz-library.js',
  'raz-reader.js',
  'raz-content.js',
  'raz-ocr.js',
  'vendor/ocr/tesseract.min.js',
  'vendor/ocr/worker.min.js',
  'vendor/ocr/tesseract-core-lstm.wasm.js',
  'vendor/ocr/eng.traineddata.gz',
  'vendor/pdf.mjs',
  'vendor/pdf.worker.mjs',
  'vendor/standard_fonts/FoxitFixed.pfb',
  'vendor/standard_fonts/FoxitFixedBold.pfb',
  'vendor/standard_fonts/FoxitFixedBoldItalic.pfb',
  'vendor/standard_fonts/FoxitFixedItalic.pfb',
  'vendor/standard_fonts/FoxitSerif.pfb',
  'vendor/standard_fonts/FoxitSerifBold.pfb',
  'vendor/standard_fonts/FoxitSerifBoldItalic.pfb',
  'vendor/standard_fonts/FoxitSerifItalic.pfb',
  'vendor/standard_fonts/FoxitSymbol.pfb',
  'vendor/standard_fonts/FoxitDingbats.pfb',
  'vendor/standard_fonts/LiberationSans-Regular.ttf',
  'vendor/standard_fonts/LiberationSans-Bold.ttf',
  'vendor/standard_fonts/LiberationSans-Italic.ttf',
  'vendor/standard_fonts/LiberationSans-BoldItalic.ttf',
  'audio/index.json',
  'books/index.json',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

async function cacheBooks() {
  const cache = await caches.open(CACHE);
  const index = await (await cache.match('books/index.json')).json();
  await Promise.all(Object.values(index).map(entry => cache.add(`books/${entry.file}`)));
}

async function cacheAudio() {
  const index = await (await caches.open(CACHE)).match('audio/index.json').then(r => r && r.json());
  if (!index) return;
  const files = new Set([...Object.values(index.normal), ...Object.values(index.slow)].map(f => `audio/${f}`));
  const cache = await caches.open(AUDIO);
  const have = new Set((await cache.keys()).map(r => new URL(r.url).pathname.split('/audio/')[1]));
  await Promise.all([...files].filter(f => !have.has(f.slice(6))).map(f => cache.add(f).catch(() => {})));
  // 清掉不再使用的旧录音
  for (const req of await cache.keys()) {
    if (!files.has(`audio/${new URL(req.url).pathname.split('/audio/')[1]}`)) await cache.delete(req);
  }
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(cacheAudio).then(cacheBooks).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (/\/audio\/[0-9a-f]+\.m4a$/.test(url.pathname)) {
    e.respondWith(caches.open(AUDIO).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.status === 200) c.put(req, res.clone());
      return res;
    }))));
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))),
  );
});
