/* 미니맵 — 전장 축소판 + 현재 화면 위치, 클릭/드래그로 점프 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const MM = (App.minimap = {});
  let box, svg;

  function world(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return null;
    return pt.matrixTransform(m.inverse());
  }
  MM.jump = function (x, y) {
    App.viewport.centerOn(x, y);
    App.render.all();
    if (App.toolbar && App.toolbar.updateZoomPct) App.toolbar.updateZoomPct();
  };

  MM.update = function (state) {
    if (!svg) return;
    state = state || App.store.get();
    const p = state.panel;
    const M = Math.max(p.widthMM, p.heightMM) * 0.06 + 20;
    svg.setAttribute('viewBox', (-M) + ' ' + (-M) + ' ' + (p.widthMM + M * 2) + ' ' + (p.heightMM + M * 2));
    let html = '<rect x="0" y="0" width="' + p.widthMM + '" height="' + p.heightMM + '" fill="#fff" stroke="#94a3b8" stroke-width="' + (p.widthMM * 0.008) + '"/>';
    (state.ducts || []).forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM, h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      html += '<rect x="' + d.x + '" y="' + d.y + '" width="' + w + '" height="' + h + '" fill="#fde68a"/>';
    });
    (state.components || []).forEach(function (c) {
      html += '<rect x="' + c.x + '" y="' + c.y + '" width="' + c.widthMM + '" height="' + c.heightMM + '" fill="' + App.typeColor(c.type) + '" fill-opacity="0.65"/>';
    });
    const vb = App.viewport.getViewBox();
    html += '<rect x="' + vb.x + '" y="' + vb.y + '" width="' + vb.w + '" height="' + vb.h + '" fill="none" stroke="#ef4444" stroke-width="' + (p.widthMM * 0.012) + '"/>';
    svg.innerHTML = html;
  };

  MM.init = function () {
    const main = document.querySelector('main');
    if (!main) return;
    box = document.createElement('div');
    box.id = 'minimap';
    box.className = 'no-canvas';
    box.title = '미니맵 — 클릭/드래그로 이동';
    svg = document.createElementNS(App.SVGNS, 'svg');
    svg.style.cssText = 'width:100%;height:100%;display:block;';
    box.appendChild(svg);
    main.appendChild(box);
    let down = false;
    box.addEventListener('pointerdown', function (e) { down = true; const w = world(e); if (w) MM.jump(w.x, w.y); e.stopPropagation(); });
    box.addEventListener('pointermove', function (e) { if (!down) return; const w = world(e); if (w) MM.jump(w.x, w.y); });
    window.addEventListener('pointerup', function () { down = false; });
    App.store.subscribe(function (state) { MM.update(state); });
    MM.update();
  };
})(window);
