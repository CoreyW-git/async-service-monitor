import threading
import time
import unittest
from unittest.mock import patch

from playwright.sync_api import sync_playwright
from service_monitor.recorder_helper import EventReporter, INIT_SCRIPT_TEMPLATE


class RecorderTests(unittest.TestCase):
    def test_slow_reporting_does_not_block_callbacks(self):
        received = []
        gate = threading.Event()

        class Client:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def post(self, url, json):
                gate.wait(1)
                received.append(json)
                return self

            def raise_for_status(self):
                pass

        with patch('service_monitor.recorder_helper.httpx.Client', Client):
            with EventReporter({}) as reporter:
                start = time.monotonic()
                reporter.send('test', {'event': 'click'})
                reporter.send('test', {'event': 'navigate'})
                self.assertLess(time.monotonic() - start, 0.1)
                gate.set()
        self.assertEqual(received, [{'event': 'click'}, {'event': 'navigate'}])

    def test_popups_and_dynamic_new_tab_links(self):
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context()
                context.expose_function('asmRecordEvent', lambda payload: None)
                context.add_init_script(INIT_SCRIPT_TEMPLATE)
                context.route('**/*', lambda route: route.fulfill(
                    content_type='text/html', body='<html><body><iframe src="https://frame.test/"></iframe></body></html>'
                    if route.request.url == 'https://main.test/' else '<html><body>Oracle quote fixture</body></html>'))
                page = context.new_page()
                page.goto('https://main.test/')
                self.assertIsNone(page.evaluate("window.open('https://popup.test/')"))
                frame = page.frames[1]
                self.assertIsNone(frame.evaluate("window.open('https://popup.test/')"))
                page.evaluate("""() => {
                    const a = document.createElement('a');
                    a.href = 'https://quote.test/ORCL'; a.target = '_blank';
                    a.textContent = 'Oracle'; document.body.appendChild(a);
                }""")
                link = page.get_by_role('link', name='Oracle')
                page.wait_for_function("document.querySelector('a').target === '_self'")
                link.evaluate("a => a.target = '_new'")
                page.wait_for_function("document.querySelector('a').target === '_self'")
                link.click()
                page.wait_for_url('https://quote.test/ORCL')
                self.assertEqual(len(context.pages), 1)
            finally:
                browser.close()


if __name__ == '__main__':
    unittest.main()
