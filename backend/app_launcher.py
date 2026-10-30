import os
import socket
import threading
import time
import webbrowser

import uvicorn

from main import app

DEFAULT_PORT = 7001
WINDOW_WIDTH = 1440
WINDOW_HEIGHT = 900
WINDOW_MIN_SIZE = (960, 640)


def _port_free(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def _pick_port() -> int:
    if _port_free(DEFAULT_PORT):
        return DEFAULT_PORT
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    print(f"端口 {DEFAULT_PORT} 被占用，改用 {port}")
    return port


def _wait_port(port: int) -> bool:
    for _ in range(100):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def _open_browser_when_ready(port: int) -> None:
    def worker() -> None:
        if _wait_port(port):
            webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=worker, daemon=True).start()


def main() -> None:
    port = _pick_port()
    headless = bool(os.environ.get("SCREENSHOT_CLIENT_HEADLESS"))

    webview = None
    if not headless:
        try:
            import webview  # type: ignore[import-not-found]
        except ImportError:
            webview = None

    if webview is None:
        if headless:
            print(f"headless 模式，服务地址 http://localhost:{port}")
        else:
            _open_browser_when_ready(port)
        uvicorn.run(app, host="127.0.0.1", port=port)
        return

    threading.Thread(
        target=lambda: uvicorn.run(app, host="127.0.0.1", port=port),
        daemon=True,
    ).start()
    _wait_port(port)
    webview.create_window(
        "Screenshot to Code",
        f"http://localhost:{port}",
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        min_size=WINDOW_MIN_SIZE,
    )
    # SCREENSHOT_CLIENT_DEBUG=1 时开启 WebView 的开发者工具（右键检查元素可用）
    webview.start(debug=bool(os.environ.get("SCREENSHOT_CLIENT_DEBUG")))


if __name__ == "__main__":
    main()
