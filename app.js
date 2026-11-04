'use strict';

(() => {
  const { THEMES, LETTERS, CVC, WRITE_SETS, STICKERS, PRAISE, PHRASES: P } = window;
  const STARS_PER_STICKER = 5;
  const KEY = 'little-english:v1';
  const DEFAULTS = { stars: 0, tts: 'clip', voice: '', rate: 0.8, zh: true, options: 3, phonics: 'sound', writeSet: 'ABC', done: {} };
  const CRAYONS = ['#7c4dff', '#ff5252', '#00a8f3', '#00c853', '#ff9100'];
  // iOS 自带的“搞怪”声音，不适合教发音
  const NOVELTY_VOICES = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');
  const fx = $('#fx');

  // ---------- 小工具 ----------

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rand(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 生成 n 道题，尽量每个词都出现，且相邻两题不重复
  function makeRounds(items, n) {
    const out = [];
    while (out.length < n) {
      let batch = shuffle(items);
      if (out.length && batch[0] === out[out.length - 1] && batch.length > 1) batch.push(batch.shift());
      out.push(...batch);
    }
    return out.slice(0, n);
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ---------- 存储 ----------

  const store = (() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
  })();
  const save = () => localStorage.setItem(KEY, JSON.stringify(store));

  // ---------- 声音：朗读 ----------
  // 优先播放预录音频（audio/，由 tools/build-audio.mjs 生成）。
  // 系统朗读在 iOS 静音模式、主屏幕模式和一些内嵌浏览器里经常没声音，只作为兜底。

  const synth = window.speechSynthesis;
  let voices = [];

  function loadVoices() {
    voices = synth ? synth.getVoices().filter(v => /^en[-_]/i.test(v.lang) && !NOVELTY_VOICES.test(v.name)) : [];
    return voices;
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function pickVoice() {
    if (!voices.length) loadVoices();
    const us = v => v.lang.replace('_', '-') === 'en-US';
    return voices.find(v => v.voiceURI === store.voice)
      || voices.find(v => us(v) && /samantha/i.test(v.name))
      || voices.find(v => us(v) && /enhanced|premium/i.test(v.name))
      || voices.find(us)
      || voices[0]
      || null;
  }

  function speakSystem(text, rate) {
    return new Promise(resolve => {
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = rate;
      u.pitch = 1.05;
      const timer = setTimeout(finish, 1500 + text.length * 150 / rate); // iOS 偶尔不触发 onend
      function finish() { clearTimeout(timer); stopCurrent = null; resolve(); }
      u.onend = finish;
      u.onerror = finish;
      stopCurrent = () => { synth.cancel(); finish(); };
      synth.resume();
      synth.speak(u);
    });
  }

  // 所有句子共用一个 <audio>：iOS 只要在点击里播过一次，之后就能随时播放
  const player = new Audio();
  player.preload = 'auto';
  let clips = null; // audio/index.json
  const clipUrls = new Map(); // 文件名 -> Promise<blob URL>
  const clipsReady = fetch('audio/index.json')
    .then(r => (r.ok ? r.json() : null))
    .then(j => { clips = j; })
    .catch(err => console.warn('audio index', err));

  // 用 blob URL 播放：Safari 对 service worker 返回的媒体 Range 请求支持不好
  function clipUrl(file) {
    if (!clipUrls.has(file)) {
      clipUrls.set(file, fetch(`audio/${file}`)
        .then(r => { if (!r.ok) throw new Error(`${r.status} ${file}`); return r.blob(); })
        .then(b => URL.createObjectURL(b))
        .catch(err => { clipUrls.delete(file); throw err; }));
    }
    return clipUrls.get(file);
  }

  // 播放结束（或中途被 hush 打断）返回 true；没有这个音频或播放失败返回 false
  async function playClip(text, slow) {
    const seq = hushSeq;
    if (!clips) await clipsReady;
    const file = clips && clips[slow ? 'slow' : 'normal'][text];
    if (!file) {
      if (clips) console.warn('没有预录音频，使用系统朗读：', text);
      return false;
    }
    const url = await clipUrl(file);
    if (seq !== hushSeq) return true; // 下载期间已经换成别的句子了
    return new Promise(resolve => {
      let timer = 0;
      const done = ok => {
        clearTimeout(timer);
        player.onended = player.onerror = player.onloadedmetadata = null;
        stopCurrent = null;
        resolve(ok);
      };
      stopCurrent = () => { player.pause(); done(true); };
      player.onended = () => done(true);
      player.onerror = () => done(false);
      player.onloadedmetadata = () => {
        clearTimeout(timer);
        timer = setTimeout(() => done(true), (player.duration / player.playbackRate) * 1000 + 1500);
      };
      timer = setTimeout(() => done(true), 8000);
      player.src = url;
      player.playbackRate = slow ? 1 : clamp(store.rate / 0.8, 0.5, 2);
      player.play().catch(err => {
        console.warn('audio play', err);
        if (stopCurrent) done(false);
      });
    });
  }

  let stopCurrent = null;
  let hushSeq = 0;

  async function say(text, { slow = false } = {}) {
    if (!text) return;
    const seq = hushSeq;
    if (store.tts !== 'system' && await playClip(text, slow).catch(() => false)) return;
    if (seq === hushSeq) await speakSystem(text, slow ? 0.35 : store.rate);
  }

  // talk('cat', 300, 'The cat says meow.', () => highlight())
  // 字符串朗读、数字等待、函数执行；新的 talk 会打断旧的。返回是否完整播完。
  let talkId = 0;
  async function talk(...steps) {
    const id = ++talkId;
    hush();
    for (const s of steps) {
      if (id !== talkId) return false;
      if (typeof s === 'number') await sleep(s);
      else if (typeof s === 'function') await s();
      else if (s) await say(s);
    }
    return id === talkId;
  }

  function hush() {
    hushSeq++;
    if (stopCurrent) stopCurrent();
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  function stopTalk() {
    talkId++;
    hush();
    stopPlay();
  }

  // ---------- 声音：音效与录音回放 ----------

  let actx = null;
  function ac() {
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) actx = new C();
    }
    if (actx && actx.state !== 'running') actx.resume();
    return actx;
  }

  function setAudioSession(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* 旧版 Safari 没有 */ }
  }

  function tone(freqs, dur, type = 'triangle', gain = 0.16) {
    const c = ac();
    if (!c) return;
    let t = c.currentTime + 0.01;
    for (const f of freqs) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
      t += dur * 0.75;
    }
  }

  const sfx = {
    tap: () => tone([620], 0.07, 'triangle', 0.08),
    ok: () => tone([660, 880, 1320], 0.14),
    no: () => tone([330, 247], 0.16, 'sine', 0.12),
    star: () => tone([1047, 1319, 1568, 2093], 0.1, 'triangle', 0.12),
  };

  let playing = null;
  function playBuffer(buf) {
    stopPlay();
    const c = ac();
    return new Promise(resolve => {
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = 1.5;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.onended = () => { if (playing === src) playing = null; resolve(); };
      playing = src;
      src.start();
    });
  }

  function stopPlay() {
    if (!playing) return;
    const p = playing;
    playing = null;
    try { p.stop(); } catch { /* 已经停了 */ }
  }

  const recorder = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),

    // 返回 { stop() => Promise<{ buffer, peak, seconds }> }
    async start(onLevel) {
      setAudioSession('play-and-record');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (err) {
        setAudioSession('playback');
        throw err;
      }
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
        .find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { mr.onstop = res; });

      const c = ac();
      const source = c.createMediaStreamSource(stream);
      const analyser = c.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let peak = 0;
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const lvl = Math.min(1, Math.sqrt(sum / data.length) * 5);
        peak = Math.max(peak, lvl);
        if (onLevel) onLevel(lvl);
        raf = requestAnimationFrame(tick);
      };
      tick();
      const began = performance.now();
      mr.start();

      return {
        async stop() {
          if (mr.state !== 'inactive') mr.stop();
          await stopped;
          cancelAnimationFrame(raf);
          source.disconnect();
          stream.getTracks().forEach(t => t.stop());
          setAudioSession('playback');
          if (onLevel) onLevel(0);
          const blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/mp4' });
          const buffer = await c.decodeAudioData(await blob.arrayBuffer());
          return { buffer, peak, seconds: (performance.now() - began) / 1000 };
        },
      };
    },
  };

  // 一小段静音 WAV，用来在第一次点击时解锁 <audio>
  function silentWav() {
    const n = 800;
    const v = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, t) => [...t].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
  }

  // iOS 要求第一次发声发生在用户点击里。点击处理函数如果马上要朗读，会直接换掉这段静音
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    setAudioSession('playback');
    ac();
    if (!stopCurrent) {
      player.src = silentWav();
      player.play().catch(() => {});
    }
    if (synth) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    }
  }
  for (const type of ['touchend', 'click']) window.addEventListener(type, unlockAudio, { capture: true });

  // ---------- 奖励 ----------

  function center(el) {
    if (!el) return { x: innerWidth / 2, y: innerHeight * 0.4 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function burst(el, n = 16) {
    const { x, y } = center(el);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const d = 120 + Math.random() * 160;
      const s = h('span', { class: 'spark' }, pick(['⭐', '✨', '🌟', '🎉', '💖', '🎈']));
      s.style.left = `${x - 22}px`;
      s.style.top = `${y - 22}px`;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      s.style.setProperty('--rot', `${rand(360) - 180}deg`);
      fx.append(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  function toast(text) {
    const t = h('div', { class: 'toast' }, text);
    fx.append(t);
    setTimeout(() => t.remove(), 1500);
  }

  // 视觉 + 音效，返回一句表扬让调用方朗读
  function cheer(el) {
    const p = pick(PRAISE);
    sfx.ok();
    burst(el);
    toast(p);
    return p;
  }

  const starBtn = $('#stars');
  function renderStars(animate) {
    starBtn.textContent = `⭐ ${store.stars}`;
    if (animate) bump(starBtn);
  }

  function addStar(n = 1) {
    const before = Math.floor(store.stars / STARS_PER_STICKER);
    store.stars += n;
    save();
    setTimeout(() => { sfx.star(); renderStars(true); burst(starBtn, 8); }, 400);
    const after = Math.floor(store.stars / STARS_PER_STICKER);
    if (after > before && before < STICKERS.length) {
      setTimeout(() => newSticker(STICKERS[Math.min(after, STICKERS.length) - 1]), 1800);
    }
  }

  function newSticker(emo) {
    const big = h('div', { class: 'emo', style: 'font-size:180px' }, emo);
    overlay(
      h('div', { class: 'word' }, 'New sticker!', h('span', { class: 'zh' }, ' 新贴纸')),
      big,
      h('button', { class: 'btn wide', onclick: closeOverlay }, '👍 OK'),
    );
    burst(big, 24);
    sfx.star();
    talk('Wow! You got a new sticker!');
  }

  // ---------- 弹层 ----------

  let overlayEl = null;
  function overlay(...kids) {
    closeOverlay();
    overlayEl = h('div', { class: 'overlay' }, h('div', { class: 'sheet' }, kids));
    document.body.append(overlayEl);
    return overlayEl;
  }
  function closeOverlay() {
    if (overlayEl) overlayEl.remove();
    overlayEl = null;
  }

  // ---------- 页面导航 ----------

  const stack = [];
  let cleanups = [];
  const onLeave = fn => cleanups.push(fn);

  const screen = (title, zh, render) => ({ title, zh, render });

  function setTitle(title, zh) {
    $('#title').replaceChildren(title, zh ? h('small', { class: 'zh' }, zh) : '');
  }

  function show(view) {
    cleanups.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    closeOverlay();
    stopPlay();
    app.replaceChildren();
    app.scrollTop = 0;
    setTitle(view.title, view.zh);
    $('#back').hidden = stack.length <= 1;
    view.render(app);
  }

  // 新页面如果一进来就朗读，会打断点击时说的那个词
  function go(view) { stack.push(view); show(view); }
  function replace(view) { stack.pop(); go(view); }
  function back() {
    if (stack.length <= 1) return;
    stopTalk();
    stack.pop();
    show(stack[stack.length - 1]);
  }
  function reload() { show(stack[stack.length - 1]); }

  // ---------- 通用组件 ----------

  function choice(emo, en, zh, onclick, cls = '') {
    return h('button', { class: `choice ${cls}`, onclick },
      h('span', { class: 'emo' }, emo), en, zh && h('span', { class: 'zh' }, zh));
  }

  function menuChoice(emo, en, zh, open) {
    return choice(emo, en, zh, () => { sfx.tap(); talk(en); open(); });
  }

  function themeGrid(open) {
    return h('div', { class: 'grid' },
      THEMES.map(t => choice(t.icon, t.name, t.zh, () => { sfx.tap(); talk(t.name); open(t); })));
  }

  function dotsBar(n) {
    const el = h('div', { class: 'dots' }, Array.from({ length: n }, () => h('i')));
    el.set = k => [...el.children].forEach((d, i) => d.classList.toggle('on', i <= k));
    return el;
  }

  // 左右滑动翻页；滑动后吞掉那次 click
  function swipe(el, move) {
    let x0 = null;
    let swiped = false;
    el.addEventListener('pointerdown', e => { x0 = e.clientX; swiped = false; });
    // 手指可能滑出卡片再抬起，所以在 window 上收尾
    const up = e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 70) { swiped = true; move(dx < 0 ? 1 : -1); }
    };
    window.addEventListener('pointerup', up);
    onLeave(() => window.removeEventListener('pointerup', up));
    el.addEventListener('click', e => {
      if (swiped) { swiped = false; e.stopImmediatePropagation(); }
    }, true);
  }

  // ---------- 首页 ----------

  const Home = screen('Little English', '', main => {
    const tile = (cls, emo, en, zh, open) => h('button', {
      class: `tile c-${cls}`,
      onclick: () => { sfx.tap(); talk(en); open(); },
    }, h('span', { class: 'emo' }, emo), h('span', {}, en), h('span', { class: 'zh' }, zh));

    main.append(h('div', { class: 'home' },
      tile('listen', '👂', 'Listen', '听', () => go(ListenThemes)),
      tile('speak', '🗣️', 'Speak', '说', () => go(SpeakThemes)),
      tile('read', '📖', 'Read', '读', () => go(ReadMenu)),
      tile('write', '✏️', 'Write', '写', () => go(WriteMenu)),
    ));
  });

  // ---------- 听 ----------

  const ListenThemes = screen('Listen', '听', main => {
    main.append(themeGrid(t => go(ListenModes(t))));
  });

  const ListenModes = t => screen(t.name, t.zh, main => {
    main.append(h('div', { class: 'grid two' },
      menuChoice('🃏', 'Learn', '认一认', () => go(Cards(t))),
      menuChoice('🎯', 'Find it', '找一找', () => go(FindTheme(t))),
    ));
  });

  const Cards = t => screen(t.name, t.zh, main => {
    const words = t.words;
    let i = 0;
    const emo = h('div', { class: 'emo' });
    const word = h('div', { class: 'word' });
    const zh = h('div', { class: 'zh' });
    const sent = h('div', { class: 'sent' });
    const card = h('button', {
      class: 'card',
      onclick: () => { bump(emo); talk(words[i].w, 400, words[i].say); },
    }, emo, word, zh, sent);
    const prev = h('button', { class: 'btn big', onclick: () => move(-1) }, '⬅️');
    const next = h('button', { class: 'btn big', onclick: () => move(1) }, '➡️');
    const dots = dotsBar(words.length);

    function draw(intro) {
      const x = words[i];
      emo.textContent = x.e;
      word.textContent = x.w;
      zh.textContent = x.zh;
      sent.textContent = x.say || '';
      prev.disabled = i === 0;
      dots.set(i);
      bump(card);
      talk(intro, intro && 500, x.w, 600, x.w);
    }

    function move(d) {
      if (i + d >= words.length) return finish();
      i = clamp(i + d, 0, words.length - 1);
      sfx.tap();
      draw();
    }

    function finish() {
      addStar(1);
      const p = cheer(card);
      talk(p, 300, "Let's play a game!");
      overlay(
        h('div', { class: 'emo' }, '🎉'),
        h('div', { class: 'word' }, 'All done!', h('span', { class: 'zh' }, ' 学完啦')),
        h('div', { class: 'row' },
          h('button', { class: 'btn wide', onclick: () => { i = 0; closeOverlay(); draw(); } }, '🔁 Again'),
          h('button', { class: 'btn wide', onclick: () => { talk('Find it'); replace(FindTheme(t)); } }, '🎯 Find it'),
        ),
      );
    }

    swipe(card, move);
    main.append(h('div', { class: 'stage' }, prev, card, next), dots);
    draw(t.name);
  });

  function themeItems(t) {
    return t.words.map(x => ({ key: x.w, show: x.e, ask: P.ask(t, x), no: P.no(t, x), yes: x.w }));
  }

  const FindTheme = t => Quiz({ title: t.name, zh: `${t.zh} · 找一找`, items: themeItems(t) });

  // ---------- 通用选择题 ----------
  // items: [{ key, show, ask, no, yes }]
  // reading: 题目以文字显示、不自动朗读（「看词找图」用）
  const Quiz = cfg => screen(cfg.title, cfg.zh, main => {
    const rounds = makeRounds(cfg.targets || cfg.items, cfg.rounds || 8);
    const n = clamp(store.options, 2, cfg.items.length);
    let r = 0;
    let firstTry = true;
    let score = 0;
    let locked = false;
    let alive = true;
    onLeave(() => { alive = false; });

    const replay = h('button', { class: 'btn big', onclick: () => ask() }, '🔊');
    const q = h('div', { class: 'question' });
    const opts = h('div', { class: 'options' });
    const dots = dotsBar(rounds.length);

    const ask = () => {
      const it = rounds[r];
      return cfg.reading ? talk(it.yes) : talk(it.ask);
    };

    function round() {
      const it = rounds[r];
      firstTry = true;
      locked = false;
      replay.disabled = false;
      dots.set(r);
      q.replaceChildren(replay, cfg.reading ? h('span', { class: 'bigword' }, it.yes) : h('span', {}, cfg.hint || '👂 ❓'));
      const others = shuffle(cfg.items.filter(x => x.key !== it.key && x.show !== it.show)).slice(0, n - 1);
      opts.replaceChildren(...shuffle([it, ...others]).map(c =>
        h('button', { class: `opt ${cfg.optClass || ''}`, onclick: e => answer(e.currentTarget, c) }, c.show)));
      if (cfg.reading) talk(r === 0 ? 'Read and find.' : '');
      else ask();
    }

    async function answer(btn, c) {
      if (locked) return;
      const it = rounds[r];
      if (c.key !== it.key) {
        firstTry = false;
        btn.classList.remove('wrong');
        void btn.offsetWidth;
        btn.classList.add('wrong');
        sfx.no();
        talk(cfg.no || c.no, 400, cfg.reading ? '' : it.ask);
        return;
      }
      locked = true;
      replay.disabled = true; // 表扬和翻题期间不允许重播打断流程。
      if (firstTry) score++;
      btn.classList.add('right');
      [...opts.children].forEach(b => { if (b !== btn) b.classList.add('dim'); });
      const ok = await talk(cheer(btn), 200, it.yes, 500);
      if (!ok || !alive) return;
      if (++r < rounds.length) round();
      else finish();
    }

    function finish() {
      const stars = score >= rounds.length * 0.8 ? 3 : score >= rounds.length * 0.5 ? 2 : 1;
      addStar(stars);
      talk(stars === 3 ? 'Amazing! You are a star!' : 'Good job! Let\'s play again!');
      overlay(
        h('div', { class: 'emo' }, stars === 3 ? '🏆' : '🎉'),
        h('div', { class: 'word' }, '⭐'.repeat(stars)),
        h('div', { class: 'zh', style: 'font-size:24px' }, `一次答对 ${score} / ${rounds.length}`),
        h('div', { class: 'row' },
          h('button', { class: 'btn wide', onclick: reload }, '🔁 Again'),
          h('button', { class: 'btn wide', onclick: back }, '✅ Done'),
        ),
      );
    }

    main.append(q, opts, dots);
    round();
  });

  // ---------- 说 ----------

  const SpeakThemes = screen('Speak', '说', main => {
    main.append(themeGrid(t => go(Speak(t))));
  });

  const Speak = t => screen(t.name, `${t.zh} · 跟我说`, main => {
    const words = t.words;
    let i = 0;
    let mode = 'word';
    let rec = null;
    let starting = false; // 等麦克风权限期间，忽略重复点击
    let clip = null;
    let autoStop = 0;
    const rewarded = new Set();

    const emo = h('div', { class: 'emo' });
    const word = h('div', { class: 'word' });
    const zh = h('div', { class: 'zh' });
    const sent = h('div', { class: 'sent' });
    const model = () => (mode === 'word' ? words[i].w : words[i].say);
    const card = h('button', { class: 'card', onclick: () => { bump(emo); talk(model()); } }, emo, word, zh, sent);
    const prev = h('button', { class: 'btn big', onclick: () => move(-1) }, '⬅️');
    const next = h('button', { class: 'btn big', onclick: () => move(1) }, '➡️');
    const listenBtn = h('button', { class: 'btn big', onclick: () => talk(model()) }, '🔊');
    const mic = h('button', { class: 'mic', onclick: toggleRec }, '🎤');
    const mine = h('button', { class: 'btn big', disabled: true, onclick: playMine }, '▶️');
    const tip = h('div', { class: 'tip' });
    const dots = dotsBar(words.length);

    const seg = h('div', { class: 'seg' },
      h('button', { class: 'on', onclick: e => setMode('word', e.currentTarget) }, 'Word', h('span', { class: 'zh' }, ' 单词')),
      h('button', { onclick: e => setMode('sentence', e.currentTarget) }, 'Sentence', h('span', { class: 'zh' }, ' 句子')),
    );

    function setMode(m, btn) {
      if (rec) return;
      mode = m;
      [...seg.children].forEach(b => b.classList.toggle('on', b === btn));
      draw();
    }

    function draw() {
      const x = words[i];
      emo.textContent = x.e;
      word.textContent = mode === 'word' ? x.w : x.say;
      word.style.fontSize = mode === 'word' ? '' : 'min(48px, 6vh)';
      zh.textContent = x.zh;
      sent.textContent = '';
      prev.disabled = i === 0;
      next.disabled = i === words.length - 1;
      clip = null;
      mine.disabled = true;
      dots.set(i);
      bump(card);
      tip.textContent = recorder.supported ? '先点 🔊 听，再点 🎤 跟着说，说完再点一下 🎤' : '';
      talk('Listen and say.', 300, model());
    }

    async function move(d) {
      if (rec) await stopRec();
      const j = clamp(i + d, 0, words.length - 1);
      if (j === i) return;
      i = j;
      sfx.tap();
      draw();
    }

    async function toggleRec() {
      if (starting) return;
      if (rec) return stopRec();
      if (!window.isSecureContext) {
        tip.textContent = '录音需要通过 https 打开（部署到 GitHub Pages 后即可）';
        return;
      }
      if (!recorder.supported) {
        tip.textContent = '这个浏览器不支持录音';
        return;
      }
      stopTalk();
      starting = true;
      try {
        rec = await recorder.start(lvl => mic.style.setProperty('--lvl', lvl.toFixed(2)));
      } catch (err) {
        console.error(err);
        tip.textContent = '没有麦克风权限：设置 → App → Safari → 麦克风 → 允许';
        return;
      } finally {
        starting = false;
      }
      if (!alive) { rec.stop().catch(() => {}); rec = null; return; }
      mic.classList.add('rec');
      mic.textContent = '⏹️';
      tip.textContent = 'Say it! 说完再点一下';
      autoStop = setTimeout(stopRec, mode === 'word' ? 5000 : 8000);
    }

    async function stopRec() {
      if (!rec) return;
      const r = rec;
      rec = null;
      clearTimeout(autoStop);
      mic.classList.remove('rec');
      mic.textContent = '🎤';
      try {
        const res = await r.stop();
        clip = res.buffer;
        mine.disabled = false;
        const spoke = res.peak > 0.12 && res.seconds > 0.6;
        if (!spoke) {
          tip.textContent = '好像没听到声音，再大声一点试试';
          await talk('I can\'t hear you. Try again!');
          return;
        }
        tip.textContent = '听听自己的声音 👂';
        await playBuffer(clip);
        if (!rewarded.has(`${mode}:${i}`)) {
          rewarded.add(`${mode}:${i}`);
          addStar(1);
          talk(cheer(mic));
        }
      } catch (err) {
        console.error(err);
        tip.textContent = '录音失败了，再试一次';
      }
    }

    async function playMine() {
      if (!clip || rec) return;
      stopTalk();
      bump(mine);
      await playBuffer(clip);
    }

    let alive = true;
    onLeave(() => {
      alive = false;
      clearTimeout(autoStop);
      if (rec) rec.stop().catch(() => {});
      rec = null;
    });

    swipe(card, move);
    main.append(
      h('div', { class: 'row', style: 'margin-bottom:10px' }, seg),
      h('div', { class: 'stage' }, prev, card, next),
      h('div', { class: 'row', style: 'padding-top:16px; gap:34px' }, listenBtn, mic, mine),
      tip,
      dots,
    );
    draw();
  });

  // ---------- 读 ----------

  const ReadMenu = screen('Read', '读', main => {
    main.append(h('div', { class: 'grid two' },
      menuChoice('🔤', 'ABC', '认字母', () => go(Letters)),
      menuChoice('🔍', 'Find letters', '找字母', () => go(FindLetters())),
      menuChoice('🧩', 'Sound it out', '拼一拼', () => go(Blend)),
      menuChoice('👀', 'Read and find', '看词找图', () => go(ReadWords())),
      menuChoice('📚', 'RAZ Books', '高频词读物', () => go(RazShelf)),
    ));
  });


  const Letters = screen('ABC', '认字母', main => {
    const open = L => {
      sfx.tap();
      const sheet = overlay(
        h('div', { class: 'huge', onclick: () => talk(P.letter(L.l)) }, L.l, h('span', { style: 'color:#b07ad6' }, L.l.toLowerCase())),
        h('div', { class: 'emo', onclick: () => talk(L.w) }, L.e),
        h('div', { class: 'word' }, L.w),
        h('div', { class: 'row' },
          h('button', { class: 'btn big', onclick: () => talk(P.letter(L.l), 400, P.letterLine(L)) }, '🔊'),
          h('button', { class: 'btn big', onclick: () => { closeOverlay(); go(Trace(WRITE_SETS[0].chars, WRITE_SETS[0].chars.indexOf(L.l))); } }, '✏️'),
          h('button', { class: 'btn big', onclick: closeOverlay }, '✖️'),
        ),
      );
      bump(sheet.firstChild);
      talk(P.letter(L.l), 400, P.letterLine(L));
    };
    main.append(h('div', { class: 'letters' },
      LETTERS.map(L => choice(L.e, `${L.l}${L.l.toLowerCase()}`, null, () => open(L)))));
  });

  function FindLetters() {
    const items = LETTERS.map(L => ({
      key: L.l,
      show: L.l,
      ask: P.findLetter(L.l),
      no: P.notLetter(L.l),
      yes: P.gotLetter(L.l),
    }));
    return Quiz({ title: 'Find letters', zh: '找字母', items, optClass: 'letter', rounds: 10 });
  }

  function ReadWords() {
    const items = CVC.map(x => ({ key: x.w, show: x.e, yes: x.w }));
    return Quiz({ title: 'Read and find', zh: '看词找图', items, reading: true, no: 'Try again!', rounds: 8 });
  }

  const sound = ch => (store.phonics === 'name' ? P.letter(ch) : P.sound(ch));

  const Blend = screen('Sound it out', '拼一拼', main => {
    const list = shuffle(CVC);
    let i = 0;
    let nextLetter = 0;
    let done = false;

    const tiles = h('div', { class: 'blend' });
    const reveal = h('div', { class: 'reveal' });
    const tip = h('div', { class: 'tip' });
    const prev = h('button', { class: 'btn big', onclick: () => move(-1) }, '⬅️');
    const play = h('button', { class: 'btn big', onclick: () => blendAll(false) }, '🔊');
    const next = h('button', { class: 'btn big', onclick: () => move(1) }, '➡️');

    const light = k => [...tiles.children].forEach((t, j) => t.classList.toggle('hl', k === 'all' || j === k));

    function draw() {
      const x = list[i];
      nextLetter = 0;
      done = false;
      prev.disabled = i === 0;
      reveal.textContent = x.e;
      reveal.className = 'reveal hidden';
      tip.textContent = '按顺序点每个字母，听它的声音';
      tiles.replaceChildren(...[...x.w].map((ch, k) =>
        h('button', { class: `ltile ${'aeiou'.includes(ch) ? 'vowel' : ''}`, onclick: () => tapLetter(k) }, ch)));
      talk('Tap the letters.');
    }

    function tapLetter(k) {
      const ch = list[i].w[k];
      if (k === nextLetter) nextLetter++;
      const finished = nextLetter === list[i].w.length && !done;
      talk(() => light(k), sound(ch), 250, () => light(-1), finished && (() => blendAll(true)));
    }

    // 逐个字母 → 慢速连读 → 正常读 → 揭晓图片
    async function blendAll(reward) {
      const x = list[i];
      const steps = [];
      [...x.w].forEach((ch, k) => steps.push(() => light(k), sound(ch), 250));
      steps.push(() => light('all'), () => say(x.w, { slow: true }), 300, x.w, () => light(-1));
      const ok = await talk(...steps);
      if (!ok) return;
      reveal.className = 'reveal show';
      if (reward && !done) {
        done = true;
        addStar(1);
        tip.textContent = '';
        await talk(cheer(reveal), 200, x.w);
      }
    }

    function move(d) {
      i = (i + d + list.length) % list.length;
      sfx.tap();
      draw();
    }

    main.append(
      h('div', { class: 'grow center' }, reveal, tiles, tip),
      h('div', { class: 'row', style: 'padding-top:12px' }, prev, play, next),
    );
    draw();
  });

  // ---------- 写 ----------

  const WriteMenu = screen('Write', '写', main => {
    const tabs = h('div', { class: 'tabs' });
    const grid = h('div', { class: 'letters' });
    const render = () => {
      const set = WRITE_SETS.find(x => x.name === store.writeSet) || WRITE_SETS[0];
      tabs.replaceChildren(...WRITE_SETS.map(x =>
        h('button', { class: `btn pill ${x === set ? 'on' : ''}`, onclick: () => { store.writeSet = x.name; save(); sfx.tap(); render(); } }, x.name)));
      const { chars } = set;
      grid.replaceChildren(...[...chars].map((ch, k) =>
        h('button', { class: 'choice', onclick: () => { sfx.tap(); go(Trace(chars, k)); } },
          ch, h('span', { class: 'zh', style: 'font-size:22px' }, store.done[`w:${ch}`] ? '⭐' : '·'))));
    };
    render();
    main.append(tabs, grid);
  });

  const spokenChar = P.char;
  const traceIntro = P.traceIntro;
  const GLYPH_FONT = '"Chalkboard SE", "Comic Sans MS", "Arial Rounded MT Bold", sans-serif';
  const CELL = 6; // 判定网格的格子大小（CSS 像素）

  const Trace = (chars, start) => screen('Write', '写', main => {
    let i = start;
    let color = CRAYONS[0];
    let passed = false;
    let geo = null; // 当前字形的判定数据
    let penSeen = false;
    const strokes = new Map();

    const guide = h('canvas');
    const ink = h('canvas');
    const bar = h('i');
    const meter = h('div', { class: 'meter' }, bar);
    const paper = h('div', { class: 'paper' }, guide, ink, meter);
    const prev = h('button', { class: 'btn big', onclick: () => move(-1) }, '⬅️');
    const next = h('button', { class: 'btn big', onclick: () => move(1) }, '➡️');
    const crayons = CRAYONS.map(c => h('button', {
      class: `crayon ${c === color ? 'on' : ''}`,
      style: `background:${c}`,
      onclick: e => { color = c; crayons.forEach(b => b.classList.toggle('on', b === e.currentTarget)); },
    }));

    const ch = () => chars[i];
    const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

    // 字形摆放（CSS 像素）。小写字母用统一基线，方便看出高低
    function placeGlyph(ctx, w, hgt) {
      const c = ch();
      let size = hgt * 0.74;
      ctx.font = `bold ${size}px ${GLYPH_FONT}`;
      const width = ctx.measureText(c).width;
      if (width > w * 0.8) size *= (w * 0.8) / width;
      ctx.font = `bold ${size}px ${GLYPH_FONT}`;
      const cap = ctx.measureText('H').actualBoundingBoxAscent || size * 0.7;
      const xh = ctx.measureText('x').actualBoundingBoxAscent || size * 0.48;
      const lower = /[a-z]/.test(c);
      const base = lower ? hgt * 0.68 : hgt / 2 + cap / 2;
      const lines = lower
        ? [base - cap, base - xh, base, base + size * 0.22]
        : [base - cap, base - cap / 2, base];
      return { size, x: w / 2, base, lines };
    }

    function fillGlyph(ctx, g, style) {
      ctx.font = `bold ${g.size}px ${GLYPH_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = style;
      ctx.fillText(ch(), g.x, g.base);
    }

    function layout() {
      const rect = paper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const k = dpr();
      const w = rect.width;
      const hgt = rect.height;
      for (const c of [guide, ink]) {
        c.width = Math.round(w * k);
        c.height = Math.round(hgt * k);
      }

      // 画纸：横线 + 浅色字 + 虚线轮廓
      const gc = guide.getContext('2d');
      gc.setTransform(k, 0, 0, k, 0, 0);
      const g = placeGlyph(gc, w, hgt);
      gc.lineWidth = 2;
      g.lines.forEach((y, j) => {
        gc.strokeStyle = j === g.lines.length - (/[a-z]/.test(ch()) ? 2 : 1) ? '#f3a5b5' : '#cfe3f7';
        gc.setLineDash(j === 1 ? [10, 10] : []);
        gc.beginPath();
        gc.moveTo(24, y);
        gc.lineTo(w - 24, y);
        gc.stroke();
      });
      fillGlyph(gc, g, '#efe7f8');
      gc.setLineDash([8, 8]);
      gc.lineWidth = 3;
      gc.strokeStyle = '#c4aee0';
      gc.strokeText(ch(), g.x, g.base);
      gc.setLineDash([]);

      // 判定网格：字形内部的“中心带”需要被覆盖，离字形太远的墨水算出界
      const gw = Math.ceil(w / CELL);
      const gh = Math.ceil(hgt / CELL);
      const grid = document.createElement('canvas');
      grid.width = gw;
      grid.height = gh;
      const gx = grid.getContext('2d', { willReadFrequently: true });
      gx.setTransform(1 / CELL, 0, 0, 1 / CELL, 0, 0);
      fillGlyph(gx, g, '#000');
      const alpha = gx.getImageData(0, 0, gw, gh).data;
      const mask = new Uint8Array(gw * gh);
      for (let j = 0; j < mask.length; j++) mask[j] = alpha[j * 4 + 3] > 110 ? 1 : 0;
      const inside = distance(mask, gw, gh, 1);
      const outside = distance(mask, gw, gh, 0);
      let maxIn = 1;
      for (let j = 0; j < mask.length; j++) if (mask[j]) maxIn = Math.max(maxIn, inside[j]);
      const core = [];
      for (let j = 0; j < mask.length; j++) if (mask[j] && inside[j] >= Math.max(1, maxIn * 0.45)) core.push(j);
      const far = new Uint8Array(gw * gh);
      for (let j = 0; j < mask.length; j++) far[j] = !mask[j] && outside[j] > maxIn * 1.6 ? 1 : 0;
      grid.width = gw; // 清空并重置变换，留给墨水采样用
      geo = { gw, gh, grid, core, far, brush: clamp(maxIn * 2 * CELL * 0.95, 16, 80) };
      clearInk();
    }

    // 两遍扫描的近似欧氏距离：每个格子到最近“非 target”格子的距离
    function distance(mask, w, hgt, target) {
      const d = new Float32Array(w * hgt);
      const INF = 1e6;
      for (let j = 0; j < d.length; j++) d[j] = mask[j] === target ? INF : 0;
      const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= hgt ? 0 : d[y * w + x]);
      for (let y = 0; y < hgt; y++) {
        for (let x = 0; x < w; x++) {
          const j = y * w + x;
          if (!d[j]) continue;
          d[j] = Math.min(d[j], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
        }
      }
      for (let y = hgt - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
          const j = y * w + x;
          if (!d[j]) continue;
          d[j] = Math.min(d[j], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
        }
      }
      return d;
    }

    function score() {
      if (!geo || passed) return;
      const { gw, gh, grid, core, far } = geo;
      const gx = grid.getContext('2d', { willReadFrequently: true });
      gx.clearRect(0, 0, gw, gh);
      gx.drawImage(ink, 0, 0, gw, gh);
      const a = gx.getImageData(0, 0, gw, gh).data;
      let covered = 0;
      let inked = 0;
      let outside = 0;
      for (const j of core) if (a[j * 4 + 3] > 40) covered++;
      for (let j = 0; j < gw * gh; j++) {
        if (a[j * 4 + 3] > 40) {
          inked++;
          if (far[j]) outside++;
        }
      }
      const coverage = core.length ? covered / core.length : 0;
      const messy = inked ? outside / inked : 0;
      bar.style.width = `${Math.min(100, (coverage / 0.8) * 100)}%`;
      bar.style.background = messy > 0.25 ? '#ffb74d' : '';
      return { coverage, messy };
    }

    function check() {
      const s = score();
      if (!s) return;
      if (s.coverage >= 0.8 && s.messy <= 0.25) {
        passed = true;
        paper.classList.add('ok');
        store.done[`w:${ch()}`] = true;
        save();
        addStar(1);
        talk(cheer(paper), 300, spokenChar(ch()));
        if (i < chars.length - 1) bump(next);
      } else if (s.coverage >= 0.8) {
        talk('Stay on the line!');
      }
    }

    function clearInk() {
      ink.getContext('2d').clearRect(0, 0, ink.width, ink.height);
      passed = false;
      paper.classList.remove('ok');
      bar.style.width = '0';
    }

    function pos(e) {
      const r = ink.getBoundingClientRect();
      const k = dpr();
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    }

    function line(a, b) {
      const c = ink.getContext('2d');
      c.strokeStyle = color;
      c.lineWidth = geo.brush * dpr();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }

    let lastCheck = 0;
    ink.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!geo) return;
      if (e.pointerType === 'pen') penSeen = true;
      if (penSeen && e.pointerType === 'touch') return; // 用笔时忽略手掌
      ink.setPointerCapture(e.pointerId);
      const p = pos(e);
      strokes.set(e.pointerId, p);
      line(p, p);
    });
    ink.addEventListener('pointermove', e => {
      const last = strokes.get(e.pointerId);
      if (!last) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      let a = last;
      for (const ev of evs.length ? evs : [e]) {
        const b = pos(ev);
        line(a, b);
        a = b;
      }
      strokes.set(e.pointerId, a);
      const now = performance.now();
      if (now - lastCheck > 200) { lastCheck = now; score(); }
    });
    const end = e => {
      if (!strokes.delete(e.pointerId)) return;
      check();
    };
    ink.addEventListener('pointerup', end);
    ink.addEventListener('pointercancel', end);

    function draw(intro = true) {
      setTitle(`Write ${ch()}`, '写');
      prev.disabled = i === 0;
      next.disabled = i === chars.length - 1;
      layout();
      if (intro) talk(traceIntro(ch()));
    }

    function move(d) {
      const j = clamp(i + d, 0, chars.length - 1);
      if (j === i) return;
      i = j;
      sfx.tap();
      draw();
    }

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => layout(), 120);
    });
    ro.observe(paper);
    onLeave(() => { ro.disconnect(); clearTimeout(resizeTimer); });

    main.append(paper, h('div', { class: 'toolbar' },
      prev,
      h('button', { class: 'btn big', onclick: () => talk(spokenChar(ch())) }, '🔊'),
      crayons,
      h('button', { class: 'btn big', onclick: () => { sfx.tap(); clearInk(); } }, '🧽'),
      next,
    ));
    // 等布局完成后再画，第一次需要尺寸
    requestAnimationFrame(() => draw(false));
    talk(traceIntro(ch()));
  });

  // ---------- 贴纸 ----------

  const Stickers = screen('My Stickers', '我的贴纸', main => {
    const got = Math.min(Math.floor(store.stars / STARS_PER_STICKER), STICKERS.length);
    const left = STARS_PER_STICKER - (store.stars % STARS_PER_STICKER);
    main.append(
      h('div', { class: 'progress' }, `⭐ ${store.stars}`,
        got < STICKERS.length && h('span', { class: 'zh' }, `　再得 ${left} 颗星解锁新贴纸`)),
      h('div', { class: 'stickers' }, STICKERS.map((s, k) => (k < got
        ? h('button', { class: 'sticker btn', onclick: e => { bump(e.currentTarget); burst(e.currentTarget, 8); sfx.star(); } }, s)
        : h('div', { class: 'sticker locked' }, '🔒')))),
    );
    talk(got ? 'Look at your stickers!' : 'Get stars to win stickers!');
  });

  // ---------- 家长设置 ----------

  function parentGate(open) {
    const a = 3 + rand(6);
    const b = 4 + rand(6);
    const answer = a + b;
    const nums = shuffle([answer, answer + 1, answer - 2, answer + 3]);
    overlay(h('div', { class: 'gate' },
      h('div', {}, '家长验证'),
      h('div', { class: 'q' }, `${a} + ${b} = ?`),
      h('div', { class: 'row' }, nums.map(nv => h('button', {
        class: 'btn wide',
        onclick: () => { closeOverlay(); if (nv === answer) open(); },
      }, String(nv)))),
      h('div', { style: 'margin-top:20px' }, h('button', { class: 'btn', onclick: closeOverlay }, '取消')),
    ));
  }

  const Settings = screen('Settings', '家长设置', main => {
    const item = (label, ...ctrl) => h('div', { class: 'item' }, h('label', {}, label), ...ctrl);

    const sample = () => talk('The cat says meow.');
    const ttsSel = h('select', { onchange: e => { store.tts = e.target.value; save(); voiceRow.hidden = store.tts !== 'system'; sample(); } },
      h('option', { value: 'clip', selected: store.tts !== 'system' }, '内置录音（推荐，静音模式也能听到）'),
      h('option', { value: 'system', selected: store.tts === 'system' }, 'iPad 系统朗读'));
    const voiceSel = h('select', { onchange: e => { store.voice = e.target.value; save(); sample(); } });
    const fillVoices = () => {
      loadVoices();
      const cur = pickVoice();
      voiceSel.replaceChildren(...(voices.length
        ? voices.map(v => h('option', { value: v.voiceURI, selected: cur && v.voiceURI === cur.voiceURI }, `${v.name} (${v.lang})`))
        : [h('option', {}, '（没有找到英文声音）')]));
    };
    fillVoices();
    if (!voices.length) setTimeout(fillVoices, 800);

    const rateLabel = h('span', {}, store.rate.toFixed(2));
    const rate = h('input', {
      type: 'range', min: '0.5', max: '1.1', step: '0.05', value: String(store.rate),
      oninput: e => { store.rate = +e.target.value; rateLabel.textContent = store.rate.toFixed(2); save(); },
      onchange: sample,
    });

    const zh = h('input', {
      type: 'checkbox', checked: store.zh,
      onchange: e => { store.zh = e.target.checked; save(); applyZh(); },
    });

    const opts = h('select', { onchange: e => { store.options = +e.target.value; save(); } },
      [2, 3, 4].map(nv => h('option', { value: nv, selected: store.options === nv }, `${nv} 个`)));

    const phon = h('select', { onchange: e => { store.phonics = e.target.value; save(); } },
      h('option', { value: 'sound', selected: store.phonics === 'sound' }, '字母音（kuh-a-tuh）'),
      h('option', { value: 'name', selected: store.phonics === 'name' }, '字母名（C-A-T）'));

    const voiceRow = item('系统声音', voiceSel);
    voiceRow.hidden = store.tts !== 'system';

    main.append(h('div', { class: 'form' },
      item('朗读', ttsSel, h('button', { class: 'btn', onclick: sample }, '试听')),
      voiceRow,
      item('语速', rate, rateLabel),
      item('显示中文', zh),
      item('「找一找」选项数', opts),
      item('拼读时读', phon),
      item('星星', h('span', {}, `⭐ ${store.stars}`), h('button', {
        class: 'btn',
        onclick: () => {
          if (!confirm('清空所有星星、贴纸和描红记录？')) return;
          store.stars = 0;
          store.done = {};
          save();
          renderStars();
          reload();
        },
      }, '清空')),
      h('div', { class: 'note' },
        h('b', {}, '使用小贴士'), h('br'),
        '1. Safari 打开后点「分享 → 添加到主屏幕」，之后从桌面图标打开就是全屏，没网也能用。', h('br'),
        '2. 没有声音时：检查音量键；「内置录音」不受静音开关影响，「系统朗读」在静音模式下可能没声音。', h('br'),
        '3. 防止孩子退出：设置 → 辅助功能 → 引导式访问，打开后在本页连按三下侧边按钮/主屏幕按钮。', h('br'),
        '4. 录音需要麦克风权限：设置 → App → Safari → 麦克风 → 允许。', h('br'),
        '5. 建议每次 10–15 分钟：先「听」认一认，再「找一找」，然后「说」，最后描一个字母。', h('br'),
        '6. 词表在 words.js 里，可以自己增删单词和 emoji；改完运行 node tools/build-audio.mjs 重新生成录音。'),
    ));
  });

  function applyZh() {
    document.body.classList.toggle('no-zh', !store.zh);
  }

  // ---------- 启动 ----------

  const { shelf: RazShelf } = window.createRazViews({
    h, screen, go, back, talk, stopTalk, onLeave, store, save, Quiz, Speak,
    addStar, cheer, overlay, closeOverlay, parentGate, sfx,
  });

  $('#back').addEventListener('click', () => { sfx.tap(); back(); });
  starBtn.addEventListener('click', () => {
    sfx.tap();
    if (stack[stack.length - 1] !== Stickers) go(Stickers);
  });
  $('#gear').addEventListener('click', () => {
    sfx.tap();
    parentGate(() => go(Settings));
  });

  // 禁止双指缩放和长按菜单
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());

  applyZh();
  renderStars();
  go(Home);

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker', err));
  }
})();
