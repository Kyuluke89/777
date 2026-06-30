/* 치수 도구 + 스냅 + 오프셋 이동 + 스토퍼 검증 (실제 클릭) */
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.PW_CHROME || undefined;
const INDEX = path.resolve(__dirname, '..', 'index.html');
function assert(c, m) { if (!c) throw new Error('ASSERT FAIL: ' + m); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/tailwind|ERR_TUNNEL|Failed to load resource/.test(t)) errors.push(t); } });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const box = await page.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;

  // 1) 치수: 점→점→오프셋 (3클릭)
  await page.click('#tool-dim');
  await page.mouse.click(cx - 120, cy);
  await page.mouse.click(cx + 120, cy);
  await page.mouse.move(cx, cy - 90);
  await page.mouse.click(cx, cy - 90);
  await page.waitForTimeout(100);
  const d1 = await page.evaluate(() => {
    const ds = App.store.get().dimensions;
    return { n: ds.length, len: ds[0] && App.dims.length(ds[0]), off: ds[0] && ds[0].off, els: document.querySelectorAll('#layer-dims [data-id]').length };
  });
  assert(d1.n === 1, '치수 1개 생성 (' + d1.n + ')');
  assert(d1.len > 0, '치수 길이 표시 (' + d1.len + ')');
  assert(d1.els === 1, '치수 렌더 (' + d1.els + ')');
  assert(Math.abs(d1.off) > 0, '오프셋 적용 (' + d1.off + ')');

  // 2) 스냅: 부품 모서리 근처 → 스냅
  const snap = await page.evaluate(() => {
    const s = App.store.get();
    s.components.push({ id: 'sc', partNo: 'x', type: 'TB', x: 200, y: 200, widthMM: 50, heightMM: 50, rotation: 0, label: 'x', terminals: 0, term: null });
    const sp = App.geom.snapPoint(s, 252, 248, 10); // (250,250) 모서리 근처
    return { x: sp.x, y: sp.y, snapped: sp.snapped };
  });
  assert(snap.snapped && snap.x === 250 && snap.y === 250, '부품 모서리 스냅 (' + JSON.stringify(snap) + ')');

  // 3) 오프셋 핸들 드래그
  await page.click('#tool-select');
  await page.evaluate(() => { const d = App.store.get().dimensions[0]; App.ui.selected.clear(); App.ui.selected.add(d.id); App.render.all(); });
  const handle = await page.evaluate(() => { const h = document.querySelector('[data-dim]'); const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const offBefore = await page.evaluate(() => App.store.get().dimensions[0].off);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y - 60, { steps: 6 });
  await page.mouse.up();
  const offAfter = await page.evaluate(() => App.store.get().dimensions[0].off);
  assert(offAfter !== offBefore, '오프셋 핸들 드래그로 이동 (' + offBefore + '→' + offAfter + ')');

  // 4) 저장/복원에 치수 포함
  const rt = await page.evaluate(() => {
    const json = JSON.stringify(App.store.get());
    App.store.replace(App.createEmptyProject());
    const cleared = App.store.get().dimensions.length;
    App.store.replace(JSON.parse(json)); App.render.all();
    return { cleared: cleared, dims: App.store.get().dimensions.length };
  });
  assert(rt.cleared === 0 && rt.dims === 1, '저장/복원 치수 보존');

  // 5) 찬넬 스토퍼: 라이브러리 존재 + 단자 0
  const stop = await page.evaluate(() => {
    const part = App.palette.getLibrary().find(p => p.partNo === 'END-STOP');
    if (!part) return { has: false };
    App.store.commit(s => s.components.push({ id: 'stop1', partNo: part.partNo, type: part.type, x: 100, y: 100, widthMM: part.w, heightMM: part.h, rotation: 0, label: part.name, terminals: part.terminals, term: null }));
    const terms = App.terminals.world(App.store.get().components.find(c => c.id === 'stop1')).length;
    return { has: true, type: part.type, terms };
  });
  assert(stop.has && stop.type === 'STOP', '찬넬 스토퍼 라이브러리 존재');
  assert(stop.terms === 0, '스토퍼 단자 0개 (' + stop.terms + ')');

  await browser.close();
  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ DIM + STOPPER TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
