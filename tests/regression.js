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
    await page.locator('#palette-list button').first().click();
    await page.mouse.click(px, py);
  }
  await page.click('#tool-select');
  await placeFirstPart(cx - 120, cy - 40);
  await placeFirstPart(cx + 120, cy - 40);
  await page.waitForTimeout(150);

  let st = await page.evaluate(() => ({ comps: App.store.get().components.length }));
  assert(st.comps === 2, '부품 2개 배치 (' + st.comps + ')');

  // --- LS 실데이터(EPLAN Data Portal) 라이브러리 탑재 확인 ---
  const ls = await page.evaluate(() => {
    const lib = App.palette.getLibrary();
    const mccb = lib.find(p => p.partNo === 'ABS32Fb-3A');
    const elcb = lib.find(p => p.partNo === 'EBS32Fb-30A/30mA');
    const plc = lib.find(p => p.partNo === 'XBM-DN16S');
    return { count: lib.length, mccb, elcb, plc, hasFake: !!lib.find(p => p.partNo === 'ABN53c') };
  });
  assert(ls.count >= 21, '카탈로그 실데이터 라이브러리 (' + ls.count + ')');
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
  assert(wireInfo.els === 1, '와이어 렌더 (' + wireInfo.els + ')');
  assert(wireInfo.route >= 2, '와이어 경로점');

  // --- 배선 편집: 세그먼트 이동 / 직각 유지 / 꺾임 추가 / 양끝 라벨 ---
  const wireEdit = await page.evaluate(() => {
    const s = App.store.get();
    const w = s.wires[0];
    const segs = App.wires.editSegments(s, w);
    const hseg = segs.find(x => x.orient === 'H');
    if (!w.corners) w.corners = JSON.parse(JSON.stringify(App.wires.corners(s, w)));
    w.corners[hseg.k].y -= 30; w.corners[hseg.k + 1].y -= 30; // 위로 이동
    const after = App.wires.route(s, w);
    const ortho = pts => pts.every((p, i) => i === 0 || pts[i - 1].x === p.x || pts[i - 1].y === p.y);
    const before2 = w.corners.length;
    App.wires.addBend(w.corners, hseg.k, w.corners[hseg.k].x + 5, w.corners[hseg.k].y);
    const after2 = w.corners.length;
    App.ui.selected.clear(); App.ui.selected.add(w.id);
    App.render.all();
    return {
      hseg: !!hseg, orthoAfter: ortho(after), added: after2 - before2,
      endLabels: !!App.wires.endLabels(s, w),
      handles: document.querySelectorAll('[data-seg]').length,
      endTexts: Array.from(document.querySelectorAll('#layer-wires text')).filter(t => t.textContent === 'W1').length
    };
  });
  assert(wireEdit.hseg, '수평 세그먼트(올리고내리기) 존재');
  assert(wireEdit.orthoAfter, '이동 후에도 경로 직각 유지');
  assert(wireEdit.added === 3, '꺾임 추가 시 corners +3 (' + wireEdit.added + ')');
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
  assert(rows.wl.length === 2 && rows.wl[1][0] === 'W1', '배선표 행 W1');

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
    const autoTag = /^[A-Z]\d+$/.test(c0.label || '');
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
    return { autoTag, nudged, dup: after - before, diffLabel, overlapRed: red };
  });
  assert(feat.autoTag, '자동 호기번호 부여 (' + feat.autoTag + ')');
  assert(feat.nudged, '방향키 미세이동');
  assert(feat.dup === 1, '복제 +1 (' + feat.dup + ')');
  assert(feat.diffLabel, '복제 시 새 호기번호');
  assert(feat.overlapRed, '겹침 경고 표시');

  // --- 영역(마퀴) 선택: 빈 공간 드래그로 다중 선택 ---
  await page.click('#tool-select');
  await page.evaluate(() => { App.ui.selected.clear(); App.render.all(); });
  await page.mouse.move(cx - 270, cy - 210);
  await page.mouse.down();
  await page.mouse.move(cx + 270, cy + 230, { steps: 6 });
  await page.mouse.up();
  const selN = await page.evaluate(() => App.ui.selected.size);
  assert(selN >= 2, '영역선택 다중 (' + selN + ')');

  await page.screenshot({ path: SHOT });
  await browser.close();

  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ ALL REGRESSION TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
