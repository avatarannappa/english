// 应用里所有要朗读的英文都从这里生成。
// tools/build-audio.mjs 会调用 PHRASES.all() 把它们预先录成 audio/*.m4a，
// 没录到的句子运行时会退回系统朗读（并在控制台警告）。

(() => {
  const { THEMES, LETTERS, CVC, PHONICS, WRITE_SETS, PRAISE } = window;
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const fill = (tpl, w) => tpl.replace('{w}', w);

  const P = {
    ask: (t, x) => x.ask || fill(t.ask, x.w),
    no: (t, x) => x.no || fill(t.no, x.w),
    letter: ch => `${ch.toUpperCase()}.`,
    letterLine: L => L.say || `${L.l} is for ${L.w}.`,
    findLetter: l => `Find the letter ${l}.`,
    notLetter: l => `That's ${l}.`,
    gotLetter: l => `${l}!`,
    sound: ch => PHONICS[ch] || ch,
    char: ch => (/\d/.test(ch) ? NUMBER_WORDS[+ch] : P.letter(ch)),
    traceIntro: ch => (/\d/.test(ch) ? `Write number ${NUMBER_WORDS[+ch]}.` : `Trace the letter ${ch.toUpperCase()}.`),

    // app.js 里直接写死的句子
    FIXED: [
      'Listen', 'Speak', 'Read', 'Write', 'Learn', 'Find it',
      'ABC', 'Find letters', 'Sound it out', 'Read and find',
      "Let's play a game!", 'Amazing! You are a star!', "Good job! Let's play again!",
      'Listen and say.', "I can't hear you. Try again!",
      'Read and find.', 'Try again!', 'Tap the letters.', 'Stay on the line!',
      'Wow! You got a new sticker!', 'Look at your stickers!', 'Get stars to win stickers!',
      'The cat says meow.',
    ],

    // { normal: [...], slow: [...] }，slow 是「拼一拼」里的慢速连读
    all() {
      const normal = new Set([...P.FIXED, ...PRAISE]);
      for (const t of THEMES) {
        normal.add(t.name);
        for (const x of t.words) [x.w, x.say, P.ask(t, x), P.no(t, x)].forEach(s => normal.add(s));
      }
      for (const L of LETTERS) {
        [P.letter(L.l), P.letterLine(L), L.w, P.findLetter(L.l), P.notLetter(L.l), P.gotLetter(L.l)].forEach(s => normal.add(s));
      }
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') [P.sound(ch), P.letter(ch)].forEach(s => normal.add(s));
      for (const x of CVC) normal.add(x.w);
      for (const set of WRITE_SETS) for (const ch of set.chars) [P.char(ch), P.traceIntro(ch)].forEach(s => normal.add(s));
      normal.delete(undefined);
      return { normal: [...normal], slow: CVC.map(x => x.w) };
    },
  };

  window.PHRASES = P;
})();
