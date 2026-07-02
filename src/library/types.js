/* 부품 타입(카테고리) — 기본 타입 + 사용자 추가 타입(색상) 관리 (localStorage) */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const T = (App.types = {});

  const BASE = {
    MCCB: '#1d4ed8', MCB: '#2563eb', ELCB: '#1e40af',
    MC: '#0d9488', CP: '#7c3aed', SMPS: '#ea580c',
    PLC: '#15803d', TB: '#64748b', RELAY: '#db2777', STOP: '#0f766e', NF: '#0e7490', ETC: '#475569'
  };
  const LABELS = {
    TB: '단자대 TB', RELAY: '릴레이', MCCB: 'MCCB', MCB: 'MCB', ELCB: 'ELCB',
    MC: 'MC', CP: 'CP', SMPS: 'SMPS', PLC: 'PLC', NF: '노이즈필터 NF', STOP: '스토퍼', ETC: '기타'
  };
  const PALETTE = ['#0891b2', '#9333ea', '#c2410c', '#4d7c0f', '#be123c', '#0369a1', '#7c3aed', '#0f766e', '#a16207', '#334155'];
  const KEY = 'panel-custom-types';
  let mem = null;

  function load() {
    if (mem) return mem;
    let a = [];
    try { const r = global.localStorage && localStorage.getItem(KEY); if (r) { const j = JSON.parse(r); if (Array.isArray(j)) a = j; } } catch (e) {}
    mem = a; return mem;
  }
  function save(a) { mem = a || []; try { if (global.localStorage) localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }

  // [{name, color, label, base}] — 기본 먼저, 사용자 타입 뒤
  T.list = function () {
    const out = Object.keys(BASE).map(function (n) { return { name: n, color: BASE[n], label: LABELS[n] || n, base: true }; });
    load().forEach(function (t) { if (!BASE[t.name]) out.push({ name: t.name, color: t.color, label: t.name, base: false }); });
    return out;
  };
  T.color = function (name) {
    if (BASE[name]) return BASE[name];
    const c = load().find(function (t) { return t.name === name; });
    return c ? c.color : BASE.ETC;
  };
  T.add = function (name, color) {
    name = (name || '').trim();
    if (!name || BASE[name]) return name || null;
    const arr = load();
    let e = arr.find(function (t) { return t.name === name; });
    if (!e) { arr.push({ name: name, color: color || PALETTE[arr.length % PALETTE.length] }); save(arr); }
    else if (color) { e.color = color; save(arr); }
    return name;
  };
  T.remove = function (name) { save(load().filter(function (t) { return t.name !== name; })); };
  T.allCustom = function () { return load().slice(); };
  T.merge = function (list) { (list || []).forEach(function (t) { if (t && t.name) T.add(t.name, t.color); }); };
  T.isCustom = function (name) { return !BASE[name] && !!load().find(function (t) { return t.name === name; }); };

  // <option> 묶음 + "＋ 새 타입…"(value=__new__)
  T.optionsHtml = function (selected) {
    const esc = App.esc || function (s) { return String(s); };
    let h = '';
    T.list().forEach(function (t) {
      h += '<option value="' + esc(t.name) + '"' + (t.name === selected ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    });
    h += '<option value="__new__">＋ 새 타입…</option>';
    return h;
  };
})(window);
