#!/usr/bin/env python3
"""서브패스(/my-car-log/) 배포 시나리오 검증 — GitHub Pages·Cloudflare Pages 경로"""
import functools, http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8901

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /my-car-log/... → ROOT/...
        if path.startswith('/my-car-log'):
            path = path[len('/my-car-log'):] or '/'
        return super().translate_path(path)
    def log_message(self, *a): pass

def main():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(H, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Asia/Seoul', locale='ko-KR')
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/my-car-log/index.html', wait_until='networkidle')
        pg.wait_for_selector('#app:not([hidden])', timeout=15000)
        st = pg.evaluate('() => ({v: DB.getState().vehicles.length, f: DB.getState().fuelLogs.length})')
        print('subpath seed:', st)
        sw = pg.evaluate('''async () => { const r = await navigator.serviceWorker.getRegistration(); return {scope: r && r.scope, active: !!(r && r.active)}; }''')
        print('subpath SW:', sw)
        pg.reload(wait_until='networkidle'); pg.wait_for_timeout(600)
        ctx.set_offline(True)
        pg.reload(wait_until='domcontentloaded')
        pg.wait_for_selector('#app:not([hidden])', timeout=15000)
        print('offline ok:', pg.evaluate('() => DB.getState().vehicles.length'))
        ctx.set_offline(False)
        man = pg.evaluate('() => fetch("manifest.json").then(r=>r.json()).then(j=>j.start_url)')
        print('manifest start_url:', man)
        print('pageerrors:', errs)
        b.close()

main()
