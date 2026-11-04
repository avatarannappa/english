# Little English

给 4 岁孩子用的英语听、说、读、写小应用。纯静态网页（PWA），用 iPad Safari 打开后「添加到主屏幕」即可全屏、离线使用，不需要上架 App Store。

## 功能

| 模块 | 玩法 |
|---|---|
| 👂 听 Listen | **认一认**：卡片翻页（点卡片重读，左右滑动翻页）；**找一找**：听题点图，一轮 8 题，按一次答对数给 1–3 颗星 |
| 🗣️ 说 Speak | 先听标准音 → 点 🎤 录音 → 自动回放自己的声音；可切换单词 / 句子；检测到有声音才给星 |
| 📖 读 Read | **认字母**：A–Z 字母卡（A is for apple）；**找字母**：听字母找字母；**拼一拼**：c-a-t 逐个字母发音 → 连读 → 揭晓图片；**看词找图**：只看单词不朗读 |
| 📚 RAZ Books（读 → 高频词读物） | Set A / B / C 共 35 本公开书目，101 个高频词。听词、原创配套短句点读、听音找词、跟读、本机正版 PDF / 图片导入、翻页进度与完成奖励 |
| ✏️ 写 Write | 大写 / 小写 / 数字描红，手指或 Apple Pencil 都能写（用笔时自动忽略手掌）；覆盖 80% 字形、且没有大面积涂到字外面，就算完成 |
| ⭐ 奖励 | 每 5 颗星解锁一张贴纸，点右上角星星查看 |
| ⚙️ 家长设置 | 做一道加法才能进入：朗读方式（内置录音 / 系统朗读）、语速、是否显示中文、选项数、拼读读字母音还是字母名、清空进度 |

所有英文朗读默认播放 `audio/` 里的预录音频（macOS Samantha 声音），不依赖浏览器的系统朗读，因此静音模式、主屏幕模式下也有声音，离线也能用。

进度存在浏览器的 `localStorage` 里，不上传任何数据。

## 文件

```
index.html            页面骨架
style.css             样式（横竖屏都适配）
app.js                全部逻辑
words.js              词表：主题、字母、拼读词、描红字符集、贴纸、表扬语 ← 改内容只改这里
raz.js                RAZ 公开书目、目标词与原创配套短句
raz-reader.js         高频词书架、阅读、练习和家长资源入口
raz-library.js        PDF / 图片导入与 IndexedDB 本机书页储存
vendor/               PDF.js 4.10.38（Apache-2.0）及标准字体，含许可证
phrases.js            根据词表生成所有要朗读的句子
audio/                预录音频（*.m4a + index.json），由 tools/build-audio.mjs 生成
tools/build-audio.mjs 生成预录音频（需要 macOS）
sw.js                 离线缓存
manifest.webmanifest  主屏幕图标和名称
icons/                图标
```

### 加内容

编辑 `words.js`，比如给动物主题加一个词：

```js
{ w: 'tiger', e: '🐯', zh: '老虎', say: 'The tiger is strong.' },
```

也可以照着已有结构新增一个主题，首页会自动出现。改完后在 Mac 上重新生成录音（只录新增的句子）：

```bash
node tools/build-audio.mjs
```

没有生成录音的句子会自动退回系统朗读。推送后，iPad 上联网打开一次就会更新（`sw.js` 对页面文件是网络优先策略）。

### RAZ 高频词读物

入口：**读 → RAZ Books（高频词读物）**。Set A 有 12 本，Set B 有 12 本，Set C 有 11 本，按官方书目顺序排列；这里的 Set A / B / C 是这套高频词书的分组，不是 RAZ 分级阅读的等级。书目与目标词依据 [RAZ 官方目录](https://www.raz-plus.com/phonics/high-frequency-word-books/) 和各书公开详情核实（2026-11-04），每本的 `source` 在 `raz.js` 中指向官方详情页。

- 点目标词听录音；**Word practice** 是本项目自编配套短句，支持整句朗读、单词点读、目标词高亮和连续朗读。
- **Find words** 只考当前书的目标词。即使本书只有一个词，也会加入其他词作为选项。
- **Say it** 复用录音回放练习。读完配套短句得到一颗星，同一本重复完成不重复奖励；阅读位置保存在当前浏览器。
- 通过家长加法验证后可以打开官方资源或导入自己有权使用的正版书页。仓库不包含 RAZ 正版原文、插图或 PDF；配套短句不标作正版读物。

**导入正版书页**：在书的详情页点「导入我的 PDF / 图片」→ 家长验证 → 选择一个 PDF，或多张 PNG / JPEG / WebP 图片。每次最多 40 页、30 MB，图片按文件名自然排序（例如 `page-2` 在 `page-10` 前面）。PDF 需使用单页阅读版本；打印折页版请先拆成单页。

导入内容转为书页图片保存在这台设备浏览器的 IndexedDB 中，**不会上传至 GitHub 或任何服务，也不会跨设备同步**。可在详情页删除本机书页。清除网站数据或删除主屏幕应用可能丢失书页，保留自己的原始文件。普通进度清空不会删除本机导入的书页。

配套短句与高频词都包含离线录音。PDF 可提取的文字通过系统朗读播放，受系统声音可用性影响；扫描 PDF 和图片不做 OCR，可以配合目标词按钮练习。首次联网加载完成离线缓存后，书架、录音、PDF 导入器和已导入书页可离线使用。PDF.js 及其标准字体随项目提供，无需第三方 CDN。

浏览器验证（需安装 Playwright 或复用本机安装；测试使用独立临时浏览器和原创 PDF 样例）：

```bash
python3 -m http.server 8792 --bind 127.0.0.1
# 另一个终端；默认导入 playwright，也可用 RAZ_PLAYWRIGHT_MODULE 指定已有模块路径
node tools/test-raz.mjs
RAZ_BROWSER=webkit node tools/test-raz.mjs
```

## 本地预览

```bash
python3 -m http.server 8000
# 电脑浏览器打开 http://localhost:8000
```

`localhost` 下录音也能用。iPad 通过局域网 `http://192.168.x.x` 访问时，**录音和离线功能不可用**（Safari 要求 HTTPS），其他功能正常。

## 部署到 GitHub Pages（免费 HTTPS）

```bash
gh repo create little-english --public --source=. --push
gh api -X POST repos/{owner}/little-english/pages -f 'source[branch]=main' -f 'source[path]=/'
```

或者在网页上操作：仓库 Settings → Pages → Source 选 `main` 分支、`/ (root)`。一两分钟后访问 `https://<用户名>.github.io/little-english/`。

> 仓库设为 public 才能用免费的 Pages。代码里没有任何个人信息，如果介意，也可以用 Cloudflare Pages / Vercel / Netlify，直接拖文件夹上传即可。

## iPad 设置

1. Safari 打开上面的地址 → 分享按钮 → **添加到主屏幕**。
2. 第一次点 🎤 时允许麦克风；如果之前拒绝过：设置 → App → Safari → 麦克风 → 允许。
3. **防止孩子退出**：设置 → 辅助功能 → 引导式访问 → 打开；进入应用后连按三下顶部按钮（或主屏幕按钮）开始。
4. 没声音时先检查音量键；如果在家长设置里切到了「系统朗读」，静音模式下可能没声音，切回「内置录音」即可。

## 使用建议

- 每次 10–15 分钟，围绕一个主题走一轮：听「认一认」→「找一找」→「说」→ 描一个字母。
- 以听和说为主，写只练大写字母就够了。
- 「说」不做自动打分：语音识别对幼儿发音很不准，误判反而打击积极性。录完回放给孩子听，家长在旁边鼓励效果更好。
