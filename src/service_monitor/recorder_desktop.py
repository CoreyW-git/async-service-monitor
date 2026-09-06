"""Serve the recorder display exclusively through portal session authorization."""

import asyncio
import os
from dataclasses import asdict
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Cookie, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from service_monitor.auth import ROLE_LEVELS, SESSION_COOKIE
from service_monitor.config import RecorderDesktopConfig, validate_recorder_desktop


class DesktopSettings(BaseModel):
    enabled: bool = True
    minimum_role: str = "admin"
    allowed_users: list[str] = Field(default_factory=list)
    public_url: str = ""


def authorize_desktop(config, user):
    if not user.get('authenticated'):
        raise HTTPException(401, 'Sign in to the portal to use the recorder desktop.')
    if not config.portal.enabled or user.get('provider') == 'disabled':
        raise HTTPException(403, 'Recorder desktop requires portal authentication to be enabled.')
    settings = config.recorder_desktop
    if not settings.enabled:
        raise HTTPException(403, 'Recorder desktop is disabled by an administrator.')
    if ROLE_LEVELS.get(str(user.get('role')), 0) < ROLE_LEVELS[settings.minimum_role]:
        raise HTTPException(403, 'Your role does not permit recorder desktop access.')
    if settings.allowed_users and user.get('username') not in settings.allowed_users:
        raise HTTPException(403, 'Your account is not permitted to use the recorder desktop.')
    return user


def install_recorder_desktop(app, auth, store):
    active = {}
    assets = Path('/usr/share/novnc').resolve()
    web = Path(__file__).parent / 'web'
    headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}

    def require_desktop(session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE)):
        return authorize_desktop(store.load(), auth.authenticate_optional(session_id))

    async def disconnect_session(session_id):
        for socket, cookie in list(active.items()):
            if cookie == session_id:
                try:
                    await socket.close(code=1008)
                except RuntimeError:
                    pass

    app.state.disconnect_recorder_desktop = disconnect_session

    @app.get('/api/settings/recorder-desktop')
    async def settings(user=Depends(auth.require_role('admin'))):
        config = store.load()
        return {**asdict(config.recorder_desktop), 'auth_provider': config.portal.provider,
                'available': bool(os.getenv('DISPLAY')) and assets.is_dir()}

    @app.put('/api/settings/recorder-desktop')
    async def save_settings(payload: DesktopSettings, user=Depends(auth.require_role('admin'))):
        config = store.load()
        value = RecorderDesktopConfig(**payload.model_dump())
        value.public_url = value.public_url.strip().rstrip('/')
        value.allowed_users = list(dict.fromkeys(name.strip() for name in value.allowed_users))
        try:
            validate_recorder_desktop(value)
            config.recorder_desktop = value
            store.save(config)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {'status': 'ok', 'message': 'Recorder desktop settings saved. Existing connections recheck access within two seconds.'}

    @app.get('/vnc.html')
    async def legacy_viewer():
        return RedirectResponse('/recorder-desktop', status_code=307)

    @app.get('/recorder-desktop')
    async def viewer(request: Request):
        try:
            require_desktop(request.cookies.get(SESSION_COOKIE))
        except HTTPException as exc:
            return HTMLResponse('<h1>Recorder desktop</h1><p>Sign in with an authorized portal account.</p><a href="/">Open portal</a>', status_code=exc.status_code, headers=headers)
        if not assets.is_dir() or not os.getenv('DISPLAY'):
            raise HTTPException(503, 'Recorder desktop is not installed on this server.')
        return FileResponse(web / 'recorder-desktop.html', headers={**headers, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'"})

    @app.get('/recorder-assets/{name:path}')
    async def asset(name: str, user=Depends(require_desktop)):
        target = (assets / name).resolve()
        if not target.is_relative_to(assets) or not target.is_file():
            raise HTTPException(404, 'Asset not found')
        return FileResponse(target, headers=headers)

    @app.get('/recorder-desktop.js')
    async def viewer_script(user=Depends(require_desktop)):
        return FileResponse(web / 'recorder-desktop.js', media_type='application/javascript', headers=headers)

    @app.websocket('/api/recorder-desktop/socket')
    async def desktop_socket(socket: WebSocket):
        cookie = socket.cookies.get(SESSION_COOKIE)
        # Cookies alone are insufficient: reject cross-site WebSocket requests.
        try:
            origin = urlsplit(socket.headers.get('origin', ''))
        except ValueError:
            await socket.close(code=1008)
            return
        if origin.scheme not in {'http', 'https'} or origin.netloc.lower() != socket.headers.get('host', '').lower():
            await socket.close(code=1008)
            return
        try:
            require_desktop(cookie)
        except HTTPException:
            await socket.close(code=1008)
            return
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection('127.0.0.1', 5900), timeout=3)
        except (OSError, TimeoutError):
            await socket.close(code=1013)
            return
        await socket.accept()
        active[socket] = cookie

        async def to_browser():
            while chunk := await reader.read(65536):
                await socket.send_bytes(chunk)

        async def to_desktop():
            while True:
                writer.write(await socket.receive_bytes())
                await writer.drain()

        async def check_access():
            while True:
                await asyncio.sleep(2)
                require_desktop(cookie)

        tasks = [asyncio.create_task(job()) for job in (to_browser, to_desktop, check_access)]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            active.pop(socket, None)
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass
            try:
                await socket.close(code=1008)
            except (RuntimeError, WebSocketDisconnect):
                pass

    return require_desktop
