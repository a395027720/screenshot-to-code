from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from static_web import web_dist_dir

router = APIRouter()


@router.get("/")
async def get_status():
    dist = web_dist_dir()
    if dist is not None:
        return FileResponse(dist / "index.html")
    return HTMLResponse(
        content="<h3>Your backend is running correctly. Please open the front-end URL (default is http://localhost:5173) to use screenshot-to-code.</h3>"
    )
