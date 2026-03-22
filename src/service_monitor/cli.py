from __future__ import annotations

import argparse
import asyncio

import uvicorn

from service_monitor.admin import create_admin_app
from service_monitor.config import load_config
from service_monitor.runner import MonitorRunner


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Async service monitor")
    parser.add_argument(
        "--mode",
        choices=["monitor", "admin"],
        default="admin",
        help="Run either the monitoring worker only or the admin portal with embedded monitor",
    )
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="Path to the YAML configuration file",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host for the admin server",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for the admin server",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.mode == "admin":
        app = create_admin_app(args.config)
        uvicorn.run(app, host=args.host, port=args.port)
        return

    config = load_config(args.config)
    runner = MonitorRunner(config)
    asyncio.run(runner.run())
