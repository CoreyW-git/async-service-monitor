import RFB from '/recorder-assets/core/rfb.js';

const status = document.getElementById('desktop-status');
let connection;
function connect() {
  if (connection) connection.disconnect();
  const url = new URL('/api/recorder-desktop/socket', window.location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  status.textContent = 'Connecting with your portal session...';
  const next = new RFB(document.getElementById('desktop-screen'), url.href);
  connection = next;
  next.scaleViewport = true;
  next.resizeSession = false;
  next.addEventListener('connect', () => { if (connection === next) status.textContent = 'Connected. Launch the recorder in the portal to open Chromium.'; });
  next.addEventListener('disconnect', () => { if (connection === next) status.textContent = 'Disconnected. Sign in to the portal and check your desktop permissions before reconnecting.'; });
  next.addEventListener('securityfailure', () => { status.textContent = 'Desktop connection refused. Contact your administrator.'; });
}
document.getElementById('desktop-reconnect').addEventListener('click', connect);
connect();
