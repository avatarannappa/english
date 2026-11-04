(() => {
  window.createRazViews = api => {
    const { h, screen, go, talk, stopTalk, onLeave, store, save, Quiz, Speak, Trace,
      addStar, cheer, overlay, closeOverlay, parentGate, sfx } = api;
    const { RAZ_BOOKS: books, RAZ_EXAMPLES: examples, RAZ_LIBRARY: library, PHRASES: P } = window;
    let selectedSet = 'A';
    const allWords = [...new Set(books.flatMap(b => b.words))];
    const wordsFor = book => book.words.map(w => examples[w]);
    const practicePages = book => wordsFor(book).map(x => ({
      text: x.say, translation: x.translation, icon: x.e, focus: x.w,
    }));
    const button = (label, fn, attrs = {}) => h('button', { class: 'btn', onclick: fn, ...attrs }, label);

    const shelf = screen('RAZ Books', '高频词读物', main => {
      const tabs = h('div', { class: 'tabs raz-tabs' });
      const grid = h('div', { class: 'raz-shelf' });
      const render = () => {
        tabs.replaceChildren(...['A', 'B', 'C'].map(set => button(`Set ${set}`, () => {
          selectedSet = set; sfx.tap(); render();
        }, { class: `btn pill ${selectedSet === set ? 'on' : ''}` })));
        grid.replaceChildren(...books.filter(b => b.set === selectedSet).map(b => {
          const done = store.done[`raz:practice:${b.id}`] || store.done[`raz:local:${b.id}`] || store.done[`raz:write:${b.id}`];
          return h('button', { class: 'choice raz-book', 'data-book': b.id, onclick: () => {
            sfx.tap(); stopTalk(); go(detail(b));
          } }, h('span', { class: 'raz-number' }, `${b.set}${b.number}${done ? ' ⭐' : ''}`),
          h('span', { class: 'emo' }, b.icon), h('span', { class: 'raz-book-title' }, b.title),
          h('span', { class: 'raz-book-words' }, b.words.join(' · ')));
        }));
      };
      main.append(tabs, h('p', { class: 'raz-intro' }, '从 Set A 开始，每次一本：认词 → 读短句 → 找词 → 跟读 → 写词。'), grid);
      render();
    });

    const detail = book => screen(book.title, `${book.set}${book.number} · 高频词`, main => {
      let alive = true;
      onLeave(() => { alive = false; stopTalk(); });
      const status = h('p', { class: 'raz-status', role: 'status' }, '正在查看本机书页…');
      const localButton = button('📖 Read my book', () => {}, { hidden: true, 'data-action': 'local-read' });
      const removeButton = button('删除本机书页', () => parentGate(async () => {
        if (!confirm('删除这本书在当前浏览器中保存的书页？')) return;
        try {
          await library.remove(book.id);
          delete store.done[`raz:local:${book.id}`];
          if (store.razProgress) delete store.razProgress[`local:${book.id}`];
          save();
          if (alive) { localButton.hidden = removeButton.hidden = true; status.textContent = '还没有本机书页，可以由家长导入。'; }
        } catch (err) { if (alive) status.textContent = err.message; }
      }), { hidden: true, class: 'btn raz-parent-button' });

      function updateLocal(local) {
        if (!alive) return;
        localButton.hidden = removeButton.hidden = !local;
        localButton.onclick = local ? () => go(reader(book, local.pages, 'local')) : null;
        status.textContent = local ? `已保存 ${local.pages.length} 页，可以离线阅读。` : '还没有本机书页，可以由家长导入。';
      }
      library.get(book.id).then(updateLocal).catch(err => { if (alive) status.textContent = err.message; });

      const words = h('div', { class: 'raz-word-list' }, book.words.map(w => button(w, () => talk(w), {
        class: 'btn raz-word', 'aria-label': `Listen to ${w}`,
      })));
      const actions = h('div', { class: 'raz-actions' },
        button('📚 Word practice', () => go(reader(book, practicePages(book), 'practice')), { 'data-action': 'practice' }),
        button('🎯 Find words', () => go(wordQuiz(book)), { 'data-action': 'quiz' }),
        button('🎤 Say it', () => go(Speak({ name: book.title, zh: '高频词', words: wordsFor(book) })), { 'data-action': 'speak' }),
        button(`✏️ Write words${store.done[`raz:write:${book.id}`] ? ' ✓' : ''}`, () => go(Trace(book.words, 0, {
          wordMode: true, progressKey: `raz:write:${book.id}`, label: `${book.set}${book.number}`,
        })), { 'data-action': 'write' }),
        localButton,
      );
      main.append(h('div', { class: 'raz-detail' },
        h('div', { class: 'raz-detail-icon' }, book.icon),
        h('p', { class: 'raz-label' }, book.review ? 'Review words · 复习词' : 'Focus words · 目标词'), words, actions,
        h('p', { class: 'raz-intro' }, 'Word practice 是自编配套短句；Write words 练习描写目标词；RAZ 正版书页由家长从官方打开或导入。'),
        h('div', { class: 'raz-parent' }, status,
          button('导入我的 PDF / 图片', () => parentGate(() => importDialog(book, updateLocal)), { class: 'btn raz-parent-button' }),
          button('RAZ 官方书页 ↗', () => parentGate(() => officialDialog(book)), { class: 'btn raz-parent-button' }),
          removeButton,
        ),
      ));
    });

    function officialDialog(book) {
      // 等家长验证后再显示链接；孩子的阅读流程不包含站外链接。
      overlay(h('div', { class: 'raz-dialog' },
        h('p', {}, '请用你的 RAZ 账号打开正版资源。下载后可以导入本机阅读。'),
        h('a', { class: 'btn', href: book.source, target: '_blank', rel: 'noopener noreferrer' }, '打开 RAZ 官方书页'),
        button('返回', closeOverlay),
      ));
    }

    function importDialog(book, onImported) {
      const message = h('p', { role: 'status', class: 'raz-status' }, '请选择一个 PDF，或多张图片（按文件名顺序翻页）。');
      const input = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp,.pdf', multiple: true, 'aria-label': '选择书页' });
      const done = button('返回', closeOverlay);
      input.addEventListener('change', async () => {
        if (!input.files.length) return;
        input.disabled = done.disabled = true;
        try {
          const local = await library.import(book.id, input.files, text => { message.textContent = text; });
          delete store.done[`raz:local:${book.id}`];
          if (store.razProgress) delete store.razProgress[`local:${book.id}`];
          save();
          onImported(local);
          message.textContent = `已保存 ${local.pages.length} 页。关掉此窗口后点 Read my book 开始阅读。`;
        } catch (err) {
          message.textContent = `导入失败：${err.message}`;
        } finally {
          input.disabled = done.disabled = false;
          input.value = '';
        }
      });
      overlay(h('div', { class: 'raz-dialog' },
        h('p', {}, '导入你有权使用的书页，只保存在这台设备的浏览器中。'),
        h('p', {}, '每次最多 40 页、30 MB。PDF 如已排成打印折页，请先换成单页版。'),
        h('p', {}, 'PDF 中可提取的文字使用系统朗读；扫描页和图片可配合下方的高频词录音练习。'),
        input, message, done,
      ));
    }

    function wordQuiz(book) {
      // a / the / on 等只有一个目标词的书，也需要至少两个不同的选项。
      const distractors = allWords.filter(w => !book.words.includes(w)).slice(0, 3);
      const item = w => ({ key: w, show: w, ask: P.razFind(w), no: P.razNot(w), yes: w });
      return Quiz({ title: 'Find words', zh: `${book.set}${book.number} · 找词`,
        items: [...book.words, ...distractors].map(item), targets: book.words.map(item),
        rounds: Math.min(8, Math.max(3, book.words.length)), optClass: 'raz-word-opt',
      });
    }

    const reader = (book, pages, mode) => screen(book.title, mode === 'local' ? '我的书页' : '自编配套短句', main => {
      const key = `${mode}:${book.id}`;
      store.razProgress ||= {};
      const prior = store.razProgress[key] || {};
      let i = Math.max(0, Math.min(pages.length - 1, Number(prior.page) || 0));
      const visited = new Set((prior.visited || []).filter(n => Number.isInteger(n) && n >= 0 && n < pages.length));
      let alive = true;
      let autoplay = false;
      let sequence = 0;
      const urls = new Map();
      const page = h('article', { class: 'raz-page' });
      const count = h('span', { class: 'raz-page-count', 'aria-live': 'polite' });
      const prev = button('⬅️', () => move(-1), { 'aria-label': 'Previous page', 'data-action': 'prev' });
      const next = button('➡️', () => move(1), { 'aria-label': 'Next page', 'data-action': 'next' });
      const listen = button('🔊', () => { stopAuto(); talk(pages[i].text); }, { 'aria-label': 'Listen to page', 'data-action': 'listen' });
      const auto = button('▶️ Read all', () => autoplay ? stopAuto() : readAll(), { 'data-action': 'auto' });
      const finish = button('✅ Done', finishBook, { 'data-action': 'finish' });
      const tip = h('p', { class: 'raz-status', role: 'status' });
      const words = h('div', { class: 'raz-word-list raz-reader-words' }, book.words.map(w => button(w, () => {
        stopAuto(); talk(w);
      }, { class: 'btn raz-word', 'aria-label': `Listen to ${w}` })));

      function remember() {
        visited.add(i);
        store.razProgress[key] = { page: i, visited: [...visited] };
        save();
      }

      function draw() {
        const p = pages[i];
        page.replaceChildren();
        if (p.image) {
          if (!urls.has(i)) urls.set(i, URL.createObjectURL(p.image));
          page.append(h('img', { class: 'raz-page-image', src: urls.get(i), alt: `${book.title}, page ${i + 1}` }));
        } else {
          page.append(h('div', { class: 'raz-page-icon' }, p.icon));
          const sentence = h('div', { class: 'raz-sentence' });
          // 只分词用于点读；原始空格和标点保留，目标词按完整单词高亮。
          for (const token of p.text.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/)) {
            if (/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(token)) {
              const focused = book.words.some(w => w.toLowerCase() === token.toLowerCase());
              sentence.append(button(token, () => { stopAuto(); talk(token); }, {
                class: `raz-token ${focused ? 'focus' : ''}`, 'aria-label': `Listen to ${token}`,
              }));
            } else sentence.append(token);
          }
          page.append(sentence, h('p', { class: 'zh raz-translation' }, p.translation));
        }
        listen.disabled = !p.text;
        auto.disabled = pages.some(p => !p.text);
        prev.disabled = i === 0;
        next.disabled = i === pages.length - 1;
        count.textContent = `${i + 1} / ${pages.length}`;
        tip.textContent = p.image && !p.text ? '这页没有可提取的文字，可以点下面的高频词听一听。' : '';
        remember();
        finish.hidden = visited.size !== pages.length;
      }

      function stopAuto() {
        sequence++;
        autoplay = false;
        auto.textContent = '▶️ Read all';
        stopTalk();
      }

      function move(d) {
        stopAuto();
        i = Math.max(0, Math.min(pages.length - 1, i + d));
        draw();
      }

      async function readAll() {
        stopAuto();
        const seq = sequence;
        autoplay = true;
        auto.textContent = '⏹️ Stop';
        for (;;) {
          const ok = await talk(pages[i].text, 500);
          if (!alive || !autoplay || seq !== sequence) return;
          if (!ok || i === pages.length - 1) break;
          i++; draw();
        }
        autoplay = false;
        auto.textContent = '▶️ Read all';
      }

      function finishBook() {
        if (visited.size !== pages.length) return;
        stopAuto();
        const doneKey = `raz:${key}`;
        if (!store.done[doneKey]) {
          store.done[doneKey] = true;
          save();
          addStar(1);
          talk(cheer(page));
        }
        tip.textContent = '读完啦！可以再读一遍，或返回练习高频词。';
        finish.hidden = true;
      }

      onLeave(() => {
        alive = false; stopAuto();
        urls.forEach(url => URL.revokeObjectURL(url));
      });
      main.append(h('div', { class: 'raz-reader' }, page,
        h('div', { class: 'raz-controls' }, prev, count, next, listen, auto, finish), words, tip,
      ));
      draw();
    });

    return { shelf };
  };
})();
