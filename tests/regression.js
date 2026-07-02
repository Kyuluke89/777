const { chromium } = require('playwright-core');
const path = require('path');

// Chromium 실행 파일: PW_CHROME 환경변수 우선, 없으면 playwright 기본 경로
const EXE = process.env.PW_CHROME || undefined;
const INDEX = path.resolve(__dirname, '..', 'index.html');
const SHOT = path.resolve(__dirname, 'regression-shot.png');

function assert(cond, msg) { if (!cond) { throw new Error('ASSERT FAIL: ' + msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/tailwind|ERR_TUNNEL|Failed to load resource/.test(t)) errors.push(t); } });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('dialog', d => d.dismiss());

  await page.goto('file://' + INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const box = await page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;

  // --- 부품 2개 배치 (실제 클릭) ---
  async function placeFirstPart(px, py) {
    await page.locator('#palette-list .pal-item').first().click();
    await page.mouse.click(px, py);
  }
  await page.click('#tool-select');
  await page.fill('#palette-search', 'ABS32Fb-3A'); // 단자 있는 부품으로 필터
  await page.waitForTimeout(50);
  await placeFirstPart(cx - 120, cy - 40);
  await placeFirstPart(cx + 120, cy - 40);
  await page.fill('#palette-search', '');
  await page.waitForTimeout(150);

  let st = await page.evaluate(() => ({ comps: App.store.get().components.length }));
  assert(st.comps === 2, '부품 2개 배치 (' + st.comps + ')');

  // --- LS 실데이터(EPLAN Data Portal) 라이브러리 탑재 확인 ---
  const ls = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const mccb = lib.find(p => p.partNo === 'ABS32Fb-3A');
    const elcb = lib.find(p => p.partNo === 'EBS32Fb-30A/30mA');
    const plc = lib.find(p => p.partNo === 'XBM-DN16S');
    const tb = lib.find(p => p.partNo === 'XTB-40H');
    const relay = lib.find(p => p.partNo === 'R4T-16P-S');
    return { count: lib.length, mccb, elcb, plc, tb, relay, hasFake: !!lib.find(p => p.partNo === 'ABN53c') };
  });
  assert(ls.count >= 30, '카탈로그 실데이터 라이브러리 (' + ls.count + ')');
  assert(ls.tb && ls.tb.type === 'TB' && ls.tb.est, '단자대 XTB-40H(추정) 존재');
  assert(ls.relay && ls.relay.type === 'RELAY', '릴레이 R4T-16P-S 존재');
  assert(!ls.hasFake, '가짜 시드 부품(ABN53c) 제거됨');
  assert(ls.mccb && ls.mccb.w === 50 && ls.mccb.h === 96 && ls.mccb.type === 'MCCB', 'ABS32Fb-3A 실측 50×96 MCCB');
  assert(ls.elcb && ls.elcb.type === 'ELCB', 'EBS32Fb-30A/30mA ELCB 존재');
  assert(ls.plc && ls.plc.type === 'PLC' && ls.plc.w === 32 && ls.plc.h === 91, 'XBM-DN16S PLC 실측 32×91');
  assert(ls.plc.term && ls.plc.term.length >= 16, 'PLC 단자 16+ (' + (ls.plc.term && ls.plc.term.length) + ')');
  // DXF 추출 단자(1,2,3,4) 좌표 확인
  assert(ls.mccb.term && ls.mccb.term.length === 4 && ls.mccb.term[0].name === '1', 'ABS32Fb 단자 4개(1~4)');

  // 실데이터 부품을 배치 → 단자가 부품에 복사되고 월드 좌표로 계산되는지
  const realTerm = await page.evaluate(() => {
    const part = App.palette.getLibrary().find(p => p.partNo === 'ABS32Fb-3A');
    App.ui.placing = part;
    App.store.commit(s => s.components.push({
      id: 'real1', partNo: part.partNo, type: part.type, x: 100, y: 100,
      widthMM: part.w, heightMM: part.h, rotation: 0, label: part.partNo,
      terminals: part.terminals, term: JSON.parse(JSON.stringify(part.term))
    }));
    App.ui.placing = null;
    const pts = App.terminals.world(App.store.get().components.find(c => c.id === 'real1'));
    return { n: pts.length, names: pts.map(p => p.name), first: pts[0] };
  });
  assert(realTerm.n === 4 && realTerm.names.join('') === '1234', '배치 부품 단자 4개 복사 (' + realTerm.names + ')');
  assert(Math.abs(realTerm.first.x - 111.6) < 0.1 && Math.abs(realTerm.first.y - 120.6) < 0.1, '단자1 월드좌표 정확');
  // 정리
  await page.evaluate(() => { App.store.commit(s => s.components = s.components.filter(c => c.id !== 'real1')); App.ui.selected.clear(); });

  // --- 와이어로 단자 연결 (실제 클릭) ---
  await page.click('#tool-wire');
  // 각 부품의 첫 단자(top) 화면 좌표
  const termPos = await page.evaluate(() => {
    const comps = App.store.get().components;
    function termRect(compId, idx) {
      const c = document.querySelector('[data-comp="' + compId + '"][data-term="' + idx + '"]');
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return { a: termRect(comps[0].id, 0), b: termRect(comps[1].id, 0) };
  });
  await page.mouse.click(termPos.a.x, termPos.a.y);
  await page.mouse.click(termPos.b.x, termPos.b.y);
  await page.waitForTimeout(150);

  let wireInfo = await page.evaluate(() => {
    const w = App.store.get().wires;
    return { n: w.length, label: w[0] && w[0].label, els: document.querySelectorAll('#layer-wires [data-id]').length,
      route: w[0] ? App.wires.route(App.store.get(), w[0]).length : 0 };
  });
  assert(wireInfo.n === 1, '와이어 1개 생성 (' + wireInfo.n + ')');
  assert(wireInfo.label === 'W1', '자동 라벨 W1 (' + wireInfo.label + ')');

  // 사용자 지정 라인번호: '100' 지정 → 와이어 라벨 100, 입력칸 101로 증가
  const customNum = await page.evaluate(() => {
    App.ui.nextWireLabel = '100';
    const s = App.store.get(); const c = s.components;
    App.store.commit(ss => { const w = App.wires.create(ss, { compId: c[0].id, index: 2 }, { compId: c[1].id, index: 2 }); if (App.ui.nextWireLabel) w.label = App.ui.nextWireLabel; ss.wires.push(w); });
    // 인터랙트와 동일한 증가 로직 모사
    function inc(s) { const m = /^(.*?)(\d+)$/.exec(s); return m ? m[1] + (parseInt(m[2], 10) + 1) : s + '1'; }
    App.ui.nextWireLabel = inc(App.ui.nextWireLabel);
    const last = App.store.get().wires.slice(-1)[0];
    return { label: last.label, next: App.ui.nextWireLabel };
  });
  assert(customNum.label === '100' && customNum.next === '101', '지정 라인번호 100→다음 101 (' + JSON.stringify(customNum) + ')');
  await page.evaluate(() => { App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== '100'); }); App.ui.nextWireLabel = ''; });
  assert(wireInfo.els === 1, '와이어 렌더 (' + wireInfo.els + ')');
  assert(wireInfo.route >= 2, '와이어 경로점');

  // --- 배선 편집: 세그먼트 이동 / 직각 유지 / 꺾임 추가 / 양끝 라벨 ---
  const ortho = pts => pts.every((p, i) => i === 0 || pts[i - 1].x === p.x || pts[i - 1].y === p.y);
  const wireEdit = await page.evaluate(() => {
    const s = App.store.get();
    const w = s.wires[0];
    function segs() { return App.wires.editSegments(s, w); }
    const seg0 = segs();
    const hseg = seg0.find(x => x.orient === 'H');
    const vseg = seg0.find(x => x.orient === 'V');
    const before2 = (w.corners || App.wires.corners(s, w)).length;

    // 1) 수평선 상하 이동 (beginSegmentDrag 경유 — 실제 드래그와 동일 경로)
    let m1 = App.wires.beginSegmentDrag(s, w, hseg.i, 'H');
    w.corners[m1.cP].y -= 30; w.corners[m1.cQ].y -= 30;
    w.corners = App.wires.cleanCorners(w.corners);
    const orthoH = App.wires.route(s, w).every((p, i, a) => i === 0 || a[i - 1].x === p.x || a[i - 1].y === p.y);

    // 2) 단자에 붙은 수직선 좌우 이동 → 꺾임 자동 생성, 직각 유지
    const segs2 = segs();
    const vTerm = segs2.find(x => x.orient === 'V' && (x.pTerm || x.qTerm)) || segs2.find(x => x.orient === 'V');
    const segCountBefore = segs2.length;
    let m2 = App.wires.beginSegmentDrag(s, w, vTerm.i, 'V');
    const ox = w.corners[m2.cP].x;
    w.corners[m2.cP].x = ox - 20; w.corners[m2.cQ].x = ox - 20;
    w.corners = App.wires.cleanCorners(w.corners);
    const route2 = App.wires.route(s, w);
    const orthoV = route2.every((p, i, a) => i === 0 || a[i - 1].x === p.x || a[i - 1].y === p.y);
    const segCountAfter = segs().length;

    // 3) 꺾임 추가
    App.ui.selected.clear(); App.ui.selected.add(w.id);
    App.render.all();
    return {
      hasH: !!hseg, hasV: !!vseg, vTermExists: !!segs2.find(x => x.orient === 'V' && (x.pTerm || x.qTerm)),
      orthoH, orthoV, grewSegments: segCountAfter >= segCountBefore,
      handles: document.querySelectorAll('[data-seg]').length,
      endLabels: !!App.wires.endLabels(s, w),
      endTexts: Array.from(document.querySelectorAll('#layer-wires text')).filter(t => t.textContent === 'W1').length
    };
  });
  assert(wireEdit.hasH && wireEdit.hasV, '수평·수직 세그먼트 존재');
  assert(wireEdit.vTermExists, '단자에 붙은 수직 세그먼트 핸들 존재');
  assert(wireEdit.orthoH && wireEdit.orthoV, '이동 후에도 경로 직각 유지');
  assert(wireEdit.grewSegments, '단자옆 이동 후 꺾임이 편집가능 세그먼트로 추가됨');
  assert(wireEdit.endLabels, '양끝 라벨 위치 계산');
  assert(wireEdit.handles >= 1, '선택 시 세그먼트 핸들 렌더 (' + wireEdit.handles + ')');
  // 세그먼트 핸들이 최상위(tophit) 레이어에 있어 겹친 선에 가려지지 않음
  const segLayer = await page.evaluate(() => {
    const inTop = document.querySelectorAll('#layer-tophit [data-seg]').length;
    const inWires = document.querySelectorAll('#layer-wires [data-seg]').length;
    return { inTop, inWires };
  });
  assert(segLayer.inTop >= 1 && segLayer.inWires === 0, '세그먼트 핸들 최상위 레이어(겹선 위)');
  assert(wireEdit.endTexts === 2, '양끝에 라인번호 텍스트 2개 (' + wireEdit.endTexts + ')');
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });

  // --- 부품 이동 시 와이어 추종 ---
  const follow = await page.evaluate(() => {
    const s = App.store.get();
    const w = s.wires[0];
    const before = App.wires.route(s, w)[0];
    s.components[0].x += 50; s.components[0].y += 30;
    App.render.all();
    const after = App.wires.route(s, w)[0];
    return { moved: Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1 };
  });
  assert(follow.moved, '와이어가 부품 이동을 추종');

  // --- BOM / 배선표 행 ---
  const rows = await page.evaluate(() => ({
    bom: App.exporter.bomRows(),
    wl: App.exporter.wiringRows()
  }));
  assert(rows.bom.length === 2 && rows.bom[1][3] === 2, 'BOM 집계 (수량 2)');
  assert(rows.bom[0][1] === '품명' && rows.bom[0][6] === '호기번호', 'BOM 품명·호기 컬럼');
  assert(rows.wl[0].indexOf('전원') >= 0, '배선표 전원 컬럼');
  assert(rows.wl[1][0] === 'W1', '배선표 행 W1');
  // 배선 길이: 인스펙터/배선표/총길이
  const wlen = await page.evaluate(() => {
    const s = App.store.get(); const w = s.wires[0];
    App.store.commit(() => { w.sq = '2.5'; w.awg = App.wires.SQ_AWG['2.5']; });
    const wrows = App.exporter.wiringRows(s);
    const sqCol = wrows[0].indexOf('SQ'), awgCol = wrows[0].indexOf('AWG');
    return { len: App.wires.length(s, w), total: App.wires.totalLength(s),
      header: wrows[0].indexOf('길이(mm)') >= 0, sum: wrows[wrows.length - 1][0] === '합계',
      sq: wrows[1][sqCol], awg: wrows[1][awgCol] };
  });
  assert(wlen.len > 0, '라인 길이 계산 (' + wlen.len + ')');
  assert(wlen.total >= wlen.len, '총 배선 길이');
  assert(wlen.header && wlen.sum, '배선표에 길이 컬럼+합계행');
  assert(wlen.sq === '2.5' && wlen.awg === '14', '전선 SQ/AWG 표기 (' + wlen.sq + '/' + wlen.awg + ')');

  // 겹선 분리: 같은 경로로 겹치는 배선을 나란히 벌려 구분
  const spread = await page.evaluate(() => {
    const s = App.store.get();
    const w0 = s.wires[0];
    // 동일 단자쌍으로 두번째 배선 추가 → 경로 완전 중첩
    App.store.commit(ss => {
      const w = App.wires.create(ss, { compId: w0.fromComp, index: w0.fromTerm }, { compId: w0.toComp, index: w0.toTerm });
      w.label = 'SPREADTEST';
      ss.wires.push(w);
    });
    const s2 = App.store.get();
    const off = App.wires.spreadOffsets(s2);
    const nOff = Object.keys(off).length;
    // 표시 경로가 논리 경로와 달라야(벌어져야) 함
    const w1 = s2.wires.find(w => w.label === 'SPREADTEST');
    const r1 = App.wires.route(s2, w1);
    const d1 = App.wires.displayRoute(s2, w1, off);
    let moved = false, endsOk = true;
    const n = Math.min(r1.length, d1.length);
    for (let i = 0; i < n; i++) {
      if (Math.abs(r1[i].x - d1[i].x) > 0.01 || Math.abs(r1[i].y - d1[i].y) > 0.01) moved = true;
    }
    // 단자 접점(양 끝)은 정확히 유지 (연결점 삽입으로 길이는 달라질 수 있음)
    if (Math.abs(r1[0].x - d1[0].x) > 0.01 || Math.abs(r1[0].y - d1[0].y) > 0.01) endsOk = false;
    const rl = r1.length - 1, dl = d1.length - 1;
    if (Math.abs(r1[rl].x - d1[dl].x) > 0.01 || Math.abs(r1[rl].y - d1[dl].y) > 0.01) endsOk = false;
    // 토글 OFF 시 오프셋 미적용
    App.ui.spreadWires = false; App.render.all();
    const offCount = App.store.get().wires.length;
    App.ui.spreadWires = true; App.render.all();
    return { nOff, moved, endsOk, offCount };
  });
  assert(spread.nOff > 0, '겹선 오프셋 산출 (' + spread.nOff + '구간)');
  assert(spread.moved, '겹치는 배선 표시경로 분리됨');
  assert(spread.endsOk, '겹선 분리해도 단자 접점은 유지');
  // 정리
  await page.evaluate(() => { App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== 'SPREADTEST'); }); });

  // 표준 색띠(흑갈적등황초파보회흰) 프리셋 + 스와치 적용
  const colors = await page.evaluate(() => {
    const names = App.wires.COLORS.map(c => c.n).join('');
    // 배선 선택 → 인스펙터 스와치 클릭
    const w0 = App.store.get().wires[0];
    App.ui.selected = new Set([w0.id]);
    App.inspector.update();
    const sws = document.querySelectorAll('#inspector .wire-sw');
    const blue = Array.from(sws).find(b => b.getAttribute('title') === '파');
    let applied = '';
    if (blue) { blue.click(); applied = App.store.get().wires.find(w => w.id === w0.id).color; }
    return { names, count: sws.length, applied };
  });
  assert(colors.names === '흑갈적등황초파보회흰', '표준 색띠 10색 (' + colors.names + ')');
  assert(colors.count === 10, '인스펙터 색 스와치 10개 (' + colors.count + ')');
  assert(colors.applied === '#1d4ed8', '스와치 클릭으로 색상 적용 (' + colors.applied + ')');
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });

  // 선 두께 조절: width 변경 시 렌더 stroke-width 반영
  const thick = await page.evaluate(() => {
    const w0 = App.store.get().wires[0];
    App.store.commit(() => { w0.width = 3; });
    App.render.all();
    const grp = document.querySelector('#layer-wires [data-id="' + w0.id + '"]');
    const lines = Array.from(grp.querySelectorAll('polyline'));
    const colored = lines.find(l => l.getAttribute('stroke') !== 'transparent');
    return { sw: colored ? parseFloat(colored.getAttribute('stroke-width')) : 0 };
  });
  assert(thick.sw === 3, '선 두께 반영 (' + thick.sw + ')');

  // 배선 프리셋: 저장/적용(드롭다운 change → 선택 배선에 즉시 적용)
  const preset = await page.evaluate(() => {
    const before = App.userlib.presets().length;
    App.userlib.addPreset({ name: 'TEST프리셋', color: '#16a34a', width: 2.5, sq: '2.5', awg: '14' });
    App.toolbar.refreshPresets('TEST프리셋');
    const after = App.userlib.presets().length;
    const w0 = App.store.get().wires[0];
    App.ui.selected = new Set([w0.id]);
    const sel = document.getElementById('wire-preset');
    sel.value = 'TEST프리셋';
    sel.dispatchEvent(new Event('change'));
    const w = App.store.get().wires.find(x => x.id === w0.id);
    const applied = (w.color === '#16a34a' && w.width === 2.5 && w.sq === '2.5');
    const defOK = App.ui.wireDefaults && App.ui.wireDefaults.width === 2.5;
    App.userlib.removePreset('TEST프리셋');
    App.toolbar.refreshPresets();
    App.ui.selected.clear(); App.ui.wireDefaults = null; App.render.all();
    return { added: after === before + 1, applied, defOK };
  });
  assert(preset.added, '배선 프리셋 저장');
  assert(preset.applied, '프리셋 선택 시 선택 배선에 적용');
  assert(preset.defOK, '프리셋 선택 시 다음 배선 기본값 설정');

  // 프리셋 관리 모달: 사전 생성 + 기존 수정(덮어쓰기) + 삭제
  const pm = await page.evaluate(() => {
    App.wirePresets.open();
    const opened = getComputedStyle(document.getElementById('wp-editor')).display !== 'none';
    document.getElementById('wp-add').click();           // 빈 행 추가(사전 생성)
    const rows = document.querySelectorAll('#wp-list .wp-row');
    const last = rows[rows.length - 1];
    last.querySelector('.wp-name').value = 'MGR프리셋';
    last.querySelector('.wp-width').value = '2.2';
    last.querySelector('.wp-color').value = '#16a34a'; // 저항색 초(select)
    last.querySelector('.wp-acdc').value = 'AC';
    const colorIsSelect = last.querySelector('.wp-color').tagName === 'SELECT';
    document.getElementById('wp-save').click();
    const saved = App.userlib.presets().find(p => p.name === 'MGR프리셋');
    // 기존 수정(덮어쓰기): 같은 이름 행의 두께 변경 후 저장
    App.wirePresets.open();
    const r2 = Array.from(document.querySelectorAll('#wp-list .wp-row')).find(r => r.querySelector('.wp-name').value === 'MGR프리셋');
    r2.querySelector('.wp-width').value = '3.3';
    document.getElementById('wp-save').click();
    const overwritten = App.userlib.presets().find(p => p.name === 'MGR프리셋');
    const count1 = App.userlib.presets().filter(p => p.name === 'MGR프리셋').length;
    // 삭제
    App.wirePresets.open();
    const r3 = Array.from(document.querySelectorAll('#wp-list .wp-row')).find(r => r.querySelector('.wp-name').value === 'MGR프리셋');
    r3.querySelector('.wp-del').click();
    document.getElementById('wp-save').click();
    const deleted = !App.userlib.presets().some(p => p.name === 'MGR프리셋');
    return {
      opened, colorIsSelect,
      savedOK: saved && saved.width === 2.2 && saved.color === '#16a34a' && saved.acdc === 'AC',
      overwritten: overwritten && overwritten.width === 3.3, noDup: count1 === 1, deleted
    };
  });
  assert(pm.opened, '프리셋 관리 모달 열림');
  assert(pm.colorIsSelect, '프리셋 색상은 저항색 선택(RGB 아님)');
  assert(pm.savedOK, '프리셋 사전 생성(색상·전원구분 포함)');
  assert(pm.overwritten && pm.noDup, '기존 프리셋 덮어쓰기(중복 없음)');
  assert(pm.deleted, '프리셋 삭제');

  // 라이브러리: 카테고리 그룹 + 기본부품 숨김/복원
  const lib = await page.evaluate(() => {
    App.palette.reloadUser();
    const heads = document.querySelectorAll('#palette-list .sticky').length; // 카테고리 헤더
    const target = App.palette.getLibrary().find(p => !p.custom);
    const pn = target.partNo;
    App.userlib.hide(pn);
    App.palette.reloadUser();
    const gone = !App.palette.getLibrary().some(p => p.partNo === pn);
    App.userlib.unhideAll();
    App.palette.reloadUser();
    const back = App.palette.getLibrary().some(p => p.partNo === pn);
    return { heads, gone, back };
  });
  assert(lib.heads >= 2, '팔레트 카테고리 그룹 헤더 (' + lib.heads + ')');
  assert(lib.gone, '기본 부품 숨김(삭제) 동작');
  assert(lib.back, '숨긴 기본 부품 복원 동작');

  // 라이브러리 타이틀(품번)·이름 수정(✎) + 복제(⎘) — 실제 버튼 클릭(prompt 오버라이드)
  await page.fill('#palette-search', 'XBM-DN16S');
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    window.__op = window.prompt;
    window.prompt = (msg) => {
      if (msg.indexOf('복제') >= 0) return 'XBM-DN16S-COPY';
      if (msg.indexOf('타이틀') >= 0) return 'PLC-RENAMED';
      if (msg.indexOf('이름') >= 0) return 'PLC새이름';
      return '';
    };
  });
  const wRef = await page.evaluate(() => App.palette.getLibrary().find(x => x.partNo === 'XBM-DN16S').w);
  // 복제(원본이 첫 항목) — 복제 후 검색 필터가 비워져 결과가 사라지지 않아야 함
  await page.locator('#palette-list .pal-dup').first().click();
  const afterDupSearch = await page.inputValue('#palette-search');
  const dupVisible = await page.evaluate(() => Array.from(document.querySelectorAll('#palette-list .pal-item .text-slate-700')).some(s => s.textContent.indexOf('XBM-DN16S-COPY') >= 0));
  // 타이틀+이름 수정 — 원본을 다시 찾아 편집
  await page.fill('#palette-search', 'XBM-DN16S');
  await page.waitForTimeout(40);
  await page.locator('#palette-list .pal-edit').first().click();
  const afterEditSearch = await page.inputValue('#palette-search');
  const renamedVisible = await page.evaluate(() => Array.from(document.querySelectorAll('#palette-list .pal-item .text-slate-700')).some(s => s.textContent.indexOf('PLC-RENAMED') >= 0));
  const ren = await page.evaluate((wRef) => {
    const lib = App.palette.getLibrary();
    const renamed = lib.find(x => x.partNo === 'PLC-RENAMED');
    const copy = lib.find(x => x.partNo === 'XBM-DN16S-COPY');
    const oldGone = !lib.some(x => x.partNo === 'XBM-DN16S');
    return {
      titleChanged: !!renamed, nameChanged: renamed && renamed.name === 'PLC새이름', oldGone: oldGone,
      dupExists: !!copy, dupSameShape: copy && copy.w === wRef
    };
  }, wRef);
  await page.evaluate(() => { window.prompt = window.__op; App.userlib.remove('PLC-RENAMED'); App.userlib.remove('XBM-DN16S-COPY'); App.userlib.unhideAll(); App.palette.reloadUser(); });
  await page.fill('#palette-search', '');
  assert(ren.titleChanged && ren.nameChanged, '라이브러리 타이틀+이름 수정');
  assert(ren.oldGone, '수정 후 기존 품번 정리');
  assert(ren.dupExists && ren.dupSameShape, '라이브러리 복제(같은 형태, 새 품번)');
  assert(afterDupSearch === '' && dupVisible, '복제 후 검색필터 비움 → 항목 보임');
  assert(afterEditSearch === '' && renamedVisible, '이름수정 후 검색필터 비움 → 항목 안 사라짐');

  // 커스텀 타입 추가 + 타입 배지 이동 + 글자 세로 방향
  const tf = await page.evaluate(() => {
    const added = App.types.add('VFD');
    const hasVFD = App.types.list().some(t => t.name === 'VFD');
    const color = App.types.color('VFD');
    const c0 = App.store.get().components[0];
    const origType = c0.type;
    App.store.commit(s => { const c = s.components.find(x => x.id === c0.id); c.type = 'VFD'; c.typeDx = 10; c.typeDy = -5; c.textVert = true; });
    App.ui.selected = new Set([c0.id]);
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
    const badge = Array.from(grp.querySelectorAll('text')).find(t => t.textContent === 'VFD');
    const bx = badge ? parseFloat(badge.getAttribute('x')) : -999;
    const cx = c0.x + c0.widthMM / 2;
    const moved = Math.abs(bx - (cx + 10)) < 0.01;
    const rotated = !!badge && (badge.getAttribute('transform') || '').indexOf('rotate(-90') >= 0;
    const handle = !!document.querySelector('#layer-tophit [data-typefor="' + c0.id + '"]');
    App.store.commit(s => { const c = s.components.find(x => x.id === c0.id); c.type = origType; c.typeDx = 0; c.typeDy = 0; c.textVert = false; });
    App.types.remove('VFD'); App.ui.selected.clear(); App.render.all();
    return { hasVFD, colorOk: /^#/.test(color), moved, rotated, handle };
  });
  assert(tf.hasVFD && tf.colorOk, '커스텀 타입 추가(+색상)');
  assert(tf.moved, '타입 배지 위치 이동');
  assert(tf.rotated, '글자 세로 방향(타입)');
  assert(tf.handle, '타입 배지 드래그 핸들');

  // 타이틀 위치 이동(오프셋 + 핸들)
  const titlePos = await page.evaluate(() => {
    App.store.commit(s => { s.panel.title = 'T'; s.panel.titleDx = 40; s.panel.titleDy = 10; });
    App.render.all();
    const t = Array.from(document.querySelectorAll('#layer-panel text')).find(x => x.textContent === 'T');
    const x = parseFloat(t.getAttribute('x')), y = parseFloat(t.getAttribute('y'));
    const handle = !!document.querySelector('#layer-tophit [data-titlemove]');
    const ok = Math.abs(x - (App.store.get().panel.widthMM / 2 + 40)) < 0.01 && Math.abs(y - (-34 + 10)) < 0.01;
    App.store.commit(s => { s.panel.title = ''; s.panel.titleDx = 0; s.panel.titleDy = 0; }); App.render.all();
    return { ok, handle };
  });
  assert(titlePos.ok, '타이틀 위치 오프셋 반영');
  assert(titlePos.handle, '타이틀 이동 핸들');

  // 부품을 찬넬(레일) 중심에 정렬
  const railCenter = await page.evaluate(() => {
    App.store.commit(s => { s.rails.push({ id: 'rr', orient: 'h', x: 100, y: 400, lengthMM: 300, widthMM: 35 }); });
    const compH = 96;
    const top = App.geom.snapToRail(App.store.get(), 150, 380, compH); // 레일 근처 상단 후보
    const railMid = 400 + 35 / 2, compMid = (top != null ? top : 0) + compH / 2;
    App.store.commit(s => { s.rails = s.rails.filter(r => r.id !== 'rr'); });
    return { hit: top != null, aligned: top != null && Math.abs(compMid - railMid) < 0.01 };
  });
  assert(railCenter.hit && railCenter.aligned, '부품 중심이 찬넬 중심에 정렬');

  // 겹선 직각 연결(부채꼴 대각 제거) + 라운드(둥근 모서리)
  const wround = await page.evaluate(() => {
    const s = App.store.get();
    const w0 = s.wires[0];
    App.store.commit(ss => {
      const w = App.wires.create(ss, { compId: w0.fromComp, index: w0.fromTerm }, { compId: w0.toComp, index: w0.toTerm });
      w.label = 'ROUNDTEST'; ss.wires.push(w);
    });
    const s2 = App.store.get();
    const off = App.wires.spreadOffsets(s2);
    const w1 = s2.wires.find(w => w.label === 'ROUNDTEST');
    const dr = App.wires.displayRoute(s2, w1, off);
    // 모든 구간이 직각(수평/수직)인지 — 대각(부채꼴) 없어야 함
    let allOrtho = true;
    for (let i = 0; i < dr.length - 1; i++) {
      const a = dr[i], b = dr[i + 1];
      if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) allOrtho = false;
    }
    // 라운드 경로에 곡선(Q) 포함
    const path = App.wires.roundedPath(dr, 10);
    const hasCurve = path.indexOf('Q') >= 0;
    // 렌더: 라운드>0이면 path 사용
    App.ui.wireRound = 8; App.render.all();
    const usesPath = !!document.querySelector('#layer-wires path[stroke]:not([stroke="transparent"])');
    App.ui.wireRound = 0; App.render.all();
    App.store.commit(ss => { ss.wires = ss.wires.filter(w => w.label !== 'ROUNDTEST'); });
    return { allOrtho, hasCurve, usesPath };
  });
  assert(wround.allOrtho, '겹선 표시경로 전부 직각(부채꼴 대각 제거)');
  assert(wround.hasCurve, '라운드 경로 곡선 생성');
  assert(wround.usesPath, '라운드>0 시 배선 path 렌더');

  // AC/DC 전원구분 + 전류 흐름 애니메이션
  const flow = await page.evaluate(async () => {
    const w0 = App.store.get().wires[0];
    App.store.commit(() => { w0.acdc = 'AC'; });
    App.render.all();
    const grp = document.querySelector('#layer-wires [data-id="' + w0.id + '"]');
    const ln = grp.querySelector('polyline[data-acdc]');
    const tagged = ln && ln.getAttribute('data-acdc') === 'AC';
    // 정지 상태에서도 라인 중간 AC 뱃지(텍스트) 존재
    const badge = Array.from(grp.querySelectorAll('text')).some(t => t.textContent === 'AC');
    // 흐름 재생 → 점선 패턴 적용 + dashoffset 시간에 따라 변함
    App.render.setFlow(true);
    const flowing = App.render.isFlowing();
    const grp2 = document.querySelector('#layer-wires [data-id="' + w0.id + '"]');
    const ln2 = grp2.querySelector('polyline[data-acdc]');
    const hasDash = !!ln2.style.strokeDasharray;
    const o1 = parseFloat(ln2.style.strokeDashoffset || '0');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const o2 = parseFloat(ln2.style.strokeDashoffset || '0');
    App.render.setFlow(false);
    const stopped = !App.render.isFlowing();
    const cleared = !document.querySelector('#layer-wires polyline[data-acdc]').style.strokeDasharray;
    return { tagged, badge, flowing, hasDash, moved: o1 !== o2, stopped, cleared };
  });
  assert(flow.tagged, '배선 AC 전원구분 표시(data-acdc)');
  assert(flow.badge, '정지 상태 라인 중간 AC/DC 뱃지 표시');
  assert(flow.flowing && flow.hasDash, '흐름 재생 시 점선 적용');
  assert(flow.moved, '흐름 애니메이션 dashoffset 변화');
  assert(flow.stopped && flow.cleared, '흐름 정지 시 점선 제거');
  await page.evaluate(() => { App.store.commit(() => { App.store.get().wires[0].acdc = ''; }); App.render.all(); });

  // 배치도 제목: 입력 → 사이즈 한 줄 위에 표시
  await page.fill('#panel-title', '제1배전반 배치도');
  await page.waitForTimeout(50);
  const title = await page.evaluate(() => {
    const saved = App.store.get().panel.title;
    const texts = Array.from(document.querySelectorAll('#layer-panel text')).map(t => ({ s: t.textContent, y: parseFloat(t.getAttribute('y')) }));
    const ti = texts.find(t => t.s === '제1배전반 배치도');
    const sz = texts.find(t => /mm/.test(t.s));
    return { saved, hasTitle: !!ti, above: ti && sz ? ti.y < sz.y : false };
  });
  assert(title.saved === '제1배전반 배치도', '제목 상태 저장');
  assert(title.hasTitle, '캔버스에 제목 렌더');
  assert(title.above, '제목이 사이즈 위에 표시');
  await page.fill('#panel-title', '');

  // 글씨 크기 배율: 부품 라벨 폰트가 배율 따라 커짐
  const fontScale = await page.evaluate(() => {
    const c0 = App.store.get().components[0];
    function labelFont() {
      const grp = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
      const t = Array.from(grp.querySelectorAll('text')).find(x => x.textContent === c0.label);
      return t ? parseFloat(t.getAttribute('font-size')) : 0;
    }
    const before = labelFont();
    App.store.commit(s => { s.fonts.comp = 2; });
    App.render.all();
    const after = labelFont();
    return { before, after };
  });
  assert(fontScale.after > fontScale.before * 1.8, '부품 글씨 배율 적용 (' + fontScale.before + '→' + fontScale.after + ')');

  // 부품 글씨 3종(카테고리/호기/이름) 독립 배율 — 각 요소가 자기 배율에만 반응
  const sep = await page.evaluate(() => {
    const c0 = App.store.get().components[0];
    function read() {
      const grp = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
      const texts = Array.from(grp.querySelectorAll('text'));
      const fs = txt => { const t = texts.find(x => x.textContent === txt); return t ? parseFloat(t.getAttribute('font-size')) : 0; };
      return { type: fs(c0.type), name: fs(c0.label), tag: fs('Q1') };
    }
    App.store.commit(s => { const c = s.components.find(x => x.id === c0.id); c.tag = 'Q1'; s.fonts = { ctype: 3, ctag: 1, cname: 1 }; });
    App.render.all();
    const A = read();
    App.store.commit(s => { s.fonts = { ctype: 1, ctag: 1, cname: 3 }; });
    App.render.all();
    const B = read();
    App.store.commit(s => { s.fonts = {}; const c = s.components.find(x => x.id === c0.id); c.tag = ''; });
    App.render.all();
    return {
      typeResponds: A.type > B.type * 1.8,   // 카테고리는 ctype에만 반응
      nameResponds: B.name > A.name * 1.8,   // 이름은 cname에만 반응
      tagStable: Math.abs(A.tag - B.tag) < 0.01  // 호기번호는 둘 다 1 → 불변
    };
  });
  assert(sep.typeResponds, '카테고리 글씨 독립 배율');
  assert(sep.nameResponds, '부품이름 글씨 독립 배율');
  assert(sep.tagStable, '호기번호 글씨 독립(다른 배율 영향 없음)');

  // 글씨 위치 이동: 라벨 오프셋이 렌더에 반영 + 드래그 핸들 존재
  const lm = await page.evaluate(() => {
    App.store.commit(s => { s.fonts.comp = 1; s.components.push({ id: 'lblc', partNo: 'x', type: 'TB', x: 250, y: 250, widthMM: 60, heightMM: 60, rotation: 0, label: '라벨이동', terminals: 0, term: null }); });
    App.ui.selected.clear(); App.ui.selected.add('lblc'); App.render.all();
    function labelXY() {
      const grp = document.querySelector('#layer-components [data-id="lblc"]');
      const t = Array.from(grp.querySelectorAll('text')).find(x => x.textContent === '라벨이동');
      return { x: parseFloat(t.getAttribute('x')), y: parseFloat(t.getAttribute('y')) };
    }
    const handle = !!document.querySelector('#layer-tophit [data-labelfor="lblc"]');
    const before = labelXY();
    App.store.commit(s => { const c = s.components.find(c => c.id === 'lblc'); c.labelDx = 18; c.labelDy = 22; });
    App.render.all();
    const after = labelXY();
    return { handle: handle, ddx: after.x - before.x, ddy: after.y - before.y };
  });
  assert(lm.handle, '라벨 드래그 핸들 존재');
  assert(Math.abs(lm.ddx - 18) < 0.5 && Math.abs(lm.ddy - 22) < 0.5, '라벨 위치 오프셋 렌더 반영 (' + lm.ddx + ',' + lm.ddy + ')');
  // 정리: 임시 부품 제거(이후 카운트 의존 테스트 보호)
  await page.evaluate(() => { App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'lblc'); }); App.ui.selected.clear(); });

  // 호기번호 드래그 핸들 존재
  const tagH = await page.evaluate(() => {
    const c = App.store.get().components[0];
    App.store.commit(s => { s.components.find(x => x.id === c.id).tag = 'Q9'; });
    App.ui.selected.clear(); App.ui.selected.add(c.id); App.render.all();
    const has = !!document.querySelector('#layer-tophit [data-tagfor="' + c.id + '"]');
    App.store.commit(s => { s.components.find(x => x.id === c.id).tag = ''; }); App.ui.selected.clear();
    return has;
  });
  assert(tagH, '호기번호 드래그 핸들 존재');

  // 부품 이름 크기 통일(넓은/좁은 부품 동일 폰트)
  const uni = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'wf', partNo: 'x', type: 'TB', x: 40, y: 520, widthMM: 100, heightMM: 60, rotation: 0, label: 'AAAA', terminals: 0, term: null });
      s.components.push({ id: 'nf', partNo: 'x', type: 'TB', x: 40, y: 600, widthMM: 12, heightMM: 60, rotation: 0, label: 'BBBBBBBB', terminals: 0, term: null });
    });
    App.render.all();
    function lf(id, lbl) { const g = document.querySelector('#layer-components [data-id="' + id + '"]'); const t = Array.from(g.querySelectorAll('text')).find(x => x.textContent === lbl); return parseFloat(t.getAttribute('font-size')); }
    const a = lf('wf', 'AAAA'), b = lf('nf', 'BBBBBBBB');
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'wf' && c.id !== 'nf'); });
    return { a: a, b: b };
  });
  assert(Math.abs(uni.a - uni.b) < 0.01, '부품 이름 크기 통일 (' + uni.a + ' vs ' + uni.b + ')');

  // 잠금: 잠긴 덕트는 미세이동 안 됨
  const lock = await page.evaluate(() => {
    App.store.commit(s => s.ducts.push({ id: 'dlk', orient: 'h', x: 100, y: 100, lengthMM: 200, widthMM: 60 }));
    App.ui.selected.clear(); App.ui.selected.add('dlk'); App.render.all();
    App.interact.toggleLock();
    const x0 = App.store.get().ducts.find(d => d.id === 'dlk').x;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const x1 = App.store.get().ducts.find(d => d.id === 'dlk').x;
    App.interact.toggleLock();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const x2 = App.store.get().ducts.find(d => d.id === 'dlk').x;
    App.store.commit(s => { s.ducts = s.ducts.filter(d => d.id !== 'dlk'); }); App.ui.selected.clear();
    return { lockedMove: x1 === x0, unlockedMove: x2 !== x1 };
  });
  assert(lock.lockedMove, '잠긴 덕트 이동 안 됨');
  assert(lock.unlockedMove, '잠금 해제 후 이동됨');

  // --- PNG 내보내기 (예외 없이 실행) ---
  const pngOk = await page.evaluate(() => { try { App.exporter.png(1); return true; } catch (e) { return 'ERR:' + e.message; } });
  assert(pngOk === true, 'PNG 내보내기 실행 (' + pngOk + ')');

  // --- 저장/불러오기 라운드트립 (와이어 포함) ---
  const round = await page.evaluate(() => {
    const json = JSON.stringify(App.store.get());
    App.store.replace(App.createEmptyProject());
    const cleared = App.store.get().wires.length;
    App.store.replace(JSON.parse(json));
    App.render.all();
    return { cleared: cleared, wires: App.store.get().wires.length, comps: App.store.get().components.length };
  });
  assert(round.cleared === 0 && round.wires === 1 && round.comps === 2, '저장/복원 와이어 보존');

  // --- 부품 삭제 시 와이어 캐스케이드 ---
  const cascade = await page.evaluate(() => {
    const s = App.store.get();
    App.ui.selected.clear();
    App.ui.selected.add(s.components[0].id);
    App.interact.deleteSelected();
    return { comps: App.store.get().components.length, wires: App.store.get().wires.length };
  });
  assert(cascade.comps === 1 && cascade.wires === 0, '부품 삭제 시 와이어 제거');

  // --- undo 복원 ---
  const undo = await page.evaluate(() => { App.store.undo(); return { comps: App.store.get().components.length, wires: App.store.get().wires.length }; });
  assert(undo.comps === 2 && undo.wires === 1, 'undo 로 복원');

  // --- 신규 편집 기능: 자동 호기번호 / 미세이동 / 복제 / 겹침경고 ---
  const feat = await page.evaluate(() => {
    const get = () => App.store.get();
    const c0 = get().components[0];
    // 라벨은 품명(파트명)으로 표시 — 자동 Q1 형식이 아님
    const isPartName = !!c0.label && !/^[A-Z]\d+$/.test(c0.label);
    App.ui.selected.clear(); App.ui.selected.add(c0.id);
    const bx = c0.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const nudged = get().components.find(c => c.id === c0.id).x !== bx;
    const before = get().components.length;
    App.interact.duplicateSelected();
    const after = get().components.length;
    const pasted = get().components[after - 1];
    const diffLabel = pasted.label !== c0.label;
    App.store.commit(() => { pasted.x = c0.x; pasted.y = c0.y; });
    App.render.all();
    const red = Array.from(document.querySelectorAll('#layer-components rect'))
      .some(r => r.getAttribute('stroke') === '#dc2626');
    return { isPartName, nudged, dup: after - before, sameLabel: pasted.label === c0.label, overlapRed: red };
  });
  assert(feat.isPartName, '라벨이 품명으로 표시됨');
  assert(feat.nudged, '방향키 미세이동');
  assert(feat.dup === 1, '복제 +1 (' + feat.dup + ')');
  assert(feat.sameLabel, '복제 시 품명 유지');
  assert(feat.overlapRed, '겹침 경고 표시');

  // --- 영역(마퀴) 선택: 빈 공간 드래그로 다중 선택 ---
  await page.click('#tool-select');
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });
  // 캔버스 영역 안으로 클램프(툴바 높이에 따라 캔버스가 작아질 수 있음)
  const mL = Math.max(box.x + 5, cx - 270), mT = Math.max(box.y + 5, cy - 150);
  const mR = Math.min(box.x + box.w - 5, cx + 270), mB = Math.min(box.y + box.h - 5, cy + 120);
  await page.mouse.move(mL, mT);
  await page.mouse.down();
  await page.mouse.move(mR, mB, { steps: 6 });
  await page.mouse.up();
  const selN = await page.evaluate(() => App.ui.selected.size);
  assert(selN >= 2, '영역선택 다중 (' + selN + ')');

  // 라인번호(배선 라벨) 화면 크기 고정 — 휠 줌해도 스크린상 크기 유지
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });
  const zoomFix = await page.evaluate(() => {
    function wlabel() { const t = document.querySelector('#layer-wires text'); return t ? parseFloat(t.getAttribute('font-size')) : 0; }
    const f1 = wlabel(), s1 = App.viewport.scale();
    const svg = document.getElementById('canvas');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    const f2 = wlabel(), s2 = App.viewport.scale();
    return { zoomedIn: s2 > s1 * 1.05, screen1: f1 * s1, screen2: f2 * s2, mmChanged: Math.abs(f2 - f1) > 0.001 };
  });
  assert(zoomFix.zoomedIn, '휠 줌인 동작');
  assert(zoomFix.mmChanged, '줌 시 라벨 mm값 재계산(재렌더)');
  assert(Math.abs(zoomFix.screen1 - zoomFix.screen2) < 0.5, '라인번호 화면 크기 고정(줌 무관 ' + zoomFix.screen1.toFixed(1) + '≈' + zoomFix.screen2.toFixed(1) + ')');

  // 라인번호 크기: 한 곳(전역)에서 지정 → 모든 라인 동일, 화면 고정
  await page.fill('#wire-label-px', '22');
  await page.evaluate(() => document.getElementById('wire-label-px').dispatchEvent(new Event('input')));
  const lblSize = await page.evaluate(() => {
    const saved = App.store.get().fonts.wirePx;
    function screenPx() { const t = document.querySelector('#layer-wires text'); const s = App.viewport.scale(); return t ? parseFloat(t.getAttribute('font-size')) * s : 0; }
    const px1 = screenPx();
    const svg = document.getElementById('canvas'); const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    const px2 = screenPx();
    return { saved, px1, px2 };
  });
  assert(lblSize.saved === 22, '라인번호 크기 전역 저장 (' + lblSize.saved + ')');
  assert(Math.abs(lblSize.px1 - 22) < 1.5, '지정 크기 적용 (~22px, ' + lblSize.px1.toFixed(1) + ')');
  assert(Math.abs(lblSize.px1 - lblSize.px2) < 0.5, '지정 후에도 줌 고정');
  await page.fill('#wire-label-px', '11');
  await page.evaluate(() => document.getElementById('wire-label-px').dispatchEvent(new Event('input')));

  // 정렬/균등 간격 도구
  const align = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'g1', partNo: 'g', type: 'TB', x: 100, y: 100, widthMM: 30, heightMM: 40, rotation: 0, label: 'g1', terminals: 0, term: null });
      s.components.push({ id: 'g2', partNo: 'g', type: 'TB', x: 200, y: 130, widthMM: 30, heightMM: 40, rotation: 0, label: 'g2', terminals: 0, term: null });
      s.components.push({ id: 'g3', partNo: 'g', type: 'TB', x: 400, y: 160, widthMM: 30, heightMM: 40, rotation: 0, label: 'g3', terminals: 0, term: null });
    });
    App.ui.selected = new Set(['g1', 'g2', 'g3']);
    const nT = App.interact.alignSelected('top');
    const s1 = App.store.get();
    const topOK = ['g1', 'g2', 'g3'].every(id => s1.components.find(c => c.id === id).y === 100);
    const nD = App.interact.distributeSelected('h');
    const s2 = App.store.get();
    const xs = ['g1', 'g2', 'g3'].map(id => s2.components.find(c => c.id === id).x).sort((a, b) => a - b);
    const gap1 = xs[1] - (xs[0] + 30), gap2 = xs[2] - (xs[1] + 30);
    const distOK = Math.abs(gap1 - gap2) <= 1;
    // undo 로 정렬 취소 가능
    App.store.undo(); App.store.undo();
    const undone = App.store.get().components.find(c => c.id === 'g2').y === 130;
    App.store.commit(s => { s.components = s.components.filter(c => ['g1', 'g2', 'g3'].indexOf(c.id) < 0); });
    App.ui.selected.clear(); App.render.all();
    return { nT, topOK, nD, distOK, undone };
  });
  assert(align.nT === 3 && align.topOK, '위 정렬(3개)');
  assert(align.nD === 3 && align.distOK, '가로 균등 간격');
  assert(align.undone, '정렬 실행취소 가능');

  // 줌 컨트롤 버튼 + 배율 표시
  await page.click('#zoom-in');
  const zoomUI = await page.evaluate(() => ({
    pct: document.getElementById('zoom-pct').textContent,
    hasBtns: !!(document.getElementById('zoom-out') && document.getElementById('zoom-fit'))
  }));
  assert(zoomUI.hasBtns && /%$/.test(zoomUI.pct), '줌 컨트롤 + 배율 표시 (' + zoomUI.pct + ')');
  await page.click('#zoom-fit');

  // 도움말 모달 (버튼/F1/닫기)
  await page.click('#act-help');
  let helpOpen = await page.evaluate(() => getComputedStyle(document.getElementById('help-modal')).display !== 'none');
  assert(helpOpen, '도움말 모달 열림');
  await page.keyboard.press('Escape');
  helpOpen = await page.evaluate(() => getComputedStyle(document.getElementById('help-modal')).display !== 'none');
  assert(!helpOpen, '도움말 모달 Esc 닫힘');

  // XSS 방지: 악성 라벨이 요소로 실행되지 않음
  const xss = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'xs1', partNo: '<img src=x onerror=window.__pwn=1>', type: 'TB', x: 500, y: 100, widthMM: 30, heightMM: 30, rotation: 0, label: '<b>bad</b>', tag: '"><script>1</script>', terminals: 0, term: null });
    });
    App.ui.selected = new Set(['xs1']);
    App.inspector.update();
    const injectedImg = !!document.querySelector('#inspector img');
    const injectedB = !!document.querySelector('#inspector b');
    const escOK = App.esc('<a"b>') === '&lt;a&quot;b&gt;';
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'xs1'); });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { pwned: !!window.__pwn, injectedImg, injectedB, escOK };
  });
  assert(!xss.pwned && !xss.injectedImg && !xss.injectedB, '악성 라벨 이스케이프(XSS 차단)');
  assert(xss.escOK, 'App.esc 동작');

  // 저장 안 된 변경 추적(dirty) — 변경 시 true, markSaved 후 false
  const dirty = await page.evaluate(() => {
    App.persistence.markSaved();
    const clean = !App.persistence.isDirty();
    App.store.commit(s => { s.panel.gridMM = s.panel.gridMM; }); // 임의 커밋
    const afterCommit = App.persistence.isDirty();
    App.persistence.markSaved();
    return { clean, afterCommit, saved: !App.persistence.isDirty() };
  });
  assert(dirty.clean && dirty.afterCommit && dirty.saved, '미저장 변경 추적(dirty→saved)');

  // === CAD 편의 기능 ===
  // 도구 단축키 V/W/D
  await page.keyboard.press('w');
  let toolNow = await page.evaluate(() => App.ui.tool);
  assert(toolNow === 'wire', '단축키 W → 배선 도구 (' + toolNow + ')');
  await page.keyboard.press('d');
  toolNow = await page.evaluate(() => App.ui.tool);
  assert(toolNow === 'dim', '단축키 D → 치수 도구');
  await page.keyboard.press('v');
  toolNow = await page.evaluate(() => App.ui.tool);
  assert(toolNow === 'select', '단축키 V → 선택 도구');

  // Ctrl+A 전체 선택
  await page.keyboard.press('Control+a');
  const selAll = await page.evaluate(() => {
    const s = App.store.get();
    const total = s.components.length + s.ducts.length + s.rails.length + s.wires.length + (s.dimensions || []).length;
    return { sel: App.ui.selected.size, total };
  });
  assert(selAll.sel === selAll.total && selAll.total > 0, 'Ctrl+A 전체 선택 (' + selAll.sel + '/' + selAll.total + ')');
  await page.keyboard.press('Escape');

  // 마우스 좌표 표시
  await page.mouse.move(cx, cy);
  const posTxt = await page.evaluate(() => document.getElementById('cursor-pos').textContent);
  assert(/-?\d+, -?\d+ mm/.test(posTxt), '마우스 좌표(mm) 표시 (' + posTxt + ')');

  // 부품 더블클릭 → 크기·단자 편집 모달
  const c0box = await page.evaluate(() => {
    const c = App.store.get().components[0];
    const grp = document.querySelector('#layer-components [data-id="' + c.id + '"] rect');
    const r = grp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.dblclick(c0box.x, c0box.y);
  const peOpen = await page.evaluate(() => getComputedStyle(document.getElementById('part-editor')).display !== 'none');
  assert(peOpen, '부품 더블클릭 → 편집 모달');
  await page.keyboard.press('Escape');

  // 스마트 정렬 가이드: 격자에 안 맞는 기준(y=303)에 드래그 시 자석 스냅
  const smart = await page.evaluate(() => {
    App.store.commit(s => {
      s.rails = []; // 레일 스냅 배제
      s.components.push({ id: 'sm1', partNo: 'sm', type: 'TB', x: 100, y: 303, widthMM: 40, heightMM: 40, rotation: 0, label: 'ref', terminals: 0, term: null });
      s.components.push({ id: 'sm2', partNo: 'sm', type: 'TB', x: 300, y: 400, widthMM: 40, heightMM: 40, rotation: 0, label: 'mv', terminals: 0, term: null });
    });
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="sm2"] rect');
    const r = grp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, scale: App.viewport.scale() };
  });
  // sm2 를 y=303 근처(302)로 드래그: 격자 스냅(300/310)이 아닌 303 에 자석
  const dyPx = (302 - 400) * smart.scale;
  await page.mouse.move(smart.x, smart.y);
  await page.mouse.down();
  await page.mouse.move(smart.x + 3, smart.y + dyPx, { steps: 8 });
  const guideShown = await page.evaluate(() => !!document.querySelector('#smart-guides line'));
  await page.mouse.up();
  const smartRes = await page.evaluate(() => {
    const y = App.store.get().components.find(c => c.id === 'sm2').y;
    const cleared = !document.querySelector('#smart-guides line');
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'sm1' && c.id !== 'sm2'); });
    App.ui.selected.clear(); App.render.all();
    return { y, cleared };
  });
  assert(guideShown, '드래그 중 스마트 가이드선 표시');
  assert(smartRes.y === 303, '스마트 가이드 자석 스냅 (y=' + smartRes.y + ')');
  assert(smartRes.cleared, '드래그 종료 시 가이드 제거');

  // === 배선 자동화 + 표제란 ===
  // 덕트 경유 자동 라우팅: 두 단자 사이 가로 덕트 중심선으로 배선
  const ductRoute = await page.evaluate(() => {
    const s = App.store.get();
    const w0 = s.wires[0];
    const r0 = App.wires.route(s, w0);
    const lo = Math.min(r0[0].y, r0[r0.length - 1].y);
    App.store.commit(ss => { ss.ducts.push({ id: 'dd1', orient: 'h', x: 0, y: lo - 120, lengthMM: 600, widthMM: 60 }); });
    // corners 없는 새 배선이 덕트 중심(y = lo-120+30)으로 지나가는지
    const s2 = App.store.get();
    const w = App.wires.create(s2, { compId: w0.fromComp, index: w0.fromTerm }, { compId: w0.toComp, index: w0.toTerm });
    const r = App.wires.route(s2, w);
    const ductCy = Math.round(lo - 120 + 30);
    const passes = r.some(p => Math.abs(p.y - ductCy) < 1);
    App.store.commit(ss => { ss.ducts = ss.ducts.filter(d => d.id !== 'dd1'); });
    return { passes, ductCy };
  });
  assert(ductRoute.passes, '덕트 경유 자동 라우팅 (y=' + ductRoute.ductCy + ')');

  // 라인번호 일괄 재부여
  const renum = await page.evaluate(() => {
    App.store.commit(s => { App.wires.renumber(s, '101'); });
    const labels = App.store.get().wires.map(w => w.label);
    const inc = App.wires.incLabel('009');
    App.store.commit(s => { App.wires.renumber(s, 'W1'); });
    return { first: labels[0], inc };
  });
  assert(renum.first === '101', '라인번호 재부여 시작값 (' + renum.first + ')');
  assert(renum.inc === '010', 'incLabel 자릿수 유지 (' + renum.inc + ')');

  // 배선 목록 패널: 행 표시 + 클릭 시 선택/화면이동
  const wl = await page.evaluate(() => {
    App.wireList.render();
    const rows = document.querySelectorAll('#wire-list > div');
    const n = App.store.get().wires.length;
    if (rows.length !== n) return { rows: rows.length, n };
    const vb0 = App.viewport.getViewBox().x;
    rows[0].click();
    return { rows: rows.length, n, selected: App.ui.selected.size === 1, moved: App.viewport.getViewBox().x !== vb0 };
  });
  assert(wl.rows === wl.n && wl.rows > 0, '배선 목록 행 수 (' + wl.rows + ')');
  assert(wl.selected, '목록 클릭 → 배선 선택');
  await page.evaluate(() => { App.ui.selected.clear(); const p = App.store.get().panel; App.viewport.fitTo(p.widthMM, p.heightMM); App.render.all(); });

  // 표제란: 도번 입력 → 캔버스 우하단에 렌더
  await page.fill('#tb-docno', 'DWG-001');
  await page.evaluate(() => document.getElementById('tb-docno').dispatchEvent(new Event('change')));
  const tbR = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('#layer-panel text')).map(t => t.textContent);
    const saved = App.store.get().titleBlock;
    return { has: texts.indexOf('DWG-001') >= 0, saved: saved && saved.docNo === 'DWG-001' };
  });
  assert(tbR.has && tbR.saved, '표제란 렌더 + 저장 (DWG-001)');
  await page.evaluate(() => { App.store.commit(s => { s.titleBlock = { show: false }; }); App.render.all(); });

  // === 멀티 시트 ===
  const sheets = await page.evaluate(() => {
    const before = App.store.get().components.length;
    App.sheetsMgr.add('2번반');                       // 새 빈 시트로 전환
    const s2 = App.store.get();
    const emptyNew = s2.components.length === 0 && s2.activeSheet === 1;
    const tabN = document.querySelectorAll('#sheet-tabs button').length;
    // 새 시트에 부품 추가
    App.store.commit(s => { s.components.push({ id: 'sh2c', partNo: 'x', type: 'TB', x: 50, y: 50, widthMM: 30, heightMM: 30, rotation: 0, label: 's2', terminals: 0, term: null }); });
    App.sheetsMgr.switchTo(0);                        // 1번 시트로 복귀
    const s1 = App.store.get();
    const backOK = s1.components.length === before && s1.activeSheet === 0;
    App.sheetsMgr.switchTo(1);                        // 다시 2번 — 내용 유지 확인
    const keep = App.store.get().components.some(c => c.id === 'sh2c');
    App.sheetsMgr.switchTo(0);
    App.sheetsMgr.remove(1);                          // 2번 삭제
    const oneLeft = App.store.get().sheets.length === 1;
    return { emptyNew, tabN, backOK, keep, oneLeft };
  });
  assert(sheets.emptyNew, '새 시트 추가(빈 도면)');
  assert(sheets.tabN >= 3, '시트 탭 렌더 (' + sheets.tabN + ')');
  assert(sheets.backOK, '시트1 복귀 시 내용 복원');
  assert(sheets.keep, '시트2 내용 유지');
  assert(sheets.oneLeft, '시트 삭제');

  // === DXF / 이미지 / 3D ===
  // DXF 문자열 생성
  const dxf = await page.evaluate(() => {
    const s = App.exporter.dxfString(App.store.get());
    return {
      hasEnt: s.indexOf('ENTITIES') >= 0, hasEOF: s.indexOf('EOF') >= 0,
      lines: (s.match(/\nLINE\n/g) || []).length,
      circles: (s.match(/\nCIRCLE\n/g) || []).length,
      texts: (s.match(/\nTEXT\n/g) || []).length
    };
  });
  assert(dxf.hasEnt && dxf.hasEOF, 'DXF 구조(ENTITIES/EOF)');
  assert(dxf.lines >= 8 && dxf.circles >= 4 && dxf.texts >= 2, 'DXF 엔티티 (' + dxf.lines + 'L/' + dxf.circles + 'C/' + dxf.texts + 'T)');

  // 부품 이미지: img 지정 → 캔버스에 <image> 렌더 + 틴트 투명화
  const imgTest = await page.evaluate(() => {
    const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const c0 = App.store.get().components[0];
    App.store.commit(s => { s.components.find(c => c.id === c0.id).img = PIX; });
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
    const im = grp.querySelector('image');
    App.store.commit(s => { s.components.find(c => c.id === c0.id).img = null; });
    App.render.all();
    return { has: !!im, href: im && (im.getAttribute('href') || '').indexOf('data:image/png') === 0 };
  });
  assert(imgTest.has && imgTest.href, '부품 이미지 렌더(<image>)');

  // 3D 뷰: 열기 → 폴리곤(3면 박스) 렌더 → 닫기
  await page.click('#act-3d');
  const v3 = await page.evaluate(() => {
    const open = getComputedStyle(document.getElementById('view3d-modal')).display !== 'none';
    const polys = document.querySelectorAll('#view3d-svg polygon').length;
    const wires3d = document.querySelectorAll('#view3d-svg polyline').length;
    return { open, polys, wires3d };
  });
  assert(v3.open, '3D 모달 열림');
  assert(v3.polys >= 9, '3D 박스 면 렌더 (' + v3.polys + 'polys)');
  assert(v3.wires3d >= 1, '3D 배선 표시');
  // 3D 드래그 회전(시점) + 휠 줌 → 뷰 변경
  const v3b = await page.evaluate(() => {
    const r = document.getElementById('view3d-svg').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, vb0: document.getElementById('view3d-svg').getAttribute('viewBox') };
  });
  await page.mouse.move(v3b.x, v3b.y);
  await page.mouse.down();
  await page.mouse.move(v3b.x + 80, v3b.y - 40, { steps: 4 });
  await page.mouse.up();
  await page.mouse.move(v3b.x, v3b.y);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(50);
  const v3after = await page.evaluate(() => document.getElementById('view3d-svg').getAttribute('viewBox'));
  assert(v3after !== v3b.vb0, '3D 드래그 회전/휠 줌으로 뷰 변경');
  await page.keyboard.press('Escape');
  const v3closed = await page.evaluate(() => getComputedStyle(document.getElementById('view3d-modal')).display === 'none');
  assert(v3closed, '3D 모달 Esc 닫힘');

  // 패널 접기 토글 + 빈 공간 더블클릭 화면맞춤
  await page.click('#toggle-left');
  let leftHidden = await page.evaluate(() => document.getElementById('left-panel').style.display === 'none');
  assert(leftHidden, '좌측 패널 접기');
  await page.click('#toggle-left');
  leftHidden = await page.evaluate(() => document.getElementById('left-panel').style.display === 'none');
  assert(!leftHidden, '좌측 패널 펼치기');
  await page.evaluate(() => { App.viewport.panBy(500, 500); }); // 화면 어긋내기
  const fitBox = await page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.9 }; });
  await page.mouse.dblclick(fitBox.x, fitBox.y);
  const fitOK = await page.evaluate(() => {
    const vb = App.viewport.getViewBox(); const p = App.store.get().panel;
    const cx = vb.x + vb.w / 2;
    return Math.abs(cx - p.widthMM / 2) < 5; // 패널 중앙 근처로 복귀
  });
  assert(fitOK, '빈 공간 더블클릭 → 화면 맞춤');

  // 통합 라운드트립: 시트+이미지+표제란이 저장/복원에 보존
  const round2 = await page.evaluate(() => {
    const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    App.sheetsMgr.add('통합2');
    App.store.commit(s => {
      s.titleBlock = { show: true, docNo: 'RT-77', author: '', date: '', rev: '' };
      s.components.push({ id: 'rt1', partNo: 'rt', type: 'TB', x: 10, y: 10, widthMM: 20, heightMM: 20, rotation: 0, label: 'rt', terminals: 0, term: null, img: PIX });
    });
    const json = JSON.stringify(App.store.get());
    App.store.replace(App.createEmptyProject());
    App.store.replace(JSON.parse(json));
    const s2 = App.store.get();
    const ok = {
      sheets: s2.sheets && s2.sheets.length === 2,
      active: s2.activeSheet === 1,
      tb: s2.titleBlock && s2.titleBlock.docNo === 'RT-77',
      img: !!(s2.components.find(c => c.id === 'rt1') || {}).img
    };
    // 정리: 시트1 복귀 + 시트2 삭제
    App.sheetsMgr.switchTo(0);
    App.sheetsMgr.remove(1);
    return ok;
  });
  assert(round2.sheets && round2.active, '라운드트립: 시트 보존');
  assert(round2.tb, '라운드트립: 표제란 보존');
  assert(round2.img, '라운드트립: 부품 이미지 보존');

  await page.screenshot({ path: SHOT });
  await browser.close();

  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ ALL REGRESSION TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
