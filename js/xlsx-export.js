/* xlsx-export.js — SheetJS로 다중 시트 .xlsx 생성 (오프라인 번들) */
(function (global) {
  'use strict';
  const C = global.CORE;
  const DB = () => global.DB;
  const AI = () => global.AI;

  function sheetFromAoa(aoa, widths) {
    const ws = global.XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    return ws;
  }

  function buildWorkbook() {
    const XLSX = global.XLSX;
    if (!XLSX) throw new Error('엑셀 엔진(XLSX)을 불러오지 못했습니다');
    const db = DB();
    const vehicles = db.vehicles();
    const wb = XLSX.utils.book_new();

    /* 1) 전체요약 */
    const head = ['차량', '차종', '연식', '주행거리(km)', '주행거리 기준일', '주유 횟수', '누적 주유비(원)', '누적 주유량(L)', '평균 실연비(km/L)', '정비 건수', '정비 비용(원)', '정기검사 만료', '보험 만기', '보험료(원)'];
    const rows = [head];
    vehicles.forEach(v => {
      const s = AI().fuelStats(v.id);
      const ms = db.maintLogs(v.id);
      rows.push([
        v.plate, v.fullName || v.name, v.year, v.odometer || '', v.odometerDate || '',
        s.count, Math.round(s.totalAmount), C.round1(s.totalLiters),
        s.avgEco ? C.round2(s.avgEco) : '',
        ms.length, Math.round(C.sum(ms, m => m.total)),
        v.inspectionEnd || '', (v.insurance && v.insurance.end) || '', (v.insurance && v.insurance.premium) || ''
      ]);
    });
    const t = C.sum(vehicles.map(v => AI().fuelStats(v.id)), s => s.totalAmount);
    rows.push([]);
    rows.push(['합계(주유)', '', '', '', '', C.sum(vehicles.map(v => AI().fuelStats(v.id)), s => s.count), Math.round(t), C.round1(C.sum(vehicles.map(v => AI().fuelStats(v.id)), s => s.totalLiters)), '', '', Math.round(C.sum(vehicles.map(v => C.sum(db.maintLogs(v.id), m => m.total)))), '', '', '']);
    rows.push([]);
    rows.push(['내보낸 시각', C.nowStamp(), '내 차 AI 차계부', '데이터는 폰 로컬(IndexedDB)에만 저장됩니다']);
    const ws1 = sheetFromAoa(rows, [12, 30, 8, 13, 14, 9, 15, 15, 15, 9, 15, 13, 13, 12]);
    XLSX.utils.book_append_sheet(wb, ws1, '전체요약');

    /* 2) 주유기록 */
    const fh = ['날짜', '차량', '주행거리(km)', '주유소', '수량(L)', '단가(원/L)', '금액(원)', '구간 주행(km)', '구간 연비(km/L)', '1km 연료비(원)', '비고'];
    const fr = [fh];
    const allFuel = [];
    vehicles.forEach(v => {
      AI().fuelStats(v.id).rows.forEach(r => allFuel.push({ v, r }));
    });
    allFuel.sort((a, b) => a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : 0);
    allFuel.forEach(({ v, r }) => {
      fr.push([
        r.date, v.plate + ' ' + v.name, r.odometer != null ? r.odometer : '', r.station || '',
        r.liters != null ? C.round2(r.liters) : '', r.unitPrice || '', r.amount || '',
        r.intervalKm != null ? Math.round(r.intervalKm) : '',
        r.eco != null ? C.round2(r.eco) : '',
        r.costPerKm != null ? Math.round(r.costPerKm) : '',
        [r.estimated ? '수량 추정' : '', r.note || ''].filter(Boolean).join(' · ')
      ]);
    });
    const ws2 = sheetFromAoa(fr, [12, 16, 13, 20, 10, 12, 12, 13, 14, 13, 30]);
    ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fr.length - 1, c: fh.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws2, '주유기록');

    /* 3) 정비기록 */
    const mh = ['날짜', '차량', '정비 항목', '주행거리(km)', '정비소', '부품비(원)', '공임(원)', '부가세(원)', '합계(원)', '무상보증 만료', '다음 교체(km)', '다음 교체(날짜)', '영수증/메모'];
    const mr = [mh];
    const allM = [];
    vehicles.forEach(v => db.maintLogs(v.id).forEach(m => allM.push({ v, m })));
    allM.sort((a, b) => a.m.date < b.m.date ? 1 : a.m.date > b.m.date ? -1 : 0);
    allM.forEach(({ v, m }) => {
      mr.push([
        m.date, v.plate + ' ' + v.name, m.item || '', m.odometer != null ? m.odometer : '', m.shop || '',
        m.parts != null ? m.parts : '', m.labor != null ? m.labor : '', m.vat != null ? m.vat : '',
        m.total != null ? m.total : '', m.warrantyUntil || '', m.nextKm || '', m.nextDate || '',
        [m.invoice ? '일련번호 ' + m.invoice : '', m.note || ''].filter(Boolean).join(' · ')
      ]);
    });
    const ws3 = sheetFromAoa(mr, [12, 16, 34, 13, 28, 12, 12, 11, 12, 13, 13, 13, 34]);
    XLSX.utils.book_append_sheet(wb, ws3, '정비기록');

    /* 4) 차량정보 */
    const ch = ['항목'].concat(vehicles.map(v => v.plate + ' ' + v.name));
    const cr = [ch];
    const fieldRows = [
      ['차종', v => v.fullName], ['연식', v => v.yearLabel], ['엔진', v => v.engine], ['변속기', v => v.transmission],
      ['구동', v => v.drive], ['연료', v => v.fuel], ['연료탱크(L)', v => v.tankL], ['차대번호', v => v.vin],
      ['주행거리(km)', v => v.odometer], ['주행거리 기준일', v => v.odometerDate], ['주행거리 출처', v => v.odometerSource],
      ['정기검사 만료', v => v.inspectionEnd], ['검사기간', v => v.inspectionWindow],
      ['보험사', v => v.insurance && v.insurance.company], ['보험 상품', v => v.insurance && v.insurance.product],
      ['보험 계약번호', v => v.insurance && v.insurance.policy], ['보험 시작', v => v.insurance && v.insurance.start],
      ['보험 만료', v => v.insurance && v.insurance.end], ['보험료(원)', v => v.insurance && v.insurance.premium],
      ['보험 담보/메모', v => v.insurance && v.insurance.note],
      ['마일리지 기준(km)', v => v.mileageDeal && v.mileageDeal.baseKm],
      ['설명서 링크', v => v.manualUrl], ['메모', v => v.notes]
    ];
    fieldRows.forEach(([k, fn]) => cr.push([k].concat(vehicles.map(v => {
      const val = fn(v);
      return val == null ? '' : val;
    }))));
    cr.push([]);
    cr.push(['소모품 주기', ...vehicles.map(() => '')]);
    cr.push(['항목', ...vehicles.map(v => v.plate + ' ' + v.name)]);
    const cons = global.SEED.CONSUMABLES;
    Object.keys(cons).forEach(k => {
      const row = [cons[k].label];
      vehicles.forEach(v => {
        const s = db.schedules(v.id).find(x => x.item === k);
        if (!s) { row.push('-'); return; }
        row.push((s.km ? C.num(s.km) + 'km' : '') + (s.km && s.months ? ' / ' : '') + (s.months ? s.months + '개월' : '') + (s.lastDate ? ' (최근 ' + s.lastDate + ')' : ' (기록 없음)'));
      });
      cr.push(row);
    });
    const ws4 = sheetFromAoa(cr, [18, 30, 30, 30, 30]);
    XLSX.utils.book_append_sheet(wb, ws4, '차량정보');

    return wb;
  }

  function fileName() {
    return '차계부_' + C.todayISO().replace(/-/g, '') + '.xlsx';
  }

  function exportFile() {
    const XLSX = global.XLSX;
    const wb = buildWorkbook();
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return { fileName: fileName(), bytes: out.byteLength, sheets: wb.SheetNames.slice() };
  }

  const EXPORT = { buildWorkbook, exportFile, fileName };
  global.EXPORT = EXPORT;
})(typeof window !== 'undefined' ? window : globalThis);
