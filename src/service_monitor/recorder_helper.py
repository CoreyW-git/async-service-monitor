from __future__ import annotations

import argparse
import json
import queue
import shutil
import tempfile
import threading
import time
import traceback
from pathlib import Path
from typing import Any

import httpx
from service_monitor.recorder_urls import normalize_recorder_url

DEBUG_LOG = Path(__file__).resolve().parents[2] / "recorder-helper.debug.log"


def _debug(message: str) -> None:
    try:
        with DEBUG_LOG.open("a", encoding="utf-8") as handle:
            handle.write(f"{time.time():.3f} {message}\n")
    except Exception:
        pass


INIT_SCRIPT_TEMPLATE = """
(() => {
  function send(payload) {
    if (window.asmRecordEvent) {
      window.asmRecordEvent(payload);
    }
  }

  let popupReported = false;
  window.open = function(url, target) {
    if (!popupReported) send({
      event: "popup_blocked",
      url: typeof url === "string" ? url : "",
      title: document.title,
      message: "window.open was blocked so the recorder can stay locked to one primary page."
    });
    popupReported = true;
    return null;
  };

  // Block script popups in embedded ad frames too, but record only the main page.
  if (window.top !== window.self) return;

  function normalizeNewWindowTargets(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = Array.from(scope.querySelectorAll('a[target], form[target]'));
    if (scope.matches && scope.matches('a[target], form[target]')) nodes.push(scope);
    nodes.forEach((node) => {
      const target = (node.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' || target === '_new') {
        node.setAttribute('target', '_self');
      }
    });
  }

  function wireMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') normalizeNewWindowTargets(mutation.target);
        for (const node of mutation.addedNodes || []) {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            normalizeNewWindowTargets(node);
          }
        }
      }
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['target']
    });
  }

  function selectorFor(element) {
    if (!element || element === document.body) return "body";
    const form = element.closest("form");
    let prefix = "";
    if (form) {
      if (form.id) {
        prefix = `form#${form.id} `;
      } else if (form.getAttribute("name")) {
        prefix = `form[name="${form.getAttribute("name")}"] `;
      }
    }
    if (element.id) return `${prefix}#${element.id}`.trim();
    const name = element.getAttribute("name");
    if (name) return `${prefix}${element.tagName.toLowerCase()}[name="${name}"]`.trim();
    const aria = element.getAttribute("aria-label");
    if (aria) return `${prefix}${element.tagName.toLowerCase()}[aria-label="${aria}"]`.trim();
    const role = element.getAttribute("role");
    if (role) return `${prefix}${element.tagName.toLowerCase()}[role="${role}"]`.trim();
    return `${prefix}${element.tagName.toLowerCase()}`.trim();
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("a, button, input, textarea, select, [role='button']");
    if (!target) return;
    const anchor = target.closest("a");
    if (anchor) {
      const targetName = (anchor.getAttribute("target") || "").toLowerCase();
      if (targetName === "_blank" || targetName === "_new") {
        event.preventDefault();
        anchor.setAttribute("target", "_self");
        if (anchor.href) {
          try {
            window.location.assign(anchor.href);
          } catch (_) {
            window.location.href = anchor.href;
          }
        }
      }
    }
    send({
      event: "click",
      selector: selectorFor(target),
      url: window.location.href,
      title: document.title
    });
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!target || !target.tagName) return;
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const inputType = (target.getAttribute("type") || "").toLowerCase();
    const autocomplete = (target.getAttribute("autocomplete") || "").toLowerCase();
    const sensitive = inputType === "password" || autocomplete.includes("password");
    send({
      event: "fill",
      selector: selectorFor(target),
      value: target.value || "",
      display_value: sensitive ? "••••••••" : (target.value || ""),
      sensitive
    });
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const targetName = (form.getAttribute("target") || "").toLowerCase();
    if (targetName === "_blank" || targetName === "_new") {
      event.preventDefault();
      form.setAttribute("target", "_self");
      try {
        form.submit();
      } catch (_) {
      }
    }
    send({
      event: "submit",
      selector: selectorFor(form),
      action: form.action || window.location.href,
      method: (form.method || "POST").toUpperCase()
    });
  }, true);

  function ready() {
    normalizeNewWindowTargets(document);
    wireMutationObserver();
    send({
      event: "page_ready",
      url: window.location.href,
      title: document.title,
      textSnippet: (document.body && document.body.innerText ? document.body.innerText.slice(0, 280) : "")
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, {once: true});
  } else {
    ready();
  }
})();
"""


def _post(client: httpx.Client, url: str, payload: dict[str, Any]) -> None:
    _debug(f"POST {url} keys={sorted(payload.keys())}")
    client.post(url, json=payload, timeout=10.0)


class EventReporter:
    """Keep recorder callbacks independent of slow portal HTTP responses."""

    def __init__(self, headers):
        self.headers = headers
        self.pending = queue.Queue(maxsize=512)
        self.stopping = threading.Event()
        self.worker = threading.Thread(target=self._run, daemon=True)

    def __enter__(self):
        self.worker.start()
        return self

    def send(self, url, payload):
        try:
            self.pending.put_nowait((url, payload))
        except queue.Full:
            _debug('Recorder reporting queue full; event dropped')

    def _run(self):
        with httpx.Client(headers=self.headers, timeout=2.0) as client:
            while not self.stopping.is_set() or not self.pending.empty():
                try:
                    url, payload = self.pending.get(timeout=0.1)
                except queue.Empty:
                    continue
                try:
                    client.post(url, json=payload).raise_for_status()
                except Exception as exc:
                    _debug(f'Recorder report failed: {type(exc).__name__}')
                finally:
                    self.pending.task_done()

    def __exit__(self, *_args):
        self.stopping.set()
        self.worker.join(timeout=3)


def _get(client: httpx.Client, url: str) -> dict[str, Any]:
    _debug(f"GET {url}")
    response = client.get(url, timeout=10.0)
    response.raise_for_status()
    return response.json()


def _cleanup_temp_profile(temp_profile) -> None:
    profile_path = getattr(temp_profile, "name", None)
    try:
        temp_profile.cleanup()
        return
    except PermissionError as exc:
        _debug(f"temp profile cleanup deferred for {profile_path}: {exc!r}")
    except Exception as exc:
        _debug(f"temp profile cleanup failed for {profile_path}: {exc!r}")
        return

    if profile_path:
        try:
            shutil.rmtree(profile_path, ignore_errors=True)
        except Exception as exc:
            _debug(f"temp profile rmtree fallback failed for {profile_path}: {exc!r}")


def _launch_browser_context(playwright, viewport_width: int, viewport_height: int, javascript_enabled: bool):
    launch_args = [
        "--new-window",
        "--start-maximized",
        f"--window-size={viewport_width},{viewport_height}",
        "--window-position=72,72",
    ]
    errors: list[str] = []
    for channel in (None, "chrome", "msedge"):
        temp_profile = tempfile.TemporaryDirectory(prefix="asm-recorder-")
        try:
            kwargs: dict[str, Any] = {
                "user_data_dir": temp_profile.name,
                "headless": False,
                "ignore_default_args": ["--disable-popup-blocking"],
                "args": launch_args,
                "no_viewport": True,
                "service_workers": "block",
                "java_script_enabled": javascript_enabled,
            }
            if channel:
                kwargs["channel"] = channel
            context = playwright.chromium.launch_persistent_context(**kwargs)
            return context, channel or "chromium", temp_profile
        except Exception as exc:
            _cleanup_temp_profile(temp_profile)
            errors.append(f"{channel or 'chromium'}: {exc}")
    raise RuntimeError(" | ".join(errors))


def run(
    session_id: str,
    target_url: str,
    api_base: str,
    token: str,
    wait_until: str,
    viewport_width: int,
    viewport_height: int,
    javascript_enabled: bool,
) -> int:
    _debug(
        "run start "
        f"session_id={session_id} target_url={target_url} wait_until={wait_until} "
        f"viewport={viewport_width}x{viewport_height} javascript_enabled={javascript_enabled}"
    )
    from playwright.sync_api import sync_playwright

    _debug("playwright import complete")
    headers = {"x-recorder-token": token}
    status_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/status"
    event_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/event"
    control_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/control"

    with EventReporter(headers) as reporter, httpx.Client(headers=headers) as client:
        try:
            target_url = normalize_recorder_url(target_url)
            _debug("posting launching status")
            _post(client, status_url, {"status": "launching", "message": "Launching desktop recorder browser...", "browser_open": False})
            _debug("launching status posted")
            with sync_playwright() as playwright:
                _debug("sync_playwright entered")
                context, runtime_name, temp_profile = _launch_browser_context(
                    playwright,
                    viewport_width,
                    viewport_height,
                    javascript_enabled,
                )
                _debug(f"browser launched runtime={runtime_name}")
                try:
                    existing_pages = list(context.pages)
                    page = existing_pages[0] if existing_pages else context.new_page()
                    context.expose_binding(
                        "asmRecordEvent",
                        lambda source, payload: reporter.send(event_url, dict(payload or {}))
                        if source['page'] == page and source['frame'] == page.main_frame else None,
                    )
                    context.add_init_script(INIT_SCRIPT_TEMPLATE)
                    _debug(f"primary page selected existing={bool(existing_pages)} total_pages={len(context.pages)}")

                    def focus_primary_page() -> None:
                        try:
                            page.bring_to_front()
                        except Exception:
                            pass

                    focus_primary_page()

                    def handle_extra_page(extra_page):
                        if extra_page == page or extra_page.is_closed():
                            return
                        popup_url = "about:blank"
                        try:
                            popup_url = extra_page.url or "about:blank"
                        except Exception:
                            pass
                        # Close before reporting so redirect chains cannot keep running.
                        try:
                            extra_page.close()
                        except Exception:
                            pass
                        focus_primary_page()
                        reporter.send(
                            event_url,
                            {
                                "event": "popup_blocked",
                                "url": popup_url,
                                "title": "Blocked secondary tab",
                                "message": "A secondary tab or popup was blocked so the recorder can stay focused on one controlled browser page.",
                            },
                        )

                    for extra_page in list(context.pages):
                        if extra_page != page:
                            handle_extra_page(extra_page)

                    context.on("page", handle_extra_page)

                    def on_navigate(frame):
                        if frame == page.main_frame:
                            reporter.send(
                                event_url,
                                {
                                    "event": "navigate",
                                    "url": frame.url,
                                    "title": "",
                                },
                            )

                    page.on("framenavigated", on_navigate)
                    _debug("navigating to target")
                    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
                    try:
                        page.goto(target_url, wait_until=wait_until, timeout=15000)
                    except PlaywrightTimeoutError:
                        if page.url == 'about:blank':
                            raise
                        _debug('Page still loading; recording continues without waiting for background traffic')
                    _debug("target loaded")
                    focus_primary_page()

                    _post(client, status_url, {"status": "running", "message": f"{runtime_name} recorder window launched", "browser_open": True})
                    _debug("running status posted")

                    next_storage_capture = 0.0
                    while True:
                        for extra_page in list(context.pages):
                            if extra_page != page:
                                handle_extra_page(extra_page)
                        if page.is_closed():
                            break
                        try:
                            if time.monotonic() >= next_storage_capture:
                                storage_state = json.dumps(context.storage_state())
                                reporter.send(
                                    status_url,
                                    {
                                        "status": "running",
                                        "browser_open": True,
                                        "storage_state": storage_state,
                                        "storage_state_captured_at": time.time(),
                                    },
                                )
                                next_storage_capture = time.monotonic() + 5.0
                        except Exception:
                            pass
                        try:
                            response = client.get(control_url, timeout=1.0)
                            response.raise_for_status()
                            control = response.json()
                        except httpx.HTTPError:
                            control = {}
                        if control.get("stop_requested"):
                            break
                        # Playwright must pump browser events between control polls.
                        page.wait_for_timeout(500)

                    try:
                        storage_state = json.dumps(context.storage_state())
                    except Exception:
                        storage_state = None

                    try:
                        context.close()
                    except Exception:
                        pass

                    reporter.send(
                        status_url,
                        {
                            "status": "stopped",
                            "message": "Desktop recorder closed.",
                            "browser_open": False,
                            "storage_state": storage_state,
                            "storage_state_captured_at": time.time() if storage_state else None,
                        },
                    )
                    _debug("stopped status posted")
                    return 0
                finally:
                    _cleanup_temp_profile(temp_profile)
        except Exception as exc:
            _debug(f"exception: {exc!r}")
            _debug(traceback.format_exc())
            try:
                reporter.send(
                    status_url,
                    {
                        "status": "error",
                        "error": f"Desktop recorder failed: {exc}",
                        "message": "Desktop recorder failed to open.",
                        "browser_open": False,
                    },
                )
            except Exception:
                pass
            return 1


def main() -> int:
    _debug("main start")
    parser = argparse.ArgumentParser(description="Async Service Monitor desktop recorder helper")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--target-url", required=True)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--wait-until", default="load")
    parser.add_argument("--viewport-width", type=int, default=1440)
    parser.add_argument("--viewport-height", type=int, default=900)
    parser.add_argument("--javascript-enabled", default="true")
    args = parser.parse_args()
    _debug("args parsed")
    return run(
        args.session_id,
        args.target_url,
        args.api_base.rstrip("/"),
        args.token,
        str(args.wait_until or "load"),
        max(320, int(args.viewport_width or 1440)),
        max(320, int(args.viewport_height or 900)),
        str(args.javascript_enabled).strip().lower() not in {"0", "false", "no", "off"},
    )


if __name__ == "__main__":
    raise SystemExit(main())
