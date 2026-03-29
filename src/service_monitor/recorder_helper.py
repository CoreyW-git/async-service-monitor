from __future__ import annotations

import argparse
import json
import time
import traceback
from pathlib import Path
from typing import Any

import httpx

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

  window.open = function(url, target) {
    send({
      event: "popup_blocked",
      url: typeof url === "string" ? url : "",
      title: document.title,
      message: "window.open was blocked so the recorder can stay locked to one primary page."
    });
    return null;
  };

  function normalizeNewWindowTargets(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('a[target], form[target]').forEach((node) => {
      const target = (node.getAttribute('target') || '').toLowerCase();
      if (target === '_blank' || target === '_new') {
        node.setAttribute('target', '_self');
      }
    });
  }

  function wireMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            normalizeNewWindowTargets(node);
          }
        }
      }
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
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
    send({
      event: "fill",
      selector: selectorFor(target),
      value: target.value || ""
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

  window.addEventListener("load", () => {
    normalizeNewWindowTargets(document);
    wireMutationObserver();
    send({
      event: "page_ready",
      url: window.location.href,
      title: document.title,
      textSnippet: (document.body && document.body.innerText ? document.body.innerText.slice(0, 280) : "")
    });
  });
})();
"""


def _post(client: httpx.Client, url: str, payload: dict[str, Any]) -> None:
    _debug(f"POST {url} keys={sorted(payload.keys())}")
    client.post(url, json=payload, timeout=10.0)


def _get(client: httpx.Client, url: str) -> dict[str, Any]:
    _debug(f"GET {url}")
    response = client.get(url, timeout=10.0)
    response.raise_for_status()
    return response.json()


def _launch_browser(playwright):
    launch_args = [
        "--new-window",
        "--start-maximized",
        "--window-size=1440,900",
        "--window-position=72,72",
        "--disable-popup-blocking",
    ]
    errors: list[str] = []
    for channel in (None, "chrome", "msedge"):
        try:
            kwargs: dict[str, Any] = {
                "headless": False,
                "args": launch_args,
            }
            if channel:
                kwargs["channel"] = channel
            browser = playwright.chromium.launch(**kwargs)
            return browser, channel or "chromium"
        except Exception as exc:
            errors.append(f"{channel or 'chromium'}: {exc}")
    raise RuntimeError(" | ".join(errors))


def run(session_id: str, target_url: str, api_base: str, token: str) -> int:
    _debug(f"run start session_id={session_id} target_url={target_url}")
    from playwright.sync_api import sync_playwright

    _debug("playwright import complete")
    headers = {"x-recorder-token": token}
    status_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/status"
    event_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/event"
    control_url = f"{api_base}/api/internal/recorder/playwright-session/{session_id}/control"

    with httpx.Client(headers=headers) as client:
        try:
            _debug("posting launching status")
            _post(client, status_url, {"status": "launching", "message": "Launching desktop recorder browser...", "browser_open": False})
            _debug("launching status posted")
            with sync_playwright() as playwright:
                _debug("sync_playwright entered")
                browser, runtime_name = _launch_browser(playwright)
                _debug(f"browser launched runtime={runtime_name}")
                context = browser.new_context(no_viewport=True)
                context.expose_function(
                    "asmRecordEvent",
                    lambda payload: _post(client, event_url, dict(payload or {})),
                )
                context.add_init_script(INIT_SCRIPT_TEMPLATE)
                page = context.new_page()
                _debug("new page created")
                try:
                    page.bring_to_front()
                except Exception:
                    pass

                def handle_extra_page(extra_page):
                    if extra_page == page:
                        return
                    popup_url = "about:blank"
                    try:
                        popup_url = extra_page.url or "about:blank"
                    except Exception:
                        pass
                    _post(
                        client,
                        event_url,
                        {
                            "event": "popup_blocked",
                            "url": popup_url,
                            "title": "Blocked secondary tab",
                            "message": "A secondary tab or popup was blocked so the recorder can stay focused on one controlled browser page.",
                        },
                    )
                    try:
                        extra_page.close()
                    except Exception:
                        pass
                    try:
                        page.bring_to_front()
                    except Exception:
                        pass

                context.on("page", handle_extra_page)
                page.on("popup", handle_extra_page)

                def on_navigate(frame):
                    if frame == page.main_frame:
                        title = ""
                        try:
                            title = page.title() if page.url else ""
                        except Exception:
                            title = ""
                        _post(
                            client,
                            event_url,
                            {
                                "event": "navigate",
                                "url": frame.url,
                                "title": title,
                            },
                        )

                page.on("framenavigated", on_navigate)
                _debug("navigating to target")
                page.goto(target_url, wait_until="domcontentloaded")
                _debug("target loaded")
                try:
                    page.bring_to_front()
                except Exception:
                    pass

                _post(client, status_url, {"status": "running", "message": f"{runtime_name} recorder window launched", "browser_open": True})
                _debug("running status posted")

                while True:
                    if page.is_closed():
                        break
                    try:
                        storage_state = json.dumps(context.storage_state())
                        _post(
                            client,
                            status_url,
                            {
                                "status": "running",
                                "browser_open": True,
                                "storage_state": storage_state,
                                "storage_state_captured_at": time.time(),
                            },
                        )
                    except Exception:
                        pass
                    control = _get(client, control_url)
                    if control.get("stop_requested"):
                        break
                    time.sleep(0.5)

                try:
                    storage_state = json.dumps(context.storage_state())
                except Exception:
                    storage_state = None

                try:
                    context.close()
                except Exception:
                    pass
                try:
                    browser.close()
                except Exception:
                    pass

                _post(
                    client,
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
        except Exception as exc:
            _debug(f"exception: {exc!r}")
            _debug(traceback.format_exc())
            try:
                _post(
                    client,
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
    args = parser.parse_args()
    _debug("args parsed")
    return run(args.session_id, args.target_url, args.api_base.rstrip("/"), args.token)


if __name__ == "__main__":
    raise SystemExit(main())
