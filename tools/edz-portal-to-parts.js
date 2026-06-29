/* EPLAN Data Portal 다운로드(DXF + commercialdata.csv) → 부품 라이브러리 변환기
 *
 * 사용법:
 *   node tools/edz-portal-to-parts.js [소스폴더=edz-source]
 *
 * 동작:
 *   1) <소스>/commercialdata.csv 파싱 → 부품 목록(부품번호·타입·설명)
 *   2) <소스>/dxf/<매크로>/Panel layout/*.dxf 의 $EXTMIN/$EXTMAX 로 풋프린트(W×H mm) 계산
 *   3) 부품을 매크로(풋프린트)에 매칭 → 정확한 치수로 라이브러리 엔트리 생성
 *   4) src/library/parts-ls.js (앱 임베드용) + data/ls-parts.json (참조용) 출력
 */
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.resolve(__dirname, '..', 'edz-source');
const ROOT = path.resolve(__dirname, '..');

function readText(file) {
  const raw = fs.readFileSync(file);
  if (raw[0] === 0xFF && raw[1] === 0xFE) return raw.toString('utf16le');
  if (raw[0] === 0xFE && raw[1] === 0xFF) return raw.swap16().toString('utf16le');
  return raw.toString('utf8').replace(/^﻿/, '');
}

function parseCSV(s) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); cur = ''; if (row.length > 1) rows.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (row.length > 1) { row.push(cur); rows.push(row); }
  return rows;
}

// DXF → { w, h, terminals:[{name,rx,ry}] }
//  - w/h: $EXTMIN/$EXTMAX 경계 박스
//  - terminals: ENTITIES 의 TEXT(단자 번호/명칭)를 좌상단 기준 좌표로 (DXF는 y가 위로
//    증가하므로 앱 좌표계(y 아래로)로 뒤집음)
const TERM_RE = /^([0-9]{1,2}|[LNT][0-9]?|PE|A[12]|R|S|T|U|V|W)$/i;
function dxfParse(file) {
  const lines = readText(file).split(/\r?\n/);
  function vec(name) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === name) {
        const o = {};
        for (let j = i + 1; j < i + 10 && j + 1 < lines.length; j++) {
          const code = lines[j].trim();
          if (code === '10') o.x = parseFloat(lines[j + 1]);
          if (code === '20') o.y = parseFloat(lines[j + 1]);
          if (o.x != null && o.y != null) return o;
        }
      }
    }
    return null;
  }
  const mn = vec('$EXTMIN'), mx = vec('$EXTMAX');
  if (!mn || !mx) return null;
  const w = Math.round((mx.x - mn.x) * 10) / 10;
  const h = Math.round((mx.y - mn.y) * 10) / 10;

  // ENTITIES 섹션에서 TEXT 추출
  let i = 0;
  while (i < lines.length && !(lines[i].trim() === '2' && (lines[i + 1] || '').trim() === 'ENTITIES')) i++;
  const terms = [];
  for (; i < lines.length; i++) {
    if (lines[i].trim() !== '0') continue;
    const type = (lines[i + 1] || '').trim();
    if (type === 'ENDSEC') break;
    if (type !== 'TEXT' && type !== 'MTEXT') continue;
    let x = null, y = null, txt = null;
    for (let j = i + 2; j < lines.length; j += 2) {
      const code = lines[j].trim();
      if (code === '0') break;
      const v = lines[j + 1];
      if (code === '10') x = parseFloat(v);
      if (code === '20') y = parseFloat(v);
      if (code === '1') txt = (v || '').trim();
    }
    if (txt && x != null && y != null && TERM_RE.test(txt)) {
      terms.push({
        name: txt,
        rx: Math.round((x - mn.x) * 10) / 10,
        ry: Math.round((mx.y - y) * 10) / 10  // y 뒤집기
      });
    }
  }
  terms.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), undefined, { numeric: true }); });
  return { w: w, h: h, terminals: terms };
}

// 재귀적으로 파일/폴더 수집
function walk(dir, onFile) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  entries.forEach(function (e) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, onFile);
    else onFile(full);
  });
}

// 패널 레이아웃 표현형식 폴더명 (영/독): "Panel layout" / "Schaltschrankaufbau"
const PANEL_RE = /panel\s*layout|schaltschrankaufbau/i;

// 모든 하위폴더의 DXF 트리에서 패널레이아웃 DXF → 매크로명→풋프린트 맵
function collectFootprints(srcDir) {
  const map = {};
  walk(srcDir, function (file) {
    if (!/\.dxf$/i.test(file)) return;
    const parts = file.split(path.sep);
    const repIdx = parts.findIndex(function (p) { return PANEL_RE.test(p); });
    if (repIdx < 1) return;               // 패널레이아웃 폴더 아래의 DXF만
    const macro = parts[repIdx - 1];      // 표현형식 폴더의 부모 = 매크로명
    const b = dxfParse(file);
    if (b && !map[macro]) map[macro] = b;
  });
  return map;
}

// 타입/부품번호에 매칭되는 매크로(풋프린트) 찾기
function matchFootprint(footprints, typeStr) {
  const keys = Object.keys(footprints);
  // 1) 매크로명이 타입 안에 그대로 포함
  for (const k of keys) if (typeStr.indexOf(k) >= 0) return footprints[k];
  // 2) 매크로명을 _ 로 분해해 토큰 중 하나가 타입에 포함 (예: EBE32Fb_EBS32Fb)
  for (const k of keys) {
    const toks = k.split(/[_\s]+/);
    for (const t of toks) if (t && typeStr.indexOf(t) >= 0) return footprints[k];
  }
  return null;
}

const TYPE_MAP = { MCCB: '배선용차단기', ELCB: '누전차단기', MCB: '소형차단기', MC: '전자접촉기', SMPS: '전원공급장치', PLC: 'PLC', CP: '서킷프로텍터', RELAY: '릴레이', TB: '단자대' };
const TERM_DEFAULT = { MCCB: 6, ELCB: 6, MCB: 4, MC: 8, CP: 2, SMPS: 6, PLC: 20, RELAY: 8, TB: 2 };

function classify(desc1, type) {
  const s = (desc1 + ' ' + type).toUpperCase();
  if (/MCCB/.test(s)) return 'MCCB';
  if (/ELCB|RCD/.test(s)) return 'ELCB';
  if (/\bMC\b|CONTACTOR/.test(s)) return 'MC';
  if (/SMPS|POWER SUPPLY/.test(s)) return 'SMPS';
  if (/PLC|XGB|XGI|XGK|XGF|XBM|XBC|XBE|XBF/.test(s)) return 'PLC';
  if (/RELAY/.test(s)) return 'RELAY';
  if (/MCB|MINIATURE/.test(s)) return 'MCB';
  return 'ETC';
}

// 같은 위치 단자 중복 제거
function dedupeTerms(terms) {
  if (!terms) return null;
  const out = [], seen = new Set();
  terms.forEach(function (t) {
    const k = Math.round(t.rx) + ',' + Math.round(t.ry);
    if (seen.has(k)) return;
    seen.add(k); out.push(t);
  });
  return out.length ? out : null;
}

function main() {
  // 모든 하위폴더의 commercialdata.csv 수집
  const csvFiles = [];
  walk(SRC, function (f) { if (/commercialdata\.csv$/i.test(f)) csvFiles.push(f); });
  if (!csvFiles.length) { console.error('commercialdata.csv 없음:', SRC); process.exit(1); }
  console.log('CSV 파일:', csvFiles.length + '개');

  const footprints = collectFootprints(SRC);
  console.log('풋프린트(매크로):', Object.keys(footprints).map(function (k) {
    return k + '(' + footprints[k].w + '×' + footprints[k].h + ',단자' + (footprints[k].terminals ? footprints[k].terminals.length : 0) + ')';
  }).join(', '));

  const seen = new Set();
  const parts = [];
  let noFp = 0;

  csvFiles.forEach(function (csv) {
    const rows = parseCSV(readText(csv));
    const header = rows[0];
    const col = function (name) { return header.indexOf(name); };
    const cPart = col('Part number'), cType = col('Type number');
    const cDesc = col('Description 1'), cDesc3 = col('Description 3');
    if (cPart < 0) return;

    rows.slice(1).filter(function (r) { return r[cPart] && r[cPart] !== '#' && r[cPart].trim(); })
      .forEach(function (r) {
        const rawPart = r[cPart].trim();
        if (seen.has(rawPart)) return;
        seen.add(rawPart);
        const type = (r[cType] || '').trim();
        const desc1 = (r[cDesc] || '').trim();
        const desc3 = (cDesc3 >= 0 ? (r[cDesc3] || '') : '').trim();
        const tcode = classify(desc1 + ' ' + desc3, type);

        // 프레임 + 정격 추출
        const frameM = type.match(/(?:MCCB|ELCB|MCB|MC|SMPS|PLC)_([A-Za-z0-9]+)/);
        const frame = frameM ? frameM[1] : type.replace(/^LSE\./, '');
        const ampM = type.match(/_(\d+)A(?:_|$)/);
        const maM = type.match(/_(\d+)mA/);
        const amp = ampM ? ampM[1] : null;
        const ma = maM ? maM[1] : null;

        const fp = matchFootprint(footprints, type) || matchFootprint(footprints, rawPart);
        if (!fp) noFp++;

        const partNo = amp ? (frame + '-' + amp + 'A' + (ma ? '/' + ma + 'mA' : '')) : frame;
        let name;
        if (amp) name = (TYPE_MAP[tcode] || tcode) + ' ' + amp + 'A' + (ma ? ' ' + ma + 'mA감도' : '');
        else name = desc1 && desc1.toUpperCase() !== type.toUpperCase() ? desc1 : (TYPE_MAP[tcode] || tcode);
        const term = dedupeTerms(fp && fp.terminals && fp.terminals.length ? fp.terminals : null);

        parts.push({
          partNo: partNo,
          manufacturer: 'LS',
          type: tcode,
          name: name,
          w: fp ? Math.round(fp.w) : 50,
          h: fp ? Math.round(fp.h) : 80,
          d: 60,
          terminals: term ? term.length : (TERM_DEFAULT[tcode] || 4),
          term: term,
          hasDxf: !!fp,
          source: 'EPLAN Data Portal',
          raw: rawPart
        });
      });
  });

  parts.sort(function (a, b) {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.partNo.localeCompare(b.partNo, undefined, { numeric: true });
  });

  // data/ls-parts.json
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data', 'ls-parts.json'),
    JSON.stringify({ generatedFrom: 'edz-source (EPLAN Data Portal)', count: parts.length, parts: parts }, null, 2));

  // src/library/parts-ls.js (앱 임베드)
  const lib = parts.map(function (p) {
    const termStr = p.term ? ', term: ' + JSON.stringify(p.term) : '';
    const estStr = p.hasDxf ? '' : ', est: true';
    return '  { partNo: ' + JSON.stringify(p.partNo) + ', manufacturer: "LS", type: ' + JSON.stringify(p.type) +
      ', name: ' + JSON.stringify(p.name) + ', w: ' + p.w + ', h: ' + p.h + ', d: ' + p.d +
      ', terminals: ' + p.terminals + termStr + estStr + ', source: "EDZ" }';
  }).join(',\n');
  const js = '/* 자동 생성됨 — tools/edz-portal-to-parts.js (EPLAN Data Portal DXF+CSV)\n' +
    '   원본: edz-source/commercialdata.csv + Panel layout DXF 풋프린트.\n' +
    '   재생성: node tools/edz-portal-to-parts.js */\n' +
    '(function (g) {\n  "use strict";\n  var App = (g.App = g.App || {});\n' +
    '  var LS = [\n' + lib + '\n  ];\n' +
    '  App.seedParts = (App.seedParts || []).concat(LS);\n})(window);\n';
  fs.writeFileSync(path.join(ROOT, 'src', 'library', 'parts-ls.js'), js);

  console.log('생성: ' + parts.length + '개 부품 (풋프린트 매칭 실패 ' + noFp + '개)');
  parts.forEach(function (p) {
    const tn = p.term ? (p.term.length + '단자[' + p.term.map(function (t) { return t.name; }).join(',') + ']') : (p.terminals + '단자(자동)');
    console.log('  ' + p.partNo + '  ' + p.w + '×' + p.h + 'mm  [' + p.type + ']  ' + tn);
  });
}

main();
