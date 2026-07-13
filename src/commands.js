/* 명령 레지스트리 — 메뉴바/단축키/명령팔레트/우클릭이 공유하는 단일 명령 목록 */
(function () {
  'use strict';
  window.App = window.App || {};

  var registry = new Map(); // id -> { id, name, group, run, hint }

  function register(cmd) {
    if (!cmd || !cmd.id || !cmd.name) return;
    registry.set(cmd.id, cmd);
  }

  // 기본 실행: 같은 id 의 버튼/체크박스 클릭 (숨김 버튼 포함)
  function run(id) {
    var cmd = registry.get(id);
    if (cmd && typeof cmd.run === 'function') { cmd.run(); return true; }
    var el = document.getElementById(id);
    if (el) { el.click(); return true; }
    return false;
  }

  function get(id) { return registry.get(id) || null; }

  function list() { return Array.from(registry.values()); }

  // 검색: 공백 구분 키워드 모두 포함(이름·그룹·id 대상, 대소문자 무시)
  function search(q) {
    var terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    var all = list();
    if (!terms.length) return all;
    return all.filter(function (c) {
      var hay = (c.group + ' ' + c.name + ' ' + c.id).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  App.commands = { register: register, run: run, get: get, list: list, search: search };
})();
