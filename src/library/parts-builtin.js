/* 기본 내장 부속 — 찬넬(DIN 레일) 엔드 스토퍼 등. 단자 없음. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const BUILTIN = [
    { partNo: 'END-STOP', manufacturer: 'LS', type: 'STOP', name: '찬넬 엔드 스토퍼', w: 10, h: 50, d: 45, terminals: 0 },
    { partNo: 'END-STOP-S', manufacturer: 'LS', type: 'STOP', name: '엔드 스토퍼(소형)', w: 8, h: 35, d: 40, terminals: 0 }
  ];
  App.seedParts = (App.seedParts || []).concat(BUILTIN);
})(window);
