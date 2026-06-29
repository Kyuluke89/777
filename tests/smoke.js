const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const exe = process.env.PW_CHROME || undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  // Tailwind CDN is blocked in this test sandbox — ignore that network error (styling only)
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/tailwindcss|ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/.test(t)) return;
    errors.push(t);
  });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'load' });
  // dismiss any confirm dialogs (autosave restore)
  page.on('dialog', d => d.dismiss());
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const out = {};
    out.appReady = !!(window.App && App.store && App.render && App.palette);
    out.seedCount = (App.palette.getLibrary() || []).length;

    // 1) panel renders
    out.panelRect = !!document.querySelector('#layer-panel rect');

    // 2) add a horizontal rail + duct + component via store
    App.store.commit(s => {
      s.ducts.push({ id: 'd1', orient: 'h', x: 0, y: 0, lengthMM: 600, widthMM: 60 });
      s.rails.push({ id: 'r1', orient: 'h', x: 20, y: 200, lengthMM: 560, widthMM: 35, type: 'DIN35' });
    });
    const part = App.palette.getLibrary()[0];
    App.store.commit(s => {
      s.components.push({ id: 'c1', partNo: part.partNo, type: part.type, x: 40, y: 200 - part.h,
        widthMM: part.w, heightMM: part.h, rotation: 0, label: part.partNo });
    });
    App.render.all();
    out.ductEls = document.querySelectorAll('#layer-ducts [data-id]').length;
    out.railEls = document.querySelectorAll('#layer-rails [data-id]').length;
    out.compEls = document.querySelectorAll('#layer-components [data-id]').length;

    // 3) save/load round trip
    const json = JSON.stringify(App.store.get());
    const reload = JSON.parse(json);
    App.store.replace(App.createEmptyProject());
    out.afterClear = App.store.get().components.length;
    App.store.replace(reload);
    App.render.all();
    out.afterRestore = App.store.get().components.length;
    out.restoreRenders = document.querySelectorAll('#layer-components [data-id]').length;

    // 4) undo/redo
    out.canUndo = App.store.canUndo();

    // 5) EDZ parser with synthetic zip (part.xml)
    let edzOk = false, edzErr = null, edzParts = 0;
    try {
      const xml = '<?xml version="1.0"?><parts><part partNr="TEST-1" description="MCCB 3P TEST" width="80" height="140" depth="70"/>' +
        '<part partNr="TEST-2" description="Magnetic Contactor" width="45" height="80" depth="86"/></parts>';
      const enc = new TextEncoder();
      const zipped = fflate.zipSync({ 'part.xml': enc.encode(xml) });
      const parsed = App.edz.parseArrayBuffer(zipped.buffer);
      edzParts = parsed.length;
      edzOk = parsed.length === 2 && parsed[0].type === 'MCCB' && parsed[1].type === 'MC';
    } catch (e) { edzErr = e.message; }
    out.edzOk = edzOk; out.edzErr = edzErr; out.edzParts = edzParts;
    out.fflate = typeof fflate;

    return out;
  });

  console.log('RESULT', JSON.stringify(r, null, 2));
  console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  const ok = r.appReady && r.panelRect && r.ductEls === 1 && r.railEls === 1 && r.compEls === 1 &&
    r.afterClear === 0 && r.afterRestore === 1 && r.restoreRenders === 1 && r.canUndo && r.edzOk &&
    errors.length === 0;
  console.log(ok ? '\n✅ ALL PASS' : '\n❌ FAIL');
  process.exit(ok ? 0 : 1);
})();
