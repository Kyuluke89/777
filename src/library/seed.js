/* 기본 부품 라이브러리 — EDZ 가져오기 전에도 동작하도록 자주 쓰는 LS 부품 시드.
   치수(mm)는 대표값이며, 실제 EDZ 가져오면 정확한 값으로 대체/추가됩니다. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  App.seedParts = [
    // 배선용 차단기 (MCCB)
    { partNo: 'ABN53c', manufacturer: 'LS', type: 'MCCB', name: '배선용차단기 3P 50A', w: 75, h: 130, d: 68, terminals: 6 },
    { partNo: 'ABN103c', manufacturer: 'LS', type: 'MCCB', name: '배선용차단기 3P 100A', w: 90, h: 155, d: 68, terminals: 6 },
    { partNo: 'ABS33c', manufacturer: 'LS', type: 'MCCB', name: '배선용차단기 3P 30A', w: 75, h: 130, d: 68, terminals: 6 },
    // 누전차단기 (ELCB)
    { partNo: 'EBN53c', manufacturer: 'LS', type: 'ELCB', name: '누전차단기 3P 50A', w: 90, h: 130, d: 68, terminals: 6 },
    // 소형차단기 / 서킷프로텍터 (MCB / CP)
    { partNo: 'BKN-b 1P', manufacturer: 'LS', type: 'MCB', name: '소형차단기 1P', w: 18, h: 80, d: 65, terminals: 2 },
    { partNo: 'BKN-b 2P', manufacturer: 'LS', type: 'MCB', name: '소형차단기 2P', w: 36, h: 80, d: 65, terminals: 4 },
    { partNo: 'CP30-BA 1P', manufacturer: 'LS', type: 'CP', name: '서킷프로텍터 1P', w: 17, h: 60, d: 55, terminals: 2 },
    // 전자접촉기 (MC)
    { partNo: 'MC-9b', manufacturer: 'LS', type: 'MC', name: '전자접촉기 9A', w: 45, h: 78, d: 86, terminals: 8 },
    { partNo: 'MC-12b', manufacturer: 'LS', type: 'MC', name: '전자접촉기 12A', w: 45, h: 78, d: 86, terminals: 8 },
    { partNo: 'MC-22b', manufacturer: 'LS', type: 'MC', name: '전자접촉기 22A', w: 45, h: 84, d: 92, terminals: 8 },
    // 전원공급장치 (SMPS)
    { partNo: 'SPB-024-100', manufacturer: 'LS', type: 'SMPS', name: 'SMPS 24V 100W', w: 52, h: 90, d: 110, terminals: 6 },
    { partNo: 'SPB-024-240', manufacturer: 'LS', type: 'SMPS', name: 'SMPS 24V 240W', w: 65, h: 125, d: 125, terminals: 6 },
    // PLC (XGB 시리즈)
    { partNo: 'XBC-DR32H', manufacturer: 'LS', type: 'PLC', name: 'XGB PLC 32점', w: 122, h: 90, d: 70, terminals: 40 },
    { partNo: 'XBE-DC32A', manufacturer: 'LS', type: 'PLC', name: 'XGB 입력 32점', w: 67, h: 90, d: 70, terminals: 36 },
    // 릴레이 / 소켓
    { partNo: 'RY-2S', manufacturer: 'LS', type: 'RELAY', name: '미니파워릴레이 2c', w: 28, h: 55, d: 65, terminals: 8 },
    // 단자대 (Terminal Block)
    { partNo: 'TB-25', manufacturer: 'LS', type: 'TB', name: '단자대 4mm²', w: 6, h: 45, d: 50, terminals: 2 }
  ];
})(window);
