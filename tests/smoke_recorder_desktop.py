"""Isolated Docker smoke test; never loads production config or credentials."""
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import uvicorn
from playwright.sync_api import sync_playwright, expect

from service_monitor.auth import AuthManager
from service_monitor.admin import create_admin_app
from service_monitor.config import AppConfig, CheckConfig, PortalUserConfig
from service_monitor.config_store import ConfigStore


def main():
    config = AppConfig()
    directory = tempfile.TemporaryDirectory()
    store = ConfigStore(Path(directory.name) / 'config.yaml')
    config.checks = [CheckConfig(name='smoke', type='http', interval_seconds=60, url='http://127.0.0.1:8765/readyz')]
    config.portal.users = [PortalUserConfig('test', 'unused-test-password', role='admin')]
    config.portal.session_secret = 'isolated-test-signing-secret'
    store.save(config)
    auth = AuthManager(store.load, store)
    cookie = auth._build_session_cookie(config, 'test')
    app = create_admin_app(store.path)
    os.environ['DISPLAY'] = ':98'
    children = []
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=8765, log_level='warning'))
    try:
        children.append(subprocess.Popen(['Xvfb', ':98', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        time.sleep(1)
        children.append(subprocess.Popen(['x11vnc', '-display', ':98', '-localhost', '-nopw', '-forever', '-shared', '-rfbport', '5900'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        for _ in range(100):
            if server.started: break
            time.sleep(.1)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            assert page.goto('http://127.0.0.1:8765/recorder-desktop').status == 401
            context.add_cookies([dict(name='service_monitor_session', value=cookie, url='http://127.0.0.1:8765')])
            page.goto('http://127.0.0.1:8765/admin/config')
            expect(page.locator('#recorder-desktop-settings-form')).to_be_visible(timeout=20000)
            page.locator('#recorder-desktop-settings-form input[name=allowed_users]').fill('test')
            page.get_by_role('button', name='Save Desktop Settings').click()
            expect(page.locator('#recorder-desktop-settings-status')).to_contain_text('saved')
            assert store.load().recorder_desktop.allowed_users == ['test']
            assert page.goto('http://127.0.0.1:8765/recorder-desktop').status == 200
            expect(page.locator('#desktop-status')).to_have_text(re.compile('^Connected'), timeout=20000)
            assert page.locator('canvas').count() == 1
            page.set_viewport_size(dict(width=390, height=844))
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            config = store.load()
            config.recorder_desktop.enabled = False
            store.save(config)
            expect(page.locator('#desktop-status')).to_have_text(re.compile('^Disconnected'), timeout=6000)
            assert not errors, errors
            browser.close()
        print('PASS: Administration form saves, real portal session required, noVNC WebSocket connected, mobile viewport, policy revocation, no JS errors')
    finally:
        server.should_exit = True
        if 'thread' in locals(): thread.join(timeout=10)
        for child in reversed(children):
            child.terminate()
            child.wait(timeout=10)
        directory.cleanup()


if __name__ == '__main__':
    main()
