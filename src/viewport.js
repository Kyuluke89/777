/* SVG 뷰포트 — viewBox 기반 팬/줌, mm 좌표계, 격자, 좌표 변환 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const SVGNS = 'http://www.w3.org/2000/svg';
  App.SVGNS = SVGNS;

  App.el = function (name, attrs, parent) {
    const node = document.createElementNS(SVGNS, name);
    if (attrs) {
      for (const k in attrs) {
        if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  };

  const Viewport = (App.viewport = {});
  let svg, layers;
  // viewBox: 보이는 영역 (mm 단위)
  let vb = { x: -100, y: -100, w: 1000, h: 1000 };

  Viewport.layers = function () { return layers; };
  Viewport.svg = function () { return svg; };

  function applyViewBox() {
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  }

  // 화면 px → 월드 mm 좌표
  Viewport.clientToWorld = function (clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const w = pt.matrixTransform(ctm.inverse());
    return { x: w.x, y: w.y };
  };

  // 현재 스케일 (px per mm)
  Viewport.scale = function () {
    const rect = svg.getBoundingClientRect();
    return rect.width / vb.w;
  };

  // 화면 고정 크기(px)를 월드 mm 로 환산 (핸들 등에 사용)
  Viewport.pxToMM = function (px) {
    return px / Viewport.scale();
  };

  Viewport.getViewBox = function () { return Object.assign({}, vb); };

  // 패널이 보이도록 맞춤
  Viewport.fitTo = function (widthMM, heightMM) {
    const rect = svg.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const margin = Math.max(widthMM, heightMM) * 0.15 + 50;
    let w = widthMM + margin * 2;
    let h = heightMM + margin * 2;
    // 종횡비 보정
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    vb.x = widthMM / 2 - w / 2;
    vb.y = heightMM / 2 - h / 2;
    vb.w = w;
    vb.h = h;
    applyViewBox();
  };

  // 줌 (factor>1 확대), 화면 좌표 기준점 유지
  Viewport.zoomAt = function (clientX, clientY, factor) {
    const before = Viewport.clientToWorld(clientX, clientY);
    vb.w /= factor;
    vb.h /= factor;
    vb.w = Math.max(20, Math.min(50000, vb.w));
    vb.h = Math.max(20, Math.min(50000, vb.h));
    applyViewBox();
    const after = Viewport.clientToWorld(clientX, clientY);
    vb.x += before.x - after.x;
    vb.y += before.y - after.y;
    applyViewBox();
  };

  Viewport.panBy = function (dxMM, dyMM) {
    vb.x -= dxMM;
    vb.y -= dyMM;
    applyViewBox();
  };

  function buildDefs() {
    const defs = App.el('defs', null, svg);
    // 보조 격자 (10mm)
    const minor = App.el('pattern', {
      id: 'grid-minor', width: 10, height: 10, patternUnits: 'userSpaceOnUse'
    }, defs);
    App.el('path', { d: 'M 10 0 H 0 V 10', fill: 'none', stroke: '#e6eaf0', 'stroke-width': 0.4 }, minor);
    // 주 격자 (100mm)
    const major = App.el('pattern', {
      id: 'grid-major', width: 100, height: 100, patternUnits: 'userSpaceOnUse'
    }, defs);
    App.el('rect', { width: 100, height: 100, fill: 'url(#grid-minor)' }, major);
    App.el('path', { d: 'M 100 0 H 0 V 100', fill: 'none', stroke: '#cfd6e0', 'stroke-width': 0.8 }, major);
  }

  Viewport.init = function (svgEl) {
    svg = svgEl;
    buildDefs();
    // 무한 격자 배경
    App.el('rect', {
      x: -100000, y: -100000, width: 200000, height: 200000,
      fill: 'url(#grid-major)', 'pointer-events': 'none', id: 'grid-bg'
    }, svg);
    // 원점 표시 (전장 좌상단 기준)
    const origin = App.el('g', { id: 'origin-mark', 'pointer-events': 'none' }, svg);
    App.el('line', { x1: -30, y1: 0, x2: 30, y2: 0, stroke: '#9ca3af', 'stroke-width': 0.6 }, origin);
    App.el('line', { x1: 0, y1: -30, x2: 0, y2: 30, stroke: '#9ca3af', 'stroke-width': 0.6 }, origin);

    layers = {
      panel: App.el('g', { id: 'layer-panel' }, svg),
      ducts: App.el('g', { id: 'layer-ducts' }, svg),
      rails: App.el('g', { id: 'layer-rails' }, svg),
      components: App.el('g', { id: 'layer-components' }, svg),
      wires: App.el('g', { id: 'layer-wires' }, svg),
      dims: App.el('g', { id: 'layer-dims' }, svg),
      overlay: App.el('g', { id: 'layer-overlay', 'pointer-events': 'none' }, svg)
    };
    applyViewBox();

    // 휠 줌
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      Viewport.zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });
  };
})(window);
