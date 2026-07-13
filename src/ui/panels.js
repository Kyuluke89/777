/* 좌우 패널 드래그 리사이즈 — 너비 localStorage 유지 */
(function () {
  'use strict';
  window.App = window.App || {};

  var MIN = 150, MAX = 480;

  function setup(asideId, side, lsKey) {
    var aside = document.getElementById(asideId);
    if (!aside) return;
    // 저장된 너비 복원
    try {
      var saved = parseInt(localStorage.getItem(lsKey), 10);
      if (saved >= MIN && saved <= MAX) aside.style.width = saved + 'px';
    } catch (err) {}

    var handle = document.createElement('div');
    handle.className = 'panel-resizer no-canvas';
    handle.title = '드래그로 패널 너비 조절';
    // 좌측 패널은 오른쪽 모서리, 우측 패널은 왼쪽 모서리에 삽입
    if (side === 'left') aside.parentNode.insertBefore(handle, aside.nextSibling);
    else aside.parentNode.insertBefore(handle, aside);

    var drag = null;
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      drag = { x0: e.clientX, w0: aside.getBoundingClientRect().width };
      handle.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x0;
      var w = side === 'left' ? drag.w0 + dx : drag.w0 - dx;
      w = Math.max(MIN, Math.min(MAX, Math.round(w)));
      aside.style.width = w + 'px';
    });
    function finish() {
      if (!drag) return;
      drag = null;
      handle.classList.remove('dragging');
      try { localStorage.setItem(lsKey, String(Math.round(aside.getBoundingClientRect().width))); } catch (err) {}
    }
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function init() {
    setup('left-panel', 'left', 'panel-left-w');
    setup('right-panel', 'right', 'panel-right-w');
  }

  App.panels = { init: init };
})();
