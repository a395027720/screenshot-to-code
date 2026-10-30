# Project Agent Instructions

深度定制 fork：中文 UI、MiniMax M3 默认模型、agent 流水线、多变体生成。输入方式五种：
Upload / URL / Text / Import / 原型（Axure 链接解析选页）。另含代码导出保存与桌面客户端打包。

## Python environment

- poetry 不在交互 PATH 时用全路径 `~/.local/bin/poetry`；首选 `cd backend && poetry run <command>`
- 依赖装在 `backend/.venv`（py3.12，uv 创建）：`poetry install` 在本机不可行——pillow-heif 0.18.0
  无 macOS 13 arm64 wheel，venv 内用 0.16.0 替代，**未改 pyproject/lock**
- pyproject  pin `^3.10`，实际 3.12 满足，直接 `poetry run` 即可

## Frontend environment

- 所有 pnpm 命令带 `COREPACK_HOME=/tmp/corepack-home`，否则 corepack 写 ~/.cache 报 EACCES
- vite dev 的 `/api` 代理默认指向 Docker 服务名 `http://backend:7001`；本地起 dev **必须**
  `PROXY_CODEGEN_BACKEND=http://127.0.0.1:7001`，否则全部接口 404/500
- `pnpm lint` 带 `--max-warnings 0` 且有基线错误（generateCode.ts 等）；要求是**改动文件零新增**，
  基线不用管；另跑 `pnpm exec tsc --noEmit` 与 `pnpm test`

## Services & ports

- Docker 容器已废弃并删除（旧镜像、无本地挂载）；不要再引用 docker 工作流
- 开发模式：backend `poetry run uvicorn main:app --port 7001`；frontend `pnpm dev`
  （用户习惯端口 8888：`pnpm dev --port 8888 --strictPort`）
- 客户端模式：`backend/web/`（前端构建产物，gitignore）存在时 FastAPI 直接服务 SPA
  （`static_web.py` 挂 /assets + SPA fallback，`routes/home.py` 的 `/` 返回内嵌 index.html）；
  WS `/generate-code` 同源可用，无需代理
- 客户端入口 `backend/app_launcher.py`：pywebview 原生窗口（mac WebKit / Win WebView2），
  7001 被占自动换端口、就绪后自动开窗口；无 pywebview 回退系统浏览器
  - `SCREENSHOT_CLIENT_HEADLESS=1`：只起服务不开窗口（打包验证用）
  - `SCREENSHOT_CLIENT_DEBUG=1`：WebView 开 devtools
- 双击启动：根目录 `启动.command` / `启动.bat`（缺产物时自动构建前端）
- 排障惯例：接口诡异先 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 查残留 vite/node 进程
  （5173/5174 常见 IPv4/IPv6 分离绑定的旧进程）

## Testing policy

- 每次代码改动后：`cd backend && poetry run pytest`；`cd backend && poetry run pyright`
  （改动文件零新增警告）
- 前后端都改时加跑前端三项（lint/tsc/test）
- 重点测试：`tests/test_axure.py`（Axure 解析、密码门、弹窗清理、page hint）、
  `tests/test_export.py`（导出、保存落盘、pick-directory 平台门禁）

## Client packaging

- 详见 `backend/PACKAGING.md`；编排 `backend/build.py`（`-t frontend|production|dmg`），
  spec：`mac_main.spec`（mac BUNDLE）/ `main.spec`（win onedir），DMG：`mac_dmg.py`
- pyinstaller / dmgbuild / pywebview 为 pip 装入 `.venv`，**未进 pyproject/lock**（文档有安装命令）
- win 版必须在 Windows 机器构建（PyInstaller 不交叉编译）；.app 未签名/公证
- 打包已知坑：BUNDLE 内 `_MEIPASS`=Contents/Frameworks，其中 web 是指向 Resources/web 的软链；
  `static_web.web_dist_dir()` 必须 `resolve()` 成真路径，否则静态文件全兜底 index.html（已修，勿回退）
- playwright 以 driver datas 进包，运行时用系统 Chrome（`channel="chrome"`），不绑自带浏览器

## API keys

- 前端「设置」→ localStorage（`usePersistedState`），随每次生成请求经 WS 传给后端
- **按宿主隔离**：浏览器、pywebview 窗口、打包 .app 三者 localStorage 互不相通，换宿主需重填
- 请求未带 key 时后端回落环境变量（`backend/.env`：OPENAI/ANTHROPIC/GEMINI_API_KEY）；
  打包 .app 读不到源码目录 .env，需系统环境变量或窗口内设置
- 无任何 key 时生成快速失败（"No OpenAI, Anthropic, or Gemini API key"）

## Axure 原型功能

- 路由 `backend/routes/axure.py`：`POST /api/axure/parse`（url/password/page hint）；
  密码门自动填写、"原型浏览提醒"自动点关、"评论互动"悬浮层截图前移除（仅 fixed/sticky 或 iframe）
- 前端 `components/unified-input/tabs/AxureTab.tsx`：深链（URL 带 `p=`/`page=`）直达单页；
  全屏框选浮层支持缩放、空格平移、选框移动/八点缩放、多次框选
- 真实 axureshow 站点仍有未实测项（页面去重/外壳截图根因），待访问密码后验证

## Prompt formatting

- Prefer triple-quoted strings (`"""..."""`) for multi-line prompt text.
- For interpolated multi-line prompts, prefer a single triple-quoted f-string over concatenated string fragments.

## Hosted

The hosted version is on the `hosted` branch. The `hosted` branch connects to a saas backend, which is a seperate codebase at ../screenshot-to-code-saas

## Cursor Cloud specific instructions

Dependencies are refreshed automatically on startup (`poetry install` in `backend/`, `pnpm install` in `frontend/`); no manual install is needed.
Cursor Cloud environment setup should run `bash /agent/repos/screenshot-to-code/scripts/cursor-cloud-install.sh`; the script changes to the repo root before installing so it works regardless of the startup working directory.

Services (see `README.md` for the canonical commands):
- Backend (FastAPI + WebSocket): from `backend/`, `poetry run uvicorn main:app --reload --port 7001`.
- Frontend (Vite/React): from `frontend/`, `pnpm dev` → open `http://localhost:5173`. The Vite dev server binds to `localhost` only, so use `http://localhost:5173`, not `http://127.0.0.1:5173` (the latter refuses the connection).
- Frontend talks to the backend over a WebSocket (`VITE_WS_BACKEND_URL`, default `ws://127.0.0.1:7001`); generation streams over that socket, other routes are plain HTTP.

Non-obvious caveats:
- `poetry` is installed under `~/.local/bin` and is on PATH for interactive shells (`.bashrc`) but not necessarily for non-interactive scripts; use the full path `~/.local/bin/poetry` if `poetry` is not found.
- The Poetry virtualenv resolves to Python 3.12 (named like `backend-...-py3.12`), not 3.10 — `pyproject.toml` pins `^3.10`, which 3.12 satisfies. Just use `poetry run`.
- Core feature (screenshot → code) requires at least one LLM key: set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` in `backend/.env` (restart backend after editing) or in the in-app Settings dialog. Without a key, generation fails fast with a "No OpenAI, Anthropic, or Gemini API key" message. `REPLICATE_API_KEY` (image gen/edit) only works via `backend/.env`, not the UI.
- Playwright Chromium is pre-installed for the optional "Screenshot preview" tool; Settings shows it as "Available".
- `pnpm install` prints an "Ignored build scripts (esbuild, puppeteer)" warning — this is harmless; Vite build/dev and tests work without approving builds.
- `cd frontend && pnpm lint` currently reports pre-existing errors (e.g. `@typescript-eslint/no-explicit-any` in `generateCode.ts`) because lint runs with `--max-warnings 0`; these are baseline issues, not environment problems.
