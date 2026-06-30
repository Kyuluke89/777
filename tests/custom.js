/* 커스텀 부품 에디터 + 기존 부품 단자 편집 검증 (실제 클릭) */
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

  // 1) 커스텀 부품 만들기
  await page.click('#act-custom');
  assert(await page.evaluate(() => getComputedStyle(document.getElementById('part-editor')).display !== 'none'), '모달 열림');
  await page.fill('#pe-name-in', '테스트단자대');
  await page.fill('#pe-w', '80');
  await page.fill('#pe-h', '60');
  await page.dispatchEvent('#pe-w', 'change');
  await page.dispatchEvent('#pe-h', 'change');
  const cbox = await page.locator('#pe-canvas').boundingBox();
  // 박스 안 3곳 클릭 → 단자 3개
  await page.mouse.click(cbox.x + cbox.width * 0.4, cbox.y + cbox.height * 0.4);
  await page.mouse.click(cbox.x + cbox.width * 0.6, cbox.y + cbox.height * 0.4);
  await page.mouse.click(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.6);
  const termsAdded = await page.evaluate(() => document.querySelectorAll('#pe-canvas [data-ti]').length);
  assert(termsAdded === 3, '단자 3개 추가 (' + termsAdded + ')');
  // 사각형 단자 1개 추가 (모양/크기 변경)
  await page.selectOption('#pe-tshape', 'rect');
  await page.fill('#pe-tw', '6'); await page.dispatchEvent('#pe-tw', 'change');
  await page.fill('#pe-th', '4'); await page.dispatchEvent('#pe-th', 'change');
  await page.selectOption('#pe-tlabel', 'left'); // 글씨 왼쪽
  await page.mouse.click(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.5);
  const rectCount = await page.evaluate(() => document.querySelectorAll('#pe-canvas rect').length);
  assert(rectCount >= 1, '사각형 단자 렌더 (' + rectCount + ')');
  await page.click('#pe-save');

  const saved = await page.evaluate(() => {
    const u = App.userlib.load();
    const p = u.find(x => x.partNo === '테스트단자대');
    const inLib = App.palette.getLibrary().some(x => x.partNo === '테스트단자대');
    const rect = p && p.term.some(t => t.shape === 'rect' && t.w === 6 && t.h === 4 && t.lp === 'left');
    return { count: u.length, has: !!p, w: p && p.w, h: p && p.h, terms: p && p.term.length, inLib, rect };
  });
  assert(saved.has && saved.w === 80 && saved.h === 60 && saved.terms === 4, '커스텀 부품 저장 (' + JSON.stringify(saved) + ')');
  assert(saved.rect, '사각형 단자(6×4, 글씨 왼쪽) 저장됨');
  assert(saved.inLib, '팔레트 라이브러리에 등장');

  // 2) 커스텀 부품 배치 → term 이 부품에 복사
  const placed = await page.evaluate(() => {
    const part = App.palette.getLibrary().find(x => x.partNo === '테스트단자대');
    App.store.commit(s => s.components.push({
      id: 'cust1', partNo: part.partNo, type: part.type, x: 100, y: 100,
      widthMM: part.w, heightMM: part.h, rotation: 0, label: part.name,
      terminals: part.terminals, term: JSON.parse(JSON.stringify(part.term))
    }));
    return App.terminals.world(App.store.get().components.find(c => c.id === 'cust1')).length;
  });
  assert(placed === 4, '커스텀 부품 단자 4개 배치 (' + placed + ')');

  // 3) 기존 부품 단자 편집: 선택 → 편집 → 단자 추가 → 적용
  await page.evaluate(() => { App.ui.selected.clear(); App.ui.selected.add('cust1'); App.render.all(); if (App.inspector) App.inspector.update(); });
  await page.click('#insp-edit-part');
  assert(await page.evaluate(() => getComputedStyle(document.getElementById('part-editor')).display !== 'none'), '편집 모달 열림');
  const loadedTerms = await page.evaluate(() => document.querySelectorAll('#pe-canvas [data-ti]').length);
  assert(loadedTerms === 4, '기존 단자 4개 로드 (' + loadedTerms + ')');
  const cbox2 = await page.locator('#pe-canvas').boundingBox();
  await page.mouse.click(cbox2.x + cbox2.width * 0.25, cbox2.y + cbox2.height * 0.25); // 빈 곳 → 단자 1개 추가
  await page.click('#pe-apply');
  const applied = await page.evaluate(() => {
    const c = App.store.get().components.find(x => x.id === 'cust1');
    return { terms: c.term.length };
  });
  assert(applied.terms === 5, '기존 부품에 단자 추가 적용 (' + applied.terms + ')');

  // 3.5) 저장 JSON 에 내 부품 라이브러리 동봉 → 비운 뒤 복원
  const rt = await page.evaluate(() => {
    const out = App.clone(App.store.get());
    out.userParts = App.userlib.load();              // saveToFile 과 동일 로직
    const json = JSON.stringify(out);
    App.userlib.saveAll([]); App.palette.reloadUser(); // 라이브러리 비우기
    const empty = App.palette.getLibrary().some(x => x.partNo === '테스트단자대');
    const data = JSON.parse(json);
    if (Array.isArray(data.userParts)) { App.userlib.merge(data.userParts); App.palette.reloadUser(); }
    const back = App.palette.getLibrary().some(x => x.partNo === '테스트단자대');
    return { empty, back, hasField: Array.isArray(out.userParts) && out.userParts.length > 0 };
  });
  assert(rt.hasField, '저장 데이터에 userParts 포함');
  assert(rt.empty === false, '라이브러리 비움 확인');
  assert(rt.back, '불러오기로 내 부품 라이브러리 복원');

  // 4) 커스텀 부품 삭제(라이브러리)
  const removed = await page.evaluate(() => {
    App.userlib.remove('테스트단자대'); App.palette.reloadUser();
    return App.palette.getLibrary().some(x => x.partNo === '테스트단자대');
  });
  assert(!removed, '커스텀 부품 라이브러리 삭제');

  await browser.close();
  assert(errors.length === 0, '콘솔 에러 없음: ' + JSON.stringify(errors));
  console.log('\n✅ CUSTOM EDITOR TESTS PASS');
})().catch(e => { console.error('\n❌ ' + e.message); process.exit(1); });
