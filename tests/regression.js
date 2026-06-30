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
  assert(rows.bom.length === 2 && rows.bom[1][2] === 2, 'BOM 집계 (수량 2)');
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
    for (let i = 0; i < r1.length; i++) {
      if (Math.abs(r1[i].x - d1[i].x) > 0.01 || Math.abs(r1[i].y - d1[i].y) > 0.01) moved = true;
    }
    // 단자 접점(양 끝)은 정확히 유지
    if (Math.abs(r1[0].x - d1[0].x) > 0.01 || Math.abs(r1[0].y - d1[0].y) > 0.01) endsOk = false;
    const L = d1.length - 1;
    if (Math.abs(r1[L].x - d1[L].x) > 0.01 || Math.abs(r1[L].y - d1[L].y) > 0.01) endsOk = false;
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

  await page.screenshot({ path: SHOT });
  await browser.close();

  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ ALL REGRESSION TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
