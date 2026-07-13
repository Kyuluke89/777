/* 도구막대 그룹 드래그 이동 — ⋮⋮ 손잡이를 끌어 순서/줄 배치 변경 (localStorage 유지) */
(function () {
  'use strict';
  window.App = window.App || {};

  var LS_KEY = 'panel-tbar-layout'; // { row1: ['draw','edit'], row2: ['place','align','wire'] }
  var ROW_IDS = ['toolbar-row1', 'toolbar-row2'];

  function rowEls() {
    return ROW_IDS.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  }

  function markerOf(row) { return row.querySelector('.tbar-end'); }

  function groupsIn(row) {
    return Array.from(row.children).filter(function (el) { return el.hasAttribute && el.hasAttribute('data-tbar'); });
  }

  function currentLayout() {
    var lay = {};
    rowEls().forEach(function (row, i) {
      lay['row' + (i + 1)] = groupsIn(row).map(function (el) { return el.getAttribute('data-tbar'); });
    });
    return lay;
  }

  function saveLayout() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(currentLayout())); } catch (err) {}
  }

  // key 그룹을 rowIndex(0/1) 줄의 beforeKey 그룹 앞으로 이동 (beforeKey=null → 그 줄 그룹들의 끝)
  function moveGroup(key, rowIndex, beforeKey) {
    var rows = rowEls();
    var row = rows[rowIndex];
    var el = document.querySelector('[data-tbar="' + key + '"]');
    if (!row || !el) return false;
    var ref = null;
    if (beforeKey) {
      ref = row.querySelector('[data-tbar="' + beforeKey + '"]');
    }
    if (!ref) {
      var gs = groupsIn(row).filter(function (g) { return g !== el; });
      ref = gs.length ? gs[gs.length - 1].nextSibling : markerOf(row);
    }
    row.insertBefore(el, ref);
    saveLayout();
    return true;
  }

  function applyLayoutObj(lay) {
    if (!lay) return;
    rowEls().forEach(function (row, i) {
      var keys = lay['row' + (i + 1)] || [];
      var marker = markerOf(row);
      keys.forEach(function (key) {
        var el = document.querySelector('[data-tbar="' + key + '"]');
        if (el) row.insertBefore(el, marker);
      });
    });
  }

  function applyLayout() {
    var lay = null;
    try { lay = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (err) {}
    applyLayoutObj(lay);
  }

  var defaultLayout = null; // init 시점(HTML 기본 배치) 기억 → 초기화용

  function resetLayout() {
    try { localStorage.removeItem(LS_KEY); } catch (err) {}
    applyLayoutObj(defaultLayout);
  }

  // ── 드래그 ──
  var drag = null;

  function onMove(e) {
    if (!drag) return;
    var rows = rowEls();
    // 대상 줄: 커서 Y 가 들어있는 줄, 없으면 가까운 줄
    var target = null;
    var bestDist = Infinity;
    rows.forEach(function (row) {
      var r = row.getBoundingClientRect();
      var d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      if (d < bestDist) { bestDist = d; target = row; }
    });
    if (!target) return;
    // 삽입 위치: 커서 X 보다 중심이 오른쪽에 있는 첫 그룹 앞
    var ref = null;
    var gs = groupsIn(target).filter(function (g) { return g !== drag.el; });
    for (var i = 0; i < gs.length; i++) {
      var r = gs[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) { ref = gs[i]; break; }
    }
    if (!ref) ref = gs.length ? gs[gs.length - 1].nextSibling : markerOf(target);
    if (drag.el.nextSibling !== ref || drag.el.parentNode !== target) {
      target.insertBefore(drag.el, ref); // 실시간 반영 — 끌면서 바로 자리 잡음
    }
  }

  function onUp() {
    if (!drag) return;
    drag.el.classList.remove('tbar-dragging');
    drag = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    saveLayout();
  }

  function attachGrips() {
    document.querySelectorAll('[data-tbar]').forEach(function (group) {
      if (group.querySelector('.tbar-grip')) return;
      var grip = document.createElement('span');
      grip.className = 'tbar-grip';
      grip.title = '드래그로 도구막대 이동 (줄 사이 이동 가능)';
      grip.textContent = '⋮⋮';
      group.insertBefore(grip, group.firstChild);
      grip.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        drag = { el: group };
        group.classList.add('tbar-dragging');
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  function init() {
    defaultLayout = currentLayout();
    applyLayout();
    attachGrips();
  }

  App.tbarDrag = {
    init: init,
    moveGroup: moveGroup,
    applyLayout: applyLayout,
    resetLayout: resetLayout,
    currentLayout: currentLayout,
  };
})();
