/* db.js — 폰 로컬 저장소 (IndexedDB → localStorage 폴백). 서버 없음 */
(function (global) {
  'use strict';

  const DB_NAME = 'car-log-pwa';
  const STORE = 'kv';
  const KEY = 'state';
  const LS_KEY = 'car-log-pwa-state';
  const SCHEMA = 3;

  let dbPromise = null;
  let state = null;
  let persistTimer = null;
  let mode = 'idb';

  function openIDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('no-indexeddb')); return; }
      let req;
      try { req = global.indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open-failed'));
      req.onblocked = () => reject(new Error('idb-blocked'));
    }).catch(err => { mode = 'local'; throw err; });
    return dbPromise;
  }

  function idbGet(key) {
    return openIDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  function idbSet(key, val) {
    return openIDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('idb-abort'));
    }));
  }

  function lsGet() {
    try { const raw = global.localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function lsSet(val) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function ensureShape(s) {
    const base = global.SEED.build();
    if (!s || typeof s !== 'object') return base;
    ['vehicles', 'fuelLogs', 'maintLogs', 'schedules', 'reminders'].forEach(k => {
      if (!Array.isArray(s[k])) s[k] = base[k];
    });
    s.settings = Object.assign({}, base.settings, s.settings || {});
    if (!s.meta) s.meta = { seeded: true, schema: SCHEMA, seededAt: global.CORE.nowStamp() };
    return s;
  }

  async function init() {
    let saved = null;
    try {
      saved = await idbGet(KEY);
      mode = 'idb';
    } catch (e) {
      mode = 'local';
      saved = lsGet();
    }
    if (!saved) {
      // localStorage에만 있던 이전 데이터가 있으면 우선 사용
      const legacy = lsGet();
      if (legacy) saved = legacy;
    }
    state = ensureShape(saved);
    try {
      const lsKey = global.localStorage.getItem('car-log-gemini-key');
      const lsModel = global.localStorage.getItem('car-log-gemini-model');
      if (lsKey && !state.settings.geminiKey) state.settings.geminiKey = lsKey;
      if (lsModel && !state.settings.geminiModel) state.settings.geminiModel = lsModel;
    } catch (e) { /* noop */ }
    if (saved && !state.meta.seeded) state.meta.seeded = true;
    await persist();
    return state;
  }

  function persistNow() {
    const snapshot = state;
    if (mode === 'idb') {
      return idbSet(KEY, snapshot).catch(() => { mode = 'local'; lsSet(snapshot); });
    }
    lsSet(snapshot);
    return Promise.resolve();
  }

  function persist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => { persistTimer = null; persistNow(); }, 60);
    return Promise.resolve();
  }

  function flush() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    return persistNow();
  }

  function getState() { return state; }

  function vehicles() { return state.vehicles; }
  function vehicle(id) { return state.vehicles.find(v => v.id === id) || state.vehicles[0]; }
  function fuelLogs(vehicleId) {
    return global.CORE.sortBy(state.fuelLogs.filter(f => !vehicleId || f.vehicleId === vehicleId), f => f.date, 'asc');
  }
  function maintLogs(vehicleId) {
    return global.CORE.sortBy(state.maintLogs.filter(m => !vehicleId || m.vehicleId === vehicleId), m => m.date, 'desc');
  }
  function schedules(vehicleId) {
    return state.schedules.filter(s => !vehicleId || s.vehicleId === vehicleId);
  }
  function reminders(vehicleId) {
    return state.reminders.filter(r => !vehicleId || r.vehicleId === vehicleId);
  }
  function settings() { return state.settings; }

  function setSetting(k, v) {
    state.settings[k] = v;
    // Gemini 키는 localStorage에도 보관(요청대로 '폰 로컬'), DB 초기화와 분리
    try {
      if (k === 'geminiKey') {
        if (v) global.localStorage.setItem('car-log-gemini-key', v);
        else global.localStorage.removeItem('car-log-gemini-key');
      }
      if (k === 'geminiModel' && v) global.localStorage.setItem('car-log-gemini-model', v);
    } catch (e) { /* 저장 불가 환경 무시 */ }
    persist();
  }

  function addFuel(rec) {
    rec.id = rec.id || global.CORE.uid('f');
    state.fuelLogs.push(rec);
    // 차량 주행거리는 뒤로 가지 않게 갱신
    const v = vehicle(rec.vehicleId);
    if (v && rec.odometer && (!v.odometer || rec.odometer >= v.odometer)) {
      v.odometer = Number(rec.odometer);
      v.odometerDate = rec.date;
      v.odometerSource = '주유 기록에서 갱신';
      v.odometerStale = false;
    }
    persist();
    return rec;
  }
  function updateFuel(id, patch) {
    const i = state.fuelLogs.findIndex(f => f.id === id);
    if (i < 0) return null;
    state.fuelLogs[i] = Object.assign({}, state.fuelLogs[i], patch);
    persist();
    return state.fuelLogs[i];
  }
  function removeFuel(id) {
    state.fuelLogs = state.fuelLogs.filter(f => f.id !== id);
    persist();
  }

  function addMaint(rec) {
    rec.id = rec.id || global.CORE.uid('m');
    state.maintLogs.push(rec);
    // 소모품 주기 자동 갱신
    if (rec.itemKey && rec.date) {
      state.schedules.forEach(s => {
        if (s.vehicleId === rec.vehicleId && s.item === rec.itemKey) {
          if (rec.odometer) s.lastKm = Number(rec.odometer);
          s.lastDate = rec.date;
          s.lastShop = rec.shop || '';
        }
      });
    }
    const v = vehicle(rec.vehicleId);
    if (v && rec.odometer && (!v.odometer || rec.odometer >= v.odometer)) {
      v.odometer = Number(rec.odometer);
      v.odometerDate = rec.date;
      v.odometerSource = '정비 기록에서 갱신';
      v.odometerStale = false;
    }
    persist();
    return rec;
  }
  function updateMaint(id, patch) {
    const i = state.maintLogs.findIndex(m => m.id === id);
    if (i < 0) return null;
    state.maintLogs[i] = Object.assign({}, state.maintLogs[i], patch);
    persist();
    return state.maintLogs[i];
  }
  function removeMaint(id) {
    state.maintLogs = state.maintLogs.filter(m => m.id !== id);
    persist();
  }

  function addVehicle(v) {
    v.id = v.id || global.CORE.uid('v');
    state.vehicles.push(v);
    persist();
    return v;
  }
  function updateVehicle(id, patch) {
    const i = state.vehicles.findIndex(v => v.id === id);
    if (i < 0) return null;
    state.vehicles[i] = Object.assign({}, state.vehicles[i], patch);
    persist();
    return state.vehicles[i];
  }
  function removeVehicle(id) {
    state.vehicles = state.vehicles.filter(v => v.id !== id);
    state.fuelLogs = state.fuelLogs.filter(f => f.vehicleId !== id);
    state.maintLogs = state.maintLogs.filter(m => m.vehicleId !== id);
    state.schedules = state.schedules.filter(s => s.vehicleId !== id);
    state.reminders = state.reminders.filter(r => r.vehicleId !== id);
    if (state.settings.activeVehicle === id && state.vehicles[0]) state.settings.activeVehicle = state.vehicles[0].id;
    persist();
  }

  function removeReminder(id) {
    state.reminders = state.reminders.filter(r => r.id !== id);
    persist();
  }

  /* JSON 전체 내보내기 / 가져오기 */
  function exportJSON() {
    return {
      app: 'car-log-pwa',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      exportedBy: '내 차 AI 차계부',
      data: JSON.parse(JSON.stringify(state))
    };
  }

  function importJSON(obj) {
    const d = obj && obj.data ? obj.data : obj;
    if (!d || !Array.isArray(d.vehicles)) throw new Error('차계부 백업 파일이 아닙니다');
    state = ensureShape(d);
    state.meta.seeded = true;
    state.meta.importedAt = global.CORE.nowStamp();
    return flush().then(() => state);
  }

  async function reset() {
    state = global.SEED.build();
    state.meta = { seeded: true, schema: SCHEMA, seededAt: global.CORE.nowStamp(), resetAt: global.CORE.nowStamp() };
    await flush();
    return state;
  }

  async function storageEstimate() {
    if (global.navigator && navigator.storage && navigator.storage.estimate) {
      try {
        const e = await navigator.storage.estimate();
        return { usage: e.usage, quota: e.quota };
      } catch (err) { /* noop */ }
    }
    return null;
  }

  const DB = {
    init, flush, persist, getState, mode: () => mode,
    vehicles, vehicle, fuelLogs, maintLogs, schedules, reminders, settings, setSetting,
    addFuel, updateFuel, removeFuel, addMaint, updateMaint, removeMaint,
    addVehicle, updateVehicle, removeVehicle, removeReminder,
    exportJSON, importJSON, reset, storageEstimate, SCHEMA
  };

  global.DB = DB;
})(typeof window !== 'undefined' ? window : globalThis);
