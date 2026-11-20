#!/usr/bin/env python3
"""배포된 실제 HTTPS URL 검증 (초기 시드·설명서 검색·엑셀·서비스워커·오프라인·설치성)"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://luxrank-ops.github.io/my-car-log/'
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(SHOTS, exist_ok=True)
R, F = [], []


def check(name, cond, detail=''):
    R.append(name)
    if cond:
        print(f'  PASS  {name}' + (f'  ({detail})' if detail != '' else ''), flush=True)
    else:
        print(f'  FAIL  {name}  {detail}', flush=True)
        F.append(name)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                            timezone_id='Asia/Seoul', locale='ko-KR', accept_downloads=True,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)

        print('[L1] 라이브 로딩', flush=True)
        pg.goto(URL, wait_until='networkidle', timeout=45000)
        pg.wait_for_selector('#app:not([hidden])', timeout=20000)
        check('앱 부팅', pg.is_visible('#tabbar'))
        st = pg.evaluate('() => ({v: DB.getState().vehicles.length, f: DB.getState().fuelLogs.length, mode: DB.mode()})')
        check('차 3대 시드', st['v'] == 3, st)
        check('주유 8건 시드', st['f'] == 8, st)
        check('IndexedDB 저장', st['mode'] == 'idb', st['mode'])
        plates = pg.evaluate('() => DB.getState().vehicles.map(v=>v.plate)')
        check('번호판 유지', plates == ['26라2388', '91머4445', '25거0986'], plates)
        vins = pg.evaluate('() => DB.getState().vehicles.map(v=>v.vin)')
        check('차대번호 마스킹', all(('*' in v) for v in vins), vins)
        pol = pg.evaluate('() => DB.getState().vehicles.map(v=>v.insurance.policy)')
        check('보험번호 마스킹', all(('*' in p) for p in pol), pol)
        tot = pg.evaluate('() => AI.fuelStats("ray").totalAmount')
        check('누적 주유비 471,192', tot == 471192, tot)
        eco = pg.evaluate('() => AI.fuelStats("ray").avgEco')
        check('평균 연비 12.39', eco and abs(eco - 12.39) < 0.02, round(eco, 3))
        pg.screenshot(path=os.path.join(SHOTS, 'live_home.png'))

        print('[L2] AI 빠른 입력 파서', flush=True)
        pg.click('[data-act="quick"]')
        pg.wait_for_selector('#qiText')
        pg.fill('#qiText', '[삼성카드] 60,000원 승인 송산주유소 11/19 일시불')
        pg.click('[data-act="qi-analyze"]')
        pg.wait_for_selector('#qiResult .form-grid')
        v = pg.evaluate('() => ({s: document.querySelector("#ff_station").value, a: document.querySelector("#ff_amount").value, d: document.querySelector("#ff_date").value})')
        check('카드문자 파싱', '송산' in v['s'] and v['a'] == '60000' and v['d'] == '2026-11-19', v)
        pg.click('#sheetPanel .sheet-head [data-close]')

        print('[L3] 설명서 검색', flush=True)
        pg.evaluate('() => { APP.S.tab="manual"; APP.renderAll(); }')
        pg.wait_for_timeout(300)
        pg.fill('#manualSearch', '엔진오일')
        pg.wait_for_timeout(300)
        n = pg.evaluate('() => document.querySelectorAll("#manualList .mcard").length')
        check('"엔진오일" 결과', n >= 4, n)
        check('하이라이트', pg.evaluate('() => document.querySelectorAll("#manualList mark").length') > 0)
        pg.click('[data-act="filter-veh"][data-id="ray"]')
        pg.wait_for_timeout(250)
        check('레이 필터', '레이 엔진오일 용량은 2.9L' in pg.inner_text('#manualList'))
        pg.click('[data-act="filter-veh"][data-id="all"]')
        pg.fill('#manualSearch', '4H'); pg.wait_for_timeout(250)
        check('"4H" 결과', '4H' in pg.inner_text('#manualList'))
        pg.fill('#manualSearch', '퓨즈'); pg.wait_for_timeout(250)
        check('"퓨즈" 결과', '퓨즈' in pg.inner_text('#manualList'))
        pg.fill('#manualSearch', '공기압'); pg.wait_for_timeout(250)
        pg.screenshot(path=os.path.join(SHOTS, 'live_manual.png'))

        print('[L4] AI 비서', flush=True)
        pg.fill('#chatInput', '레이 엔진오일 몇 리터야?')
        pg.click('#chatForm button[type="submit"]')
        pg.wait_for_timeout(500)
        ans = pg.evaluate('() => APP.S.chat[APP.S.chat.length-1].text')
        check('엔진오일 2.9L 답변', '2.9L' in ans, ans[:70])
        pg.fill('#chatInput', '브레이크 소음 나는데 보증 남았어?')
        pg.click('#chatForm button[type="submit"]')
        pg.wait_for_timeout(500)
        ans2 = pg.evaluate('() => APP.S.chat[APP.S.chat.length-1].text')
        check('보증 D-day 답변', '2026.11.25' in ans2 or '2026-11-25' in ans2, ans2[:90])
        pg.screenshot(path=os.path.join(SHOTS, 'live_chat.png'))

        print('[L5] 엑셀 다운로드', flush=True)
        pg.evaluate('() => { APP.S.tab="settings"; APP.renderAll(); }')
        pg.wait_for_timeout(300)
        with pg.expect_download(timeout=30000) as dl:
            pg.click('[data-act="export-xlsx"]')
        d = dl.value
        out = os.path.join(SHOTS, 'live_export.xlsx')
        d.save_as(out)
        check('파일명', d.suggested_filename.startswith('차계부_'), d.suggested_filename)
        import openpyxl
        wb = openpyxl.load_workbook(out)
        check('4시트', wb.sheetnames == ['전체요약', '주유기록', '정비기록', '차량정보'], wb.sheetnames)
        check('주유 8행', wb['주유기록'].max_row - 1 == 8, wb['주유기록'].max_row - 1)
        check('정비 5행', wb['정비기록'].max_row - 1 >= 5, wb['정비기록'].max_row - 1)
        pages = pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')

        print('[L6] PWA 설치성·서비스워커', flush=True)
        man = pg.evaluate('() => fetch("manifest.json").then(r=>r.json())')
        check('manifest display standalone', man['display'] == 'standalone', man['display'])
        check('manifest 아이콘 3종', len(man['icons']) >= 3, len(man['icons']))
        icons_ok = pg.evaluate('''async () => {
            const r = await fetch("manifest.json").then(r=>r.json());
            const res = await Promise.all(r.icons.map(i => fetch(i.src).then(x => x.status)));
            const apple = await fetch("icons/apple-touch-icon.png").then(x=>x.status);
            return res.concat([apple]);
        }''')
        check('아이콘 모두 200', all(c == 200 for c in icons_ok), icons_ok)
        sw = pg.evaluate('''async () => { const r = await navigator.serviceWorker.getRegistration();
            return {has: !!r, active: !!(r && r.active), scope: r && r.scope}; }''')
        check('서비스워커 활성', sw['has'] and sw['active'], sw)
        check('SW 스코프 /my-car-log/', '/my-car-log/' in (sw['scope'] or ''), sw['scope'])
        pg.reload(wait_until='networkidle')
        pg.wait_for_timeout(800)
        check('SW 페이지 제어', pg.evaluate('() => !!navigator.serviceWorker.controller'))

        print('[L7] 오프라인 동작', flush=True)
        ctx.set_offline(True)
        pg.reload(wait_until='domcontentloaded')
        pg.wait_for_selector('#app:not([hidden])', timeout=20000)
        off = pg.evaluate('() => ({v: DB.getState().vehicles.length, ans: AI.answer("레이 엔진오일 몇 리터야?","ray").text.slice(0,40)})')
        check('오프라인 재로딩', off['v'] == 3, off)
        check('오프라인 AI 답변', '2.9L' in off['ans'] or '엔진오일' in off['ans'], off['ans'])
        ctx.set_offline(False)

        print('[L8] 오류·레이아웃', flush=True)
        real = [e for e in errs if 'favicon' not in e.lower()]
        check('콘솔 오류 없음', len(real) == 0, real[:3])
        check('390px 가로 스크롤 없음', pages <= 1, pages)
        b.close()

    print(f'\n=== 라이브 검증: {len(R)-len(F)}/{len(R)} 통과 ===')
    if F:
        print('실패:', F)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
