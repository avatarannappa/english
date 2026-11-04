// Tesseract 的 worker、WASM 和英文模型都从本站加载，书页不离开设备。
(() => {
  function textRectangle(canvas) {
    if (!canvas?.width || !canvas?.height || !canvas.getContext) return undefined;
    // 常见低龄读物：大幅彩色插图下方有白底正文。避开插图的伪文字。
    const sample = document.createElement('canvas');
    sample.width = 160; sample.height = Math.round(canvas.height / canvas.width * 160);
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
    let denseRows = 0, bottom = 0;
    for (let y = Math.floor(sample.height * 0.1); y < sample.height * 0.9; y++) {
      let colored = 0;
      for (let x = 0; x < sample.width; x++) {
        const j = (y * sample.width + x) * 4;
        const hi = Math.max(pixels[j], pixels[j + 1], pixels[j + 2]);
        const lo = Math.min(pixels[j], pixels[j + 1], pixels[j + 2]);
        if (hi - lo > 35 && lo < 220) colored++;
      }
      if (colored > sample.width * 0.25) { denseRows++; bottom = y; }
    }
    if (denseRows < sample.height * 0.15 || bottom < sample.height * 0.4 || bottom > sample.height * 0.8) return undefined;
    const top = Math.round((bottom / sample.height + 0.015) * canvas.height);
    return { left: 0, top, width: canvas.width, height: canvas.height - top };
  }

  window.createRazOCR = () => {
    let worker;
    let ready;
    const base = new URL('./vendor/ocr/', document.baseURI).href;
    return {
      async recognize(image, progress = () => {}) {
        if (image?.width < 20 || image?.height < 20) return { rawText: '', confidence: 100 };
        if (!ready) {
          progress('正在加载本机英文识别工具…');
          ready = Tesseract.createWorker('eng', 1, {
            workerPath: `${base}worker.min.js`,
            corePath: `${base}tesseract-core-lstm.wasm.js`,
            langPath: base,
            workerBlobURL: false,
            cacheMethod: 'none',
          }).then(async w => { worker = w; await w.setParameters({ tessedit_pageseg_mode: '11' }); return w; });
        }
        await ready;
        const rectangle = textRectangle(image);
        const { data } = await worker.recognize(image, rectangle ? { rectangle } : {}, { text: true, blocks: true });
        const lines = (data.blocks || []).flatMap(b => b.paragraphs || []).flatMap(p => p.lines || []);
        const filtered = lines.map(line => (line.words || []).filter(word => {
          const plain = word.text.replace(/[^A-Za-z]/g, '');
          return word.confidence >= 45 && plain && (plain.length > 1 || /^[aAI]$/.test(plain));
        }).map(word => word.text).join(' ')).filter(Boolean).join('\n');
        return { rawText: filtered || data.text.trim(), confidence: data.confidence };
      },
      async close() {
        // 即使初始化/识别失败，也尽量释放 worker。
        if (ready) await ready.catch(() => {});
        if (worker) await worker.terminate();
      },
    };
  };
})();
