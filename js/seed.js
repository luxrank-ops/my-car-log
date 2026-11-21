/* seed.js — 최초 실행 시 기본 탑재 데이터 (work/차량관리_대장.md 기준, 2026-11-21 확인분) */
(function (global) {
  'use strict';

  const CONSUMABLES = {
    engine_oil:   { label: '엔진오일·오일필터', icon: '🛢️', order: 1 },
    air_filter:   { label: '에어클리너(에어필터)', icon: '🌬️', order: 2 },
    cabin_filter: { label: '에어컨 필터', icon: '❄️', order: 3 },
    brake_fluid:  { label: '브레이크액', icon: '🛑', order: 4 },
    brake_pad:    { label: '브레이크 패드·디스크', icon: '🧱', order: 5 },
    coolant:      { label: '냉각수', icon: '💧', order: 6 },
    trans_fluid:  { label: '미션오일', icon: '⚙️', order: 7 },
    spark_plug:   { label: '점화플러그', icon: '⚡', order: 8 },
    diff_fluid:   { label: '4WD 디퍼렌셜 오일', icon: '🧭', order: 9 },
    tire:         { label: '타이어·위치교환', icon: '🛞', order: 10 },
    battery:      { label: '배터리', icon: '🔋', order: 11 },
    wiper:        { label: '와이퍼 블레이드', icon: '🌧️', order: 12 }
  };

  const VEHICLES = [
    {
      id: 'ray',
      plate: '26라2388',
      name: '레이',
      fullName: '기아 레이 VAN',
      year: 2012,
      yearLabel: '2012년식(2013형 등록 2012-12-28)',
      engine: '카파 1.0 MPI 가솔린',
      transmission: '자동 4단',
      drive: 'FF(전륜)',
      fuel: '가솔린',
      tankL: 38,
      vin: 'KNAC**********2450',
      color: '#2b57e6',
      emoji: '🚙',
      odometer: 141545,
      odometerDate: '2026-11-21',
      odometerSource: '2026-11-21 본인 확인',
      inspectionEnd: '2026-12-27',
      inspectionWindow: '2026-09-28 ~ 2027-01-27',
      insurance: {
        company: 'KB손해보험', product: 'KB다이렉트 개인용', policy: '2026-***8027',
        start: '2026-03-24', end: '2027-03-24', premium: 288430,
        note: '기명 1인 · 자차 미가입'
      },
      mileageDeal: { baseKm: 131848, note: '최초 131,848km (약 8개월 9,697km)' },
      manualUrl: 'https://www.kia.com/kr/customer-service/manual.html',
      notes: '경차(1,000cc). 2018-06-05 트레일러 히치 튜닝 등록. 이전 10회.'
    },
    {
      id: 'colorado',
      plate: '91머4445',
      name: '콜로라도',
      fullName: '쉐보레 콜로라도 3.6 Z71-X AWD',
      year: 2022,
      yearLabel: '2022년식(등록 2022-03-10)',
      engine: '3.6L V6 직분사 가솔린(LGZ)',
      transmission: '자동 8단',
      drive: '4WD(AutoTrac 액티브 4x4)',
      fuel: '가솔린',
      tankL: 79.9,
      vin: '1GCP**********4767',
      color: '#e07b18',
      emoji: '🛻',
      odometer: 52051,
      odometerDate: '2026-04-08',
      odometerSource: '2026-04-08 정기검사 시 기록',
      odometerStale: true,
      inspectionEnd: '2027-03-09',
      inspectionWindow: '2026-12-10 ~ 2027-04-09',
      insurance: {
        company: 'KB손해보험', product: 'KB다이렉트 업무용', policy: '2026-***8122',
        start: '2026-03-24', end: '2027-03-24', premium: 477440,
        note: '자차 2,583만원 · 기명 만48~58세'
      },
      mileageDeal: null,
      manualUrl: 'https://www.chevrolet.co.kr/owner-manuals/real-new-colorado',
      notes: '화물·자가용. 2023-12-20 차체 너비·높이 변경 튜닝. 2025-11-13 자차 사고 수리.'
    },
    {
      id: 'impala',
      plate: '25거0986',
      name: '임팔라',
      fullName: '쉐보레 임팔라 2.5',
      year: 2015,
      yearLabel: '2016년식(등록 2015-11-10)',
      engine: '2.5L L4 ECOTEC SIDI 가솔린',
      transmission: '자동 6단',
      drive: 'FF(전륜)',
      fuel: '가솔린',
      tankL: 70,
      vin: '1G11**********2200',
      color: '#7a53d6',
      emoji: '🚘',
      odometer: 100769,
      odometerDate: '2025-10-14',
      odometerSource: '2025-10-14 종합검사 시 기록',
      odometerStale: true,
      inspectionEnd: '2027-12-15',
      inspectionWindow: '2025-12-16 ~ 2027-12-15',
      insurance: {
        company: 'KB손해보험', product: 'KB다이렉트 개인용', policy: '2026-***2207',
        start: null, end: null, premium: 315930,
        note: '기명+지정 1인 · 자차 미가입 · 증권 기간 미확인'
      },
      mileageDeal: { baseKm: 106288, note: '최초 106,288km' },
      manualUrl: 'https://www.chevrolet.co.kr/owner-manuals/impala',
      notes: '2,457cc / 199ps / 5,110×1,855×1,495mm / 공차 2,000kg(등록증) / 복합 10.5km/L. 조수석 감지센서 무상수리 통지(2020-06-05).'
    }
  ];

  const FUEL_LOGS = [
    { id: 'f_ray_01', vehicleId: 'ray', date: '2026-08-26', odometer: 138772, station: '송산주유소', liters: 33.040, unitPrice: 1816, amount: 60000, note: '' },
    { id: 'f_ray_02', vehicleId: 'ray', date: '2026-09-02', odometer: 139154, station: '송산주유소', liters: 27.533, unitPrice: 1816, amount: 50000, note: '' },
    { id: 'f_ray_03', vehicleId: 'ray', date: '2026-09-11', odometer: 139498, station: '김해 동남주유소', liters: 33.973, unitPrice: 1825, amount: 62000, note: '' },
    { id: 'f_ray_04', vehicleId: 'ray', date: '2026-09-22', odometer: 139943, station: '송산주유소', liters: 37.000, unitPrice: 1816, amount: 67192, note: '' },
    { id: 'f_ray_05', vehicleId: 'ray', date: '2026-10-11', odometer: 140367, station: '송산주유소', liters: 27.533, unitPrice: 1816, amount: 50000, note: '' },
    { id: 'f_ray_06', vehicleId: 'ray', date: '2026-10-21', odometer: 140716, station: '진해 신명주유소', liters: 32.103, unitPrice: 1869, amount: 60000, estimated: true, note: '수량은 금액÷단가 추정치' },
    { id: 'f_ray_07', vehicleId: 'ray', date: '2026-11-05', odometer: 141141, station: '생곡 국제산단 GS', liters: 34.085, unitPrice: 1819, amount: 62000, note: '' },
    { id: 'f_ray_08', vehicleId: 'ray', date: '2026-11-19', odometer: null, station: '', liters: 33.040, unitPrice: 1816, amount: 60000, estimated: true, note: '주행거리 미기록 · 2026-11-21 기준 141,545km' }
  ];

  const MAINT_LOGS = [
    /* 레이 2026-10-26 브레이크 정비 (총 421,344원 · 일련번호 BK0420-2026-3-005334) */
    {
      id: 'm_ray_2610_1', vehicleId: 'ray', date: '2026-10-26', item: '프론트 브레이크 디스크 양쪽 교환',
      itemKey: 'brake_pad', odometer: 140895, shop: '서부산서비스 기아오토큐(송정)',
      parts: 89600, labor: 53900, vat: 14350, total: 157850,
      warrantyUntil: '2026-11-25', invoice: 'BK0420-2026-3-005334',
      note: '디스크 2개'
    },
    {
      id: 'm_ray_2610_2', vehicleId: 'ray', date: '2026-10-26', item: '프론트 브레이크 패드 어셈블리 교환',
      itemKey: 'brake_pad', odometer: 140895, shop: '서부산서비스 기아오토큐(송정)',
      parts: 40800, labor: 7700, vat: 4850, total: 53350,
      warrantyUntil: '2026-11-25', invoice: 'BK0420-2026-3-005334', note: '프론트'
    },
    {
      id: 'm_ray_2610_3', vehicleId: 'ray', date: '2026-10-26', item: '브레이크 오일(DOT-4 LV) 교환·에어빼기',
      itemKey: 'brake_fluid', odometer: 140895, shop: '서부산서비스 기아오토큐(송정)',
      parts: 59400, labor: 29740, vat: 8914, total: 98054,
      warrantyUntil: '2026-11-25', invoice: 'BK0420-2026-3-005334',
      nextKm: 180000, nextDate: '2028-10-01',
      note: '작업지시서 권장: 다음 교환 ~18만km / 2028-10'
    },
    {
      id: 'm_ray_2610_4', vehicleId: 'ray', date: '2026-10-26', item: '프론트 브레이크 좌측 캘리퍼 어셈블리 교환',
      itemKey: 'brake_pad', odometer: 140895, shop: '서부산서비스 기아오토큐(송정)',
      parts: 55700, labor: 46200, vat: 10190, total: 112090,
      warrantyUntil: '2026-11-25', invoice: 'BK0420-2026-3-005334', note: '좌측 1개'
    },
    {
      id: 'm_ray_2308', vehicleId: 'ray', date: '2023-08-14', item: '발전기(알터네이터) 교환',
      itemKey: null, odometer: null, shop: '기아 서비스센터',
      parts: null, labor: null, vat: null, total: null, note: '자동차365 정비이력 · 금액 미확인'
    },
    /* 콜로라도 */
    {
      id: 'm_col_2511', vehicleId: 'colorado', date: '2025-11-13', item: '우측 판금·교체 수리(자차 사고)',
      itemKey: null, odometer: null, shop: '한국지엠 서비스센터',
      parts: 6190000, labor: 3470000, vat: null, total: 10630000,
      note: '자기부담 50만원 · 증권 표기 합계 약 1,063만원'
    },
    {
      id: 'm_col_2502', vehicleId: 'colorado', date: '2025-02-15', item: '전·후 펜더 정비',
      itemKey: null, odometer: 46861, shop: '한국지엠평택서비스센터',
      parts: null, labor: null, vat: null, total: null, note: '정비이력 · 금액 미확인'
    },
    /* 임팔라 */
    {
      id: 'm_imp_1703', vehicleId: 'impala', date: '2017-03-17', item: '중고차 성능점검',
      itemKey: null, odometer: 17458, shop: '성능점검장',
      parts: null, labor: null, vat: null, total: null, note: '17,458km'
    }
  ];

  /* 소모품 교체 주기 (일반 권장 + 작업지시서 확인분) */
  const SCHEDULES = [
    /* 레이 1.0 */
    { vehicleId: 'ray', item: 'engine_oil', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'air_filter', km: 15000, months: 24, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'cabin_filter', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'brake_fluid', km: 40000, months: 24, lastKm: 140895, lastDate: '2026-10-26' },
    { vehicleId: 'ray', item: 'brake_pad', km: 45000, months: 36, lastKm: 140895, lastDate: '2026-10-26', note: '2026-10-26 프론트 디스크·패드·캘리퍼 신품' },
    { vehicleId: 'ray', item: 'coolant', km: 60000, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'trans_fluid', km: 70000, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'spark_plug', km: 70000, months: 60, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'tire', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'battery', km: null, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'ray', item: 'wiper', km: null, months: 12, lastKm: null, lastDate: null },
    /* 콜로라도 3.6 AWD */
    { vehicleId: 'colorado', item: 'engine_oil', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'air_filter', km: 20000, months: 24, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'cabin_filter', km: 12000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'brake_fluid', km: 40000, months: 24, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'brake_pad', km: 50000, months: 36, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'coolant', km: 240000, months: 60, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'trans_fluid', km: 80000, months: 60, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'spark_plug', km: 100000, months: 72, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'diff_fluid', km: 45000, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'tire', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'battery', km: null, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'colorado', item: 'wiper', km: null, months: 12, lastKm: null, lastDate: null },
    /* 임팔라 2.5 */
    { vehicleId: 'impala', item: 'engine_oil', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'air_filter', km: 20000, months: 24, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'cabin_filter', km: 12000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'brake_fluid', km: 40000, months: 24, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'brake_pad', km: 50000, months: 36, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'coolant', km: 240000, months: 60, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'trans_fluid', km: 80000, months: 60, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'spark_plug', km: 100000, months: 72, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'tire', km: 10000, months: 12, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'battery', km: null, months: 48, lastKm: null, lastDate: null },
    { vehicleId: 'impala', item: 'wiper', km: null, months: 12, lastKm: null, lastDate: null }
  ];

  /* 대장의 '지금 할 일' — 앱이 스스로 챙기는 항목 */
  const REMINDERS = [
    { id: 'r_col_tax', vehicleId: 'colorado', title: '환경개선부담금 12,520원 납부', due: '2026-11-30', kind: 'tax', note: '다른 차량분 · 미납 시 압류 유지' },
    { id: 'r_col_seize', vehicleId: 'colorado', title: '압류 해제 확인', due: '2026-12-05', kind: 'admin', note: '강서구 환경위생과 강서구 환경위생과 · 2026-06-15 등록 건' },
    { id: 'r_col_ins', vehicleId: 'colorado', title: '보험 중복(메리츠·KB) 확인', due: '2026-12-20', kind: 'insurance', note: '메리츠 2025-07-26~2026-07-26 / KB 2025-07-28~2026-03-24 기간 겹침' },
    { id: 'r_imp_recall', vehicleId: 'impala', title: '조수석 감지센서 무상수리 확인', due: '2026-12-20', kind: 'recall', note: '한국지엠 1600-3000 · 2020-06-05 통지 건 조치 여부 미확인' },
    { id: 'r_ray_mileage', vehicleId: 'ray', title: '마일리지 특약 주행거리 사진 등록', due: '2026-12-10', kind: 'insurance', note: '최초 131,848km 기준 특약' }
  ];

  function build() {
    return JSON.parse(JSON.stringify({
      vehicles: VEHICLES,
      fuelLogs: FUEL_LOGS,
      maintLogs: MAINT_LOGS,
      schedules: SCHEDULES,
      reminders: REMINDERS,
      settings: { activeVehicle: 'ray', geminiKey: '', geminiModel: 'gemini-3.1-flash-lite' }
    }));
  }

  const SEED = { build, CONSUMABLES, VEHICLES, version: '2026-11-21' };
  global.SEED = SEED;
  if (typeof module !== 'undefined' && module.exports) module.exports = SEED;
})(typeof window !== 'undefined' ? window : globalThis);
