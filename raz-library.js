// 正版 PDF / 图片只写入当前浏览器的 IndexedDB，不上传到服务器或仓库。
(() => {
  const MAX_PAGES = 40;
  const MAX_BYTES = 30 * 1024 * 1024;
  let dbPromise;

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

  async function imagePage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return { image: await png(canvas), text: '' };
    } catch {
      throw new Error(`无法读取图片 ${file.name}，请使用 PNG、JPEG 或 WebP。`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pdfPages(file, progress) {
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
        const viewport = page.getViewport({ scale: Math.min(2, 1200 / Math.max(bounds.width, bounds.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
        pages.push({ image: await png(canvas), text });
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

  window.RAZ_LIBRARY = {
    async get(id) {
      const book = await request('readonly', store => store.get(id));
      if (!book) return book;
      return { ...book, pages: book.pages.map(p => ({
        ...p, image: p.image instanceof Blob ? p.image : new Blob([p.image], { type: 'image/png' }),
      })) };
    },
    remove: id => request('readwrite', store => store.delete(id)),
    async import(id, files, progress = () => {}) {
      const list = [...files];
      if (!list.length) throw new Error('请选择 PDF 或图片书页。');
      if (list.reduce((sum, f) => sum + f.size, 0) > MAX_BYTES) throw new Error('一次最多导入 30 MB，请缩小文件后再试。');
      const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImage = f => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);
      let pages;
      if (list.length === 1 && isPdf(list[0])) {
        pages = await pdfPages(list[0], progress);
      } else {
        if (list.some(f => !isImage(f))) throw new Error('请选择一个 PDF，或者一组 PNG、JPEG、WebP 图片。');
        if (list.length > MAX_PAGES) throw new Error(`每次最多导入 ${MAX_PAGES} 页。`);
        // 图片以文件名自然排序：page-2 排在 page-10 前面。
        list.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
        pages = [];
        for (const [i, f] of list.entries()) {
          progress(`正在准备书页 ${i + 1} / ${list.length}…`);
          pages.push(await imagePage(f));
        }
      }
      progress('正在保存到本机…');
      // 所有书页处理成功后一次性替换；失败时保留之前的书。
      const book = { id, pages, importedAt: Date.now() };
      // WebKit 某些版本无法将 Blob 写入 IndexedDB，使用字节数据持久化，读取时恢复 Blob。
      const persisted = { ...book, pages: await Promise.all(pages.map(async p => ({
        ...p, image: new Uint8Array(await p.image.arrayBuffer()),
      }))) };
      await request('readwrite', store => store.put(persisted));
      return book;
    },
  };
})();
