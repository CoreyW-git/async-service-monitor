# Authenticated Docker Recorder Desktop

Start the local stack from this checkout:

```powershell
docker compose -p asm-local -f docker-compose.local.yml up -d --build
```

Sign in at http://localhost:8000 and open http://localhost:8000/recorder-desktop.
The same-origin /vnc.html path redirects to this viewer. Port 6080 is no longer
published. Previous shared VNC passwords are unused; their files are left intact.

Administration > Configuration > Recorder Desktop controls enablement, minimum
role (default admin), an optional username allowlist, and public application
origin. The allowlist further restricts the minimum role; it does not grant roles.
Manage passwords, account enablement and roles in portal user settings.
Disabled portal authentication denies desktop access. The viewer, assets,
WebSocket and desktop recorder APIs use the portal authentication manager.
Logout disconnects that session's viewers; connected viewers recheck account
and policy access every two seconds.

Launch the Chromium recorder from the portal, then interact with its browser in
the desktop viewer. Recorded steps appear back in the portal. The desktop is
blank when no browser is open.

This is a shared desktop, NOT isolated per-user browsers. Authorized users see
and control the same browser and logged-in sessions. Grant access only to mutually
trusted operators. Closing the viewer does not stop or clear the recorder.

Set the public origin to an address such as https://monitor.example.com.
Separately create DNS and configure a TLS reverse proxy to port 8000. Serve the
whole portal and viewer on that origin. Preserve Host/Origin and forward WebSocket
Upgrade/Connection headers for /api/recorder-desktop/socket. Sign in on that
hostname before opening its viewer. HTTP public origins are rejected except for
localhost addresses. This setting changes links; it does not provision DNS or TLS.

Raw VNC listens only on container loopback without a separate password. Do not
publish port 5900 or add standalone websockify: all external desktop traffic must
pass through the authenticated portal gateway. The local stack exposes only port
8000 on host loopback. Remote proxy deployment requires appropriate private
network configuration. Container and host administrators remain trusted.

Authentication inherits the portal provider with no independent account store.
OCI sign-in is currently a portal placeholder: desktop access stays denied until
OCI integration supplies authenticated identities and mapped portal roles.

The launcher supervises the app, virtual display, and VNC server. If any
service exits, the container exits and Docker's restart policy restarts it.
The regular Dockerfile command still starts just the app; the local Compose
file opts into the recorder desktop.
