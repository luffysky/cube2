/* Opening lessons: a fixed queue and where every piece goes. Found by tools/find_opener.js, written by tools/make_openers.js.
   steps: [piece, x, y, rotation] and, for the piece that finishes the lesson, [piece, x, y, rotation, spin, lines]. */
(function (root) {
  var ZZ = root.ZZ || require('./engine.js');
  ZZ.OPENERS = [
    { id: 'tsd', coin: 40, queue: ['I','O','J','Z','L','S','T'],
      steps: [['I',3,38,0],['O',8,38,0],['J',5,37,2],['Z',3,36,1],['L',-1,37,1],['S',0,35,3],['T',1,37,2,'full',2]] },
    { id: 'pc', coin: 50, queue: ['I','O','T','Z','J','L','S','T','O','I'],
      steps: [['I',3,38,0],['O',7,38,0],['T',0,38,0],['Z',1,37,0],['J',-1,36,1],['L',4,37,0],['S',4,36,0],['T',2,35,2],['O',7,36,0],['I',7,36,1,'none',4]] },
    { id: 'dt', coin: 80, queue: ['I','O','T','Z','J','L','S','I','O','J','Z','S','L','T','T'],
      steps: [['I',4,38,0],['O',8,38,0],['T',0,38,0],['Z',6,36,1],['J',4,37,0],['L',0,36,2],['S',0,35,0],['I',-1,32,3],['O',5,36,0],['J',5,34,2],['Z',3,33,1],['S',3,32,0],['L',8,35,3],['T',2,35,0,'full',2],['T',2,37,3,'full',3]] }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = ZZ;
})(typeof window !== 'undefined' ? window : globalThis);
