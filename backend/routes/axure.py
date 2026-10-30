import asyncio
import ipaddress
from typing import Any, Optional, cast
from urllib.parse import urljoin, urlparse

from fastapi import APIRouter, HTTPException
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)
from pydantic import BaseModel

from config import IS_PROD
from routes.screenshot import bytes_to_data_url, normalize_url

router = APIRouter()

NAV_TIMEOUT_MS = 30_000
NETWORK_IDLE_TIMEOUT_MS = 8_000
RENDER_SETTLE_MS = 300
GATE_SETTLE_MS = 800
SITEMAP_POLL_INTERVAL_MS = 500
SITEMAP_POLL_MAX_TRIES = 6
SCREENSHOT_CONCURRENCY = 3
JPEG_QUALITY = 80

_playwright: Optional[Playwright] = None
_browser: Optional[Browser] = None
_browser_lock = asyncio.Lock()
_parse_cache: dict[tuple[str, str, str], "AxureParseResponse"] = {}


class AxureParseRequest(BaseModel):
    url: str
    password: Optional[str] = None
    page: Optional[str] = None


class AxurePage(BaseModel):
    name: str
    url: str
    image: str


class AxureParseResponse(BaseModel):
    pages: list[AxurePage]


async def _get_browser() -> Browser:
    global _browser, _playwright
    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            if _playwright is None:
                _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(
                headless=True, channel="chrome"
            )
        return _browser


async def _close_browser() -> None:
    global _browser, _playwright
    if _browser is not None:
        try:
            await _browser.close()
        except Exception as exc:
            print(f"[axure] 关闭浏览器失败: {exc}")
    _browser = None
    if _playwright is not None:
        try:
            await _playwright.stop()
        except Exception as exc:
            print(f"[axure] 停止 Playwright 失败: {exc}")
    _playwright = None


def _is_private_host(hostname: str) -> bool:
    host = hostname.strip().rstrip(".").lower()
    if not host or host in ("localhost", "localhost.localdomain"):
        return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        # 域名不做 DNS 解析，仅按字面值判断
        return False
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


_SITEMAP_JS = """
() => {
  try {
    const axure = window.$axure;
    if (axure && axure.document && axure.document.sitemap
        && Array.isArray(axure.document.sitemap.rootNodes)) {
      return axure.document.sitemap.rootNodes;
    }
  } catch (error) {
    // 跨域或无 $axure 的 frame，忽略
  }
  return null;
}
"""


def _flatten_sitemap(nodes: list[Any], prefix: str = "") -> list[tuple[str, str]]:
    pages: list[tuple[str, str]] = []
    if not isinstance(nodes, list):
        return pages
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_dict = cast(dict[str, Any], node)
        name = str(node_dict.get("pageName") or node_dict.get("folderName") or "").strip()
        full_name = f"{prefix}{name}" if name else prefix.rstrip("/")
        url: Any = node_dict.get("url")
        if isinstance(url, str) and url.strip():
            pages.append((full_name, url.strip()))
        child_prefix = f"{full_name}/" if full_name else ""
        children: Any = node_dict.get("children")
        pages.extend(_flatten_sitemap(children, child_prefix))
    return pages


async def _find_sitemap(page: Page) -> Optional[tuple[list[Any], str]]:
    for frame in page.frames:
        try:
            nodes: Any = await frame.evaluate(_SITEMAP_JS)
        except Exception:
            continue
        if isinstance(nodes, list):
            return cast(list[Any], nodes), frame.url
    return None


async def _handle_password_gate(page: Page, password: Optional[str]) -> None:
    gate = page.locator("input[type='password']:visible").first
    if await gate.count() == 0:
        return
    if not password:
        raise HTTPException(status_code=400, detail="该原型需要访问密码")

    await gate.fill(password)
    submit = page.locator(
        "form:has(input[type='password']) button, "
        "form:has(input[type='password']) input[type='submit']"
    ).first
    if await submit.count() == 0:
        submit = page.locator("button, input[type='submit']").first
    if await submit.count() > 0:
        await submit.click()
    else:
        await gate.press("Enter")

    try:
        await page.wait_for_load_state(
            "networkidle", timeout=NETWORK_IDLE_TIMEOUT_MS
        )
    except PlaywrightTimeoutError:
        pass
    await page.wait_for_timeout(GATE_SETTLE_MS)

    if await page.locator("input[type='password']:visible").count() > 0:
        raise HTTPException(status_code=400, detail="访问密码错误或未提供")


_NOTICE_CLOSE_TEXTS = (
    "关闭",
    "我知道了",
    "知道了",
    "确定",
    "好的",
    "确认",
    "不再提示",
    "跳过",
    "close",
    "got it",
    "ok",
)

_NOTICE_CLOSE_JS = """
(texts) => {
  const passes = [
    "button, a, [role='button'], input[type='button'], input[type='submit']",
    "span, div, i, [class*='close'], [class*='Close'], [aria-label]",
  ];
  for (const selector of passes) {
    for (const element of document.querySelectorAll(selector)) {
      const label = (
        element.getAttribute("aria-label") || element.textContent || ""
      ).trim().toLowerCase();
      if (!label || label.length > 12) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      if (texts.some((text) => label === text || label.includes(text))) {
        element.click();
        return label;
      }
    }
  }
  return null;
}
"""


async def _dismiss_notices(page: Page) -> None:
    for _ in range(3):
        clicked = await page.evaluate(_NOTICE_CLOSE_JS, _NOTICE_CLOSE_TEXTS)
        if clicked is None:
            return
        await page.wait_for_timeout(RENDER_SETTLE_MS)


_OVERLAY_REMOVE_JS = """
() => {
  const patterns = ["comment", "pinglun", "hudong", "feedback"];
  const targets = new Set();
  for (const element of document.querySelectorAll("body *")) {
    const text = (element.textContent || "").trim();
    const className = typeof element.className === "string" ? element.className : "";
    const meta = `${element.id || ""} ${className}`.toLowerCase();
    const byText = text.length > 0 && text.length <= 40 && text.includes("评论互动");
    const byMeta = patterns.some((pattern) => meta.includes(pattern));
    if (!byText && !byMeta) {
      continue;
    }
    let node = element;
    let floating = element.tagName === "IFRAME";
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (style.position === "fixed" || style.position === "sticky") {
        floating = true;
        break;
      }
      node = node.parentElement;
    }
    if (!floating || !node || node === document.body) {
      continue;
    }
    targets.add(node);
  }
  for (const node of targets) {
    node.remove();
  }
  return targets.size;
}
"""


async def _remove_comment_overlays(page: Page) -> None:
    await page.evaluate(_OVERLAY_REMOVE_JS)


async def _capture_pages(
    context: BrowserContext,
    base_url: str,
    flat_nodes: list[tuple[str, str]],
) -> list[AxurePage]:
    semaphore = asyncio.Semaphore(SCREENSHOT_CONCURRENCY)

    async def capture(name: str, raw_url: str) -> AxurePage:
        page_url = urljoin(base_url, raw_url)
        image = ""
        async with semaphore:
            shot_page = await context.new_page()
            try:
                await shot_page.goto(
                    page_url, timeout=NAV_TIMEOUT_MS, wait_until="load"
                )
                try:
                    await shot_page.wait_for_load_state(
                        "networkidle", timeout=NETWORK_IDLE_TIMEOUT_MS
                    )
                except PlaywrightTimeoutError:
                    pass
                await shot_page.wait_for_timeout(RENDER_SETTLE_MS)
                await _dismiss_notices(shot_page)
                await _remove_comment_overlays(shot_page)
                data = await shot_page.screenshot(
                    full_page=True, type="jpeg", quality=JPEG_QUALITY
                )
                image = bytes_to_data_url(data, "image/jpeg")
            except Exception as exc:
                print(f"[axure] 页面截图失败: {page_url}, 原因: {exc}")
            finally:
                await shot_page.close()
        return AxurePage(name=name, url=page_url, image=image)

    results = await asyncio.gather(*(capture(name, url) for name, url in flat_nodes))
    return list(results)


def _filter_by_page(
    flat_nodes: list[tuple[str, str]], hint: str
) -> list[tuple[str, str]]:
    matched = [
        node
        for node in flat_nodes
        if node[0] == hint or node[0].endswith(f"/{hint}")
    ]
    return matched or flat_nodes


async def _parse_axure(
    url: str, password: Optional[str], page_hint: Optional[str]
) -> AxureParseResponse:
    browser = await _get_browser()
    context = await browser.new_context(viewport={"width": 1280, "height": 832})
    try:
        page = await context.new_page()
        try:
            await page.goto(url, timeout=NAV_TIMEOUT_MS, wait_until="domcontentloaded")
        except PlaywrightTimeoutError:
            raise HTTPException(status_code=400, detail="链接不可达或加载超时")
        except Exception as exc:
            print(f"[axure] 打开链接失败: {url}, 原因: {exc}")
            raise HTTPException(status_code=400, detail="链接不可达或加载超时")

        await _handle_password_gate(page, password)

        sitemap: Optional[tuple[list[Any], str]] = None
        for _ in range(SITEMAP_POLL_MAX_TRIES):
            sitemap = await _find_sitemap(page)
            if sitemap is not None:
                break
            await page.wait_for_timeout(SITEMAP_POLL_INTERVAL_MS)
        if sitemap is None:
            raise HTTPException(status_code=400, detail="无法识别为 Axure 原型")

        nodes, base_url = sitemap
        flat_nodes = _flatten_sitemap(nodes)
        if page_hint:
            flat_nodes = _filter_by_page(flat_nodes, page_hint)
        pages = await _capture_pages(context, base_url, flat_nodes)
        return AxureParseResponse(pages=pages)
    finally:
        await context.close()


@router.post("/api/axure/parse")
async def parse_axure_prototype(
    request: AxureParseRequest,
) -> AxureParseResponse:
    try:
        url = normalize_url(request.url)
    except ValueError:
        raise HTTPException(status_code=400, detail="链接无效，仅支持 http/https 地址")

    parsed = urlparse(url)
    if IS_PROD and _is_private_host(parsed.hostname or ""):
        raise HTTPException(status_code=400, detail="不允许解析本机或内网地址")

    cache_key = (url, request.password or "", request.page or "")
    cached = _parse_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        response = await _parse_axure(url, request.password, request.page)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[axure] 解析失败: {url}, 原因: {exc}")
        raise HTTPException(status_code=500, detail=f"解析 Axure 原型失败: {exc}")

    _parse_cache[cache_key] = response
    return response
