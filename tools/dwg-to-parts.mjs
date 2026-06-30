/* DWG 카탈로그 도면 → 부품 라이브러리 (모델명·단자수 추출, 치수는 표준 추정)
 *
 * EPLAN 포털 DXF+CSV 가 없는 LS 단자대(XTB)·릴레이(R4T/S4T) DWG 시트에서
 * MTEXT 의 모델명과 단자수를 뽑아 부품을 만든다. 치수는 카탈로그 표준 추정값
 * (est:true → 앱에서 ≈/추정 표시). 정확한 치수가 필요하면 EPLAN 포털 DXF+CSV 권장.
 *
 * 사전 준비(개발용 1회): npm i @mlightcad/libredwg-web
 * 실행: node tools/dwg-to-parts.mjs [edz-source/tb edz-source/relay ...]
 * 출력: src/library/parts-dwg.js (앱 자동 로드)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIRS = process.argv.slice(2).length ? process.argv.slice(2)
  : [path.join(ROOT, 'edz-source', 'tb'), path.join(ROOT, 'edz-source', 'relay')];

function walk(dir, out) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of es) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.dwg$/i.test(e.name)) out.push(full);
  }
}
function cleanText(s) {
  return (s || '').replace(/\{[^;]*;/g, '').replace(/[{}\\]/g, '').replace(/\\?A1;?/g, '').trim();
}
// 모델명 → 타입·단자수·치수(추정)
function classify(model) {
  if (/^XTB/i.test(model)) {
    const m = model.match(/(\d+)\s*[HB]/i);
    const term = m ? parseInt(m[1], 10) : 20;
    return { type: 'TB', name: '인터페이스 단자대 ' + model.replace(/^XTB-?/i, ''), terminals: term,
      w: Math.round(38 + term * 1.4), h: 72 };           // 표준 추정
  }
  if (/^R4T|^S4T/i.test(model)) {
    const m = model.match(/(\d+)\s*P/i);
    const term = m ? parseInt(m[1], 10) : 16;
    return { type: 'RELAY', name: '릴레이 터미널 ' + model, terminals: term,
      w: Math.round(50 + term * 2.4), h: 74 };            // 표준 추정
  }
  return null;
}

const lib = await LibreDwg.create();
const seen = new Set();
const parts = [];

for (const dir of DIRS) {
  const files = []; walk(dir, files);
  for (const file of files) {
    const buf = new Uint8Array(fs.readFileSync(file));
    const dwg = lib.dwg_read_data(buf, Dwg_File_Type.DWG);
    const db = lib.convert(dwg);
    const texts = (db.entities || []).filter(e => /TEXT/i.test(e.type)).map(e => cleanText(e.text));
    const models = new Set();
    texts.forEach(t => {
      const m = t.match(/\b(XTB-?\d+[HB]|R4T-\d+P-[A-Z]+|R4T-[A-Z]+-UL|S4T-\d+P-[0-9A-Z\-]+)\b/g);
      if (m) m.forEach(x => models.add(x));
    });
    models.forEach(model => {
      if (seen.has(model)) return; seen.add(model);
      const c = classify(model);
      if (!c) return;
      parts.push({ partNo: model, manufacturer: 'LS', type: c.type, name: c.name,
        w: c.w, h: c.h, d: 60, terminals: c.terminals, est: true, source: 'DWG' });
    });
    lib.dwg_free(dwg);
    console.error('읽음:', path.basename(file), '→ 모델', Array.from(models).join(', ') || '(없음)');
  }
}

parts.sort((a, b) => a.type.localeCompare(b.type) || a.partNo.localeCompare(b.partNo, undefined, { numeric: true }));

const body = parts.map(p =>
  '  { partNo: ' + JSON.stringify(p.partNo) + ', manufacturer: "LS", type: ' + JSON.stringify(p.type) +
  ', name: ' + JSON.stringify(p.name) + ', w: ' + p.w + ', h: ' + p.h + ', d: ' + p.d +
  ', terminals: ' + p.terminals + ', est: true, source: "DWG" }').join(',\n');
const js = '/* 자동 생성됨 — tools/dwg-to-parts.mjs (LS DWG 카탈로그 시트)\n' +
  '   모델명·단자수는 도면에서 추출, 치수는 표준 추정값(est). 정확한 치수는\n' +
  '   EPLAN Data Portal DXF+CSV 권장. 재생성: node tools/dwg-to-parts.mjs */\n' +
  '(function (g) {\n  "use strict";\n  var App = (g.App = g.App || {});\n' +
  '  var DWG = [\n' + body + '\n  ];\n' +
  '  App.seedParts = (App.seedParts || []).concat(DWG);\n})(window);\n';
fs.writeFileSync(path.join(ROOT, 'src', 'library', 'parts-dwg.js'), js);
console.error('\n생성:', parts.length, '개 부품 → src/library/parts-dwg.js');
parts.forEach(p => console.error('  ' + p.partNo + '  ≈' + p.w + '×' + p.h + 'mm  [' + p.type + ']  단자' + p.terminals));
