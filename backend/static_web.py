import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from starlette.staticfiles import StaticFiles

API_PREFIXES = ("api/", "generate-code", "local-assets", "uploaded-assets")


def web_dist_dir() -> Path | None:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    candidate = base / "web"
    if candidate.is_dir() and (candidate / "index.html").is_file():
        # BUNDLE 包内 web 可能是软链（Frameworks → Resources），resolve 成真路径
        # 保证后续 is_relative_to 校验一致
        return candidate.resolve()
    return None


def configure_static_web(app: FastAPI) -> None:
    dist = web_dist_dir()
    if dist is None:
        return

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
    async def spa_fallback(full_path: str) -> FileResponse | HTMLResponse:
        if full_path.startswith(API_PREFIXES):
            return HTMLResponse("Not Found", status_code=404)
        target = (dist / full_path).resolve()
        if full_path and target.is_file() and target.is_relative_to(dist):
            return FileResponse(target)
        return FileResponse(dist / "index.html")
