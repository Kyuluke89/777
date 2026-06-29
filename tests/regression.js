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
    return { count: lib.length, mccb, elcb };
  });
  assert(ls.count >= 36, 'LS 부품 포함 라이브러리 (' + ls.count + ')');
  assert(ls.mccb && ls.mccb.w === 50 && ls.mccb.h === 96 && ls.mccb.type === 'MCCB', 'ABS32Fb-3A 실측 50×96 MCCB');
  assert(ls.elcb && ls.elcb.type === 'ELCB', 'EBS32Fb-30A/30mA ELCB 존재');

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

  await page.screenshot({ path: SHOT });
  await browser.close();

  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ ALL REGRESSION TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
