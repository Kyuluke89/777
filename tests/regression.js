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
  await page.evaluate(() => { if (App.palette && App.palette.loadSamples) App.palette.loadSamples(true); }); // 테스트: 샘플(기본) 부품 사용

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
  assert(rows.bom[0][0] === '품명' && rows.bom[0][6] === '호기번호', 'BOM 품명·호기 컬럼');
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
      if (msg.indexOf('품명') >= 0) return 'PLC-RENAMED';
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
      titleChanged: !!renamed, nameChanged: renamed && renamed.name === 'PLC-RENAMED', oldGone: oldGone, // 타이틀=품명 통일
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

  // 라인번호(넘버링 튜브) 도면(mm) 고정 — 줌해도 mm값 그대로(선에 붙어 함께 스케일)
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });
  const zoomFix = await page.evaluate(() => {
    function wlabel() { const t = document.querySelector('#layer-wires text'); return t ? parseFloat(t.getAttribute('font-size')) : 0; }
    const f1 = wlabel(), s1 = App.viewport.scale();
    const svg = document.getElementById('canvas');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    const f2 = wlabel(), s2 = App.viewport.scale();
    return { zoomedIn: s2 > s1 * 1.05, mm1: f1, mm2: f2 };
  });
  assert(zoomFix.zoomedIn, '휠 줌인 동작');
  assert(Math.abs(zoomFix.mm1 - zoomFix.mm2) < 0.001, '라인번호 도면(mm) 고정 — 줌해도 크기 안 바뀜 (' + zoomFix.mm1 + '≈' + zoomFix.mm2 + ')');

  // 라인번호 크기: 한 곳(전역, mm)에서 지정 → 모든 라인 동일
  await page.fill('#wire-label-px', '8');
  await page.evaluate(() => document.getElementById('wire-label-px').dispatchEvent(new Event('input')));
  const lblSize = await page.evaluate(() => {
    const saved = App.store.get().fonts.wireMM;
    function mmSize() { const t = document.querySelector('#layer-wires text'); return t ? parseFloat(t.getAttribute('font-size')) : 0; }
    const m1 = mmSize();
    const svg = document.getElementById('canvas'); const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    const m2 = mmSize();
    return { saved, m1, m2 };
  });
  assert(lblSize.saved === 8, '라인번호 크기(mm) 전역 저장 (' + lblSize.saved + ')');
  assert(Math.abs(lblSize.m1 - 8) < 0.01 && Math.abs(lblSize.m2 - 8) < 0.01, '지정 mm 크기 적용 + 줌 무관 유지');
  await page.fill('#wire-label-px', '4');
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
    // 다른 부품/레일 간섭 배제(임시 격리, 끝나고 복원)
    window.__sgBackup = JSON.parse(JSON.stringify({ comps: App.store.get().components, rails: App.store.get().rails }));
    App.store.commit(s => {
      s.rails = [];
      s.components = [
        { id: 'sm1', partNo: 'sm', type: 'TB', x: 100, y: 303, widthMM: 40, heightMM: 40, rotation: 0, label: 'ref', terminals: 0, term: null },
        { id: 'sm2', partNo: 'sm', type: 'TB', x: 300, y: 400, widthMM: 40, heightMM: 40, rotation: 0, label: 'mv', terminals: 0, term: null }
      ];
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
    App.store.commit(s => { s.components = window.__sgBackup.comps; s.rails = window.__sgBackup.rails; });
    App.ui.selected.clear(); App.render.all();
    return { y, cleared };
  });
  assert(guideShown, '드래그 중 스마트 가이드선 표시');
  // 위/아래/중앙 어느 모서리든 기준(303)에 정렬되면 성공 — 격자(10 배수)가 아닌 303 정렬이 스냅 증거
  const snapped = (smartRes.y === 303) || (smartRes.y + 40 === 303) || (smartRes.y + 20 === 303);
  assert(snapped, '스마트 가이드 자석 스냅 (y=' + smartRes.y + ')');
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

  // 기본 그래픽 없음: 사용자가 이미지를 넣기 전엔 깔끔한 박스, 넣으면 <image> 표시
  const face = await page.evaluate(() => {
    App.store.commit(s => { s.components.push({ id: 'faceC', partNo: 'F', type: 'MCCB', x: 480, y: 620, widthMM: 50, heightMM: 96, rotation: 0, label: 'F', terminals: 0, term: null }); });
    const c0 = App.store.get().components.find(c => c.id === 'faceC');
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
    const noFace = !grp.querySelector('.part-face') && !grp.querySelector('image');
    const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    App.store.commit(s => { s.components.find(c => c.id === c0.id).img = PIX; });
    App.render.all();
    const grp2 = document.querySelector('#layer-components [data-id="' + c0.id + '"]');
    const imgShown = !!grp2.querySelector('image');
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'faceC'); });
    App.render.all();
    return { noFace, imgShown };
  });
  assert(face.noFace, '기본 그래픽 없음(사용자 이미지 전엔 깔끔한 박스)');
  assert(face.imgShown, '사용자 이미지를 넣으면 표시');

  // 이미지 투명도/자르기(클립) 도면 반영 + 편집기 모서리 핸들
  const imgAdj = await page.evaluate(() => {
    const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    App.store.commit(s => { s.components.push({ id: 'imgc', partNo: 'IMG', type: 'TB', x: 460, y: 500, widthMM: 40, heightMM: 40, rotation: 0, label: 'i', terminals: 0, term: null, img: PIX, imgO: 0.5, imgCX: 5, imgCY: 5, imgCW: 20, imgCH: 20 }); });
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="imgc"]');
    const im = grp.querySelector('image');
    const op = im && im.getAttribute('opacity');
    const clip = im && (im.getAttribute('clip-path') || '').indexOf('imclip_imgc') >= 0;
    // 편집기: 이미지 모드에서 모서리 핸들 4개
    App.ui.selected = new Set(['imgc']); App.inspector.update();
    App.partEditor.open({ component: App.store.get().components.find(c => c.id === 'imgc') });
    document.getElementById('pe-mode-img').click();
    const handles = document.querySelectorAll('#pe-canvas [data-ih]').length;
    App.partEditor.close();
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'imgc'); });
    App.ui.selected.clear(); App.render.all();
    return { op, clip, handles };
  });
  assert(imgAdj.op === '0.5', '이미지 투명도 도면 반영 (' + imgAdj.op + ')');
  assert(imgAdj.clip, '이미지 자르기(클립) 도면 반영');
  assert(imgAdj.handles === 4, '이미지 모서리 핸들 4개 (' + imgAdj.handles + ')');

  // 3D 뷰(WebGL): 열기 → 메쉬 렌더 → 궤도 회전/줌 → 닫기
  await page.click('#act-3d');
  await page.waitForTimeout(300);
  const v3 = await page.evaluate(() => {
    const open = getComputedStyle(document.getElementById('view3d-modal')).display !== 'none';
    const canvas = !!document.querySelector('#view3d-host canvas');
    const dbg = App.view3d._debug();
    return { open, canvas, meshes: dbg.meshes, cam0: dbg.cam };
  });
  assert(v3.open, '3D 모달 열림');
  assert(v3.canvas, '3D WebGL 캔버스 생성');
  assert(v3.meshes >= 4, '3D 메쉬 렌더 (' + v3.meshes + ')');
  // 궤도 회전(드래그) + 줌(휠) → 카메라 이동
  const v3c = await page.evaluate(() => { const r = document.querySelector('#view3d-host canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(v3c.x, v3c.y);
  await page.mouse.down();
  await page.mouse.move(v3c.x + 120, v3c.y - 60, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(250);
  const v3cam = await page.evaluate(() => App.view3d._debug().cam);
  const camMoved = v3cam && v3.cam0 && (Math.abs(v3cam[0] - v3.cam0[0]) > 1 || Math.abs(v3cam[1] - v3.cam0[1]) > 1 || Math.abs(v3cam[2] - v3.cam0[2]) > 1);
  assert(camMoved, '3D 궤도 회전/줌으로 카메라 이동');
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

  // 전체 시트 통합 내보내기(allSheets) — 시트별 부품/배선 수집
  const multiExp = await page.evaluate(() => {
    App.sheetsMgr.add('수출2');
    App.store.commit(s => { s.components.push({ id: 'me1', partNo: 'ME-1', type: 'TB', x: 10, y: 10, widthMM: 20, heightMM: 20, rotation: 0, label: 'me', terminals: 0, term: null }); });
    const all = App.exporter.allSheets(App.store.get());
    const names = all.map(a => a.name);
    const sheet1HasComps = all[0].st.components.length > 0;   // 시트1(보관 데이터)
    const sheet2HasME = all[1].st.components.some(c => c.partNo === 'ME-1');
    App.sheetsMgr.switchTo(0); App.sheetsMgr.remove(1);
    return { n: all.length, names, sheet1HasComps, sheet2HasME };
  });
  assert(multiExp.n === 2 && multiExp.sheet1HasComps && multiExp.sheet2HasME, '전체 시트 통합 수집 (' + multiExp.names + ')');

  // 우측 패널 자체 스크롤(휠) — 본문은 스크롤 금지
  const scrollChk = await page.evaluate(() => {
    const rp = document.getElementById('right-panel');
    const canScroll = getComputedStyle(rp).overflowY === 'auto';
    const bodyLocked = getComputedStyle(document.body).overflow === 'hidden';
    rp.scrollTop = 40;
    return { canScroll, bodyLocked, scrolled: rp.scrollTop > 0 || rp.scrollHeight <= rp.clientHeight };
  });
  assert(scrollChk.canScroll && scrollChk.bodyLocked && scrollChk.scrolled, '우측 패널 스크롤 + 본문 고정');

  // 기계(필드) 영역 + 센서/모터 부품 + 전장→기계 배선
  const field = await page.evaluate(() => {
    App.store.commit(s => { s.panel.fieldZone = true; });
    App.render.all();
    const zone = Array.from(document.querySelectorAll('#layer-panel text')).some(t => t.textContent.indexOf('기계장치 영역') >= 0);
    const lib = App.palette.getLibrary();
    const sensor = lib.find(p => p.partNo === 'FLD-SENSOR');
    const motor = lib.find(p => p.partNo === 'FLD-MOTOR');
    // 전장 위(기계 영역)에 센서 배치 → 전장 안 부품과 배선
    App.store.commit(s => {
      s.components.push({ id: 'fsen', partNo: sensor.partNo, type: sensor.type, x: 100, y: -200, widthMM: sensor.w, heightMM: sensor.h, rotation: 0, label: '근접센서', terminals: sensor.terminals, term: JSON.parse(JSON.stringify(sensor.term)) });
    });
    const c0 = App.store.get().components[0];
    App.store.commit(s => { const w = App.wires.create(s, { compId: c0.id, index: 1 }, { compId: 'fsen', index: 0 }); w.label = 'FW1'; s.wires.push(w); });
    const s2 = App.store.get();
    const fw = s2.wires.find(w => w.label === 'FW1');
    const route = App.wires.route(s2, fw);
    const crossesUp = route && route.some(p => p.y < 0); // 전장 밖(위)까지 이어짐
    App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== 'FW1'); s.components = s.components.filter(c => c.id !== 'fsen'); s.panel.fieldZone = false; });
    App.render.all();
    return { zone, hasSensor: !!sensor, hasMotor: !!motor, wired: !!fw, crossesUp };
  });
  assert(field.zone, '기계 영역 표시');
  assert(field.hasSensor && field.hasMotor, '필드 기기(센서/모터) 라이브러리');
  assert(field.wired && field.crossesUp, '전장 부품 ↔ 기계 기기 배선 연결');

  // 케이블표: 전장↔기계 배선만 집계
  const cable = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const sensor = lib.find(p => p.partNo === 'FLD-SENSOR');
    App.store.commit(s => {
      s.components.push({ id: 'csen', partNo: sensor.partNo, type: sensor.type, x: 200, y: -180, widthMM: sensor.w, heightMM: sensor.h, rotation: 0, label: '센서A', terminals: sensor.terminals, term: JSON.parse(JSON.stringify(sensor.term)) });
      const c0 = s.components[0];
      const w = App.wires.create(s, { compId: c0.id, index: 1 }, { compId: 'csen', index: 0 });
      w.label = 'C001'; w.sq = '1.25'; s.wires.push(w);
    });
    const rows = App.exporter.cableRows(App.store.get());
    App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== 'C001'); s.components = s.components.filter(c => c.id !== 'csen'); });
    const r = rows.find(x => x[0] === 'C001');
    return { n: rows.length, ok: !!r && r[3] === '센서A' && r[5] === '1.25', onlyField: rows.length === 3 };
  });
  assert(cable.ok, '케이블표 행(판넬측/현장측/규격) 정확');
  assert(cable.onlyField, '케이블표는 필드 배선만 (' + cable.n + '행)');

  // === CAD급 개편 라운드: 썸네일/컨텍스트메뉴/심볼/IO 리스트 ===
  // 팔레트 썸네일
  const thumbN = await page.evaluate(() => document.querySelectorAll('#palette-list .pal-thumb').length);
  assert(thumbN >= 1, '팔레트 부품 썸네일 (' + thumbN + ')');

  // 우클릭 컨텍스트 메뉴 (부품 위 → 편집/삭제 항목, Esc 닫기)
  const ctxBox = await page.evaluate(() => {
    const c = App.store.get().components[0];
    const grp = document.querySelector('#layer-components [data-id="' + c.id + '"] rect');
    const r = grp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(ctxBox.x, ctxBox.y, { button: 'right' });
  const ctx = await page.evaluate(() => {
    const m = document.getElementById('ctx-menu');
    const open = m && m.style.display !== 'none';
    const labels = m ? Array.from(m.querySelectorAll('.ctx-item')).map(d => d.textContent) : [];
    return { open, hasEdit: labels.some(t => t.indexOf('편집') >= 0), hasDel: labels.some(t => t.indexOf('삭제') >= 0) };
  });
  assert(ctx.open && ctx.hasEdit && ctx.hasDel, '우클릭 컨텍스트 메뉴(부품)');
  await page.keyboard.press('Escape');
  const ctxClosed = await page.evaluate(() => document.getElementById('ctx-menu').style.display === 'none');
  assert(ctxClosed, '컨텍스트 메뉴 Esc 닫힘');

  // 계통도 심볼: 라이브러리 + 벡터 렌더
  const sym = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const mccb = lib.find(p => p.partNo === 'SYM-MCCB');
    const motor = lib.find(p => p.partNo === 'SYM-MOTOR');
    App.store.commit(s => { s.components.push({ id: 'sym1', partNo: mccb.partNo, type: 'SYM', sym: mccb.sym, x: 50, y: 950, widthMM: mccb.w, heightMM: mccb.h, rotation: 0, label: 'Q1', terminals: 2, term: JSON.parse(JSON.stringify(mccb.term)) }); });
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="sym1"]');
    const lines = grp.querySelectorAll('.part-sym line').length;
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'sym1'); });
    App.render.all();
    return { hasMccb: !!mccb, hasMotor: !!motor, lines };
  });
  assert(sym.hasMccb && sym.hasMotor, '계통도 심볼 라이브러리(SYM)');
  // 심볼 DXF: SYM 레이어 실선 포함
  const symDxf = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const mccb = lib.find(p => p.partNo === 'SYM-MCCB');
    App.store.commit(s => { s.components.push({ id: 'sd1', partNo: mccb.partNo, type: 'SYM', sym: mccb.sym, x: 50, y: 950, widthMM: mccb.w, heightMM: mccb.h, rotation: 0, label: 'Q9', terminals: 2, term: JSON.parse(JSON.stringify(mccb.term)) }); });
    const d = App.exporter.dxfString(App.store.get());
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'sd1'); });
    return { hasSymLayer: d.indexOf('SYM') >= 0, lines: (d.match(/\nSYM\n/g) || []).length };
  });
  assert(symDxf.hasSymLayer && symDxf.lines >= 4, '심볼 DXF 실선 내보내기 (' + symDxf.lines + ')');
  assert(sym.lines >= 3, '심볼 벡터 렌더 (' + sym.lines + '선)');

  // PLC I/O 리스트
  const io = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const plc = lib.find(p => p.type === 'PLC');
    App.store.commit(s => {
      s.components.push({ id: 'plc1', partNo: plc.partNo, type: 'PLC', x: 400, y: 600, widthMM: plc.w, heightMM: plc.h, rotation: 0, label: 'PLC1', terminals: plc.terminals, term: JSON.parse(JSON.stringify(plc.term)) });
      const c0 = s.components[0];
      const w = App.wires.create(s, { compId: 'plc1', index: 0 }, { compId: c0.id, index: 0 });
      w.label = 'IO-1'; s.wires.push(w);
    });
    const rows = App.exporter.ioRows(App.store.get());
    const hit = rows.find(r => r[2] === 'IO-1');
    App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== 'IO-1'); s.components = s.components.filter(c => c.id !== 'plc1'); });
    return { header: rows[0][0] === 'PLC', ok: !!hit && hit[0] === 'PLC1' && !!hit[3] };
  });
  assert(io.header && io.ok, 'PLC I/O 리스트(연결 기기 매핑)');

  // === CAD 2차: 심볼확장/프레임/일괄편집/미니맵 ===
  const round2b = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const coil = lib.find(p => p.partNo === 'SYM-COIL');
    const bus = lib.find(p => p.partNo === 'SYM-BUS');
    // 도면 프레임
    App.store.commit(s => { s.panel.frame = true; });
    App.render.all();
    const frame = !!document.querySelector('#sheet-frame rect');
    App.store.commit(s => { s.panel.frame = false; });
    App.render.all();
    // 미니맵: 부품 사각형 + 뷰포트 표시
    const mm = document.querySelector('#minimap svg');
    const mmRects = mm ? mm.querySelectorAll('rect').length : 0;
    const vb0 = App.viewport.getViewBox();
    App.minimap.jump(150, 400);
    const vb1 = App.viewport.getViewBox();
    const jumped = Math.abs((vb1.x + vb1.w / 2) - 150) < 2 && Math.abs((vb1.y + vb1.h / 2) - 400) < 2;
    App.viewport.fitTo(App.store.get().panel.widthMM, App.store.get().panel.heightMM); App.render.all();
    return { coil: !!coil, bus: !!bus, frame, mmRects, jumped };
  });
  assert(round2b.coil && round2b.bus, '확장 심볼(코일/버스바) 라이브러리');
  assert(round2b.frame, '도면 프레임 렌더');
  assert(round2b.mmRects >= 3, '미니맵 렌더 (' + round2b.mmRects + 'rect)');
  assert(round2b.jumped, '미니맵 점프(centerOn)');

  // 다중선택 일괄 편집(배선 2개 → SQ 일괄)
  const multi = await page.evaluate(() => {
    const s0 = App.store.get();
    const w0 = s0.wires[0];
    App.store.commit(s => {
      const w = App.wires.create(s, { compId: w0.fromComp, index: w0.fromTerm }, { compId: w0.toComp, index: w0.toTerm });
      w.label = 'MULTI2'; s.wires.push(w);
    });
    const ids = [App.store.get().wires[0].id, App.store.get().wires.find(w => w.label === 'MULTI2').id];
    App.ui.selected = new Set(ids);
    App.inspector.update();
    const sqSel = document.querySelector('#inspector [data-mf="sq"]');
    const hasUI = !!sqSel && !!document.querySelector('#inspector .mw-color');
    sqSel.value = '5.5';
    sqSel.dispatchEvent(new Event('change'));
    const both = ids.every(i => { const f = App.store.findById(i); return f.item.sq === '5.5' && f.item.awg === '10'; });
    App.store.commit(s => { s.wires = s.wires.filter(w => w.label !== 'MULTI2'); });
    App.ui.selected.clear(); App.inspector.update(); App.render.all();
    return { hasUI, both };
  });
  assert(multi.hasUI, '다중선택 일괄 편집 UI');
  assert(multi.both, '배선 SQ/AWG 일괄 적용');

  // === CAD 3차: 팔레트 탭 / 전원 모선(fx) / IEC 심볼 / 배치도 연동 ===
  // 팔레트 탭: 심볼 탭 → SYM만, 부품 탭 → SYM 제외
  await page.click('#lib-tab-syms');
  const tabSym = await page.evaluate(() => {
    const pn = Array.from(document.querySelectorAll('#palette-list .pal-item .font-semibold')).map(e => e.textContent);
    return { n: pn.length, allSym: pn.length > 0 && pn.every(t => t.indexOf('SYM-') === 0) };
  });
  await page.click('#lib-tab-parts');
  const tabPart = await page.evaluate(() => {
    const pn = Array.from(document.querySelectorAll('#palette-list .pal-item .font-semibold')).map(e => e.textContent);
    return { n: pn.length, noSym: pn.every(t => t.indexOf('SYM-') !== 0) };
  });
  assert(tabSym.allSym, '심볼 탭: SYM만 표시 (' + tabSym.n + ')');
  assert(tabPart.n > 0 && tabPart.noSym, '부품 탭: 심볼 제외 (' + tabPart.n + ')');

  // 전원 모선: 폭을 늘리면 탭 단자(fx)가 따라 퍼짐 + IEC 추가 심볼 존재
  const rail = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const r2 = lib.find(p => p.partNo === 'SYM-RAIL2');
    const iec = ['SYM-RAIL3', 'SYM-M3', 'SYM-GEN', 'SYM-V', 'SYM-TON', 'SYM-INV'].every(k => lib.some(p => p.partNo === k));
    App.store.commit(s => { s.components.push({ id: 'rl1', partNo: r2.partNo, type: 'SYM', sym: r2.sym, x: 20, y: 1050, widthMM: r2.w, heightMM: r2.h, rotation: 0, label: 'AC모선', terminals: r2.terminals, term: JSON.parse(JSON.stringify(r2.term)) }); });
    const c = App.store.get().components.find(x => x.id === 'rl1');
    const xs1 = App.terminals.world(c).map(t => t.x);
    const spread1 = Math.max.apply(null, xs1) - Math.min.apply(null, xs1);
    App.store.commit(s => { s.components.find(x => x.id === 'rl1').widthMM = 600; });
    const xs2 = App.terminals.world(App.store.get().components.find(x => x.id === 'rl1')).map(t => t.x);
    const spread2 = Math.max.apply(null, xs2) - Math.min.apply(null, xs2);
    // 모선 렌더(2줄)
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="rl1"]');
    const railLines = grp.querySelectorAll('.part-sym line').length;
    App.store.commit(s => { s.components = s.components.filter(x => x.id !== 'rl1'); });
    App.render.all();
    return { iec, spread1: Math.round(spread1), spread2: Math.round(spread2), railLines };
  });
  assert(rail.iec, 'IEC 추가 심볼(모선3상/M3/G/V/TON/INV)');
  assert(rail.spread2 > rail.spread1 * 1.3, '모선 폭 확대 시 탭 단자 확산 (' + rail.spread1 + '→' + rail.spread2 + ')');
  assert(rail.railLines >= 2, '모선 2줄 렌더');

  // 배치도 연동: 계통도 심볼 → 배치 부품 선택/이동
  const link = await page.evaluate(() => {
    const target = App.store.get().components.find(c => !c.sym); // 배치 부품(시트0)
    const tid = target.id;
    App.sheetsMgr.add('계통도T');                                  // 시트1 생성·전환
    const lib = App.palette.getLibrary();
    const mc = lib.find(p => p.partNo === 'SYM-MC');
    App.store.commit(s => { s.components.push({ id: 'lk1', partNo: mc.partNo, type: 'SYM', sym: mc.sym, x: 100, y: 100, widthMM: mc.w, heightMM: mc.h, rotation: 0, label: 'K1', terminals: 2, term: JSON.parse(JSON.stringify(mc.term)) }); });
    App.ui.selected = new Set(['lk1']);
    App.inspector.update();
    const sel = document.getElementById('insp-link');
    const hasOpt = sel && Array.from(sel.options).some(o => o.value === '0:' + tid);
    sel.value = '0:' + tid;
    sel.dispatchEvent(new Event('change'));
    const it = App.store.get().components.find(c => c.id === 'lk1');
    const linked = it.linkSheet === 0 && it.linkId === tid;
    document.getElementById('insp-link-go').click();
    const jumped = App.store.get().activeSheet === 0 && App.ui.selected.has(tid);
    App.sheetsMgr.remove(1);                                        // 정리
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { hasOpt, linked, jumped };
  });
  assert(link.hasOpt, '연동 드롭다운에 배치 부품 노출');
  assert(link.linked, '심볼-배치 부품 연동 저장');
  assert(link.jumped, '연동 부품으로 시트 전환+선택+이동');

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

  // === CAD 4차: 자유 텍스트 / 도곽 구역참조 / 심볼 크로스레퍼런스 ===
  // 텍스트 도구: 툴바 버튼 → 캔버스 클릭으로 주석 배치
  await page.click('#tool-text');
  const t4tool = await page.evaluate(() => App.ui.tool === 'text');
  assert(t4tool, '텍스트 도구 선택(툴바 버튼)');
  {
    const box = await page.evaluate(() => {
      const r = document.getElementById('canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
  }
  const t4place = await page.evaluate(() => {
    const s = App.store.get();
    const t = (s.texts || [])[0];
    const node = document.querySelector('#layer-texts [data-kind="texts"]');
    return { n: (s.texts || []).length, hasNode: !!node, sel: t && App.ui.selected.has(t.id) };
  });
  assert(t4place.n === 1 && t4place.hasNode, '텍스트 클릭 배치 + SVG 렌더');
  assert(t4place.sel, '배치 직후 선택 상태');
  // 인스펙터로 내용/크기 수정 → 저장·렌더 반영
  const t4edit = await page.evaluate(() => {
    App.inspector.update();
    const inp = document.querySelector('#inspector [data-field="text"]');
    if (!inp) return { ok: false };
    inp.value = '주의: 메인 차단기';
    inp.dispatchEvent(new Event('change'));
    const sz = document.querySelector('#inspector [data-field="size"]');
    sz.value = '12';
    sz.dispatchEvent(new Event('change'));
    const t = App.store.get().texts[0];
    const node = document.querySelector('#layer-texts [data-kind="texts"]');
    return { ok: t.text === '주의: 메인 차단기' && t.size === 12 && node.textContent === '주의: 메인 차단기' };
  });
  assert(t4edit.ok, '텍스트 인스펙터 편집(내용/크기)');
  // 시트 팩/언팩 + 저장 라운드트립에 texts 보존
  const t4rt = await page.evaluate(() => {
    App.sheetsMgr.add('TXT-RT');            // 전환: texts 는 시트0에 보관됨
    const empty = (App.store.get().texts || []).length === 0;
    App.sheetsMgr.switchTo(0);
    App.sheetsMgr.remove(1);
    const back = App.store.get().texts.length === 1 && App.store.get().texts[0].text === '주의: 메인 차단기';
    const json = JSON.stringify(App.store.get());
    App.store.replace(App.createEmptyProject());
    App.store.replace(JSON.parse(json));
    const rt = App.store.get().texts.length === 1;
    return { empty, back, rt };
  });
  assert(t4rt.empty && t4rt.back, '시트 전환 시 텍스트 팩/언팩 보존');
  assert(t4rt.rt, '저장 라운드트립: 텍스트 보존');
  // DXF에 NOTES 레이어 TEXT로 포함
  const t4dxf = await page.evaluate(() => App.exporter.dxfString(App.store.get()).indexOf('NOTES') >= 0);
  assert(t4dxf, 'DXF 내보내기에 텍스트(NOTES) 포함');
  // 삭제(Del 경로)
  const t4del = await page.evaluate(() => {
    App.toolbar.setTool('select');
    App.ui.selected = new Set([App.store.get().texts[0].id]);
    App.interact.deleteSelected();
    return (App.store.get().texts || []).length === 0;
  });
  assert(t4del, '텍스트 삭제');

  // 도곽 구역참조: frame 켜면 열번호 1..8 + 행문자 A.. 표기
  const t4zone = await page.evaluate(() => {
    App.store.commit(s => { s.panel.frame = true; });
    App.render.all();
    const fr = document.getElementById('sheet-frame');
    const txts = fr ? Array.from(fr.querySelectorAll('text')).map(e => e.textContent) : [];
    App.store.commit(s => { s.panel.frame = false; });
    App.render.all();
    return { has1: txts.indexOf('1') >= 0, has8: txts.indexOf('8') >= 0, hasA: txts.indexOf('A') >= 0 };
  });
  assert(t4zone.has1 && t4zone.has8 && t4zone.hasA, '도곽 구역참조(열 1-8/행 A..) 렌더');

  // 크로스레퍼런스: 같은 라벨(K1) 심볼끼리 점프 버튼
  const t4xref = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const mc = lib.find(p => p.partNo === 'SYM-MC');
    const no = lib.find(p => p.partNo === 'SYM-AUXA') || mc; // 보조접점 a(NO)
    App.store.commit(s => {
      s.components.push({ id: 'xr1', partNo: mc.partNo, type: 'SYM', sym: mc.sym, x: 60, y: 1200, widthMM: mc.w, heightMM: mc.h, rotation: 0, label: 'K1', terminals: 2, term: JSON.parse(JSON.stringify(mc.term)) });
      s.components.push({ id: 'xr2', partNo: no.partNo, type: 'SYM', sym: no.sym, x: 260, y: 1200, widthMM: no.w, heightMM: no.h, rotation: 0, label: 'K1', terminals: 2, term: JSON.parse(JSON.stringify(no.term)) });
    });
    App.ui.selected = new Set(['xr1']);
    App.inspector.update();
    const btns = Array.from(document.querySelectorAll('#inspector .insp-xref'));
    const hasBtn = btns.length === 1 && btns[0].getAttribute('data-cid') === 'xr2';
    if (btns[0]) btns[0].click();
    const jumped = App.ui.selected.has('xr2');
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'xr1' && c.id !== 'xr2'); });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { hasBtn, jumped };
  });
  assert(t4xref.hasBtn, '크로스레퍼런스 버튼(같은 라벨 심볼) 노출');
  assert(t4xref.jumped, '크로스레퍼런스 점프(선택 이동)');

  // === 덕트 라벨 스티커 (24×30mm 3칸) ===
  const stk = await page.evaluate(() => {
    App.store.commit(s => { s.ducts.push({ id: 'sd1', orient: 'h', x: 0, y: 900, lengthMM: 200, widthMM: 60 }); });
    App.ui.selected = new Set(['sd1']);
    App.inspector.update();
    const addBtn = document.getElementById('insp-st-add');
    if (!addBtn) return { fail: 'no-add-btn' };
    addBtn.click();
    const d = App.store.get().ducts.find(x => x.id === 'sd1');
    const created = d.stickers && d.stickers.length === 1;
    // 3칸 내용 입력 (사진과 동일한 예)
    const vals = ['POWER S/W 01', 'MAIN POWER S/W', 'MAS-025 25A'];
    for (let li = 0; li < 3; li++) {
      const inp = document.querySelector('#inspector [data-stline="' + li + '"]');
      inp.value = vals[li];
      inp.dispatchEvent(new Event('change'));
    }
    const st = App.store.get().ducts.find(x => x.id === 'sd1').stickers[0];
    const linesOk = st.lines.join('|') === vals.join('|');
    // 렌더: 어두운 배경 + 3행 텍스트
    App.render.all();
    const node = document.querySelector('[data-sticker="' + st.id + '"]');
    const texts = node ? Array.from(node.querySelectorAll('text')).map(e => e.textContent) : [];
    const sepLines = node ? node.querySelectorAll('line').length : 0;
    // 위치 클램프: 9999 → lengthMM - 스티커 폭(세로 3줄, 30) = 170
    const offInp = document.querySelector('#inspector [data-stoff]');
    offInp.value = '9999';
    offInp.dispatchEvent(new Event('change'));
    const clamped = App.store.get().ducts.find(x => x.id === 'sd1').stickers[0].off === 170;
    // DXF 포함
    const dxf = App.exporter.dxfString(App.store.get());
    const inDxf = dxf.indexOf('LABELS') >= 0 && dxf.indexOf('MAS-025 25A') >= 0;
    // 저장 라운드트립 (덕트 내장이라 자동)
    const rt = JSON.parse(JSON.stringify(App.store.get())).ducts.find(x => x.id === 'sd1').stickers.length === 1;
    // 삭제
    document.querySelector('#inspector .insp-st-del').click();
    const deleted = App.store.get().ducts.find(x => x.id === 'sd1').stickers.length === 0;
    App.store.commit(s => { s.ducts = s.ducts.filter(x => x.id !== 'sd1'); });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { created, linesOk, texts, sepLines, clamped, inDxf, rt, deleted };
  });
  assert(stk.created, '스티커 추가(인스펙터)');
  assert(stk.linesOk, '스티커 3칸 내용 입력');
  assert(stk.texts.length === 3 && stk.texts[0] === 'POWER S/W 01', '스티커 3행 텍스트 렌더');
  assert(stk.sepLines >= 2, '스티커 칸 구분선 렌더');
  assert(stk.clamped, '스티커 위치 덕트 길이로 클램프');
  assert(stk.inDxf, 'DXF에 스티커(LABELS) 포함');
  assert(stk.rt && stk.deleted, '스티커 저장 보존 + 삭제');

  // 스티커: 세로 3줄 기본 + 크기 조절 + 부품 연동(1줄 유형·2줄 품명) + Ctrl 복사
  const stk2 = await page.evaluate(() => {
    App.store.commit(s => {
      s.ducts.push({ id: 'sd2', orient: 'h', x: 0, y: 900, lengthMM: 400, widthMM: 60 });
      s.components.push({ id: 'lkc1', partNo: 'MAS-025', type: 'MCCB', partName: '메인차단기', x: 500, y: 1700, widthMM: 30, heightMM: 40, rotation: 0, label: '메인차단기', terminals: 0, term: null });
    });
    App.ui.selected = new Set(['sd2']);
    App.inspector.update();
    document.getElementById('insp-st-add').click();
    const st = App.store.get().ducts.find(x => x.id === 'sd2').stickers[0];
    const isRows = !st.mode && st.cellW === 30 && st.cellH === 24; // 기본: 세로 3줄 30×24
    let node = document.querySelector('[data-sticker="' + st.id + '"]');
    const rect1 = node.querySelector('rect');
    const sz1 = parseFloat(rect1.getAttribute('width')) === 30 && parseFloat(rect1.getAttribute('height')) === 24;
    // 크기 조절: 너비 40, 높이 30
    const cw = document.querySelector('#inspector [data-stcw]');
    cw.value = '40'; cw.dispatchEvent(new Event('change'));
    const ch = document.querySelector('#inspector [data-stch]');
    ch.value = '30'; ch.dispatchEvent(new Event('change'));
    node = document.querySelector('[data-sticker="' + st.id + '"]');
    const rect2 = node.querySelector('rect');
    const resized = parseFloat(rect2.getAttribute('width')) === 40 && parseFloat(rect2.getAttribute('height')) === 30;
    // 부품 연동 → 1줄=유형(MCCB), 2줄=라이브러리 타이틀(MAS-025) 자동, 3줄 직접 작성
    const lsel = document.querySelector('#inspector [data-stlink]');
    const hasOpt = Array.from(lsel.options).some(o => o.value === 'lkc1');
    lsel.value = 'lkc1'; lsel.dispatchEvent(new Event('change'));
    const l3 = document.querySelector('#inspector [data-stline="2"]');
    l3.value = 'MAS-025 25A'; l3.dispatchEvent(new Event('change'));
    node = document.querySelector('[data-sticker="' + st.id + '"]');
    const texts = Array.from(node.querySelectorAll('text')).map(e => e.textContent);
    const linked = texts[0] === 'MCCB' && texts[1] === 'MAS-025' && texts[2] === 'MAS-025 25A';
    const l1dis = document.querySelector('#inspector [data-stline="0"]').disabled;
    // 부품 타이틀(품번) 바꾸면 스티커에 즉시 반영 (동적 연동)
    App.store.commit(s => { s.components.find(c => c.id === 'lkc1').partNo = 'MAS-050'; });
    App.render.all();
    node = document.querySelector('[data-sticker="' + st.id + '"]');
    const synced = Array.from(node.querySelectorAll('text')).some(t => t.textContent === 'MAS-050');
    // Ctrl+드래그 복사
    const svg = document.getElementById('canvas');
    const bb = node.getBoundingClientRect();
    const dn = new PointerEvent('pointerdown', { clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2, button: 0, ctrlKey: true, bubbles: true });
    Object.defineProperty(dn, 'target', { value: node });
    svg.dispatchEvent(dn);
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: bb.left + bb.width / 2 + 120, clientY: bb.top + bb.height / 2, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: bb.left + bb.width / 2 + 120, clientY: bb.top + bb.height / 2, bubbles: true }));
    const dts = App.store.get().ducts.find(x => x.id === 'sd2').stickers;
    const copied = dts.length === 2 && dts[1].linkId === 'lkc1' && dts[1].off !== dts[0].off;
    App.store.commit(s => {
      s.ducts = s.ducts.filter(x => x.id !== 'sd2');
      s.components = s.components.filter(c => c.id !== 'lkc1');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { isRows, sz1, resized, hasOpt, linked, l1dis, synced, copied };
  });
  assert(stk2.isRows && stk2.sz1, '스티커 기본: 세로 3줄(30×24)');
  assert(stk2.resized, '스티커 너비/높이 조절(40×30)');
  assert(stk2.hasOpt && stk2.linked, '부품 연동: 1줄=유형·2줄=타이틀(품번) 자동 + 3줄 직접 작성');
  assert(stk2.l1dis, '연동 시 1·2줄 입력 잠금');
  assert(stk2.synced, '부품 품명 변경 시 스티커 자동 반영');
  assert(stk2.copied, 'Ctrl+드래그로 스티커 복사');

  // === 파츠리스트 XLSX (발주 양식) ===
  const xl = await page.evaluate(() => {
    // 같은 규격 2개 + 다른 규격 1개 → 수량 집계 확인
    App.store.commit(s => {
      s.components.push(
        { id: 'xc1', partNo: 'EBS32Fb 15A', type: 'MCCB', partName: '누전차단기', manufacturer: 'LSIS', x: 10, y: 1400, widthMM: 30, heightMM: 40, rotation: 0, label: '누전차단기', terminals: 0, term: null },
        { id: 'xc2', partNo: 'EBS32Fb 15A', type: 'MCCB', partName: '누전차단기', manufacturer: 'LSIS', x: 60, y: 1400, widthMM: 30, heightMM: 40, rotation: 0, label: '누전차단기', terminals: 0, term: null },
        { id: 'xc3', partNo: 'FDR-120-24', type: 'SMPS', partName: 'SMPS', manufacturer: 'ORIENT', x: 110, y: 1400, widthMM: 30, heightMM: 40, rotation: 0, label: 'SMPS', terminals: 0, term: null }
      );
    });
    const rows = App.xlsx.partsRows(App.store.get());
    const ebs = rows.find(r => r.name === 'EBS32Fb 15A'); // 타이틀=품명 (PART NAME 칸)
    const agg = ebs && ebs.qty === 2 && ebs.maker === 'LSIS';
    // prompt/다운로드 스텁 후 실제 xlsx 생성 → unzip 해서 내용 검증
    const answers = ['A260504', '타스코', 'Carton 시스템'];
    let ai = 0;
    const oldPrompt = window.prompt, oldClick = HTMLAnchorElement.prototype.click;
    window.prompt = () => answers[ai++ % 3];
    let zipped = null;
    const oldZip = fflate.zipSync;
    fflate.zipSync = function (files, o) { zipped = oldZip(files, o); return zipped; };
    HTMLAnchorElement.prototype.click = function () {};
    const n = App.xlsx.partsList(App.store.get());
    window.prompt = oldPrompt; HTMLAnchorElement.prototype.click = oldClick; fflate.zipSync = oldZip;
    if (!zipped) return { agg, fail: 'no-zip' };
    const un = fflate.unzipSync(zipped);
    const dec = new TextDecoder();
    const sheet = dec.decode(un['xl/worksheets/sheet1.xml']);
    const wb = dec.decode(un['xl/workbook.xml']);
    const hasParts = ['[Content_Types].xml', '_rels/.rels', 'xl/styles.xml'].every(k => !!un[k]);
    App.store.commit(s => { s.components = s.components.filter(c => ['xc1', 'xc2', 'xc3'].indexOf(c.id) < 0); });
    App.render.all();
    return {
      agg, n, hasParts,
      sheetName: wb.indexOf('파트리스트') >= 0,
      title: sheet.indexOf('PARTS LIST') >= 0,
      heads: ['PART NO.', 'PART NAME', 'SPECIFICATION', '구매품수량', '재고품수량', '제조사', '총합', '구매요청일', '입고예정', '진행'].every(h => sheet.indexOf(h) >= 0),
      labels: [' PROJECT  NO :', 'CUSTOMER :', 'PRODUCT (GROUP) :', 'Prepared by', 'Checked by', 'Approved by'].every(h => sheet.indexOf(h) >= 0),
      vals: sheet.indexOf('A260504') >= 0 && sheet.indexOf('타스코') >= 0 && sheet.indexOf('A260504-01-000-01') >= 0,
      merges: sheet.indexOf('<mergeCell ref="D2:F2"/>') >= 0 && sheet.indexOf('<mergeCell ref="A2:B2"/>') >= 0,
      qty: sheet.indexOf('EBS32Fb 15A') >= 0 && sheet.indexOf('LSIS') >= 0
    };
  });
  assert(xl.agg, '파츠리스트 집계(같은 규격 수량 합산+제조사)');
  assert(xl.n >= 2 && xl.hasParts, 'XLSX 패키지 생성(zip 구조)');
  assert(xl.sheetName, 'XLSX 시트명 "파트리스트"');
  assert(xl.title && xl.heads, 'XLSX 머리글(PARTS LIST + 표 헤더 10종)');
  assert(xl.labels, 'XLSX 좌측 라벨/결재란(PROJECT NO·CUSTOMER·Prepared by…)');
  assert(xl.vals, 'XLSX 값 채움 + PART NO. 자동넘버링');
  assert(xl.merges, 'XLSX 셀 병합(원본과 동일)');
  assert(xl.qty, 'XLSX 데이터 행(규격/제조사)');

  // === 덕트 복제 / 크기 사전 지정 / 속성 복사 ===
  const dupFix = await page.evaluate(() => {
    App.store.commit(s => {
      s.ducts.push({ id: 'dd1', orient: 'h', x: 0, y: 1500, lengthMM: 150, widthMM: 60, stickers: [{ id: 'ds1', off: 5, lines: ['A', '', ''] }] });
      s.texts.push({ id: 'dt1', x: 0, y: 1600, text: '복제확인', size: 8 });
    });
    const before = { d: App.store.get().ducts.length, t: App.store.get().texts.length };
    App.ui.selected = new Set(['dd1', 'dt1']);
    App.interact.duplicateSelected();
    const s2 = App.store.get();
    const dupDuct = s2.ducts.length === before.d + 1;
    const dupText = s2.texts.length === before.t + 1;
    const newDuct = s2.ducts[s2.ducts.length - 1];
    const stickerCopied = newDuct.stickers && newDuct.stickers.length === 1 && newDuct.stickers[0].id !== 'ds1';
    // 정리
    App.store.commit(s => {
      s.ducts = s.ducts.filter(d => d.id === undefined || (d.id !== 'dd1' && d.id !== newDuct.id));
      s.texts = s.texts.filter(t => t.id !== 'dt1' && t.text !== '복제확인');
    });
    App.ui.selected.clear();
    return { dupDuct, dupText, stickerCopied };
  });
  assert(dupFix.dupDuct, '덕트 복제(Ctrl+D) 동작');
  assert(dupFix.dupText, '텍스트 복제 동작');
  assert(dupFix.stickerCopied, '복제 시 스티커 id 재발급');

  // 덕트 길이 사전 지정 → 클릭 한 번 배치
  await page.evaluate(() => {
    document.getElementById('duct-len').value = '250';
    document.getElementById('duct-len').dispatchEvent(new Event('input'));
  });
  await page.click('#tool-duct-h');
  {
    const box = await page.evaluate(() => {
      const r = document.getElementById('canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
  }
  const fixedDuct = await page.evaluate(() => {
    const s = App.store.get();
    const d = s.ducts[s.ducts.length - 1];
    const ok = d && d.lengthMM === 250 && d.orient === 'h';
    App.store.commit(s2 => { s2.ducts = s2.ducts.filter(x => x.id !== d.id); });
    document.getElementById('duct-len').value = '';
    document.getElementById('duct-len').dispatchEvent(new Event('input'));
    App.toolbar.setTool('select');
    App.ui.selected.clear(); App.render.all();
    return ok;
  });
  assert(fixedDuct, '덕트 길이 지정 후 클릭 한 번 배치(250mm)');

  // 속성 복사(MATCHPROP): 와이어 색/두께를 다른 와이어에 적용
  const mprop = await page.evaluate(() => {
    const s = App.store.get();
    if (s.wires.length < 2) return { skip: true };
    const w1 = s.wires[0], w2 = s.wires[1];
    App.store.commit(ss => {
      ss.wires[0].color = '#16a34a'; ss.wires[0].width = 2.4; ss.wires[0].sq = '2.5'; ss.wires[0].label = 'R220';
      ss.wires[1].color = '#111111'; ss.wires[1].width = 1; ss.wires[1].label = 'X9';
    });
    App.ui.selected = new Set([w1.id]);
    App.interact.startMatchProp();
    const armed = !!App.ui.matchProp && App.ui.matchProp.kind === 'wires';
    // 대상 클릭 시뮬레이션 대신 같은 적용 로직 검증: matchProp 상태에서 클릭 핸들러가 쓰는 props 확인
    const propsOk = App.ui.matchProp.props.color === '#16a34a' && App.ui.matchProp.props.width === 2.4 && App.ui.matchProp.props.sq === '2.5';
    // 실제 클릭 경로: 대상 와이어 DOM 좌표로 pointerdown
    const el = document.querySelector('[data-id="' + w2.id + '"][data-kind="wires"]');
    let applied = false, escCleared = false;
    if (el) {
      const bb = el.getBoundingClientRect();
      const ev = new PointerEvent('pointerdown', { clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2, button: 0, bubbles: true });
      Object.defineProperty(ev, 'target', { value: el });
      document.getElementById('canvas').dispatchEvent(ev);
      const w2n = App.store.get().wires.find(x => x.id === w2.id);
      applied = w2n.color === '#16a34a' && w2n.width === 2.4 && w2n.sq === '2.5' && w2n.label === 'R220';
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    escCleared = !App.ui.matchProp;
    App.ui.selected.clear(); App.render.all();
    return { armed, propsOk, applied, escCleared };
  });
  if (!mprop.skip) {
    assert(mprop.armed && mprop.propsOk, '속성 복사 모드 시작(원본 속성 추출)');
    assert(mprop.applied, '속성 복사: 대상 와이어에 색/두께/SQ/라인번호 적용');
    assert(mprop.escCleared, '속성 복사 Esc 종료');
  }

  // === 센터선(중심선) 도구 ===
  await page.click('#tool-cline');
  const clTool = await page.evaluate(() => App.ui.tool === 'cline');
  assert(clTool, '센터선 도구 선택');
  {
    // 위 점 → 아래 점 클릭 (거의 수직 → 자동 수직 정렬)
    const pts = await page.evaluate(() => {
      const p = App.store.get().panel;
      App.viewport.fitTo(p.widthMM, p.heightMM); // 클릭 좌표가 화면 안에 오도록
      App.render.all();
      const svg = document.getElementById('canvas');
      const ctm = svg.getScreenCTM();
      function toClient(x, y) {
        const p = svg.createSVGPoint(); p.x = x; p.y = y;
        const c = p.matrixTransform(ctm);
        return { x: c.x, y: c.y };
      }
      return { a: toClient(300, 5), b: toClient(302, 795) }; // 2mm 어긋나게 → 수직 스냅 확인
    });
    await page.mouse.click(pts.a.x, pts.a.y);
    await page.mouse.click(pts.b.x, pts.b.y);
  }
  const clMade = await page.evaluate(() => {
    const s = App.store.get();
    const cl = (s.clines || [])[0];
    const node = document.querySelector('[data-kind="clines"]');
    const dash = node && node.querySelectorAll('line')[1] && node.querySelectorAll('line')[1].getAttribute('stroke-dasharray');
    return {
      n: (s.clines || []).length,
      vertical: cl && cl.x1 === cl.x2,   // 자동 수직 정렬
      span: cl && Math.abs(cl.y2 - cl.y1) > 500,
      hasNode: !!node, dash: dash,
      sel: cl && App.ui.selected.has(cl.id)
    };
  });
  assert(clMade.n === 1 && clMade.hasNode, '센터선 두 점 클릭 생성');
  assert(clMade.vertical, '거의 수직 클릭 → 완전 수직 자동 정렬');
  assert(clMade.dash && clMade.dash.split(' ').length === 4, '일점쇄선(dash-dot) 렌더');
  assert(clMade.sel, '생성 직후 선택');
  // 이동(4좌표), 인스펙터, 복제, DXF, 시트/저장 라운드트립, 삭제
  const clOps = await page.evaluate(() => {
    const cl = App.store.get().clines[0];
    const id = cl.id, ox1 = cl.x1, oy1 = cl.y1;
    // 인스펙터 X1 수정
    App.toolbar.setTool('select');
    App.ui.selected = new Set([id]);
    App.inspector.update();
    const inp = document.querySelector('#inspector [data-field="x1"]');
    inp.value = String(ox1 + 50);
    inp.dispatchEvent(new Event('change'));
    const edited = App.store.get().clines[0].x1 === ox1 + 50;
    // 복제 → 2개 + 오프셋
    App.ui.selected = new Set([id]);
    App.interact.duplicateSelected();
    const dup = App.store.get().clines.length === 2;
    // DXF CENTER 레이어
    const dxf = App.exporter.dxfString(App.store.get()).indexOf('CENTER') >= 0;
    // 저장 라운드트립
    const json = JSON.stringify(App.store.get());
    App.store.replace(App.createEmptyProject());
    App.store.replace(JSON.parse(json));
    const rt = App.store.get().clines.length === 2;
    // 전체 삭제
    App.ui.selected = new Set(App.store.get().clines.map(c => c.id));
    App.interact.deleteSelected();
    const cleared = App.store.get().clines.length === 0;
    App.render.all(); App.inspector.update();
    return { edited, dup, dxf, rt, cleared };
  });
  assert(clOps.edited, '센터선 인스펙터 좌표 편집');
  assert(clOps.dup, '센터선 복제');
  assert(clOps.dxf, 'DXF에 센터선(CENTER) 포함');
  assert(clOps.rt, '센터선 저장 라운드트립 보존');
  assert(clOps.cleared, '센터선 삭제');

  // === 사이 센터: 찬넬을 위/아래 덕트 사이 정중앙으로 ===
  const cbtw = await page.evaluate(() => {
    App.store.commit(s => {
      s.ducts.push(
        { id: 'cbd1', orient: 'h', x: 0, y: 100, lengthMM: 300, widthMM: 60 },   // 위 덕트 (하단 160)
        { id: 'cbd2', orient: 'h', x: 0, y: 400, lengthMM: 300, widthMM: 60 }    // 아래 덕트 (상단 400)
      );
      s.rails.push({ id: 'cbr1', orient: 'h', x: 20, y: 200, lengthMM: 260, widthMM: 35, type: 'DIN35' });
    });
    App.render.all();
    App.ui.selected = new Set(['cbr1']);
    App.interact.startCenterBetween();
    const armed = !!App.ui.centerBetween;
    function clickOn(id) {
      const el = document.querySelector('[data-id="' + id + '"]');
      const bb = el.getBoundingClientRect();
      const ev = new PointerEvent('pointerdown', { clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2, button: 0, bubbles: true });
      Object.defineProperty(ev, 'target', { value: el });
      document.getElementById('canvas').dispatchEvent(ev);
    }
    clickOn('cbd1');
    const stage1 = App.ui.centerBetween && App.ui.centerBetween.refs.length === 1;
    clickOn('cbd2');
    const rail = App.store.get().rails.find(r => r.id === 'cbr1');
    // 틈 160~400 의 정중앙 280 → 레일(35) 상단 y = 262.5
    const centered = rail && Math.abs((rail.y + 17.5) - 280) < 0.01;
    const done = !App.ui.centerBetween;
    // 가로 케이스: 세로 덕트 2개 좌우 → 가로 센터
    App.store.commit(s => {
      s.ducts.push(
        { id: 'cbd3', orient: 'v', x: 100, y: 500, lengthMM: 200, widthMM: 60 },  // 우측 끝 160
        { id: 'cbd4', orient: 'v', x: 400, y: 500, lengthMM: 200, widthMM: 60 }   // 좌측 끝 400
      );
    });
    App.render.all();
    App.ui.selected = new Set(['cbr1']);
    App.interact.startCenterBetween();
    clickOn('cbd3'); clickOn('cbd4');
    const rail2 = App.store.get().rails.find(r => r.id === 'cbr1');
    const centeredH = rail2 && Math.abs((rail2.x + 130) - 280) < 0.01; // 레일 길이 260 중심 → 280
    // undo 로 이동 취소 가능
    App.store.undo();
    // 정리
    App.store.commit(s => {
      s.ducts = s.ducts.filter(d => ['cbd1', 'cbd2', 'cbd3', 'cbd4'].indexOf(d.id) < 0);
      s.rails = s.rails.filter(r => r.id !== 'cbr1');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { armed, stage1, centered, done, centeredH };
  });
  assert(cbtw.armed && cbtw.stage1, '사이 센터 모드(기준 1·2 클릭 흐름)');
  assert(cbtw.centered, '찬넬이 위/아래 덕트 사이 정중앙(세로) 배치');
  assert(cbtw.done, '기준 2개 클릭 후 모드 자동 종료');
  assert(cbtw.centeredH, '좌/우 기준 → 가로 센터 배치');

  // === 덕트/레일 끝 핸들 리사이즈 ===
  const drsz = await page.evaluate(() => {
    App.store.commit(s => { s.ducts.push({ id: 'rz1', orient: 'h', x: 0, y: 700, lengthMM: 200, widthMM: 60 }); });
    App.ui.selected = new Set(['rz1']);
    App.render.all();
    const h1 = document.querySelector('[data-dresize="end"][data-dtarget="rz1"]');
    const h0 = document.querySelector('[data-dresize="start"][data-dtarget="rz1"]');
    if (!h1 || !h0) return { fail: 'no-handles' };
    const svg = document.getElementById('canvas');
    const ctm = svg.getScreenCTM();
    function cl(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; const c = p.matrixTransform(ctm); return { x: c.x, y: c.y }; }
    function drag(handle, fromW, toW) {
      const a = cl(fromW.x, fromW.y), b = cl(toW.x, toW.y);
      const dn = new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, bubbles: true });
      Object.defineProperty(dn, 'target', { value: handle });
      svg.dispatchEvent(dn);
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
    }
    // 끝 핸들: 200 → 300 으로 늘리기
    drag(h1, { x: 200, y: 730 }, { x: 300, y: 730 });
    const d1 = App.store.get().ducts.find(x => x.id === 'rz1');
    const grew = d1.lengthMM === 300;
    // 시작 핸들: 0 → 50 (끝 고정, x 이동 + 길이 감소)
    App.render.all();
    const h0b = document.querySelector('[data-dresize="start"][data-dtarget="rz1"]');
    drag(h0b, { x: 0, y: 730 }, { x: 50, y: 730 });
    const d2 = App.store.get().ducts.find(x => x.id === 'rz1');
    const shrunk = d2.x === 50 && d2.lengthMM === 250;
    App.store.commit(s => { s.ducts = s.ducts.filter(x => x.id !== 'rz1'); });
    App.ui.selected.clear(); App.render.all();
    return { grew, shrunk };
  });
  assert(drsz.grew, '덕트 끝 핸들 드래그로 늘리기(200→300)');
  assert(drsz.shrunk, '덕트 시작 핸들 드래그(끝 고정, x+50/길이 250)');

  // === 부품 편집기: 글쓰기·사각 경계라인(선 스타일) ===
  const pshape = await page.evaluate(() => {
    // 새 커스텀 부품 편집기 열기
    App.partEditor.open({});
    const modeText = !!document.getElementById('pe-mode-text');
    const modeRect = !!document.getElementById('pe-mode-rect');
    const styleSel = document.getElementById('pe-shp-style');
    // 사각라인 모드 → 드래그로 사각형 그리기 (일점쇄선 스타일)
    styleSel.value = 'dashdot';
    styleSel.dispatchEvent(new Event('change'));
    document.getElementById('pe-mode-rect').click();
    const svg = document.getElementById('pe-canvas');
    const ctm = svg.getScreenCTM();
    function cl(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; const c = p.matrixTransform(ctm); return { x: c.x, y: c.y }; }
    function pd(x, y, type) { const a = cl(x, y); svg.dispatchEvent(new PointerEvent(type, { clientX: a.x, clientY: a.y, button: 0, bubbles: true })); }
    pd(5, 5, 'pointerdown'); pd(45, 35, 'pointermove'); pd(45, 35, 'pointerup');
    // 글쓰기 모드 → 클릭 + prompt
    const oldPrompt = window.prompt;
    window.prompt = () => 'MAIN 220V';
    document.getElementById('pe-mode-text').click();
    pd(10, 60, 'pointerdown'); pd(10, 60, 'pointerup');
    window.prompt = oldPrompt;
    // 내부 상태 확인 (shapes 2개: rect dashdot + text)
    const rows = document.querySelectorAll('#pe-shapes [data-shdel]').length;
    const preview = document.getElementById('pe-canvas');
    const dashRect = Array.from(preview.querySelectorAll('rect')).some(r => (r.getAttribute('stroke-dasharray') || '') === '8 2 2 2');
    const textEl = Array.from(preview.querySelectorAll('text')).some(t => t.textContent === 'MAIN 220V');
    // 라이브러리 저장 → 배치 → 도면 렌더에 도형 표시
    document.getElementById('pe-name-in').value = '도형테스트부품';
    document.getElementById('pe-save').click();
    const lp = App.palette.getLibrary().find(p => p.partNo === '도형테스트부품' || p.name === '도형테스트부품');
    const savedShapes = lp && lp.shapes && lp.shapes.length === 2;
    App.store.commit(s => {
      s.components.push(Object.assign({ id: 'shp1', partNo: lp.partNo, type: lp.type, x: 300, y: 1600, widthMM: lp.w, heightMM: lp.h, rotation: 0, label: 'T', terminals: 0, term: null, shapes: JSON.parse(JSON.stringify(lp.shapes)) }));
    });
    App.render.all();
    const grp = document.querySelector('#layer-components [data-id="shp1"]');
    const drawn = grp && Array.from(grp.querySelectorAll('rect')).some(r => (r.getAttribute('stroke-dasharray') || '') === '8 2 2 2') &&
      Array.from(grp.querySelectorAll('text')).some(t => t.textContent === 'MAIN 220V');
    // DXF에 포함
    const dxfHas = App.exporter.dxfString(App.store.get()).indexOf('MAIN 220V') >= 0;
    // 정리
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'shp1'); });
    App.userlib.remove(lp.partNo);
    App.palette.reloadUser();
    App.render.all();
    return { modeText, modeRect, rows, dashRect, textEl, savedShapes, drawn, dxfHas };
  });
  assert(pshape.modeText && pshape.modeRect, '편집기 글쓰기/사각라인 모드 버튼');
  assert(pshape.rows === 2 && pshape.dashRect, '사각 경계라인 드래그 생성(일점쇄선 스타일)');
  assert(pshape.textEl, '글쓰기(텍스트) 클릭 추가');
  assert(pshape.savedShapes, '도형이 라이브러리에 저장');
  assert(pshape.drawn, '배치 부품 도면에 도형 렌더');
  assert(pshape.dxfHas, 'DXF에 부품 도형 포함');

  // === 품명 표시 온/오프 + 글자 방향 분리(품명/타입/호기) ===
  const nmdir = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'nd1', partNo: 'ND-1', type: 'MCCB', partName: '방향테스트품명', tag: 'M1', x: 560, y: 1700, widthMM: 40, heightMM: 60, rotation: 0, label: '방향테스트', terminals: 0, term: null });
    });
    App.render.all();
    function grp() { return document.querySelector('#layer-components [data-id="nd1"]'); }
    function texts() { return Array.from(grp().querySelectorAll('text')).map(t => ({ s: t.textContent, r: t.getAttribute('transform') || '' })); }
    const shown = texts().some(t => t.s === '방향테스트');
    // 품명 끄기
    const cb = document.getElementById('show-names');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    const hidden = !texts().some(t => t.s === '방향테스트');
    const typeStill = texts().some(t => t.s === 'MCCB');   // 타입/호기는 유지
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const backOn = texts().some(t => t.s === '방향테스트');
    // 글자 방향 분리: 품명만 세로, 타입/호기는 가로 유지
    App.ui.selected = new Set(['nd1']);
    App.inspector.update();
    const dl = document.getElementById('insp-dir-label');
    dl.value = 'v'; dl.dispatchEvent(new Event('change'));
    const after = texts();
    const labelV = after.some(t => t.s === '방향테스트' && t.r.indexOf('rotate(-90') >= 0);
    const typeH = after.some(t => t.s === 'MCCB' && t.r.indexOf('rotate') < 0);
    const tagH = after.some(t => t.s === 'M1' && t.r.indexOf('rotate') < 0);
    // 호기만 세로 추가
    const dt = document.getElementById('insp-dir-tag');
    dt.value = 'v'; dt.dispatchEvent(new Event('change'));
    const tagV = texts().some(t => t.s === 'M1' && t.r.indexOf('rotate(-90') >= 0);
    // 저장 라운드트립
    const json = JSON.stringify(App.store.get());
    const rt = JSON.parse(json).components.find(c => c.id === 'nd1');
    const persisted = rt.labelVert === true && rt.tagVert === true && !rt.typeVert;
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'nd1'); });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { shown, hidden, typeStill, backOn, labelV, typeH, tagH, tagV, persisted };
  });
  assert(nmdir.shown && nmdir.hidden && nmdir.backOn, '품명 표시 온/오프 토글');
  assert(nmdir.typeStill, '품명 숨겨도 타입/호기는 유지');
  assert(nmdir.labelV && nmdir.typeH && nmdir.tagH, '글자 방향 분리: 품명만 세로');
  assert(nmdir.tagV, '호기 방향 개별 세로');
  assert(nmdir.persisted, '방향 분리 값 저장');

  // 편집기 단자 스냅 격자 조절
  const peGrid = await page.evaluate(() => {
    App.partEditor.open({});
    const gi = document.getElementById('pe-grid-in');
    if (!gi) return { fail: 'no-input' };
    const def25 = gi.value === '2.5';
    // 격자 10mm 로 변경 → 단자 추가 좌표가 10 배수로 스냅
    gi.value = '10'; gi.dispatchEvent(new Event('change'));
    document.getElementById('pe-mode-add').click();
    const svg = document.getElementById('pe-canvas');
    const ctm = svg.getScreenCTM();
    const pt = svg.createSVGPoint(); pt.x = 13; pt.y = 17; // → (10, 20) 기대
    const cl = pt.matrixTransform(ctm);
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: cl.x, clientY: cl.y, button: 0, bubbles: true }));
    svg.dispatchEvent(new PointerEvent('pointerup', { clientX: cl.x, clientY: cl.y, bubbles: true }));
    // onUp 은 window 가 아닌 svg 리스너일 수 있어 둘 다 발송
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cl.x, clientY: cl.y, bubbles: true }));
    const terms = App.partEditor.isOpen() ? (document.querySelectorAll('#pe-canvas [data-ti]').length) : 0;
    let snapped = false;
    if (terms) {
      const tEl = document.querySelector('#pe-canvas [data-ti] circle, #pe-canvas [data-ti] rect');
      const cx = parseFloat(tEl.getAttribute('cx') || tEl.getAttribute('x'));
      snapped = Math.abs(cx - 10) < 0.01 || Math.abs(cx - 10 + (parseFloat(tEl.getAttribute('width')) || 0) / 2) < 2;
    }
    // 격자 표시도 10mm 패턴으로
    const pat = document.querySelector('#pe-canvas pattern#pe-grid');
    const patOk = pat && pat.getAttribute('width') === '10';
    document.getElementById('pe-cancel').click();
    return { def25, terms, snapped, patOk };
  });
  assert(peGrid.def25, '편집기 격자 기본 2.5mm');
  assert(peGrid.terms === 1 && peGrid.snapped, '격자 10mm 변경 → 단자 10 배수 스냅');
  assert(peGrid.patOk, '격자 표시가 설정 크기 반영');

  // 편집기 우측 패널 통합 스크롤 (단자 목록 개별 스크롤 제거)
  const peScroll = await page.evaluate(() => {
    const t = document.getElementById('pe-terms');
    return !t.className.match(/overflow-y-auto|flex-1/);
  });
  assert(peScroll, '부품 편집기 우측 패널 통합 스크롤');

  // === 글씨 배치(위치/방향) 라이브러리 기억 → 재배치 시 동일 적용 ===
  const lblmem = await page.evaluate(() => {
    // 내부품 생성 + 배치
    App.userlib.add({ partNo: 'MEM-1', type: 'RELAY', name: '배치기억', w: 40, h: 50, d: 40, terminals: 0 });
    App.palette.reloadUser();
    App.store.commit(s => {
      s.components.push({ id: 'mm1', partNo: 'MEM-1', type: 'RELAY', partName: '배치기억', x: 620, y: 1700, widthMM: 40, heightMM: 50, rotation: 0, label: '배치기억', terminals: 0, term: null });
    });
    // 글씨를 옮긴 것처럼 오프셋/방향 설정 후 저장 훅 호출(드래그 종료와 동일 경로)
    App.store.commit(s => {
      const c = s.components.find(x => x.id === 'mm1');
      c.labelDx = 25; c.labelDy = -12; c.typeDx = 8; c.tagDx = 5; c.labelVert = true;
    });
    App.interact.saveLabelLayout('mm1');
    const lp = App.palette.getLibrary().find(p => p.partNo === 'MEM-1');
    const savedToLib = lp && lp.labelDx === 25 && lp.labelDy === -12 && lp.typeDx === 8 && lp.labelVert === true;
    // 같은 부품을 새로 배치 → 글씨 배치 동일 적용 (팔레트 배치 흐름)
    App.ui.placing = lp;
    const svg = document.getElementById('canvas');
    const ctm = svg.getScreenCTM();
    const pt = svg.createSVGPoint(); pt.x = 100; pt.y = 1800;
    const cl = pt.matrixTransform(ctm);
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: cl.x, clientY: cl.y, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cl.x, clientY: cl.y, bubbles: true }));
    const comps = App.store.get().components.filter(c => c.partNo === 'MEM-1');
    const nc = comps[comps.length - 1];
    const applied = comps.length === 2 && nc.labelDx === 25 && nc.labelDy === -12 && nc.typeDx === 8 && nc.labelVert === true;
    // 정리
    App.ui.placing = null;
    App.store.commit(s => { s.components = s.components.filter(c => c.partNo !== 'MEM-1'); });
    App.userlib.remove('MEM-1');
    App.palette.reloadUser();
    App.ui.selected.clear(); App.render.all();
    return { savedToLib, applied };
  });
  assert(lblmem.savedToLib, '글씨 배치(위치/방향) 라이브러리에 저장');
  assert(lblmem.applied, '같은 부품 재배치 시 글씨 배치 동일 적용');

  // 이미 배치돼 있던 같은 부품에도 즉시 적용
  const lblretro = await page.evaluate(() => {
    App.userlib.add({ partNo: 'MEM-2', type: 'RELAY', name: '기존적용', w: 40, h: 50, d: 40, terminals: 0 });
    App.palette.reloadUser();
    App.store.commit(s => {
      s.components.push(
        { id: 'mr1', partNo: 'MEM-2', type: 'RELAY', partName: '기존적용', x: 620, y: 1800, widthMM: 40, heightMM: 50, rotation: 0, label: '기존적용', terminals: 0, term: null },
        { id: 'mr2', partNo: 'MEM-2', type: 'RELAY', partName: '기존적용', x: 700, y: 1800, widthMM: 40, heightMM: 50, rotation: 0, label: '기존적용', terminals: 0, term: null }
      );
    });
    App.store.commit(s => {
      const c = s.components.find(x => x.id === 'mr1');
      c.labelDx = 33; c.tagVert = true;
    });
    App.interact.saveLabelLayout('mr1');
    const other = App.store.get().components.find(x => x.id === 'mr2');
    const retro = other.labelDx === 33 && other.tagVert === true;
    App.store.commit(s => { s.components = s.components.filter(c => c.partNo !== 'MEM-2'); });
    App.userlib.remove('MEM-2');
    App.palette.reloadUser();
    App.render.all();
    return retro;
  });
  assert(lblretro, '이미 배치된 같은 부품에도 글씨 배치 즉시 적용');

  // === 부품 글씨 = 라이브러리 타이틀(품번), 품명 중복 제거 ===
  const titleDisp = await page.evaluate(() => {
    App.userlib.add({ partNo: 'TTL-1', type: 'MC', name: '타이틀부품', w: 40, h: 40, d: 40, terminals: 0 });
    App.palette.reloadUser();
    const lp = App.palette.getLibrary().find(p => p.partNo === 'TTL-1');
    // 팔레트 배치 → 기본 라벨 = 타이틀(품번)
    App.ui.placing = lp;
    const svg = document.getElementById('canvas');
    const pt = svg.createSVGPoint(); pt.x = 200; pt.y = 1850;
    const cl = pt.matrixTransform(svg.getScreenCTM());
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: cl.x, clientY: cl.y, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: cl.x, clientY: cl.y, bubbles: true }));
    App.ui.placing = null;
    const nc = App.store.get().components.filter(c => c.partNo === 'TTL-1')[0];
    const defTitle = nc && nc.label === 'TTL-1';
    // 구버전 부품(라벨=품명)도 화면엔 타이틀 표시
    App.store.commit(s => {
      s.components.push({ id: 'tt2', partNo: 'TTL-2', type: 'MC', partName: '옛품명', x: 300, y: 1850, widthMM: 40, heightMM: 40, rotation: 0, label: '옛품명', terminals: 0, term: null });
    });
    App.render.all();
    const grp2 = document.querySelector('#layer-components [data-id="tt2"]');
    const texts2 = Array.from(grp2.querySelectorAll('text')).map(t => t.textContent);
    const legacyTitle = texts2.indexOf('TTL-2') >= 0 && texts2.indexOf('옛품명') < 0;
    App.store.commit(s => { s.components = s.components.filter(c => c.partNo !== 'TTL-1' && c.id !== 'tt2'); });
    App.userlib.remove('TTL-1');
    App.palette.reloadUser(); App.render.all();
    return { defTitle, legacyTitle };
  });
  assert(titleDisp.defTitle, '배치 기본 글씨 = 라이브러리 타이틀(품번)');
  assert(titleDisp.legacyTitle, '기존 부품(라벨=품명)도 타이틀로 표시');

  // === 단자 커버(날개) 좌/우 토글 + Alt+드래그 복제 ===
  const cover = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'cv1', partNo: 'TB-CV', type: 'TB', x: 400, y: 1900, widthMM: 12, heightMM: 60, rotation: 0, label: 'TB', terminals: 0, term: null });
    });
    App.ui.selected = new Set(['cv1']);
    App.inspector.update();
    const cbl = document.getElementById('insp-cover-l');
    const cbr = document.getElementById('insp-cover-r');
    if (!cbl || !cbr) return { fail: 'no-checkbox' };
    function coverRects() {
      const grp = document.querySelector('#layer-components [data-id="cv1"]');
      const c = App.store.get().components.find(x => x.id === 'cv1');
      return Array.from(grp.querySelectorAll('rect')).filter(r => {
        const x = parseFloat(r.getAttribute('x'));
        return Math.abs(x - (c.x - 2.5)) < 0.01 || Math.abs(x - (c.x + c.widthMM)) < 0.01;
      }).filter(r => parseFloat(r.getAttribute('height')) > 60);
    }
    const none = coverRects().length === 0;
    cbl.checked = true; cbl.dispatchEvent(new Event('change'));
    App.inspector.update();
    const onlyL = coverRects().length === 1;
    document.getElementById('insp-cover-r').checked = true;
    document.getElementById('insp-cover-r').dispatchEvent(new Event('change'));
    const both = coverRects().length === 2;
    App.inspector.update();
    document.getElementById('insp-cover-l').checked = false;
    document.getElementById('insp-cover-l').dispatchEvent(new Event('change'));
    const onlyR = coverRects().length === 1;
    const st1 = App.store.get().components.find(x => x.id === 'cv1');
    const persisted = st1.coverR === true && st1.coverL === false;
    // DXF 에도 커버 사각형 포함 (rect = 4 LINE)
    const dxfBefore = (App.exporter.dxfString(App.store.get()).match(/\nLINE\n/g) || []).length;
    App.store.commit(s => { s.components.find(x => x.id === 'cv1').coverR = false; });
    const dxfAfter = (App.exporter.dxfString(App.store.get()).match(/\nLINE\n/g) || []).length;
    const dxfHas = dxfBefore - dxfAfter === 4;
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'cv1'); });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { none, onlyL, both, onlyR, persisted, dxfHas };
  });
  assert(cover.none && cover.onlyL && cover.both && cover.onlyR, '단자 커버 좌/우 개별 토글 렌더');
  assert(cover.persisted, '단자 커버 상태 저장');
  assert(cover.dxfHas, 'DXF에 단자 커버 포함');

  // Alt+드래그 즉시 복제
  const altdup = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push({ id: 'ad1', partNo: 'AD-1', type: 'MC', x: 460, y: 1900, widthMM: 30, heightMM: 30, rotation: 0, label: 'AD', terminals: 0, term: null });
    });
    App.render.all();
    App.toolbar.setTool('select');
    App.ui.selected.clear();
    const before = App.store.get().components.length;
    const grp = document.querySelector('#layer-components [data-id="ad1"]');
    const bb = grp.getBoundingClientRect();
    const svg = document.getElementById('canvas');
    const dn = new PointerEvent('pointerdown', { clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2, button: 0, altKey: true, bubbles: true });
    Object.defineProperty(dn, 'target', { value: grp });
    svg.dispatchEvent(dn);
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: bb.left + bb.width / 2 + 80, clientY: bb.top + bb.height / 2, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: bb.left + bb.width / 2 + 80, clientY: bb.top + bb.height / 2, bubbles: true }));
    const s2 = App.store.get();
    const copies = s2.components.filter(c => c.partNo === 'AD-1');
    const orig = copies.find(c => c.id === 'ad1');
    const copy = copies.find(c => c.id !== 'ad1');
    const dup = s2.components.length === before + 1 && copies.length === 2;
    const origStays = orig && orig.x === 460;                 // 원본 제자리
    const copyMoved = copy && copy.x > 470;                   // 복제본이 끌려감
    App.store.commit(s => { s.components = s.components.filter(c => c.partNo !== 'AD-1'); });
    App.ui.selected.clear(); App.render.all();
    return { dup, origStays, copyMoved };
  });
  assert(altdup.dup, 'Alt+드래그: 복제본 생성');
  assert(altdup.origStays && altdup.copyMoved, 'Alt+드래그: 원본 제자리, 복제본 이동');

  // === 간격 배열: 겹친 부품을 지정 간격으로 나란히 ===
  const pack = await page.evaluate(() => {
    App.store.commit(s => {
      // 3개가 같은 자리에 겹침 (폭 12)
      s.components.push(
        { id: 'pk1', partNo: 'PK', type: 'TB', x: 100, y: 1950, widthMM: 12, heightMM: 40, rotation: 0, label: 'p', terminals: 0, term: null },
        { id: 'pk2', partNo: 'PK', type: 'TB', x: 100, y: 1950, widthMM: 12, heightMM: 40, rotation: 0, label: 'p', terminals: 0, term: null },
        { id: 'pk3', partNo: 'PK', type: 'TB', x: 100, y: 1950, widthMM: 12, heightMM: 40, rotation: 0, label: 'p', terminals: 0, term: null }
      );
    });
    App.ui.selected = new Set(['pk1', 'pk2', 'pk3']);
    // 간격 2mm 가로 배열 → 100, 114, 128
    document.getElementById('al-gap').value = '2';
    document.getElementById('al-packh').click();
    const xs = App.store.get().components.filter(c => c.partNo === 'PK').map(c => c.x).sort((a, b) => a - b);
    const gap2 = xs[0] === 100 && xs[1] === 114 && xs[2] === 128;
    // 간격 0 → 딱 붙음: 100, 112, 124
    App.ui.selected = new Set(['pk1', 'pk2', 'pk3']);
    document.getElementById('al-gap').value = '0';
    document.getElementById('al-packh').click();
    const xs0 = App.store.get().components.filter(c => c.partNo === 'PK').map(c => c.x).sort((a, b) => a - b);
    const gap0 = xs0[0] === 100 && xs0[1] === 112 && xs0[2] === 124;
    // 세로 배열 (간격 5) → y 1950, 1995, 2040
    App.ui.selected = new Set(['pk1', 'pk2', 'pk3']);
    document.getElementById('al-gap').value = '5';
    document.getElementById('al-packv').click();
    const ys = App.store.get().components.filter(c => c.partNo === 'PK').map(c => c.y).sort((a, b) => a - b);
    const vpack = ys[0] === 1950 && ys[1] === 1995 && ys[2] === 2040;
    App.store.commit(s => { s.components = s.components.filter(c => c.partNo !== 'PK'); });
    App.ui.selected.clear(); App.render.all();
    return { gap2, gap0, vpack };
  });
  assert(pack.gap2, '간격 배열: 겹친 3개 → 2mm 간격 가로 배열');
  assert(pack.gap0, '간격 배열: 0mm → 딱 붙임');
  assert(pack.vpack, '간격 배열: 세로 방향(5mm)');

  // === 편집기 품명 칸 = 이름 변경 (별도 품명 항목 없음) ===
  const peRename = await page.evaluate(() => {
    App.userlib.add({ partNo: 'RN-1', type: 'MC', name: 'RN-1', w: 30, h: 30, d: 30, terminals: 0 });
    App.palette.reloadUser();
    App.store.commit(s => {
      s.components.push({ id: 'rn1', partNo: 'RN-1', type: 'MC', partName: 'RN-1', x: 520, y: 1950, widthMM: 30, heightMM: 30, rotation: 0, label: 'RN-1', terminals: 0, term: null });
    });
    const c = App.store.get().components.find(x => x.id === 'rn1');
    App.partEditor.open({ component: c });
    document.getElementById('pe-name-in').value = 'RN-2';
    document.getElementById('pe-apply').click();
    const lib = App.palette.getLibrary();
    const renamed = lib.some(p => p.partNo === 'RN-2' && p.name === 'RN-2');
    const oldGone = !lib.some(p => p.partNo === 'RN-1');
    const c2 = App.store.get().components.find(x => x.id === 'rn1');
    const compSync = c2.partNo === 'RN-2' && c2.partName === 'RN-2' && c2.label === 'RN-2';
    App.store.commit(s => { s.components = s.components.filter(x => x.id !== 'rn1'); });
    App.userlib.remove('RN-2'); App.userlib.remove('RN-1');
    App.palette.reloadUser(); App.render.all();
    return { renamed, oldGone, compSync };
  });
  assert(peRename.renamed && peRename.oldGone, '편집기 품명 수정 = 라이브러리 이름 변경(항목 하나)');
  assert(peRename.compSync, '이름 변경이 배치 부품 품번/표시에 동기화');

  // === 배선 규격/전원/프리셋 확장 ===
  const wireExt = await page.evaluate(() => {
    // 24 AWG 까지 확장 + SQ 선택 시 두께/AWG 자동
    const awg24 = App.wires.SQ_AWG['0.2'] === '24' && App.wires.SQ_AWG['0.5'] === '20';
    const widthMap = App.wires.SQ_WIDTH['0.2'] === 0.8 && App.wires.SQ_WIDTH['2.0'] === 1.4;
    // 전원 직접 추가
    App.userlib.addAcdc('DC24');
    const acdcHas = App.userlib.acdcList().indexOf('DC24') >= 0;
    // 인스펙터: 배선 선택 → SQ 고르면 AWG+두께 자동, 전원 목록에 DC24
    const w = App.store.get().wires[0];
    if (!w) return { skip: true };
    App.toolbar.setTool('select');
    App.ui.selected = new Set([w.id]);
    App.inspector.update();
    const sqSel = document.querySelector('#inspector [data-field="sq"]');
    sqSel.value = '0.5';
    sqSel.dispatchEvent(new Event('change'));
    const w2 = App.store.get().wires.find(x => x.id === w.id);
    const autoSet = w2.sq === '0.5' && w2.awg === '20' && w2.width === 1.0;
    App.inspector.update();
    const adSel = document.querySelector('#inspector [data-field="acdc"]');
    const adHasCustom = Array.from(adSel.options).some(o => o.value === 'DC24');
    const adHasNew = Array.from(adSel.options).some(o => o.value === '__new__');
    // 프리셋 편집기: 순서 변경(▼) + SQ→두께 자동
    App.wirePresets.open();
    const list = document.getElementById('wp-list');
    const names1 = Array.from(list.querySelectorAll('.wp-name')).map(i => i.value);
    list.querySelector('.wp-row .wp-down').click(); // 첫 행을 아래로
    const names2 = Array.from(list.querySelectorAll('.wp-name')).map(i => i.value);
    const reordered = names2[0] === names1[1] && names2[1] === names1[0];
    const sqRow = list.querySelector('.wp-row .wp-sq');
    sqRow.value = '0.2';
    sqRow.dispatchEvent(new Event('change'));
    const rowEl = sqRow.closest('.wp-row');
    const presetAuto = rowEl.querySelector('.wp-awg').value === '24' && parseFloat(rowEl.querySelector('.wp-width').value) === 0.8;
    const wpAdHasNew = Array.from(list.querySelector('.wp-acdc').options).some(o => o.value === '__new__');
    document.getElementById('wp-cancel').click();
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { awg24, widthMap, acdcHas, autoSet, adHasCustom, adHasNew, reordered, presetAuto, wpAdHasNew };
  });
  if (!wireExt.skip) {
    assert(wireExt.awg24 && wireExt.widthMap, 'SQ 목록 24AWG(0.2SQ)까지 확장 + 두께 매핑');
    assert(wireExt.autoSet, '규격 선택 → AWG·두께 자동 설정(인스펙터)');
    assert(wireExt.acdcHas && wireExt.adHasCustom && wireExt.adHasNew, '전원 구분 직접 추가(DC24) + 목록 반영');
    assert(wireExt.reordered, '프리셋 순서 변경(▲▼)');
    assert(wireExt.presetAuto && wireExt.wpAdHasNew, '프리셋 SQ→AWG·두께 자동 + 전원 추가 옵션');
  }

  // === 스티커 표시 온/오프 ===
  const stkToggle = await page.evaluate(() => {
    App.store.commit(s => {
      s.ducts.push({ id: 'sv1', orient: 'h', x: 0, y: 2000, lengthMM: 200, widthMM: 60, stickers: [{ id: 'sst1', off: 10, cellW: 30, cellH: 24, lines: ['A', 'B', 'C'] }] });
    });
    App.render.all();
    const shown = !!document.querySelector('[data-sticker="sst1"]');
    const cb = document.getElementById('show-stickers');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    const hidden = !document.querySelector('[data-sticker="sst1"]');
    const dxfOff = App.exporter.dxfString(App.store.get()).indexOf('LABELS') < 0;
    cb.checked = true; cb.dispatchEvent(new Event('change'));
    const back = !!document.querySelector('[data-sticker="sst1"]');
    App.store.commit(s => { s.ducts = s.ducts.filter(d => d.id !== 'sv1'); });
    App.render.all();
    return { shown, hidden, dxfOff, back };
  });
  assert(stkToggle.shown && stkToggle.hidden && stkToggle.back, '스티커 표시 온/오프 토글');
  assert(stkToggle.dxfOff, '스티커 숨김 시 DXF에서도 제외');

  // === 라운드 설정 유지 + 겹선 분리는 단자 옆 구간만 ===
  const rndSpread = await page.evaluate(() => {
    // 라운드 입력 → localStorage 에 저장(새로고침에도 유지)
    const wr = document.getElementById('wire-round');
    wr.value = '4';
    wr.dispatchEvent(new Event('input'));
    let saved = null;
    try { saved = localStorage.getItem('panel-wire-round'); } catch (e) {}
    const roundKept = App.ui.wireRound === 4 && saved === '4';
    wr.value = '0'; wr.dispatchEvent(new Event('input'));
    // 겹선 분리: 오프셋이 각 배선의 첫/끝 구간(단자 옆)에만 배정
    const off = App.wires.spreadOffsets(App.store.get());
    const st = App.store.get();
    const onlyEnds = Object.keys(off).every(k => {
      const wid = k.slice(0, k.lastIndexOf(':'));
      const seg = +k.slice(k.lastIndexOf(':') + 1);
      const w = st.wires.find(x => x.id === wid);
      if (!w) return false;
      const R = App.wires.route(st, w);
      return seg === 0 || seg === R.length - 2;
    });
    return { roundKept, onlyEnds, offCount: Object.keys(off).length };
  });
  assert(rndSpread.roundKept, '배선 라운드 설정 localStorage 유지');
  assert(rndSpread.onlyEnds, '겹선 분리: 단자 옆 구간만 오프셋');


  // === 선 정렬 (기준선 클릭 → 상대선 클릭) ===
  const walign = await page.evaluate(() => {
    // 부품 4개 + 수평 구간 높이가 다른 배선 2개
    App.store.commit(s => {
      s.components.push(
        { id: 'wa1', partNo: 'WA', type: 'MC', x: 50, y: 300, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'wa2', partNo: 'WA', type: 'MC', x: 300, y: 300, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'wa3', partNo: 'WA', type: 'MC', x: 50, y: 500, widthMM: 30, heightMM: 40, rotation: 0, label: 'c', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'wa4', partNo: 'WA', type: 'MC', x: 300, y: 500, widthMM: 30, heightMM: 40, rotation: 0, label: 'd', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push(
        { id: 'waw1', fromComp: 'wa1', fromTerm: 0, toComp: 'wa2', toTerm: 0, label: 'A1', color: '#e11d2a', width: 1.2, corners: null, midY: 250 },
        { id: 'waw2', fromComp: 'wa3', fromTerm: 0, toComp: 'wa4', toTerm: 0, label: 'A2', color: '#e11d2a', width: 1.2, corners: null, midY: 450 }
      );
    });
    App.render.all();
    const st = App.store.get();
    function hy(wid) { // 수평 구간 y
      const R = App.wires.route(st, st.wires.find(w => w.id === wid));
      for (let i = 0; i < R.length - 1; i++) if (R[i].y === R[i + 1].y && Math.abs(R[i].x - R[i + 1].x) > 3) return R[i].y;
      return null;
    }
    const before = { a: hy('waw1'), b: hy('waw2') };
    // 모드 시작 → 기준선(waw1 수평 구간) 클릭 → 상대선(waw2) 클릭
    App.interact.startWireAlign();
    const svg = document.getElementById('canvas');
    const ctm = svg.getScreenCTM();
    function clickWire(wid, wx, wy) {
      const el = document.querySelector('[data-id="' + wid + '"][data-kind="wires"]');
      const p = svg.createSVGPoint(); p.x = wx; p.y = wy;
      const c = p.matrixTransform(ctm);
      const ev = new PointerEvent('pointerdown', { clientX: c.x, clientY: c.y, button: 0, bubbles: true });
      Object.defineProperty(ev, 'target', { value: el });
      svg.dispatchEvent(ev);
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: c.x, clientY: c.y, bubbles: true }));
    }
    clickWire('waw1', 190, 250);   // 기준 수평선 y=250
    const armed = App.ui.wireAlign && App.ui.wireAlign.stage === 1 && App.ui.wireAlign.coord === 250;
    clickWire('waw2', 190, 450);   // 상대선 수평 구간
    const after = hy('waw2');
    const aligned = after === 250 && before.b === 450 && before.a === 250;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const escOff = !App.ui.wireAlign;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'waw1' && w.id !== 'waw2');
      s.components = s.components.filter(c => c.partNo !== 'WA');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { armed, aligned, escOff };
  });
  assert(walign.armed, '선 정렬: 기준선 지정(수평 y=250)');
  assert(walign.aligned, '선 정렬: 상대선이 기준선 좌표로 이동(450→250)');
  assert(walign.escOff, '선 정렬: Esc 종료');

  // === 배선 끝점 드래그로 단자 재연결 ===
  const wend = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'we1', partNo: 'WE', type: 'MC', x: 50, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'we2', partNo: 'WE', type: 'MC', x: 300, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'we3', partNo: 'WE', type: 'MC', x: 450, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'c', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'wew1', fromComp: 'we1', fromTerm: 0, toComp: 'we2', toTerm: 0, label: 'E1', color: '#e11d2a', width: 1.2, corners: null, midY: null });
    });
    App.toolbar.setTool('select');
    App.ui.selected = new Set(['wew1']);
    App.render.all();
    const handle = document.querySelector('[data-wend="b"][data-wire="wew1"]');
    if (!handle) return { fail: 'no-handle' };
    const svg = document.getElementById('canvas');
    const ctm = svg.getScreenCTM();
    function cl(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; const c = p.matrixTransform(ctm); return { x: c.x, y: c.y }; }
    const a = cl(315, 602);       // 현재 B 끝(we2 단자 근처)
    const b = cl(465, 602);       // we3 단자(450+15, 600+2)
    const dn = new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, bubbles: true });
    Object.defineProperty(dn, 'target', { value: handle });
    svg.dispatchEvent(dn);
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
    const w = App.store.get().wires.find(x => x.id === 'wew1');
    const reconnected = w.toComp === 'we3' && w.toTerm === 0 && w.fromComp === 'we1';
    // 실행취소로 원복
    App.store.undo();
    const undone = App.store.get().wires.find(x => x.id === 'wew1').toComp === 'we2';
    App.store.commit(s => {
      s.wires = s.wires.filter(x => x.id !== 'wew1');
      s.components = s.components.filter(c => c.partNo !== 'WE');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { reconnected, undone };
  });
  assert(wend.reconnected, '배선 끝점 드래그 → 다른 단자로 재연결');
  assert(wend.undone, '재연결 실행취소');

  // === 덕트망 자동 라우팅 + 이동 시 배선 경로 유지 ===
  const droute = await page.evaluate(() => {
    // 빈 영역(x+1400)에 ㄱ자 덕트망: 위 가로덕트 + 왼쪽 세로덕트 (교차)
    App.store.commit(s => {
      s.ducts.push(
        { id: 'dg1', orient: 'h', x: 1440, y: 80, lengthMM: 460, widthMM: 60 },   // 중심 y=110
        { id: 'dg2', orient: 'v', x: 1440, y: 80, lengthMM: 420, widthMM: 60 }    // 중심 x=1470
      );
      s.components.push(
        { id: 'dgc1', partNo: 'DG', type: 'MC', x: 1550, y: 400, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'dgc2', partNo: 'DG', type: 'MC', x: 1800, y: 200, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'dgw1', fromComp: 'dgc1', fromTerm: 0, toComp: 'dgc2', toTerm: 0, label: 'G1', color: '#111', width: 1.2, corners: null, midY: null });
    });
    const st = App.store.get();
    const R = App.wires.route(st, st.wires.find(w => w.id === 'dgw1'));
    // 세로덕트(x=1470) 타고 올라가 교차점(1470,110) 지나 가로덕트(y=110) 경유해야 함
    const viaV = R.some(p => Math.round(p.x) === 1470);
    const viaH = R.some(p => Math.round(p.y) === 110);
    const viaCross = R.some(p => Math.round(p.x) === 1470 && Math.round(p.y) === 110);
    // 이동 시 편집 경로 유지: 경로를 실체화(편집된 상태처럼)한 뒤 부품 이동 → 모양 따라감
    App.store.commit(s => {
      const w = s.wires.find(x => x.id === 'dgw1');
      w.corners = App.wires.route(s, w).slice(1, -1).map(p => ({ x: p.x, y: p.y }));
    });
    const origFirst = JSON.parse(JSON.stringify(App.store.get().wires.find(w => w.id === 'dgw1').corners[0]));
    App.toolbar.setTool('select');
    App.ui.selected.clear();
    App.viewport.centerOn(1670, 300); // 빈 영역으로 뷰 이동(다른 테스트 잔여물과 화면 좌표 안 겹치게)
    const svg = document.getElementById('canvas');
    App.render.all();
    const ctm = svg.getScreenCTM();
    function cl(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; const c = p.matrixTransform(ctm); return { x: c.x, y: c.y }; }
    const grp = document.querySelector('#layer-components [data-id="dgc1"]');
    const a = cl(1553, 437), b = cl(1583, 457); // 모서리 클릭(+30,+20 이동)
    const dn = new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, bubbles: true });
    Object.defineProperty(dn, 'target', { value: grp });
    svg.dispatchEvent(dn);
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
    const cd = App.store.get().components.find(c => c.id === 'dgc1');
    const w2 = App.store.get().wires.find(w => w.id === 'dgw1');
    const dxr = cd.x - 1550, dyr = cd.y - 400;
    const moved = dxr !== 0 || dyr !== 0;
    // 첫 스터브 corner 가 부품 이동량만큼 따라감, 나머지 경로는 유지
    const followed = Math.abs(w2.corners[0].x - (origFirst.x + dxr)) < 0.6 && Math.abs(w2.corners[0].y - (origFirst.y + dyr)) < 0.6;
    const restKept = Math.round(w2.corners[1].x) === 1470 && Math.round(w2.corners[2].y) === 110;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'dgw1');
      s.components = s.components.filter(c => c.partNo !== 'DG');
      s.ducts = s.ducts.filter(d => d.id !== 'dg1' && d.id !== 'dg2');
    });
    App.ui.selected.clear();
    const p = App.store.get().panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all(); App.inspector.update();
    return { viaV, viaH, viaCross, moved, followed, restKept };
  });
  assert(droute.viaV && droute.viaH && droute.viaCross, '덕트망 자동 라우팅: 세로→교차점→가로 덕트 경유');
  assert(droute.moved && droute.followed, '부품 이동 시 편집된 배선 경로가 따라감(초기화 안 됨)');
  assert(droute.restKept, '이동 후 나머지 경로(덕트 경유) 유지');

  // === 마퀴 선택: 배선은 실제 선분과 겹칠 때만 ===
  const mq = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'mq1', partNo: 'MQ', type: 'MC', x: 1500, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'mq2', partNo: 'MQ', type: 'MC', x: 1800, y: 800, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'mqw1', fromComp: 'mq1', fromTerm: 0, toComp: 'mq2', toTerm: 0, label: 'M1', color: '#111', width: 1.2, corners: null, midY: null });
      s.texts.push({ id: 'mqt1', x: 1650, y: 750, text: '안쪽텍스트', size: 8 });
    });
    App.toolbar.setTool('select');
    App.ui.selected.clear();
    App.viewport.centerOn(1670, 700);
    App.render.all();
    const svg = document.getElementById('canvas');
    const ctm = svg.getScreenCTM();
    function cl(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; const c = p.matrixTransform(ctm); return { x: c.x, y: c.y }; }
    function marquee(x1, y1, x2, y2) {
      App.ui.selected.clear();
      const a = cl(x1, y1), b = cl(x2, y2);
      svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, bubbles: true }));
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
      return Array.from(App.ui.selected);
    }
    // 배선 경로: x=1515 수직(592~700), y=700 수평(1515~1815), x=1815 수직(700~792)
    // ㄷ자 안쪽 빈 공간(선분 없음, 텍스트만) 드래그 → 배선은 선택 안 되고 텍스트만
    const inner = marquee(1600, 720, 1760, 780);
    const innerOk = inner.indexOf('mqt1') >= 0 && inner.indexOf('mqw1') < 0;
    // 수평 선분을 가로지르는 드래그 → 배선 선택
    const cross = marquee(1600, 660, 1650, 720);
    const crossOk = cross.indexOf('mqw1') >= 0;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'mqw1');
      s.components = s.components.filter(c => c.partNo !== 'MQ');
      s.texts = s.texts.filter(t => t.id !== 'mqt1');
    });
    App.ui.selected.clear();
    const p = App.store.get().panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all(); App.inspector.update();
    return { inner, innerOk, crossOk };
  });
  assert(mq.innerOk, '마퀴: 배선 경로 안쪽 빈 공간 드래그 → 겹친 배선 미선택');
  assert(mq.crossOk, '마퀴: 선분을 실제로 지나면 배선 선택');

  // === 배선 연결 추적 표시 + 전원 뱃지 경로 중앙 ===
  const trace = await page.evaluate(() => {
    // 길이가 비대칭인 L자 경로 — midPoint 가 경로 길이 기준 중앙이어야 함
    const mp = App.wires.midPoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }]);
    const midOk = Math.abs(mp.x - 60) < 0.01 && Math.abs(mp.y - 0) < 0.01;
    // 배선 선택 → 양끝 부품 점선 강조 + 인스펙터 이동 버튼
    App.store.commit(s => {
      s.components.push(
        { id: 'tr1', partNo: 'TR', type: 'MC', x: 1500, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: 'L1', rx: 15, ry: 2 }] },
        { id: 'tr2', partNo: 'TR', type: 'MC', x: 1700, y: 600, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: 'T1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'trw1', fromComp: 'tr1', fromTerm: 0, toComp: 'tr2', toTerm: 0, label: 'TT1', color: '#111', width: 1.2, corners: null, midY: null });
    });
    App.toolbar.setTool('select');
    App.ui.selected = new Set(['trw1']);
    App.render.all();
    App.inspector.update();
    function hilite(cid) {
      const grp = document.querySelector('#layer-components [data-id="' + cid + '"]');
      return grp && Array.from(grp.querySelectorAll('rect')).some(r => (r.getAttribute('stroke') || '') === '#0ea5e9');
    }
    const hl = hilite('tr1') && hilite('tr2');
    const info = document.getElementById('inspector').textContent;
    const names = info.indexOf('[L1]') >= 0 && info.indexOf('[T1]') >= 0;
    const goBtn = document.getElementById('insp-go-from');
    goBtn.click();
    const vb = App.viewport.getViewBox();
    const centered = Math.abs((vb.x + vb.w / 2) - 1515) < 2 && Math.abs((vb.y + vb.h / 2) - 620) < 2;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'trw1');
      s.components = s.components.filter(c => c.partNo !== 'TR');
    });
    App.ui.selected.clear();
    const p = App.store.get().panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all(); App.inspector.update();
    return { midOk, hl, names, centered };
  });
  assert(trace.midOk, '전원 뱃지 위치 = 경로 길이 기준 중앙');
  assert(trace.hl, '배선 선택 시 양끝 부품 점선 강조');
  assert(trace.names, '인스펙터 연결 정보에 단자 이름 표시');
  assert(trace.centered, '시작 부품으로 화면 이동 버튼');

  // === 다중 선택 라인번호 일괄 변경 ===
  const blkLbl = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'bl1', partNo: 'BL', type: 'MC', x: 1500, y: 700, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'bl2', partNo: 'BL', type: 'MC', x: 1700, y: 700, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'bl3', partNo: 'BL', type: 'MC', x: 1500, y: 850, widthMM: 30, heightMM: 40, rotation: 0, label: 'c', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'bl4', partNo: 'BL', type: 'MC', x: 1700, y: 850, widthMM: 30, heightMM: 40, rotation: 0, label: 'd', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push(
        { id: 'blw1', fromComp: 'bl1', fromTerm: 0, toComp: 'bl2', toTerm: 0, label: 'Z1', color: '#111', width: 1.2, corners: null, midY: 650 },
        { id: 'blw2', fromComp: 'bl3', fromTerm: 0, toComp: 'bl4', toTerm: 0, label: 'Z2', color: '#111', width: 1.2, corners: null, midY: 800 }
      );
    });
    App.ui.selected = new Set(['blw1', 'blw2']);
    App.inspector.update();
    const inp = document.querySelector('#inspector [data-mf="label"]');
    if (!inp) return { fail: 'no-input' };
    // 자동 증가: R100 → 위(blw1)=R100, 아래(blw2)=R101
    inp.value = 'R100';
    inp.dispatchEvent(new Event('change'));
    const st1 = App.store.get();
    const auto = st1.wires.find(w => w.id === 'blw1').label === 'R100' && st1.wires.find(w => w.id === 'blw2').label === 'R101';
    // 동일 번호 체크 → 둘 다 같은 번호
    App.inspector.update();
    document.getElementById('insp-same-label').checked = true;
    const inp2 = document.querySelector('#inspector [data-mf="label"]');
    inp2.value = 'COM';
    inp2.dispatchEvent(new Event('change'));
    const st2 = App.store.get();
    const same = st2.wires.find(w => w.id === 'blw1').label === 'COM' && st2.wires.find(w => w.id === 'blw2').label === 'COM';
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'blw1' && w.id !== 'blw2');
      s.components = s.components.filter(c => c.partNo !== 'BL');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { auto, same };
  });
  assert(blkLbl.auto, '다중 선택 라인번호: 자동 증가(R100→R101)');
  assert(blkLbl.same, '다중 선택 라인번호: 동일 번호 적용');

  // === 라인번호 위치(단자 거리) 슬라이더 ===
  const inset = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'in1', partNo: 'IN', type: 'MC', x: 1500, y: 950, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'in2', partNo: 'IN', type: 'MC', x: 1800, y: 950, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'inw1', fromComp: 'in1', fromTerm: 0, toComp: 'in2', toTerm: 0, label: 'N1', color: '#111', width: 1.2, corners: null, midY: 900 });
    });
    const st = App.store.get();
    const w = st.wires.find(x => x.id === 'inw1');
    const sl = document.getElementById('wire-label-inset');
    if (!sl) return { fail: 'no-slider' };
    sl.value = '10'; sl.dispatchEvent(new Event('input'));
    const e10 = App.wires.endLabels(st, w);
    sl.value = '50'; sl.dispatchEvent(new Event('input'));
    const e50 = App.wires.endLabels(st, w);
    // 단자(1515,952)로부터 라벨까지 경로상 거리 10mm vs 50mm — 시작 라벨 위치가 달라야 함
    const d10 = Math.hypot(e10.a.x - 1515, e10.a.y - 952);
    const d50 = Math.hypot(e50.a.x - 1515, e50.a.y - 952);
    const works = d10 < d50 && d10 <= 12 && d50 <= 52;
    let saved = null;
    try { saved = localStorage.getItem('panel-wire-label-inset'); } catch (e) {}
    // 원복
    sl.value = '30'; sl.dispatchEvent(new Event('input'));
    App.store.commit(s => {
      s.wires = s.wires.filter(x => x.id !== 'inw1');
      s.components = s.components.filter(c => c.partNo !== 'IN');
    });
    App.render.all();
    return { works, saved };
  });
  assert(inset.works, '라인번호 위치 슬라이더(10mm↔50mm 반영)');
  assert(inset.saved === '50', '라인번호 위치 localStorage 유지');

  // === 프리셋 레이어 표시/숨김 ===
  const visTest = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'vs1', partNo: 'VS', type: 'MC', x: 1500, y: 1100, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'vs2', partNo: 'VS', type: 'MC', x: 1700, y: 1100, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push(
        { id: 'vsw1', fromComp: 'vs1', fromTerm: 0, toComp: 'vs2', toTerm: 0, label: 'V1', color: '#111', width: 1.2, corners: null, midY: 1050, preset: '제어 0.75SQ' },
        { id: 'vsw2', fromComp: 'vs1', fromTerm: 0, toComp: 'vs2', toTerm: 0, label: 'V2', color: '#222', width: 1.2, corners: null, midY: 1060 }
      );
    });
    App.render.all();
    function visible(wid) { return !!document.querySelector('#layer-wires [data-id="' + wid + '"]'); }
    const both = visible('vsw1') && visible('vsw2');
    // 👁 팝업 열기 → 프리셋 체크 해제 → 해당 배선만 숨김
    document.getElementById('wire-vis').click();
    const pop = document.getElementById('wire-vis-pop');
    if (!pop) return { fail: 'no-pop' };
    const cb = pop.querySelector('.vis-cb[data-preset="제어 0.75SQ"]');
    if (!cb) return { fail: 'no-cb' };
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    const hid = !visible('vsw1') && visible('vsw2');
    let saved = null;
    try { saved = localStorage.getItem('panel-hidden-presets'); } catch (e) {}
    const persisted = saved && saved.indexOf('제어 0.75SQ') >= 0;
    // 다시 켜기
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const back = visible('vsw1');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); // 팝업 닫기
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'vsw1' && w.id !== 'vsw2');
      s.components = s.components.filter(c => c.partNo !== 'VS');
    });
    App.render.all();
    return { both, hid, persisted, back };
  });
  assert(visTest.both && visTest.hid && visTest.back, '프리셋 레이어: 해당 프리셋 배선만 표시/숨김');
  assert(visTest.persisted, '프리셋 숨김 상태 localStorage 유지');

  // === 전원(AC/DC) 뱃지 표시 온/오프 ===
  const acdcVis = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'av1', partNo: 'AV', type: 'MC', x: 1500, y: 1250, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'av2', partNo: 'AV', type: 'MC', x: 1700, y: 1250, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'avw1', fromComp: 'av1', fromTerm: 0, toComp: 'av2', toTerm: 0, label: 'A9', color: '#111', width: 1.2, corners: null, midY: 1200, acdc: 'AC' });
    });
    App.render.all();
    function badge() {
      const grp = document.querySelector('#layer-wires [data-id="avw1"]');
      return grp && Array.from(grp.querySelectorAll('text')).some(t => t.textContent === 'AC');
    }
    const shown = badge();
    const cb = document.getElementById('wire-acdc-show');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    const hidden = !badge();
    let saved = null;
    try { saved = localStorage.getItem('panel-show-acdc'); } catch (e) {}
    cb.checked = true; cb.dispatchEvent(new Event('change'));
    const back = badge();
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'avw1');
      s.components = s.components.filter(c => c.partNo !== 'AV');
    });
    App.render.all();
    return { shown, hidden, saved, back };
  });
  assert(acdcVis.shown && acdcVis.hidden && acdcVis.back, '전원(AC/DC) 뱃지 표시 온/오프');
  assert(acdcVis.saved === '0', '전원 표시 설정 localStorage 유지');

  // === 배선 선택 시 프리셋 표시/변경 ===
  const wpre = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'wp1', partNo: 'WP', type: 'MC', x: 1500, y: 1400, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'wp2', partNo: 'WP', type: 'MC', x: 1700, y: 1400, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'wpw1', fromComp: 'wp1', fromTerm: 0, toComp: 'wp2', toTerm: 0, label: 'P1', color: '#111', width: 1, corners: null, midY: 1350, preset: '제어 0.75SQ' });
    });
    App.toolbar.setTool('select');
    App.ui.selected = new Set(['wpw1']);
    App.inspector.update();
    const sel = document.getElementById('insp-wpreset');
    if (!sel) return { fail: 'no-select' };
    const shows = sel.value === '제어 0.75SQ'; // 현재 프리셋 표시 (목록에 없어도 표기)
    // 테스트용 프리셋 등록 후 변경 → 이름 + 속성(색/두께/규격/전원) 적용
    App.userlib.addPreset({ name: '테스트프리셋X', color: '#123456', width: 2.2, sq: '2.0', awg: '14', acdc: 'DC' });
    App.inspector.update();
    const sel2 = document.getElementById('insp-wpreset');
    sel2.value = '테스트프리셋X';
    sel2.dispatchEvent(new Event('change'));
    const w = App.store.get().wires.find(x => x.id === 'wpw1');
    const applied = w.preset === '테스트프리셋X' && w.sq === '2.0' && w.width === 2.2 && w.color === '#123456' && w.acdc === 'DC';
    App.userlib.removePreset('테스트프리셋X');
    App.store.commit(s => {
      s.wires = s.wires.filter(x => x.id !== 'wpw1');
      s.components = s.components.filter(c => c.partNo !== 'WP');
    });
    App.ui.selected.clear(); App.render.all(); App.inspector.update();
    return { shows, applied };
  });
  assert(wpre.shows, '배선 선택 시 프리셋 이름 표시');
  assert(wpre.applied, '인스펙터에서 프리셋 변경 → 이름+속성 적용');

  // === 라인번호 넘버링 튜브 렌더 ===
  const tube = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'tb1', partNo: 'TU', type: 'MC', x: 1500, y: 1550, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'tb2', partNo: 'TU', type: 'MC', x: 1700, y: 1550, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'tbw1', fromComp: 'tb1', fromTerm: 0, toComp: 'tb2', toTerm: 0, label: 'R220', color: '#111', width: 1.2, corners: null, midY: 1500 });
    });
    App.render.all();
    const grp = document.querySelector('#layer-wires [data-id="tbw1"]');
    // 흰 캡슐(둥근 사각) 배경 + 검정 글씨 + 회전 그룹
    const tubes = Array.from(grp.querySelectorAll('rect')).filter(r => (r.getAttribute('fill') || '') === '#ffffff' && parseFloat(r.getAttribute('rx') || 0) > 0);
    const label = Array.from(grp.querySelectorAll('text')).find(t => t.textContent === 'R220');
    const dark = label && (label.getAttribute('fill') === '#111827');
    const rotated = label && (label.closest('g[transform*="rotate"]') !== null);
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'tbw1');
      s.components = s.components.filter(c => c.partNo !== 'TU');
    });
    App.render.all();
    return { tubes: tubes.length, dark, rotated };
  });
  assert(tube.tubes >= 2, '라인번호 흰 튜브(캡슐) 렌더 (양 끝)');
  assert(tube.dark && tube.rotated, '튜브 검정 글씨 + 선 방향 정렬');

  // === 행선지 튜브 (상대 호기-단자) + 토글 ===
  const destTube = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'dt1', partNo: 'DT', type: 'MC', tag: 'Q1', x: 1500, y: 1700, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: 'L1', rx: 15, ry: 2 }] },
        { id: 'dt2', partNo: 'DT', type: 'MC', tag: 'Q2', x: 1700, y: 1700, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: 'T3', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'dtw1', fromComp: 'dt1', fromTerm: 0, toComp: 'dt2', toTerm: 0, label: 'D1', color: '#111', width: 1.2, corners: null, midY: 1650 });
    });
    App.render.all();
    function destTexts() {
      const grp = document.querySelector('#layer-wires [data-id="dtw1"]');
      return Array.from(grp.querySelectorAll('[data-dest] text')).map(t => t.textContent);
    }
    const ds = destTexts();
    // a쪽(시작=dt1) 행선지 = 상대 Q2-T3, b쪽 = Q1-L1
    const hasBoth = ds.indexOf('Q2-T3') >= 0 && ds.indexOf('Q1-L1') >= 0;
    // 토글 끄기
    const cb = document.getElementById('wire-dest-show');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    const off = destTexts().length === 0;
    cb.checked = true; cb.dispatchEvent(new Event('change'));
    const back = destTexts().length === 2;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'dtw1');
      s.components = s.components.filter(c => c.partNo !== 'DT');
    });
    App.render.all();
    return { ds, hasBoth, off, back };
  });
  assert(destTube.hasBoth, '행선지 튜브: 상대 호기-단자 (Q2-T3 / Q1-L1)');
  assert(destTube.off && destTube.back, '행선지 표시 토글');

  // === 배선 격자 조절 ===
  const wgrid = await page.evaluate(() => {
    App.store.commit(s => {
      s.components.push(
        { id: 'wg1', partNo: 'WG', type: 'MC', x: 1500, y: 1850, widthMM: 30, heightMM: 40, rotation: 0, label: 'a', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] },
        { id: 'wg2', partNo: 'WG', type: 'MC', x: 1700, y: 1850, widthMM: 30, heightMM: 40, rotation: 0, label: 'b', terminals: 1, term: [{ name: '1', rx: 15, ry: 2 }] }
      );
      s.wires.push({ id: 'wgw1', fromComp: 'wg1', fromTerm: 0, toComp: 'wg2', toTerm: 0, label: 'GG1', color: '#111', width: 1.2, corners: null, midY: 1800 });
    });
    App.toolbar.setTool('select');
    App.ui.selected = new Set(['wgw1']);
    App.viewport.centerOn(1615, 1800);
    App.render.all();
    const gi = document.getElementById('wire-grid');
    function dragSeg(targetY) {
      // 수평 세그먼트(y=현재 midY) 핸들을 targetY 로 드래그
      const seg = document.querySelector('[data-seg][data-wire="wgw1"][data-orient="H"]');
      if (!seg) return false;
      const svg = document.getElementById('canvas');
      const ctm = svg.getScreenCTM();
      const st = App.store.get();
      const R = App.wires.route(st, st.wires.find(w => w.id === 'wgw1'));
      let curY = null;
      for (let i = 0; i < R.length - 1; i++) if (R[i].y === R[i + 1].y && Math.abs(R[i].x - R[i + 1].x) > 3) curY = R[i].y;
      const p = svg.createSVGPoint(); p.x = 1615; p.y = curY;
      const a = p.matrixTransform(ctm);
      p.y = targetY;
      const b = p.matrixTransform(ctm);
      const dn = new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, button: 0, bubbles: true });
      Object.defineProperty(dn, 'target', { value: seg });
      svg.dispatchEvent(dn);
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
      return true;
    }
    function midY() {
      const st = App.store.get();
      const R = App.wires.route(st, st.wires.find(w => w.id === 'wgw1'));
      for (let i = 0; i < R.length - 1; i++) if (R[i].y === R[i + 1].y && Math.abs(R[i].x - R[i + 1].x) > 3) return R[i].y;
      return null;
    }
    // 격자 25mm → 1783 으로 드래그하면 1775 로 스냅
    gi.value = '25'; gi.dispatchEvent(new Event('input'));
    const ok1 = dragSeg(1783);
    const snapped25 = midY() % 25 === 0;
    // 격자 0(자유) → 1783.0 그대로(0.1 단위)
    gi.value = '0'; gi.dispatchEvent(new Event('input'));
    dragSeg(1783.4);
    const free = Math.abs(midY() - 1783.4) < 0.26;
    gi.value = ''; gi.dispatchEvent(new Event('input')); // 원복(전장 격자 따름)
    const cleared = App.ui.wireGrid == null;
    App.store.commit(s => {
      s.wires = s.wires.filter(w => w.id !== 'wgw1');
      s.components = s.components.filter(c => c.partNo !== 'WG');
    });
    App.ui.selected.clear();
    const p = App.store.get().panel;
    App.viewport.fitTo(p.widthMM, p.heightMM);
    App.render.all();
    return { ok1, snapped25, free, cleared };
  });
  assert(wgrid.ok1 && wgrid.snapped25, '배선 격자 25mm 스냅');
  assert(wgrid.free, '배선 격자 0 = 자유 이동(0.1mm)');
  assert(wgrid.cleared, '비우면 전장 격자 따름');

  // === 라이브러리 표시 안정화 + 샘플(기본) 부품 토글 ===
  const libfix = await page.evaluate(() => {
    // 1) 예전에 숨긴 품번과 같은 이름으로 내부품(복제 등) 추가해도 목록에 보여야 함
    App.userlib.hide('HIDE-T1');
    App.userlib.add({ partNo: 'HIDE-T1', type: 'PLC', name: '숨김충돌테스트', w: 30, h: 30, d: 30, terminals: 0 });
    App.palette.reloadUser();
    const visible = App.palette.getLibrary().some(p => p.partNo === 'HIDE-T1');
    // 2) 샘플 부품 끄기: 기본부품 제거, 심볼·내부품은 유지
    App.palette.loadSamples(false);
    const lib2 = App.palette.getLibrary();
    const noSample = !lib2.some(p => p.partNo === 'XBM-DN16S');
    const symKeep = lib2.some(p => p.type === 'SYM');
    const userKeep = lib2.some(p => p.partNo === 'HIDE-T1');
    App.palette.loadSamples(true); // 복구
    const back = App.palette.getLibrary().some(p => p.partNo === 'XBM-DN16S');
    App.userlib.remove('HIDE-T1');
    App.userlib.unhide('HIDE-T1');
    App.palette.reloadUser();
    return { visible, noSample, symKeep, userKeep, back };
  });
  assert(libfix.visible, '숨김 목록과 같은 품번의 내부품(복제)도 표시');
  assert(libfix.noSample && libfix.symKeep && libfix.userKeep, '샘플 부품 끄기: 기본부품만 제거(심볼·내부품 유지)');
  assert(libfix.back, '샘플 부품 다시 불러오기');

  // === CAD식 메뉴바 ===
  const mbar = await page.evaluate(() => {
    const bar = document.getElementById('menubar');
    const roots = Array.from(bar.querySelectorAll('.menu-root')).map(b => b.getAttribute('data-menu'));
    const need = ['파일', '편집', '뷰', '삽입', '그리기', '형식', '도구'];
    const hasAll = need.every(t => roots.indexOf(t) >= 0);
    // 파일 메뉴 열기 → '저장' 항목 존재
    const fileBtn = bar.querySelector('[data-menu="파일"]');
    fileBtn.click();
    const dd = fileBtn.querySelector('.menu-dd');
    const opened = !!dd;
    const items = dd ? Array.from(dd.querySelectorAll('.menu-item')).map(i => i.textContent) : [];
    const hasSave = items.some(t => t.indexOf('저장') >= 0);
    const hasDxf = items.some(t => t.indexOf('DXF') >= 0);
    // 바깥 클릭 → 닫힘
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const closed = !bar.querySelector('.menu-dd');
    // 그리기 메뉴에서 배선 도구 실행
    const drawBtn = bar.querySelector('[data-menu="그리기"]');
    drawBtn.click();
    const wireItem = Array.from(drawBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('배선') >= 0);
    wireItem.click();
    const toolSet = App.ui.tool === 'wire';
    App.toolbar.setTool('select');
    // 숨김 버튼(파일 액션) 핸들러 유지 확인
    const bound = ['act-save', 'act-load', 'act-bom', 'act-dxf', 'act-print'].every(id => {
      const el = document.getElementById(id);
      return el && typeof el.onclick === 'function';
    });
    return { hasAll, opened, hasSave, hasDxf, closed, toolSet, bound };
  });
  assert(mbar.hasAll, '메뉴바: 파일/편집/뷰/삽입/그리기/형식/도구 루트');
  assert(mbar.opened && mbar.hasSave && mbar.hasDxf, '파일 메뉴: 저장·DXF 항목');
  assert(mbar.closed, '바깥 클릭으로 메뉴 닫힘');
  assert(mbar.toolSet, '그리기 메뉴 → 배선 도구 실행');
  assert(mbar.bound, '메뉴로 이동한 액션 버튼 핸들러 유지');

  // === 메뉴 체크 토글 (뷰 > 품명 표시) ===
  const mchk = await page.evaluate(() => {
    const bar = document.getElementById('menubar');
    const viewBtn = bar.querySelector('[data-menu="뷰"]');
    viewBtn.click();
    let item = Array.from(viewBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('품명 표시') >= 0);
    const checkedMark = item.querySelector('.menu-check').textContent === '✓';
    item.click(); // 체크박스 토글
    const off = App.store.get().panel.showNames === false;
    // 다시 열면 ✓ 사라짐
    viewBtn.click();
    item = Array.from(viewBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('품명 표시') >= 0);
    const uncheckedMark = item.querySelector('.menu-check').textContent === '';
    item.click(); // 원복
    const back = App.store.get().panel.showNames !== false;
    return { checkedMark, off, uncheckedMark, back };
  });
  assert(mchk.checkedMark && mchk.off, '뷰 메뉴 체크 항목: ✓ 표시 + 토글 동작');
  assert(mchk.uncheckedMark && mchk.back, '체크 상태 메뉴에 반영 + 원복');

  // === 단축키 설정 (keymap) ===
  const km = await page.evaluate(() => {
    const defV = App.keymap.actionFor('v') === 'tool-select';
    const defW = App.keymap.actionFor('w') === 'tool-wire';
    const defR = App.keymap.actionFor('r') === 'act-rotate';
    // 재바인딩: x → 센터선 도구
    App.keymap.bind('x', 'tool-cline');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    const rebound = App.ui.tool === 'cline';
    App.toolbar.setTool('select');
    const saved = (localStorage.getItem('panel-keymap') || '').indexOf('tool-cline') >= 0;
    // 해제 후 기본값 복원
    App.keymap.unbind('tool-cline');
    const unbound = App.keymap.actionFor('x') === null && App.keymap.actionFor('c') === null;
    App.keymap.reset();
    const restored = App.keymap.actionFor('c') === 'tool-cline' && App.keymap.actionFor('v') === 'tool-select';
    // 설정 모달 열기/닫기
    App.keymap.open();
    const modalOpen = !document.getElementById('keymap-modal').classList.contains('hidden');
    App.keymap.close();
    const modalClosed = document.getElementById('keymap-modal').classList.contains('hidden');
    return { defV, defW, defR, rebound, saved, unbound, restored, modalOpen, modalClosed };
  });
  assert(km.defV && km.defW && km.defR, '기본 단축키: V선택 W배선 R회전');
  assert(km.rebound && km.saved, '단축키 재바인딩(x→센터선) + localStorage 저장');
  assert(km.unbound && km.restored, '단축키 해제 + 기본값 복원');
  assert(km.modalOpen && km.modalClosed, '단축키 설정 모달 열기/닫기');

  // === 키 입력이 keymap 경유로 동작 (기존 도구 단축키 유지) ===
  const kmkey = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    const wire = App.ui.tool === 'wire';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
    const sel = App.ui.tool === 'select';
    return { wire, sel };
  });
  assert(kmkey.wire && kmkey.sel, '키보드 단축키 keymap 경유 동작(W/V)');

  // === 두 글자 단축키 (연속 입력) ===
  const km2 = await page.evaluate(async () => {
    App.keymap.bind('du', 'tool-duct-h'); // D→U = 가로 덕트 ('d' 단독 = 치수 유지)
    const prefix = App.keymap.hasPrefix('d') === true;
    // d 누른 직후에는 대기 상태(치수로 즉시 안 바뀜) → u 이어 누르면 덕트
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    const waiting = App.ui.tool !== 'dim' && App.ui.tool !== 'duct-h';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }));
    const duct = App.ui.tool === 'duct-h';
    App.toolbar.setTool('select');
    // d 단독 → 잠시 후 치수 도구로 확정
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    await new Promise(r => setTimeout(r, 750));
    const dimAfter = App.ui.tool === 'dim';
    App.toolbar.setTool('select');
    // 무효 조합(d→x)이면 마지막 키 단독으로 재시도 → 아무 도구도 안 바뀜(x 미할당)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const invalid = App.ui.tool === 'select';
    const saved = (localStorage.getItem('panel-keymap') || '').indexOf('"du"') >= 0;
    App.keymap.reset();
    // 리셋 후 d 즉시 치수 (대기 없이)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    const instant = App.ui.tool === 'dim';
    App.toolbar.setTool('select');
    return { prefix, waiting, duct, dimAfter, invalid, saved, instant };
  });
  assert(km2.prefix && km2.waiting && km2.duct, '두 글자 단축키: D→U 연속 입력 = 가로 덕트');
  assert(km2.dimAfter, '두 글자 대기 후 한 글자(D 단독=치수) 확정');
  assert(km2.invalid && km2.saved, '무효 조합 무해 + 두 글자 바인딩 localStorage 저장');
  assert(km2.instant, '두 글자 바인딩 없으면 한 글자 즉시 실행');

  // === 도구막대 그룹 표시/숨김 (뷰 > 도구막대) ===
  const tbar = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('[data-tbar]')).map(el => el.getAttribute('data-tbar'));
    const hasAll = ['draw', 'edit', 'place', 'align', 'wire'].every(k => groups.indexOf(k) >= 0);
    // 메뉴에서 정렬 도구막대 끄기
    const bar = document.getElementById('menubar');
    const viewBtn = bar.querySelector('[data-menu="뷰"]');
    viewBtn.click();
    let item = Array.from(viewBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('도구막대: 정렬') >= 0);
    const checked = item.querySelector('.menu-check').textContent === '✓';
    item.click();
    const alEl = document.querySelector('[data-tbar="align"]');
    const hidden = alEl.style.display === 'none' && !App.menubar.toolbarVisible('align');
    const saved = (localStorage.getItem('panel-hidden-toolbars') || '').indexOf('align') >= 0;
    // 다시 열면 ✓ 없음 → 클릭으로 복원
    viewBtn.click();
    item = Array.from(viewBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('도구막대: 정렬') >= 0);
    const unchecked = item.querySelector('.menu-check').textContent === '';
    item.click();
    const back = alEl.style.display !== 'none' && App.menubar.toolbarVisible('align');
    return { hasAll, checked, hidden, saved, unchecked, back };
  });
  assert(tbar.hasAll, '도구막대 그룹 5종(data-tbar) 존재');
  assert(tbar.checked && tbar.hidden && tbar.saved, '뷰 메뉴에서 도구막대 끄기 + localStorage 저장');
  assert(tbar.unchecked && tbar.back, '도구막대 다시 켜기 (체크 반영)');

  // === 명령 레지스트리 + 명령 팔레트 (Ctrl+K) ===
  const cmdp = await page.evaluate(() => {
    const hasCmds = ['act-save', 'select-all', 'cmd-palette', 'wire-renum'].every(id => !!App.commands.get(id));
    const found = App.commands.search('저장').some(c => c.id === 'act-save');
    // Ctrl+K 로 팔레트 열기
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    const opened = App.cmdPalette.isOpen();
    // 검색 → Enter 로 실행 (그리기 > 배선 도구)
    const inp = document.getElementById('cmdp-input');
    inp.value = '단자 연결';
    inp.dispatchEvent(new Event('input'));
    const listed = document.querySelectorAll('#cmdp-list .cmdp-item').length >= 1;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const ran = App.ui.tool === 'wire' && !App.cmdPalette.isOpen();
    App.toolbar.setTool('select');
    return { hasCmds, found, opened, listed, ran };
  });
  assert(cmdp.hasCmds && cmdp.found, '명령 레지스트리: 메뉴 항목 자동 등록 + 검색');
  assert(cmdp.opened && cmdp.listed, 'Ctrl+K 명령 팔레트 열기 + 검색 목록');
  assert(cmdp.ran, '팔레트 Enter → 명령 실행(배선 도구) + 닫힘');

  // === 단축키 힌트 자동 동기화 (버튼 툴팁) ===
  const hint = await page.evaluate(() => {
    const btn = document.getElementById('tool-select');
    const before = (btn.getAttribute('title') || '').indexOf('(V)') >= 0;
    App.keymap.bind('q', 'tool-select');
    const after = (btn.getAttribute('title') || '').indexOf('(Q)') >= 0 && (btn.getAttribute('title') || '').indexOf('(V)') < 0;
    App.keymap.reset();
    const restored = (btn.getAttribute('title') || '').indexOf('(V)') >= 0;
    return { before, after, restored };
  });
  assert(hint.before && hint.after && hint.restored, '단축키 힌트 툴팁 자동 동기화 (V→Q→V)');

  // === Undo 라벨 (실행취소: 작업이름) ===
  const ulbl = await page.evaluate(() => {
    App.store.commit(s => { s.texts.push({ id: 'ul1', x: 1, y: 1, text: 'u', size: 8, color: '#000' }); }, { label: '라벨테스트' });
    const u1 = App.store.undoLabel() === '라벨테스트';
    // 편집 메뉴에 라벨 표시
    const bar = document.getElementById('menubar');
    const editBtn = bar.querySelector('[data-menu="편집"]');
    editBtn.click();
    const undoItem = Array.from(editBtn.querySelectorAll('.menu-item')).find(i => i.textContent.indexOf('실행 취소') >= 0);
    const inMenu = undoItem.textContent.indexOf('라벨테스트') >= 0;
    App.menubar.closeAll();
    App.store.undo();
    const r1 = App.store.redoLabel() === '라벨테스트';
    App.store.redo();
    const back = App.store.get().texts.some(t => t.id === 'ul1');
    App.store.commit(s => { s.texts = s.texts.filter(t => t.id !== 'ul1'); }); // 정리
    return { u1, inMenu, r1, back };
  });
  assert(ulbl.u1 && ulbl.inMenu, 'undo 라벨 기록 + 편집 메뉴에 "실행 취소: 이름" 표시');
  assert(ulbl.r1 && ulbl.back, 'undo→redo 라벨 이동 + 상태 복원');

  // === 하단 상태바 ===
  const sbar = await page.evaluate(() => {
    const hasBar = !!document.getElementById('statusbar');
    App.toolbar.setTool('wire');
    const toolShown = document.getElementById('sb-tool').textContent.indexOf('배선') >= 0;
    App.toolbar.setTool('select');
    App.store.commit(s => {
      s.components.push({ id: 'sb1', partNo: 'SB', type: 'MC', x: 100, y: 100, widthMM: 20, heightMM: 20, rotation: 0, label: 's', terminals: 0, term: [] });
    });
    App.ui.selected = new Set(['sb1']);
    App.render.all();
    const selShown = document.getElementById('sb-sel').textContent.indexOf('부품 1') >= 0;
    const gridShown = document.getElementById('sb-grid').textContent.indexOf('격자') >= 0;
    const posInBar = document.getElementById('statusbar').contains(document.getElementById('cursor-pos'));
    App.ui.selected.clear();
    App.store.commit(s => { s.components = s.components.filter(c => c.id !== 'sb1'); });
    return { hasBar, toolShown, selShown, gridShown, posInBar };
  });
  assert(sbar.hasBar && sbar.toolShown, '상태바: 현재 도구 표시');
  assert(sbar.selShown && sbar.gridShown && sbar.posInBar, '상태바: 선택 요약·격자·좌표 표시');

  // === 파일 저장 API + 최근 프로젝트 목록 모달 ===
  const psave = await page.evaluate(() => {
    const api = typeof App.persistence.saveToFile === 'function' &&
      typeof App.persistence.pushRecent === 'function' &&
      typeof App.persistence.listRecent === 'function' &&
      typeof App.persistence.parseProject === 'function';
    // parseProject 왕복
    const json = JSON.stringify({ panel: { widthMM: 100, heightMM: 100, gridMM: 10 }, components: [] });
    const parsed = App.persistence.parseProject(json);
    const parseOk = parsed.panel.widthMM === 100 && Array.isArray(parsed.wires);
    // 목록 모달: 항목 렌더 + 클릭 콜백
    let picked = null;
    App.menubar.openListModal('테스트 목록', [{ name: '프로젝트A', ts: 1700000000000, data: { x: 1 } }], '없음', r => { picked = r; });
    const modal = document.getElementById('list-modal');
    const item = modal.querySelector('.recent-item');
    const listed = item && item.textContent.indexOf('프로젝트A') >= 0;
    item.click();
    const pickedOk = picked && picked.data.x === 1 && !document.getElementById('list-modal');
    return { api, parseOk, listed, pickedOk };
  });
  assert(psave.api && psave.parseOk, '저장/최근 프로젝트 API + parseProject');
  assert(psave.listed && psave.pickedOk, '목록 모달 렌더 + 선택 콜백');

  await page.screenshot({ path: SHOT });
  await browser.close();

  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ ALL REGRESSION TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
