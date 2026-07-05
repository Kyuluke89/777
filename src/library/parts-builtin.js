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
  App.seedParts = (App.seedParts || []).concat(BUILTIN, FIELD);
})(window);
