// 从家长校对后的实际书页生成练习素材，不调用远端模型或上传原文。
(() => {
  const canonical = word => word.toLowerCase() === 'i' ? 'I' : word.toLowerCase();
  const tokens = text => (text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) || []).map(canonical);
  const metadata = /copyright|all rights|written by|illustrated by|reading\s*a[ -]?z|readinga-z|www\.|https?:|correlation|leveling|word count|learning a-z|^©/i;

  function cleanText(raw, title = '') {
    const lines = raw.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
    const kept = lines.filter(line => {
      if (!/[A-Za-z]/.test(line) || metadata.test(line)) return false;
      if (/high[ -]?frequency\s+words|set\s+[abc].*book\b/i.test(line)) return false;
      return !title || line.toLowerCase() !== title.toLowerCase();
    });
    // Rebus 读物有时将图片标签放在句号下一行，例如 "the .\nkite"。
    return kept.join('\n').replace(/(\b(?:a|an|the)\s*)([.!?])\s*\n\s*([A-Za-z]+)\s*(?=\n|$)/gi, '$1$3$2')
      .replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  }

  function preparePage(raw, title = '', confidence = 100) {
    const text = cleanText(raw, title);
    // 封面/版权信息仍保存为书页，但默认不纳入孩子的练习，家长可更改。
    const isMetadata = /written by|illustrated by|copyright|all rights|correlation/i.test(raw);
    return { rawText: raw, text, include: !!text && !isMetadata, confidence };
  }

  function analyze(pages, focusWords = [], selectedWords) {
    const sentences = [];
    const byWord = new Map();
    pages.forEach((page, pageIndex) => {
      if (page.include === false || !page.text?.trim()) return;
      for (const text of page.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []) {
        const sentence = text.trim();
        if (!tokens(sentence).length) continue;
        sentences.push({ text: sentence, pageIndex });
        for (const w of tokens(sentence)) {
          if (!byWord.has(w)) byWord.set(w, { w, count: 0, pageIndex, sentence, focus: focusWords.some(f => canonical(f) === w) });
          byWord.get(w).count++;
        }
      }
    });
    const vocabulary = [...byWord.values()].filter(x => /^[A-Za-z]+(?:[-'][A-Za-z]+)?$/.test(x.w) && x.w.length <= 16)
      .sort((a, b) => Number(b.focus) - Number(a.focus) || b.count - a.count || a.pageIndex - b.pageIndex || a.w.localeCompare(b.w));
    const chosen = selectedWords ? new Set(selectedWords.map(canonical)) : null;
    const words = chosen ? vocabulary.filter(x => chosen.has(x.w)) : vocabulary.slice(0, 12);
    return { version: 1, sentences, vocabulary, words };
  }

  window.RAZ_CONTENT = { cleanText, preparePage, analyze, tokens };
})();
