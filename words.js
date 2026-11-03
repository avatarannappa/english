// 学习内容都在这个文件里，改完刷新页面即可生效。
// 字段说明：
//   w   英文单词（会被朗读）
//   e   emoji，当图片用
//   zh  中文，给家长看（设置里可关闭）
//   say 例句，「听」和「说」里会用到
//   ask/no 可选，覆盖主题的模板（比如复数要说 Where are ...）
// 主题的 ask 是「找一找」的提问，no 是点错时的提示，{w} 会被替换成单词。

window.THEMES = [
  {
    id: 'animals', name: 'Animals', zh: '动物', icon: '🐾', ask: 'Where is the {w}?', no: "That's the {w}.",
    words: [
      { w: 'cat', e: '🐱', zh: '猫', say: 'The cat says meow.' },
      { w: 'dog', e: '🐶', zh: '狗', say: 'The dog says woof.' },
      { w: 'duck', e: '🦆', zh: '鸭子', say: 'The duck says quack.' },
      { w: 'pig', e: '🐷', zh: '猪', say: 'The pig says oink.' },
      { w: 'cow', e: '🐮', zh: '奶牛', say: 'The cow says moo.' },
      { w: 'sheep', e: '🐑', zh: '羊', say: 'The sheep says baa.' },
      { w: 'bird', e: '🐦', zh: '小鸟', say: 'The bird can fly.' },
      { w: 'fish', e: '🐟', zh: '鱼', say: 'The fish can swim.' },
      { w: 'rabbit', e: '🐰', zh: '兔子', say: 'The rabbit can hop.' },
      { w: 'monkey', e: '🐵', zh: '猴子', say: 'The monkey likes bananas.' },
      { w: 'lion', e: '🦁', zh: '狮子', say: 'The lion says roar.' },
      { w: 'elephant', e: '🐘', zh: '大象', say: 'The elephant is very big.' },
    ],
  },
  {
    id: 'colors', name: 'Colors', zh: '颜色', icon: '🎨', ask: 'Which one is {w}?', no: "That's {w}.",
    words: [
      { w: 'red', e: '❤️', zh: '红色', say: 'The apple is red.' },
      { w: 'blue', e: '💙', zh: '蓝色', say: 'The sky is blue.' },
      { w: 'green', e: '💚', zh: '绿色', say: 'The grass is green.' },
      { w: 'yellow', e: '💛', zh: '黄色', say: 'The banana is yellow.' },
      { w: 'orange', e: '🧡', zh: '橙色', say: 'The orange is orange.' },
      { w: 'purple', e: '💜', zh: '紫色', say: 'The grapes are purple.' },
      { w: 'pink', e: '🩷', zh: '粉色', say: 'The flower is pink.' },
      { w: 'brown', e: '🤎', zh: '棕色', say: 'The bear is brown.' },
      { w: 'black', e: '🖤', zh: '黑色', say: 'The night is black.' },
      { w: 'white', e: '🤍', zh: '白色', say: 'The snow is white.' },
    ],
  },
  {
    id: 'fruits', name: 'Fruits', zh: '水果', icon: '🍎', ask: 'Where is the {w}?', no: "That's the {w}.",
    words: [
      { w: 'apple', e: '🍎', zh: '苹果', say: 'I like apples.' },
      { w: 'banana', e: '🍌', zh: '香蕉', say: 'The monkey likes bananas.' },
      { w: 'orange', e: '🍊', zh: '橙子', say: 'The orange is round.' },
      { w: 'grapes', e: '🍇', zh: '葡萄', say: 'The grapes are purple.', ask: 'Where are the grapes?', no: 'Those are grapes.' },
      { w: 'strawberry', e: '🍓', zh: '草莓', say: 'The strawberry is red.' },
      { w: 'watermelon', e: '🍉', zh: '西瓜', say: 'The watermelon is big.' },
      { w: 'pear', e: '🍐', zh: '梨', say: 'I like pears.' },
      { w: 'peach', e: '🍑', zh: '桃子', say: 'The peach is sweet.' },
      { w: 'lemon', e: '🍋', zh: '柠檬', say: 'The lemon is sour.' },
      { w: 'pineapple', e: '🍍', zh: '菠萝', say: 'The pineapple is yummy.' },
    ],
  },
  {
    id: 'numbers', name: 'Numbers', zh: '数字', icon: '🔢', ask: 'Find number {w}.', no: "That's {w}.",
    words: [
      { w: 'one', e: '1️⃣', zh: '一', say: 'One big sun.' },
      { w: 'two', e: '2️⃣', zh: '二', say: 'Two little hands.' },
      { w: 'three', e: '3️⃣', zh: '三', say: 'Three little pigs.' },
      { w: 'four', e: '4️⃣', zh: '四', say: 'A dog has four legs.' },
      { w: 'five', e: '5️⃣', zh: '五', say: 'Five little fingers.' },
      { w: 'six', e: '6️⃣', zh: '六', say: 'Six little ducks.' },
      { w: 'seven', e: '7️⃣', zh: '七', say: 'Seven little stars.' },
      { w: 'eight', e: '8️⃣', zh: '八', say: 'An octopus has eight legs.' },
      { w: 'nine', e: '9️⃣', zh: '九', say: 'Nine little cars.' },
      { w: 'ten', e: '🔟', zh: '十', say: 'Ten little fingers.' },
    ],
  },
  {
    id: 'body', name: 'My Body', zh: '身体', icon: '🙋', ask: 'Where is the {w}?', no: "That's the {w}.",
    words: [
      { w: 'eye', e: '👁️', zh: '眼睛', say: 'I see with my eyes.' },
      { w: 'ear', e: '👂', zh: '耳朵', say: 'I hear with my ears.' },
      { w: 'nose', e: '👃', zh: '鼻子', say: 'I smell with my nose.' },
      { w: 'mouth', e: '👄', zh: '嘴巴', say: 'I eat with my mouth.' },
      { w: 'hand', e: '✋', zh: '手', say: 'Clap your hands.' },
      { w: 'foot', e: '🦶', zh: '脚', say: 'Stamp your feet.' },
      { w: 'leg', e: '🦵', zh: '腿', say: 'I run with my legs.' },
      { w: 'arm', e: '💪', zh: '胳膊', say: 'I have strong arms.' },
      { w: 'tooth', e: '🦷', zh: '牙齿', say: 'Brush your teeth.' },
    ],
  },
  {
    id: 'vehicles', name: 'Vehicles', zh: '交通工具', icon: '🚗', ask: 'Where is the {w}?', no: "That's the {w}.",
    words: [
      { w: 'car', e: '🚗', zh: '小汽车', say: 'The car goes beep beep.' },
      { w: 'bus', e: '🚌', zh: '公交车', say: 'I go to school by bus.' },
      { w: 'train', e: '🚂', zh: '火车', say: 'The train goes choo choo.' },
      { w: 'plane', e: '✈️', zh: '飞机', say: 'The plane flies in the sky.' },
      { w: 'boat', e: '⛵', zh: '小船', say: 'The boat is on the water.' },
      { w: 'bike', e: '🚲', zh: '自行车', say: 'I ride my bike.' },
      { w: 'truck', e: '🚚', zh: '卡车', say: 'The truck is big.' },
      { w: 'rocket', e: '🚀', zh: '火箭', say: 'The rocket goes up!' },
      { w: 'helicopter', e: '🚁', zh: '直升机', say: 'The helicopter flies.' },
      { w: 'tractor', e: '🚜', zh: '拖拉机', say: 'The tractor is on the farm.' },
    ],
  },
];

// 「读 → 字母」：默认朗读 "A. A is for apple."，say 可覆盖
window.LETTERS = [
  { l: 'A', w: 'apple', e: '🍎' },
  { l: 'B', w: 'ball', e: '⚽' },
  { l: 'C', w: 'cat', e: '🐱' },
  { l: 'D', w: 'dog', e: '🐶' },
  { l: 'E', w: 'egg', e: '🥚' },
  { l: 'F', w: 'fish', e: '🐟' },
  { l: 'G', w: 'grapes', e: '🍇' },
  { l: 'H', w: 'hat', e: '👒' },
  { l: 'I', w: 'insect', e: '🐜' },
  { l: 'J', w: 'juice', e: '🧃' },
  { l: 'K', w: 'kite', e: '🪁' },
  { l: 'L', w: 'lion', e: '🦁' },
  { l: 'M', w: 'moon', e: '🌙' },
  { l: 'N', w: 'nose', e: '👃' },
  { l: 'O', w: 'octopus', e: '🐙' },
  { l: 'P', w: 'pig', e: '🐷' },
  { l: 'Q', w: 'queen', e: '👸' },
  { l: 'R', w: 'rabbit', e: '🐰' },
  { l: 'S', w: 'sun', e: '☀️' },
  { l: 'T', w: 'tiger', e: '🐯' },
  { l: 'U', w: 'umbrella', e: '☂️' },
  { l: 'V', w: 'van', e: '🚐' },
  { l: 'W', w: 'whale', e: '🐳' },
  { l: 'X', w: 'fox', e: '🦊', say: 'X is in fox.' },
  { l: 'Y', w: 'yo-yo', e: '🪀' },
  { l: 'Z', w: 'zebra', e: '🦓' },
];

// 「读 → 拼读」：三个字母的 CVC 单词
window.CVC = [
  { w: 'cat', e: '🐱' },
  { w: 'dog', e: '🐶' },
  { w: 'pig', e: '🐷' },
  { w: 'sun', e: '☀️' },
  { w: 'hat', e: '👒' },
  { w: 'bed', e: '🛏️' },
  { w: 'cup', e: '🥤' },
  { w: 'fox', e: '🦊' },
  { w: 'hen', e: '🐔' },
  { w: 'bus', e: '🚌' },
  { w: 'bug', e: '🐛' },
  { w: 'box', e: '📦' },
  { w: 'bat', e: '🦇' },
  { w: 'pen', e: '🖊️' },
  { w: 'leg', e: '🦵' },
  { w: 'six', e: '6️⃣' },
  { w: 'ten', e: '🔟' },
  { w: 'map', e: '🗺️' },
];

// 字母的“发音”（phonics），用系统朗读近似发出，可按需微调
window.PHONICS = {
  a: 'ah', b: 'buh', c: 'kuh', d: 'duh', e: 'eh', f: 'fff', g: 'guh', h: 'huh', i: 'ih',
  j: 'juh', k: 'kuh', l: 'lll', m: 'mmm', n: 'nnn', o: 'aw', p: 'puh', q: 'kwuh', r: 'rrr',
  s: 'sss', t: 'tuh', u: 'uh', v: 'vvv', w: 'wuh', x: 'kss', y: 'yuh', z: 'zzz',
};

// 「写」可选的字符集
window.WRITE_SETS = [
  { name: 'ABC', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { name: 'abc', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { name: '123', chars: '0123456789' },
];

// 每攒 5 颗星解锁一张
window.STICKERS = [
  '🦄', '🐼', '🦖', '🐙', '🦋', '🐳', '🦊', '🐸', '🐧', '🐨',
  '🐯', '🦉', '🐢', '🐬', '🦕', '🐝', '🐞', '🦜', '🚀', '🚂',
  '🚁', '⛵', '🏰', '🎠', '🎡', '🌈', '🌻', '🍦', '🍩', '🎂',
  '🧸', '🎈', '🪁', '⚽', '🎨', '🎸', '👑', '🌟', '🦩', '🐲',
];

window.PRAISE = ['Great job!', 'Well done!', 'Super!', 'Awesome!', 'Good job!', 'Excellent!', 'Yes, you got it!'];
