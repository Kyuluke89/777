/* 기본 내장 부속 — 찬넬(DIN 레일) 엔드 스토퍼 등. 단자 없음. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const BUILTIN = [
    { partNo: 'END-STOP', manufacturer: 'LS', type: 'STOP', name: '찬넬 엔드 스토퍼', w: 10, h: 50, d: 45, terminals: 0 },
    { partNo: 'END-STOP-S', manufacturer: 'LS', type: 'STOP', name: '엔드 스토퍼(소형)', w: 8, h: 35, d: 40, terminals: 0 }
  ];
  const FIELD = [
    { partNo: 'FLD-SENSOR', manufacturer: '필드', type: 'SENSOR', name: '근접센서', w: 30, h: 60, d: 30, terminals: 3, term: [{name:'BN',rx:8,ry:52},{name:'BU',rx:15,ry:52},{name:'BK',rx:22,ry:52}] },
    { partNo: 'FLD-MOTOR', manufacturer: '필드', type: 'MOTOR', name: '모터', w: 80, h: 80, d: 80, terminals: 4, term: [{name:'U',rx:14,ry:70},{name:'V',rx:32,ry:70},{name:'W',rx:50,ry:70},{name:'E',rx:68,ry:70}] },
    { partNo: 'FLD-SOL', manufacturer: '필드', type: 'SOL', name: '솔레노이드밸브', w: 40, h: 50, d: 40, terminals: 2, term: [{name:'1',rx:12,ry:44},{name:'2',rx:28,ry:44}] },
    { partNo: 'FLD-LAMP', manufacturer: '필드', type: 'LAMP', name: '표시등', w: 25, h: 25, d: 30, terminals: 2, term: [{name:'+',rx:7,ry:21},{name:'-',rx:18,ry:21}] },
    { partNo: 'FLD-SW', manufacturer: '필드', type: 'SW', name: '푸시버튼/스위치', w: 25, h: 30, d: 35, terminals: 2, term: [{name:'1',rx:7,ry:26},{name:'2',rx:18,ry:26}] }
  ];
  // 계통도(단선도) 심볼 — 자체 벡터(sym 키), 위/아래 단자로 세로 결선
  function symPart(no, name, sym, h, extra) {
    return Object.assign({ partNo: no, manufacturer: '심볼', type: 'SYM', sym: sym, name: name,
      w: 24, h: h || 44, d: 1, terminals: 2,
      term: [{ name: '1', rx: 12, ry: 2 }, { name: '2', rx: 12, ry: (h || 44) - 2 }] }, extra || {});
  }
  const SYMBOLS = [
    symPart('SYM-MCCB', '배선용차단기', 'mccb'),
    symPart('SYM-ELCB', '누전차단기', 'elcb'),
    symPart('SYM-FUSE', '퓨즈', 'fuse', 36),
    symPart('SYM-MC', '전자접촉기(주접점)', 'mc'),
    symPart('SYM-THR', '열동계전기(THR/EOCR)', 'thr', 36),
    symPart('SYM-TR', '변압기', 'tr', 48),
    symPart('SYM-MOTOR', '모터(M)', 'motor', 40, { term: [{ name: '1', rx: 12, ry: 2 }], terminals: 1 }),
    symPart('SYM-LAMP', '표시등', 'lamp', 32),
    symPart('SYM-SW', '개폐기(단로기)', 'sw'),
    symPart('SYM-EARTH', '접지', 'earth', 30, { term: [{ name: '1', rx: 12, ry: 2 }], terminals: 1 }),
    symPart('SYM-CT', '변류기(CT)', 'ct', 36),
    symPart('SYM-METER', '계측기(A/V)', 'meter', 32),
    symPart('SYM-AUXA', '보조접점 a(NO)', 'auxa', 34),
    symPart('SYM-AUXB', '보조접점 b(NC)', 'auxb', 34),
    symPart('SYM-COIL', '코일(릴레이/MC)', 'coil', 36),
    symPart('SYM-PB', '누름버튼(PB)', 'pb', 36),
    symPart('SYM-3PH', '3상 표시', 'ph3', 34),
    { partNo: 'SYM-BUS', manufacturer: '심볼', type: 'SYM', sym: 'bus', name: '버스바(모선)',
      w: 120, h: 12, d: 1, terminals: 4,
      term: [{ name: '1', rx: 15, ry: 6 }, { name: '2', rx: 45, ry: 6 }, { name: '3', rx: 75, ry: 6 }, { name: '4', rx: 105, ry: 6 }] }
  ];
  App.seedParts = (App.seedParts || []).concat(BUILTIN, FIELD, SYMBOLS);
})(window);
