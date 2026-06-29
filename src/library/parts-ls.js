/* 자동 생성됨 — tools/edz-portal-to-parts.js (EPLAN Data Portal DXF+CSV)
   원본: edz-source/commercialdata.csv + Panel layout DXF 풋프린트.
   재생성: node tools/edz-portal-to-parts.js */
(function (g) {
  "use strict";
  var App = (g.App = g.App || {});
  var LS = [
  { partNo: "ABS32Fb-3A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 3A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "ABS32Fb-5A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 5A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "ABS32Fb-10A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 10A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "ABS32Fb-15A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 15A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "ABS32Fb-20A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 20A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "ABS32Fb-30A", manufacturer: "LS", type: "MCCB", name: "배선용차단기 30A", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBE32Fb-3A/50mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 3A 50mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBE32Fb-5A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 5A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-3A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 3A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-3A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 3A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-5A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 5A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-5A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 5A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-10A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 10A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-10A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 10A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-15A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 15A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-15A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 15A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-20A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 20A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-20A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 20A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-30A/15mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 30A 15mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" },
  { partNo: "EBS32Fb-30A/30mA", manufacturer: "LS", type: "ELCB", name: "누전차단기 30A 30mA감도", w: 50, h: 96, d: 60, terminals: 4, term: [{"name":"1","rx":11.6,"ry":20.6},{"name":"2","rx":11.6,"ry":77.1},{"name":"3","rx":36.6,"ry":20.6},{"name":"4","rx":36.6,"ry":77.1}], source: "EDZ" }
  ];
  App.seedParts = (App.seedParts || []).concat(LS);
})(window);
