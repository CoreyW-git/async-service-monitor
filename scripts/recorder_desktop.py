"""Run a loopback-only desktop behind the portal's authenticated gateway."""

import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


def main():
    os.umask(0o077)
    data = Path('/app/data')
    data.mkdir(parents=True, exist_ok=True)
    config = data / 'config.yaml'
    if not config.exists():
        shutil.copyfile('/app/config.yaml', config)
    children = []

    def stop(_signum=None, _frame=None):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        children.append(subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp']))
        for _ in range(100):
            if children[0].poll() is not None:
                raise RuntimeError('Recorder display failed to start.')
            if Path('/tmp/.X11-unix/X99').exists():
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('Recorder display startup timed out.')
        # Never publish 5900: portal HTTP/WebSocket authorization is the only gateway.
        children.append(subprocess.Popen(['x11vnc', '-display', ':99', '-localhost', '-nopw', '-forever', '-shared', '-rfbport', '5900']))
        children.append(subprocess.Popen([sys.executable, '-m', 'service_monitor', '--config', str(config)]))
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
        raise RuntimeError('A recorder desktop service exited; restarting the container is required.')
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    main()
