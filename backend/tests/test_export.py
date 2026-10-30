from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import httpx
import pytest
from fastapi import HTTPException

import routes.export as export_module
from routes.export import (
    ExportRequest,
    ExportSaveRequest,
    export_code,
    export_save,
    pick_directory,
)


@pytest.mark.asyncio
async def test_export_code_rewrites_data_url_images_into_zip_assets() -> None:
    png_data_url = "data:image/png;base64,iVBORw0KGgo="
    svg_data_url = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"
    code = f"""
    <html>
      <head>
        <style>.hero {{ background-image: url("{svg_data_url}"); }}</style>
      </head>
      <body>
        <img src="{png_data_url}" />
      </body>
    </html>
    """

    response = await export_code(ExportRequest(code=code))

    with ZipFile(BytesIO(response.body)) as archive:
        assert sorted(archive.namelist()) == [
            "assets/image-1.png",
            "assets/image-2.svg",
            "index.html",
        ]

        index_html = archive.read("index.html").decode("utf-8")
        assert 'src="assets/image-1.png"' in index_html
        assert 'url("assets/image-2.svg")' in index_html
        assert archive.read("assets/image-1.png") == b"\x89PNG\r\n\x1a\n"
        assert archive.read("assets/image-2.svg").startswith(b"<svg")


@pytest.mark.asyncio
async def test_export_code_rewrites_script_image_urls_into_zip_assets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_url = "https://replicate.delivery/example/output.png"
    code = f"""
    <html>
      <body>
        <div id="root"></div>
        <script type="text/babel">
          function App() {{
            return <img src="{image_url}" />;
          }}
        </script>
      </body>
    </html>
    """

    async def mock_fetch_remote_asset(
        _client: httpx.AsyncClient, fetch_url: str, extension_hint: str
    ) -> tuple[bytes, str] | None:
        assert fetch_url == image_url
        assert extension_hint == "png"
        return b"\x89PNG\r\n\x1a\n", "png"

    monkeypatch.setattr("routes.export.fetch_remote_asset", mock_fetch_remote_asset)

    response = await export_code(ExportRequest(code=code))

    with ZipFile(BytesIO(response.body)) as archive:
        assert sorted(archive.namelist()) == ["assets/image-1.png", "index.html"]
        index_html = archive.read("index.html").decode("utf-8")
        assert image_url not in index_html
        assert 'src="assets/image-1.png"' in index_html
        assert archive.read("assets/image-1.png") == b"\x89PNG\r\n\x1a\n"


@pytest.mark.asyncio
async def test_export_code_returns_zip_with_index_when_no_assets() -> None:
    response = await export_code(ExportRequest(code="<html><body>Hello</body></html>"))

    with ZipFile(BytesIO(response.body)) as archive:
        assert archive.namelist() == ["index.html"]
        assert archive.read("index.html").decode("utf-8") == (
            "<html><body>Hello</body></html>"
        )


@pytest.mark.asyncio
async def test_export_save_writes_index_html(tmp_path: Path) -> None:
    target_dir = tmp_path / "out"
    response = await export_save(
        ExportSaveRequest(
            code="<html><body><p>hello</p></body></html>",
            directory=str(target_dir),
            filename="index.html",
        )
    )

    written = target_dir / "index.html"
    assert response == {"files": [str(written)]}
    assert "hello" in written.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_export_save_rejects_bad_filename(tmp_path: Path) -> None:
    with pytest.raises(HTTPException):
        await export_save(
            ExportSaveRequest(
                code="<html></html>",
                directory=str(tmp_path),
                filename="../evil.html",
            )
        )


@pytest.mark.asyncio
async def test_pick_directory_rejected_on_unsupported_platform(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(export_module.platform, "system", lambda: "Linux")
    with pytest.raises(HTTPException):
        await pick_directory()
