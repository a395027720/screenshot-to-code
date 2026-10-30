import asyncio
import contextlib
import functools
import http.server
import threading
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi import HTTPException

import routes.axure as axure
from routes.axure import AxureParseRequest, parse_axure_prototype

GATE_PASSWORD = "secret123"

INDEX_HTML = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>模拟 Axure 原型</title>
<script>
window.$axure = {
  document: {
    sitemap: {
      rootNodes: [
        { pageName: "首页", url: "page1.html" },
        { folderName: "分组", children: [
            { pageName: "考核计划管理", url: "page2.html" }
        ] }
      ]
    }
  }
};
</script>
</head>
<body><h1>原型播放器入口</h1></body>
</html>
"""

PAGE1_HTML = """<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>页面一</title></head>
<body style="margin:0">
<div style="width:320px;height:180px;background:#3b82f6"></div>
<p style="font-size:24px">页面一内容</p>
</body>
</html>
"""

PAGE2_HTML = """<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>页面二</title></head>
<body style="margin:0">
<div style="width:320px;height:180px;background:#f97316"></div>
<p style="font-size:24px">考核计划管理页面内容</p>
</body>
</html>
"""

GATE_HTML = f"""<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>访问验证</title></head>
<body>
<form id="gate-form">
  <input type="password" id="gate-password">
  <button type="button" id="gate-submit">验证访问</button>
</form>
<p id="gate-error"></p>
<script>
document.getElementById("gate-submit").addEventListener("click", function () {{
  var value = document.getElementById("gate-password").value;
  if (value === "{GATE_PASSWORD}") {{
    window.location.href = "proto.html";
  }} else {{
    document.getElementById("gate-error").textContent = "密码错误";
  }}
}});
</script>
</body>
</html>
"""

PLAIN_HTML = """<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>普通页面</title></head>
<body><p>这不是 Axure 原型</p></body>
</html>
"""


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        pass


@contextlib.contextmanager
def _served(directory: Path) -> Iterator[str]:
    handler = functools.partial(_QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _write(directory: Path, filename: str, content: str) -> None:
    (directory / filename).write_text(content, encoding="utf-8")


@pytest.fixture()
def prototype_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "prototype"
    directory.mkdir()
    _write(directory, "index.html", INDEX_HTML)
    _write(directory, "page1.html", PAGE1_HTML)
    _write(directory, "page2.html", PAGE2_HTML)
    return directory


@pytest.fixture()
def gate_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "gated"
    directory.mkdir()
    _write(directory, "index.html", GATE_HTML)
    _write(directory, "proto.html", INDEX_HTML)
    _write(directory, "page1.html", PAGE1_HTML)
    _write(directory, "page2.html", PAGE2_HTML)
    return directory


@pytest.fixture()
def plain_dir(tmp_path: Path) -> Path:
    directory = tmp_path / "plain"
    directory.mkdir()
    _write(directory, "index.html", PLAIN_HTML)
    return directory


@pytest.fixture(autouse=True)
async def _reset_axure_state() -> Any:
    axure._parse_cache.clear()
    yield
    await axure._close_browser()
    axure._parse_cache.clear()
    axure._browser_lock = asyncio.Lock()


async def test_parse_axure_success(prototype_dir: Path) -> None:
    with _served(prototype_dir) as base:
        response = await parse_axure_prototype(
            AxureParseRequest(url=f"{base}/index.html")
        )

    assert len(response.pages) == 2
    first, second = response.pages
    assert first.name == "首页"
    assert first.url == f"{base}/page1.html"
    assert first.image.startswith("data:image/jpeg;base64,")
    assert second.name == "分组/考核计划管理"
    assert second.url == f"{base}/page2.html"
    assert second.image.startswith("data:image/jpeg;base64,")


async def test_parse_axure_with_correct_password(gate_dir: Path) -> None:
    with _served(gate_dir) as base:
        response = await parse_axure_prototype(
            AxureParseRequest(url=f"{base}/index.html", password=GATE_PASSWORD)
        )

    assert [page.name for page in response.pages] == ["首页", "分组/考核计划管理"]
    assert all(page.image.startswith("data:image/jpeg;base64,") for page in response.pages)


async def test_parse_axure_with_wrong_password(gate_dir: Path) -> None:
    with _served(gate_dir) as base:
        with pytest.raises(HTTPException) as exc_info:
            await parse_axure_prototype(
                AxureParseRequest(url=f"{base}/index.html", password="wrong-password")
            )

    assert exc_info.value.status_code == 400
    assert "密码" in str(exc_info.value.detail)


async def test_parse_axure_gate_requires_password(gate_dir: Path) -> None:
    with _served(gate_dir) as base:
        with pytest.raises(HTTPException) as exc_info:
            await parse_axure_prototype(AxureParseRequest(url=f"{base}/index.html"))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "该原型需要访问密码"


async def test_parse_non_axure_page(plain_dir: Path) -> None:
    with _served(plain_dir) as base:
        with pytest.raises(HTTPException) as exc_info:
            await parse_axure_prototype(
                AxureParseRequest(url=f"{base}/index.html")
            )

    assert exc_info.value.status_code == 400
    assert "无法识别" in str(exc_info.value.detail)


@pytest.mark.parametrize(
    "bad_url",
    ["file:///tmp/axure/index.html", "ftp://example.com/proto/index.html"],
)
async def test_invalid_scheme_rejected(bad_url: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        await parse_axure_prototype(AxureParseRequest(url=bad_url))

    assert exc_info.value.status_code == 400
    assert "http" in str(exc_info.value.detail)


async def test_private_host_rejected_in_prod(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(axure, "IS_PROD", True)
    with pytest.raises(HTTPException) as exc_info:
        await parse_axure_prototype(
            AxureParseRequest(url="http://127.0.0.1:9999/index.html")
        )

    assert exc_info.value.status_code == 400
    assert "内网" in str(exc_info.value.detail)


async def test_parse_result_cached(prototype_dir: Path) -> None:
    with _served(prototype_dir) as base:
        url = f"{base}/index.html"
        first = await parse_axure_prototype(AxureParseRequest(url=url))
        second = await parse_axure_prototype(AxureParseRequest(url=url))

    assert second is first


async def test_parse_with_page_hint_returns_single_page(
    prototype_dir: Path,
) -> None:
    with _served(prototype_dir) as base:
        response = await parse_axure_prototype(
            AxureParseRequest(url=f"{base}/index.html", page="考核计划管理")
        )

    assert len(response.pages) == 1
    assert response.pages[0].name == "分组/考核计划管理"


NOTICE_HTML = """<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>原型浏览提醒</title></head>
<body>
<div id="notice" style="position:fixed;inset:0;background:rgba(0,0,0,.5)">
  <button id="notice-close" type="button">我知道了</button>
</div>
<script>
document.getElementById("notice-close").addEventListener("click", function () {
  document.getElementById("notice").style.display = "none";
});
</script>
</body>
</html>
"""


COMMENT_OVERLAY_HTML = """<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>带评论悬浮层</title></head>
<body>
<p id="inflow">评论互动功能说明（正文内容，不应被移除）</p>
<div id="float-wrap" style="position:fixed;right:0;bottom:0">
  <div id="float-panel">评论互动</div>
</div>
</body>
</html>
"""


async def test_remove_comment_overlays_keeps_inflow_content(
    tmp_path: Path,
) -> None:
    directory = tmp_path / "overlay"
    directory.mkdir()
    _write(directory, "index.html", COMMENT_OVERLAY_HTML)

    with _served(directory) as base:
        browser = await axure._get_browser()
        context = await browser.new_context()
        page = await context.new_page()
        try:
            await page.goto(f"{base}/index.html")
            assert await page.locator("#float-panel").count() == 1

            await axure._remove_comment_overlays(page)

            assert await page.locator("#float-wrap").count() == 0
            assert await page.locator("#inflow").count() == 1
        finally:
            await context.close()


async def test_dismiss_notices_clicks_close_button(tmp_path: Path) -> None:
    directory = tmp_path / "notice"
    directory.mkdir()
    _write(directory, "index.html", NOTICE_HTML)

    with _served(directory) as base:
        browser = await axure._get_browser()
        context = await browser.new_context()
        page = await context.new_page()
        try:
            await page.goto(f"{base}/index.html")
            assert await page.locator("#notice:visible").count() == 1

            await axure._dismiss_notices(page)

            assert await page.locator("#notice:visible").count() == 0
        finally:
            await context.close()
