# Little English

给 4 岁孩子用的英语听、说、读、写小应用。纯静态网页（PWA），用 iPad Safari 打开后「添加到主屏幕」即可全屏、离线使用，不需要上架 App Store。

## 功能

| 模块 | 玩法 |
|---|---|
| 👂 听 Listen | **认一认**：卡片翻页（点卡片重读，左右滑动翻页）；**找一找**：听题点图，一轮 8 题，按一次答对数给 1–3 颗星 |
| 🗣️ 说 Speak | 先听标准音 → 点 🎤 录音 → 自动回放自己的声音；可切换单词 / 句子；检测到有声音才给星 |
| 📖 读 Read | **认字母**：A–Z 字母卡（A is for apple）；**找字母**：听字母找字母；**拼一拼**：c-a-t 逐个字母发音 → 连读 → 揭晓图片；**看词找图**：只看单词不朗读 |
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
