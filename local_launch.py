from __future__ import annotations

import sys
from pathlib import Path

import uvicorn


ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from service_monitor.admin import create_admin_app  # noqa: E402


if __name__ == "__main__":
    uvicorn.run(create_admin_app("config.yaml"), host="127.0.0.1", port=8000)
