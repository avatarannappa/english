// 正版 PDF / 图片只写入当前浏览器的 IndexedDB，不上传到服务器或仓库。
(() => {
  const MAX_PAGES = 40;
  const MAX_BYTES = 30 * 1024 * 1024;
  let dbPromise;
  const siteIndex = fetch('books/index.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const opening = new Map();

  function database() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('little-english-library', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('books', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('浏览器未允许保存书页，请检查储存空间或退出无痕浏览。'));
      }).catch(err => { dbPromise = null; throw err; });
    }
    return dbPromise;
  }

  async function request(mode, run) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('books', mode);
      const req = run(tx.objectStore('books'));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => {
        console.warn('Book storage transaction:', tx.error?.name, tx.error?.message);
        reject(new Error('书页保存失败，请检查浏览器储存空间。'));
      };
    });
  }

  const png = canvas => new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('无法转换这张书页。')), 'image/png');
  });

  async function recognizePage(canvas, ocr, title, progress) {
    try {
      const result = await ocr.recognize(canvas, progress);
      return { ...RAZ_CONTENT.preparePage(result.rawText, title, result.confidence), method: 'ocr' };
    } catch {
      // 识别失败时保留图片供家长填文字，不丢掉书页或冒充识别成功。
      return { rawText: '', text: '', include: false, confidence: 0, method: 'manual', recognitionError: true };
    }
  }

  async function imagePage(file, ocr, title, progress, skipOCR = false) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return { image: await png(canvas), ...(skipOCR ? {} : await recognizePage(canvas, ocr, title, progress)) };
    } catch {
      throw new Error(`无法读取图片 ${file.name}，请使用 PNG、JPEG 或 WebP。`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pdfPages(file, progress, ocr, title) {
    const pdfjs = await import('./vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.mjs', document.baseURI).href;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      standardFontDataUrl: new URL('./vendor/standard_fonts/', document.baseURI).href,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGES) throw new Error(`每次最多导入 ${MAX_PAGES} 页，请先拆分 PDF。`);
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        progress(`正在准备书页 ${n} / ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const bounds = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(bounds.width, bounds.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const content = await page.getTextContent();
        const raw = content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').trim();
        let extracted;
        if (/[A-Za-z]{2}/.test(raw)) {
          extracted = { ...RAZ_CONTENT.preparePage(raw, title), method: 'pdf' };
        } else {
          progress(`正在识别扫描书页 ${n} / ${pdf.numPages}…`);
          extracted = await recognizePage(canvas, ocr, title, progress);
        }
        pages.push({ image: await png(canvas), ...extracted });
        page.cleanup();
      }
      return pages;
    } catch (err) {
      if (err.name === 'PasswordException') throw new Error('请使用没有密码保护的 PDF。');
      throw err;
    } finally {
      await task.destroy();
    }
  }

  async function saveBook(book, preservePersonal = false) {
    // WebKit 的 Blob 持久化兼容：使用字节保存，读取时恢复图片。
    const persisted = { ...book, pages: await Promise.all(book.pages.map(async p => ({
      ...p, image: p.image instanceof Blob ? new Uint8Array(await p.image.arrayBuffer()) : p.image,
    }))) };
    if (preservePersonal) {
      const db = await database();
      let skipped = false;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('books', 'readwrite');
        const store = tx.objectStore('books');
        const read = store.get(book.id);
        read.onsuccess = () => {
          // 自动下载期间家长可能导入自己的书，网站版本不能覆盖个人版本。
          if (read.result && read.result.origin !== 'site') skipped = true;
          else store.put(persisted);
        };
        tx.oncomplete = resolve;
        tx.onabort = () => reject(new Error('内置书籍保存失败。'));
      });
      if (skipped) return RAZ_LIBRARY.get(book.id);
    } else await request('readwrite', store => store.put(persisted));
    return book;
  }

  const revision = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  window.RAZ_LIBRARY = {
    siteBooks: () => siteIndex,
    async restoreSite(id) {
      const entry = (await siteIndex)[id];
      if (!entry || !/^raz-[a-z]\d+-[0-9a-f]+\.razbook\.json$/.test(entry.file)) throw new Error('网站尚未提供这本书的校对版本。');
      const response = await fetch(`books/${entry.file}`);
      if (!response.ok) throw new Error('内置版本加载失败，请联网后重试。');
      const file = new File([await response.blob()], entry.file, { type: 'application/json' });
      const previous = await this.get(id);
      if (previous && previous.origin !== 'site') await saveBook({ ...previous, id: `${id}:backup` });
      return this.import(id, [file], () => {}, entry.version, true);
    },
    async restoreBackup(id) {
      const backup = await this.get(`${id}:backup`);
      if (!backup) throw new Error('没有之前的本机版本。');
      return saveBook({ ...backup, id, origin: 'personal' });
    },
    async recognizeStored(id, progress = () => {}) {
      const book = await this.get(id);
      if (!book) throw new Error('本机没有这本书。');
      return this.import(id, book.pages.map((p, i) => new File([p.image], `page-${i + 1}.png`, { type: 'image/png' })), progress);
    },
    async open(id, progress = () => {}) {
      if (opening.has(id)) return opening.get(id);
      const task = (async () => {
        const local = await this.get(id);
        if (local && local.origin !== 'site') return local;
        const entry = (await siteIndex)[id];
        if (!entry) return local;
        if (!/^raz-[a-z]\d+-[0-9a-f]+\.razbook\.json$/.test(entry.file) || !/^[0-9a-f]+$/.test(entry.version)) throw new Error('网站书籍目录格式错误。');
        if (local?.siteVersion === entry.version) return local;
        progress('正在加载网站内置书籍…');
        try {
          const res = await fetch(`books/${entry.file}`);
          if (!res.ok) throw new Error('下载失败');
          return await this.import(id, [new File([await res.blob()], entry.file, { type: 'application/json' })], progress, entry.version);
        } catch (err) {
          if (local) return local;
          throw new Error('内置书籍加载失败，请联网后重新打开这本书。');
        }
      })();
      opening.set(id, task);
      try { return await task; } finally { opening.delete(id); }
    },
    async get(id) {
      const book = await request('readonly', store => store.get(id));
      if (!book) return book;
      const restored = { ...book, pages: book.pages.map(p => ({
        ...p, image: p.image instanceof Blob ? p.image : new Blob([p.image], { type: 'image/png' }),
      })) };
      if (!restored.analysis?.sentences?.length) restored.analysis = RAZ_CONTENT.analyze(restored.pages, RAZ_BOOKS.find(b => b.id === id)?.words || []);
      restored.revision ||= String(restored.importedAt);
      return restored;
    },
    remove: id => request('readwrite', store => store.delete(id)),
    async exportPackage(id) {
      const book = await this.get(id);
      if (!book) throw new Error('本机没有这本书。');
      const pages = [];
      for (const p of book.pages) {
        const url = URL.createObjectURL(p.image);
        try {
          const img = new Image(); img.src = url; await img.decode();
          const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
          const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          pages.push({ image: canvas.toDataURL('image/jpeg', 0.9), text: p.text, include: p.include !== false });
        } finally { URL.revokeObjectURL(url); }
      }
      return JSON.stringify({ format: 'little-english-book', version: 1, bookId: id, pages,
        selectedWords: book.analysis.words.map(x => x.w), reviewed: !!book.reviewed,
      });
    },
    async updateContents(id, edits, selectedWords) {
      const book = await this.get(id);
      if (!book || edits.length !== book.pages.length) throw new Error('书页已经改变，请重新打开校对界面。');
      if (!selectedWords.length || selectedWords.length > 16) throw new Error('请选择 1–16 个书中单词作为本次练习词。');
      const pages = book.pages.map((p, i) => ({ ...p, text: edits[i].text.trim(), include: !!edits[i].include }));
      const analysis = RAZ_CONTENT.analyze(pages, RAZ_BOOKS.find(b => b.id === id)?.words || [], selectedWords);
      if (analysis.words.length !== new Set(selectedWords).size) throw new Error('练习词与最新文字不一致，请更新词表后再保存。');
      return saveBook({ ...book, pages, analysis, revision: revision(), reviewed: true, origin: 'personal' });
    },
    async import(id, files, progress = () => {}, siteVersion, replacePersonal = false) {
      const list = [...files];
      if (!list.length) throw new Error('请选择 PDF 或图片书页。');
      if (list.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error('一次最多导入 30 MB，请缩小文件后再试。');
      const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImage = f => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
      if (list.length === 1 && /\.razbook\.json$/i.test(list[0].name)) {
        const bundle = JSON.parse(await list[0].text());
        if (bundle.format !== 'little-english-book' || bundle.version !== 1 || bundle.bookId !== id) throw new Error('书籍包格式不正确，或不属于当前这本书。');
        if (!Array.isArray(bundle.pages) || !bundle.pages.length || bundle.pages.length > MAX_PAGES) throw new Error('书籍包页数不正确。');
        const pages = [];
        for (const [i, p] of bundle.pages.entries()) {
          if (typeof p.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(p.image) || typeof p.text !== 'string' || p.text.length > 3000) throw new Error('书籍包包含无效书页。');
          progress(`正在导入已校对书页 ${i + 1} / ${bundle.pages.length}…`);
          const decoded = atob(p.image.split(',')[1]);
          const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
          const image = await imagePage(new File([bytes], `page-${i + 1}.jpg`, { type: p.image.split(';')[0].slice(5) }), null, '', progress, true);
          pages.push({ ...image, text: p.text.trim(), include: !!p.include, method: 'package' });
        }
        const analysis = RAZ_CONTENT.analyze(pages, RAZ_BOOKS.find(b => b.id === id)?.words || [], bundle.selectedWords);
        if (!analysis.words.length || analysis.words.length > 16) throw new Error('书籍包中需有 1–16 个有效练习词。');
        return saveBook({ id, pages, analysis, revision: siteVersion ? `site-${siteVersion}` : revision(),
          importedAt: Date.now(), reviewed: !!bundle.reviewed, origin: siteVersion ? 'site' : 'personal', siteVersion,
        }, !!siteVersion && !replacePersonal);
      }
      const ocr = createRazOCR();
      const meta = RAZ_BOOKS.find(b => b.id === id);
      let pages;
      try {
        if (list.length === 1 && isPdf(list[0])) {
          pages = await pdfPages(list[0], progress, ocr, meta?.title || '');
        } else {
          if (list.some(f => !isImage(f))) throw new Error('请选择一个 PDF，或者一组 PNG、JPEG、WebP 图片。');
          if (list.length > MAX_PAGES) throw new Error(`每次最多导入 ${MAX_PAGES} 页。`);
          // 图片以文件名自然排序：page-2 排在 page-10 前面。
          list.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
          pages = [];
          for (const [i, f] of list.entries()) {
            progress(`正在准备书页 ${i + 1} / ${list.length}…`);
            pages.push(await imagePage(f, ocr, meta?.title || '', progress));
          }
        }
      } finally {
        await ocr.close();
      }
      progress('正在保存到本机…');
      // 所有书页处理成功后一次性替换；失败时保留之前的书。
      return saveBook({ id, pages, importedAt: Date.now(), revision: revision(), reviewed: false, origin: 'personal',
        analysis: RAZ_CONTENT.analyze(pages, meta?.words || []),
      });
    },
  };
})();
