/* 3D 입체 보기 — 전장(플레이트) 위 부품/덕트/레일을 깊이(d)만큼 돌출시킨
   캐비닛(oblique) 투영. SVG 만으로 렌더(외부 라이브러리 없음), 읽기 전용. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const V3 = (App.view3d = {});

  let modal, svg;
  // 깊이 1mm 당 화면 오프셋 (위-오른쪽 방향) — 드래그로 시점 변경
  let KX = 0.5, KY = -0.35;
  let depthScale = 1; // 깊이 과장 배율
  let zoomK = 1;      // 휠 줌 배율

  function el(name, attrs, parent) {
    const n = document.createElementNS(App.SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function shade(hex, f) { // hex 색을 f(0~1) 만큼 어둡게
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function poly(parent, pts, fill, stroke) {
    el('polygon', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), fill: fill, stroke: stroke || '#334155', 'stroke-width': 0.5, 'stroke-linejoin': 'round' }, parent);
  }

  // 박스 1개(x,y,w,h,깊이 d) — 앞면+윗면+오른면 3면
  function box(parent, x, y, w, h, d, color, label, img) {
    const dx = d * KX * depthScale, dy = d * KY * depthScale;
    // 윗면
    poly(parent, [[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]], shade(color, 0.82));
    // 오른면
    poly(parent, [[x + w, y], [x + w, y + h], [x + w + dx, y + h + dy], [x + w + dx, y + dy]], shade(color, 0.62));
    // 앞면
    const fx = x + dx, fy = y + dy;
    poly(parent, [[fx, fy], [fx + w, fy], [fx + w, fy + h], [fx, fy + h]], color);
    if (img) {
      const im = el('image', { x: fx, y: fy, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', 'pointer-events': 'none' }, parent);
      im.setAttribute('href', img);
      el('rect', { x: fx, y: fy, width: w, height: h, fill: 'none', stroke: '#334155', 'stroke-width': 0.5 }, parent);
    }
    if (label) {
      const t = el('text', {
        x: fx + w / 2, y: fy + h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': Math.max(4, Math.min(8, w * 0.16)), fill: '#ffffff', 'font-weight': 'bold',
        stroke: 'rgba(0,0,0,.35)', 'stroke-width': 0.4, 'paint-order': 'stroke', 'pointer-events': 'none'
      }, parent);
      t.textContent = label;
    }
  }

  // 밝은 앞면 색(타입색을 연하게) — shade() 가 hex 를 요구하므로 hex 로 반환
  function faceColor(type) {
    const c = App.typeColor(type);
    const n = parseInt(c.slice(1), 16);
    const mix = function (v) { return Math.round(v + (255 - v) * 0.45); };
    const h = function (v) { return ('0' + v.toString(16)).slice(-2); };
    return '#' + h(mix((n >> 16) & 255)) + h(mix((n >> 8) & 255)) + h(mix(n & 255));
  }

  V3.render = function () {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const s = App.store.get();
    const p = s.panel;

    // 플레이트(뒤판) — 살짝 두께
    const plate = el('g', {}, svg);
    box(plate, 0, 0, p.widthMM, p.heightMM, 3, '#e2e8f0', null);

    // 배선(플레이트 표면, z≈0)
    const wg = el('g', {}, svg);
    (s.wires || []).forEach(function (w) {
      const pts = App.wires.route(s, w);
      if (!pts) return;
      el('polyline', {
        points: pts.map(function (q) { return q.x + ',' + q.y; }).join(' '),
        fill: 'none', stroke: w.color || '#dc2626', 'stroke-width': (w.width || 1.2),
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.9
      }, wg);
    });

    // 돌출 박스들 — 화면 겹침 순서(왼-아래 → 오른-위)로 정렬
    const items = [];
    (s.ducts || []).forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      items.push({ x: d.x, y: d.y, w: w, h: h, d: 40, color: '#fbbf24', label: null });
    });
    (s.rails || []).forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      items.push({ x: r.x, y: r.y, w: w, h: h, d: 8, color: '#94a3b8', label: null });
    });
    (s.components || []).forEach(function (c) {
      // 90/270도 회전은 가로세로 스왑(중심 유지)해 반영
      const rot = ((c.rotation || 0) % 180 + 180) % 180;
      let x = c.x, y = c.y, w = c.widthMM, h = c.heightMM;
      if (rot === 90) {
        const cx = x + w / 2, cy = y + h / 2;
        w = c.heightMM; h = c.widthMM; x = cx - w / 2; y = cy - h / 2;
      }
      items.push({
        x: x, y: y, w: w, h: h,
        d: c.d || 60, color: faceColor(c.type), label: c.label || c.partNo || '', img: c.img || null
      });
    });
    items.sort(function (a, b) { return (KX * a.x + KY * a.y) - (KX * b.x + KY * b.y); }); // painter's
    const bg = el('g', {}, svg);
    items.forEach(function (it) { box(bg, it.x, it.y, it.w, it.h, it.d, it.color, it.label, it.img); });

    // 뷰박스: 돌출 오프셋 포함해 맞춤
    const maxD = 80 * depthScale;
    const pad = 40;
    const x0 = -pad, y0 = maxD * -KY * -1 - pad - 40, x1 = p.widthMM + maxD * KX + pad, y1 = p.heightMM + pad;
    let vw = (x1 - x0), vh = (y1 + pad + 40 + maxD * 0.4);
    let vx = x0, vy = -(40 + maxD * 0.4) - pad;
    // 휠 줌: 중심 기준 축소/확대
    const cx0 = vx + vw / 2, cy0 = vy + vh / 2;
    vw /= zoomK; vh /= zoomK;
    svg.setAttribute('viewBox', (cx0 - vw / 2) + ' ' + (cy0 - vh / 2) + ' ' + vw + ' ' + vh);
  };

  V3.open = function () {
    if (!modal) return;
    zoomK = 1;
    modal.style.display = 'flex';
    V3.render();
  };
  V3.close = function () { if (modal) modal.style.display = 'none'; };
  V3.isOpen = function () { return modal && modal.style.display !== 'none'; };

  V3.init = function () {
    modal = document.getElementById('view3d-modal');
    svg = document.getElementById('view3d-svg');
    if (!modal) return;
    const close = document.getElementById('v3-close');
    if (close) close.onclick = V3.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) V3.close(); });
    const depth = document.getElementById('v3-depth');
    if (depth) depth.addEventListener('input', function () {
      depthScale = Math.max(0.2, parseFloat(this.value) || 1);
      V3.render();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && V3.isOpen()) V3.close();
    });
    // 드래그: 투영 각도(시점) 변경 · 휠: 줌
    let drag = null;
    if (svg) {
      svg.style.cursor = 'grab';
      svg.style.touchAction = 'none';
      svg.addEventListener('pointerdown', function (e) {
        drag = { x: e.clientX, y: e.clientY, kx: KX, ky: KY };
        svg.style.cursor = 'grabbing';
        try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      });
      svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        KX = Math.max(0.1, Math.min(1.0, drag.kx + (e.clientX - drag.x) * 0.003));
        KY = Math.max(-0.8, Math.min(-0.08, drag.ky - (e.clientY - drag.y) * 0.003));
        V3.render();
      });
      svg.addEventListener('pointerup', function () { drag = null; svg.style.cursor = 'grab'; });
      svg.addEventListener('wheel', function (e) {
        e.preventDefault();
        zoomK = Math.max(0.4, Math.min(8, zoomK * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        V3.render();
      }, { passive: false });
    }
  };
})(window);
