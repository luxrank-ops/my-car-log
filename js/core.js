/* core.js — 공통 유틸 (날짜·숫자·DOM) */
(function (global) {
  'use strict';

  const DAY = 86400000;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* "1,234" · "12,520원" · "6만원" → 숫자 */
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[,\s원₩]/g, '');
    if (!s) return null;
    let mult = 1;
    if (/만$/.test(s)) { mult = 10000; s = s.replace(/만$/, ''); }
    else if (/천$/.test(s)) { mult = 1000; s = s.replace(/천$/, ''); }
    const n = parseFloat(s);
    return isFinite(n) ? n * mult : null;
  }

  function num(v, d) {
    const n = (v == null || v === '') ? null : Number(v);
    if (n == null || !isFinite(n)) return '-';
    const fixed = d == null ? 0 : d;
    return n.toLocaleString('ko-KR', { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
  }
  function won(v) { return v == null || v === '' || !isFinite(Number(v)) ? '-' : num(v) + '원'; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* 날짜: 내부 저장은 'YYYY-MM-DD' 문자열 */
  function todayISO(d) {
    const t = d ? new Date(d) : new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toDate(iso) {
    if (!iso) return null;
    if (iso instanceof Date) return iso;
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function addDays(iso, n) {
    const d = toDate(iso); if (!d) return null;
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }
  function daysBetween(a, b) { /* b - a (일) */
    const d1 = toDate(a), d2 = toDate(b);
    if (!d1 || !d2) return null;
    return Math.round((d2 - d1) / DAY);
  }
  function dday(iso, base) {
    if (!iso) return null;
    return daysBetween(base || todayISO(), iso);
  }
  function ddayLabel(iso, base) {
    const d = dday(iso, base);
    if (d == null) return '-';
    if (d === 0) return 'D-DAY';
    return d > 0 ? 'D-' + d : 'D+' + Math.abs(d);
  }
  function fmtDate(iso) {
    const d = toDate(iso); if (!d) return '-';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function fmtDateShort(iso) {
    const d = toDate(iso); if (!d) return '-';
    return pad(d.getMonth() + 1) + '/' + pad(d.getDate());
  }
  function addMonths(iso, m) {
    const d = toDate(iso); if (!d) return null;
    const day = d.getDate();
    d.setMonth(d.getMonth() + m);
    if (d.getDate() < day) d.setDate(0);
    return todayISO(d);
  }
  function weekdayKo(iso) {
    const d = toDate(iso); if (!d) return '';
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  }
  function monthKey(iso) { return String(iso || '').slice(0, 7); }
  function nowStamp() {
    const d = new Date();
    return todayISO(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sum(arr, fn) {
    return (arr || []).reduce((a, v) => a + (Number(fn ? fn(v) : v) || 0), 0);
  }
  function sortBy(arr, fn, dir) {
    const d = dir === 'desc' ? -1 : 1;
    return arr.slice().sort((a, b) => {
      const x = fn(a), y = fn(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return x > y ? d : x < y ? -d : 0;
    });
  }
  function groupBy(arr, fn) {
    const out = {};
    (arr || []).forEach(v => { const k = fn(v); (out[k] = out[k] || []).push(v); });
    return out;
  }
  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* 검색 하이라이트 */
  function highlight(text, terms) {
    let out = esc(text);
    (terms || []).forEach(t => {
      if (!t) return;
      const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, m => '<mark>' + m + '</mark>');
    });
    return out;
  }

  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  const CORE = {
    DAY, $, $$, esc, parseNum, num, won, round1, round2, clamp,
    todayISO, toDate, addDays, daysBetween, dday, ddayLabel, fmtDate, fmtDateShort,
    addMonths, weekdayKo, monthKey, nowStamp, uid, sum, sortBy, groupBy, median, highlight, normalize, pad
  };

  global.CORE = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
})(typeof window !== 'undefined' ? window : globalThis);
