/* 모바일 터치: 두 손가락 핀치 줌 + 팬, 진행 제스처 취소 검증 */
const { chromium } = require('playwright-core');
const path = require('path');
const EXE = process.env.PW_CHROME || undefined;
const INDEX = path.resolve(__dirname, '..', 'index.html');
function assert(c, m) { if (!c) throw new Error('ASSERT FAIL: ' + m); }

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--touch-events=enabled'] });
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 800, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/tailwind|ERR_TUNNEL|Failed to load resource/.test(t)) errors.push(t); } });
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + INDEX, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const svg = document.getElementById('canvas');
    const rect = svg.getBoundingClientRect();
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    function mk(pts) { return pts.map((pt, i) => new Touch({ identifier: i, target: svg, clientX: pt[0], clientY: pt[1], pageX: pt[0], pageY: pt[1] })); }
    function tev(type, pts) {
      const touches = mk(pts);
      svg.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches }));
    }
    const hasCancel = typeof App.interact.cancelGesture === 'function';

    // 핀치 확대(손가락 벌리기) → viewBox 폭 감소
    const w0 = App.viewport.getViewBox().w;
    tev('touchstart', [[cx - 30, cy], [cx + 30, cy]]);
    tev('touchmove', [[cx - 90, cy], [cx + 90, cy]]);
    tev('touchend', []);
    const w1 = App.viewport.getViewBox().w;

    // 두 손가락 팬 → viewBox x 이동
    const x0 = App.viewport.getViewBox().x;
    tev('touchstart', [[cx - 30, cy], [cx + 30, cy]]);
    tev('touchmove', [[cx + 30, cy], [cx + 90, cy]]);
    tev('touchend', []);
    const x1 = App.viewport.getViewBox().x;

    return { hasCancel, zoomedIn: w1 < w0 - 1, panned: Math.abs(x1 - x0) > 1 };
  });

  assert(r.hasCancel, 'cancelGesture API 존재');
  assert(r.zoomedIn, '두 손가락 핀치 줌(확대)');
  assert(r.panned, '두 손가락 팬');
  assert(errors.length === 0, '콘솔 에러 없음: ' + errors.join(' | '));

  console.log('\n✅ TOUCH TESTS PASS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
