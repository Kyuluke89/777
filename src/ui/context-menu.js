/* 우클릭 컨텍스트 메뉴 — CAD 관례(우드래그=팬, 우클릭=메뉴) */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const CM = (App.ctxMenu = {});
  let el = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ctx-menu';
    el.style.display = 'none';
    document.body.appendChild(el);
    document.addEventListener('pointerdown', function (e) {
      if (el.style.display !== 'none' && !el.contains(e.target)) CM.hide();
    }, true);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') CM.hide(); });
    return el;
  }

  CM.show = function (x, y, items) {
    const m = ensure();
    m.innerHTML = '';
    items.forEach(function (it) {
      if (it === 'sep') {
        const s = document.createElement('div'); s.className = 'ctx-sep'; m.appendChild(s); return;
      }
      const d = document.createElement('div');
      d.className = 'ctx-item' + (it.danger ? ' danger' : '');
      d.innerHTML = '<span>' + (it.icon || '') + '</span><span>' + App.esc(it.label) + '</span>' +
        (it.key ? '<span class="ctx-key">' + it.key + '</span>' : '');
      d.onclick = function () { CM.hide(); try { it.fn(); } catch (e) { console.error(e); } };
      m.appendChild(d);
    });
    m.style.display = 'block';
    m.style.left = '0px'; m.style.top = '0px';
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  };
  CM.hide = function () { if (el) el.style.display = 'none'; };
  CM.isOpen = function () { return el && el.style.display !== 'none'; };
})(window);
