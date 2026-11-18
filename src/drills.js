/* 轉磚 drills: preset walls for the spin dojo. Rows are listed top to bottom and sit on the floor. */
(function (root) {
  'use strict';
  var ZZ = root.ZZ || require('./engine.js');

  ZZ.DRILLS = [
    {
      id: 'tsd-r', name: '第一次 T 轉',
      goal: { spin: 'full', lines: 2 }, queue: ['T'],
      tip: '把 T 轉成直的，凸出那格朝左，降到底，再轉一下轉進去。',
      board: ['.....XX...', 'XXX...XXXX', 'XXXX.XXXXX']
    },
    {
      id: 'tsd-l', name: '換一邊再來',
      goal: { spin: 'full', lines: 2 }, queue: ['T'],
      tip: '屋簷換到左邊，凸出那格就要朝右進去。',
      board: ['...XX.....', 'XXXX...XXX', 'XXXXX.XXXX']
    },
    {
      id: 'roof-j', name: '自己蓋屋簷',
      goal: { spin: 'full', lines: 2 }, queue: ['J', 'T'],
      tip: '洞口上面沒有屋簷就轉不進去。先用這塊蓋住缺口的一邊。',
      board: ['XXX...XXXX', 'XXXX.XXXXX']
    },
    {
      id: 'roof-z', name: '用 Z 蓋屋簷',
      goal: { spin: 'full', lines: 2 }, queue: ['Z', 'T'],
      tip: 'Z 和 S 天生就有一格懸空，拿來當屋簷剛好。',
      board: ['XXXX...XXX', 'XXXXX.XXXX']
    },
    {
      id: 'tst-l', name: '三消轉',
      goal: { spin: 'full', lines: 3 }, queue: ['T'],
      tip: 'T 平躺滑到屋簷下面，再轉一下，它會自己踢進直井裡。',
      board: ['....XX....', '.....X....', 'XXXX.XXXXX', 'XXX..XXXXX', 'XXXX.XXXXX']
    },
    {
      id: 'tst-r', name: '三消轉，換邊',
      goal: { spin: 'full', lines: 3 }, queue: ['T'],
      tip: '方向反過來。從右邊滑進去，往另一邊轉。',
      board: ['....XX....', '....X.....', 'XXXXX.XXXX', 'XXXXX..XXX', 'XXXXX.XXXX']
    },
    {
      id: 'b2b', name: '連續兩顆',
      goal: { spin: 'full', lines: 2 }, queue: ['T', 'T'],
      tip: '先轉上面那個洞。兩顆連著轉，第二顆會多送一行。',
      board: ['XX......XX', 'X...XXXXXX', 'XX.XXXXXXX', 'XXXXXX...X', 'XXXXXXX.XX']
    },
    {
      id: 'mini', name: '迷你 T 轉',
      goal: { spin: 'mini', lines: 1 }, queue: ['T'],
      tip: '靠牆轉進角落也算 T 轉，只是比較小。它不送行，但能接住連續重擊。',
      board: ['..........', '.XXXXXXXXX']
    },
    {
      id: 'z-spin', name: 'Z 轉',
      goal: { piece: 'Z', spin: 'spin', lines: 2 }, queue: ['Z'],
      tip: 'Z 先順轉立起來，往左一格站進缺口，降到底再順轉，它會踢進屋簷底下。',
      board: ['..X.......', 'XXX..XXXXX', 'XXXX..XXXX']
    },
    {
      id: 's-spin', name: 'S 轉',
      goal: { piece: 'S', spin: 'spin', lines: 2 }, queue: ['S'],
      tip: 'S 順轉立起來，直接降到底，再順轉一次，它會往右下踢進屋簷底下。',
      board: ['.......X..', 'XXXXX..XXX', 'XXXX..XXXX']
    },
    {
      id: 'z-triple', name: 'Z 轉三消',
      goal: { piece: 'Z', spin: 'spin', lines: 3 }, queue: ['Z'],
      tip: 'Z 平著落在洞口上，順轉一下，整塊會立著踢進去，一次清三排。',
      board: ['...X......', 'XXXXX.XXXX', 'XXXX..XXXX', 'XXXX.XXXXX']
    },
    {
      id: 'l-spin', name: 'L 轉',
      goal: { piece: 'L', spin: 'spin', lines: 2 }, queue: ['L'],
      tip: 'L 先逆轉立起來，降進直井，再順轉躺平，長邊會滑進屋簷底下。',
      board: ['XXXX.XXXXX', 'XX...XXXXX']
    },
    {
      id: 'j-spin', name: 'J 轉',
      goal: { piece: 'J', spin: 'spin', lines: 2 }, queue: ['J'],
      tip: '跟 L 轉左右相反。往右一格，順轉立起來，降進直井，再逆轉躺平。',
      board: ['XXXXX.XXXX', 'XXXXX...XX']
    },
    {
      id: 'i-spin', name: '長條轉',
      goal: { piece: 'I', spin: 'spin', lines: 1 }, queue: ['I'],
      tip: '長條靠左立起來，對準直井降到底，再往屋簷那一邊轉，它會整條躺平鑽進去。',
      board: ['X.XXXXXXXX', 'X.XXXXXXXX', 'X....XXXXX']
    },
    {
      id: 'i-spin-l', name: '長條轉，換邊',
      goal: { piece: 'I', spin: 'spin', lines: 1 }, queue: ['I'],
      tip: '直井換到右邊。一樣立起來降到底，這次要往左轉。轉錯邊它會跳回屋頂上。',
      board: ['XXXXXXXX.X', 'XXXXXXXX.X', 'XXXXX....X']
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
