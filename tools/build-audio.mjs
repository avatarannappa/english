// 把应用里所有要朗读的英文预先录成音频：audio/*.m4a + audio/index.json
// 依赖 macOS 自带的 say 和 afconvert。改了 words.js 或 phrases.js 后重新运行：
//   node tools/build-audio.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const VOICE = process.env.VOICE || 'Samantha';
const RATE = { normal: 150, slow: 60 }; // 每分钟词数，say 默认约 175
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'audio');
const tmp = join(out, '.tmp');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['words.js', 'raz.js', 'phrases.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
const phrases = sandbox.window.PHRASES.all();
const normalSet = new Set(phrases.normal);
// 随站点发布的书籍也生成录音；避免书中原句只能依赖浏览器系统朗读。
const catalogPath = join(root, 'books', 'index.json');
if (existsSync(catalogPath)) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  for (const [id, entry] of Object.entries(catalog)) {
    if (!/^raz-[a-z]\d+-[0-9a-f]+\.razbook\.json$/.test(entry.file)) throw new Error('Invalid published book filename');
    const book = JSON.parse(readFileSync(join(root, 'books', entry.file), 'utf8'));
    if (book.bookId !== id) throw new Error('Published book ID mismatch');
    for (const w of book.selectedWords) {
      [w, sandbox.window.PHRASES.razFind(w), sandbox.window.PHRASES.razNot(w)].forEach(text => normalSet.add(text));
    }
    for (const p of book.pages) {
      if (!p.include || !p.text) continue;
      normalSet.add(p.text);
      for (const word of p.text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) || []) normalSet.add(word);
    }
  }
}
const normal = [...normalSet];
const slow = phrases.slow;

mkdirSync(tmp, { recursive: true });
const index = { voice: VOICE, normal: {}, slow: {} };
const keep = new Set(['index.json']);
let made = 0;

for (const [kind, list] of Object.entries({ normal, slow })) {
  for (const text of list) {
    const file = `${createHash('sha1').update(`${VOICE}|${RATE[kind]}|${text}`).digest('hex').slice(0, 12)}.m4a`;
    index[kind][text] = file;
    keep.add(file);
    if (existsSync(join(out, file))) continue;
    const aiff = join(tmp, 'x.aiff');
    execFileSync('say', ['-v', VOICE, '-r', String(RATE[kind]), '-o', aiff, text]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', aiff, join(out, file)]);
    made++;
  }
}

rmSync(tmp, { recursive: true, force: true });
let removed = 0;
for (const f of readdirSync(out)) {
  if (!keep.has(f)) { rmSync(join(out, f)); removed++; }
}
writeFileSync(join(out, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
console.log(`${normal.length + slow.length} phrases, ${made} recorded, ${removed} removed`);
