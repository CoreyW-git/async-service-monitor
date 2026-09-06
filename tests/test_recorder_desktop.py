import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from service_monitor.auth import AuthManager
from service_monitor.config import AppConfig, CheckConfig, PortalUserConfig, RecorderDesktopConfig, validate_recorder_desktop
from service_monitor.config_store import ConfigStore
from service_monitor.recorder_desktop import authorize_desktop, install_recorder_desktop


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.config = AppConfig()
        self.config.checks = [CheckConfig(name='test', type='http', interval_seconds=60, url='https://example.com')]
        self.user = dict(authenticated=True, username='operator', role='admin', provider='basic')

    def test_policy(self):
        self.assertEqual(authorize_desktop(self.config, self.user), self.user)
        for user in [dict(self.user, authenticated=False), dict(self.user, role='read_only'),
                     dict(self.user, role='read_write'), dict(self.user, provider='disabled')]:
            with self.assertRaises(HTTPException):
                authorize_desktop(self.config, user)
        self.config.recorder_desktop.minimum_role = 'read_write'
        authorize_desktop(self.config, dict(self.user, role='read_write'))
        self.config.recorder_desktop.allowed_users = ['someone-else']
        with self.assertRaises(HTTPException):
            authorize_desktop(self.config, self.user)
        self.config.recorder_desktop.allowed_users = ['operator']
        authorize_desktop(self.config, self.user)
        self.config.recorder_desktop.enabled = False
        with self.assertRaises(HTTPException):
            authorize_desktop(self.config, self.user)
        self.config.recorder_desktop.enabled = True
        self.config.portal.enabled = False
        with self.assertRaises(HTTPException):
            authorize_desktop(self.config, self.user)

    def test_urls_and_persistence(self):
        for url in ['https://monitor.example.com', 'http://localhost:8000', 'http://[::1]:8000']:
            validate_recorder_desktop(RecorderDesktopConfig(public_url=url))
        for url in ['javascript:alert(1)', 'http://example.com', 'https://example.com/path',
                    'https://user:password@example.com', 'https://example.com#x', 'https://[bad']:
            with self.assertRaises(ValueError):
                validate_recorder_desktop(RecorderDesktopConfig(public_url=url))
        with tempfile.TemporaryDirectory() as directory:
            store = ConfigStore(Path(directory) / 'config.yaml')
            self.config.recorder_desktop = RecorderDesktopConfig(False, 'read_write', ['operator'], 'https://monitor.example.com')
            store.save(self.config)
            self.assertEqual(store.load().recorder_desktop, self.config.recorder_desktop)

    def make_client(self):
        owner = self
        class Store:
            def load(self): return owner.config
            def save(self, config): owner.config = config
        auth = AuthManager(lambda: owner.config, Store())
        auth.authenticate_optional = lambda cookie: owner.user if cookie == 'valid' else {'authenticated': False}
        app = FastAPI()
        install_recorder_desktop(app, auth, Store())
        return TestClient(app)

    def test_real_portal_session_and_provider(self):
        self.config.portal.users = [PortalUserConfig('operator', 'unused', role='admin')]
        self.config.portal.session_secret = 'isolated-test-signing-secret'
        auth = AuthManager(lambda: self.config, None)
        cookie = auth._build_session_cookie(self.config, 'operator')
        authorize_desktop(self.config, auth.authenticate_optional(cookie))
        self.config.portal.users[0].enabled = False
        with self.assertRaises(HTTPException):
            authorize_desktop(self.config, auth.authenticate_optional(cookie))
        self.config.portal.users[0].enabled = True
        self.config.portal.provider = 'oci'
        with self.assertRaises(HTTPException):
            authorize_desktop(self.config, auth.authenticate_optional(cookie))

    def test_http_and_websocket_denials(self):
        with self.make_client() as client:
            for route in ['/recorder-desktop', '/recorder-desktop.js', '/recorder-assets/core/rfb.js', '/api/settings/recorder-desktop']:
                self.assertEqual(client.get(route).status_code, 401, route)
            for headers in [{'origin': 'http://testserver'}, {'origin': 'https://evil.example', 'cookie': 'service_monitor_session=valid'}]:
                with self.assertRaises(WebSocketDisconnect):
                    with client.websocket_connect('/api/recorder-desktop/socket', headers=headers):
                        self.fail('unauthorized connection accepted')
            client.cookies.set('service_monitor_session', 'valid')
            self.assertEqual(client.get('/api/settings/recorder-desktop').status_code, 200)
            self.assertEqual(client.put('/api/settings/recorder-desktop', json={'minimum_role': 'read_only'}).status_code, 422)
            self.assertEqual(client.put('/api/settings/recorder-desktop', json={'enabled': False}).status_code, 200)
            self.assertEqual(client.get('/recorder-desktop.js').status_code, 403)
            self.user['role'] = 'read_write'
            self.assertEqual(client.get('/api/settings/recorder-desktop').status_code, 403)

    def test_connection_revoked_on_policy_change(self):
        class Reader:
            async def read(self, size):
                await asyncio.sleep(30)
        class Writer:
            closed = False
            def close(self): self.closed = True
            async def wait_closed(self): pass
        writer = Writer()
        async def connect(*args): return Reader(), writer
        with patch('service_monitor.recorder_desktop.asyncio.open_connection', connect):
            with self.make_client() as client:
                with client.websocket_connect('/api/recorder-desktop/socket', headers={
                    'origin': 'http://testserver', 'cookie': 'service_monitor_session=valid'
                }) as socket:
                    self.config.recorder_desktop.enabled = False
                    self.assertEqual(socket.receive()['type'], 'websocket.close')
        self.assertTrue(writer.closed)


if __name__ == '__main__':
    unittest.main()
