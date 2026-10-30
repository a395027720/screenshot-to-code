# 客户端打包说明（PyInstaller + DMG）

把 screenshot-to-code 打成可双击运行的本地客户端：后端 FastAPI 内嵌前端构建产物（`backend/web/`），入口为 `app_launcher.py`（自动选端口，7001 被占用时落备用端口，就绪后自动打开浏览器）。

## 相关文件

| 文件 | 作用 |
| --- | --- |
| `build.py` | 编排脚本：构建前端 → pyinstaller → dmgbuild |
| `mac_main.spec` | macOS 打包 spec（BUNDLE 生成 `Screenshot to Code.app`） |
| `main.spec` | Windows 打包 spec（onedir，生成 `dist/release/Screenshot to Code/`） |
| `mac_dmg.py` | dmgbuild 的 DMG 配置 |

## 依赖准备（一次性）

打包工具与客户端窗口依赖不写入 `pyproject.toml`，直接装进 venv：

```bash
cd backend
~/.local/bin/poetry run pip install pyinstaller dmgbuild
# 客户端原生窗口（pywebview），入口 app_launcher.py 优先开原生窗口，缺依赖时回退系统浏览器
~/.local/bin/poetry run pip install pywebview                     # macOS 会自动带上 pyobjc-framework-Cocoa/WebKit 等
~/.local/bin/poetry run pip install "pywebview[clr]"              # Windows 需要 pythonnet(clr) 支持 EdgeChromium 后端
```

图标文件位于 `backend/assets/`：`icon.icns`（mac）、`icon.ico`（win）、`icon.svg`（源文件），已分别接入 `mac_main.spec` 的 BUNDLE、`main.spec` 的 EXE 和 `mac_dmg.py` 的卷图标。

## macOS 构建

```bash
cd backend
# 完整流程（前端构建 + .app + .dmg），默认版本号即当前发布版本
~/.local/bin/poetry run python build.py -v 0.2.0

# 或分步
~/.local/bin/poetry run python build.py -t frontend      # 只构建前端到 backend/web
~/.local/bin/poetry run python build.py -t production    # 前端 + pyinstaller + dmg
~/.local/bin/poetry run python build.py -t dmg -v 0.2.0  # 只打 dmg（需已有 .app）
```

产物：

- `backend/dist/mac-release/Screenshot to Code.app`
- `backend/dist/[mac]-ScreenshotToCode-v0.2.0.dmg`

直接运行验证。`SCREENSHOT_CLIENT_HEADLESS=1` 表示只起后端服务、不开 pywebview 窗口也不开浏览器（自动化验证用）：

```bash
SCREENSHOT_CLIENT_HEADLESS=1 BROWSER=/usr/bin/true "./dist/mac-release/Screenshot to Code.app/Contents/MacOS/ScreenshotToCode"
# 服务地址看 stdout 的 "Uvicorn running on http://127.0.0.1:<port>"（7001 被占用时自动落备用端口）
```

## Windows 构建

**必须在 Windows 机器上执行**（PyInstaller 不支持交叉编译），Python 环境与依赖同 `backend/pyproject.toml`：

```bat
cd backend
poetry run pip install pyinstaller
poetry run python build.py
```

产物：`backend/dist/release/Screenshot to Code/ScreenshotToCode.exe`，整个目录拷贝分发。

## 打包内容要点

- `backend/web/`（前端构建产物）以 datas 打入 `_MEIPASS/web`，`static_web.py` 通过 `sys._MEIPASS` 定位。
- playwright 的 driver 目录（`site-packages/playwright/driver`，含 node 可执行与 package）以 datas 打入 `_MEIPASS/playwright/driver`。
- hiddenimports 补全了 uvicorn 运行时动态导入的子模块（loops/protocols/lifespan）、websockets、email.mime 等。
- pywebview 平台后端由 `webview/guilib.py` 运行时动态导入，需 hiddenimports 显式声明：mac 补 `webview.platforms.cocoa` 与 pyobjc（AppKit/Foundation/WebKit/Quartz/Security/UniformTypeIdentifiers 等）；win 补 `webview.platforms.edgechromium`/`winforms` 与 `clr`（pythonnet），WebView2 互操作 DLL 由 hooks-contrib 的 hook-webview 自动收集。
- 环境变量 `SCREENSHOT_CLIENT_HEADLESS=1`：跳过窗口只起服务（无 GUI 环境/自动化验证用）。

## 已知限制

- **Windows 版需在 Windows 机器上构建**，本仓库 spec 只保证语法正确。
- **Axure 解析依赖系统 Chrome**：`routes/axure.py` 用 `channel="chrome"` 启动本机安装的 Chrome，打包产物不含 Chromium；目标机器必须安装 Chrome。
- 打包产物未签名/未公证，macOS 首次打开需在「系统设置 → 隐私与安全性」放行，或右键打开。
- `playwright install chromium` 下载的浏览器不打入包内，「截图预览」功能在没装过 Chromium 缓存的机器上不可用（启动探测会记日志并自动降级）。
- LLM API Key 不打包：运行后在前端 Settings 里配置，或放在可执行文件工作目录的 `.env`。
- pywebview 窗口打不开时（依赖缺失/无 GUI 环境），`app_launcher.py` 自动回退为起服务 + 打开系统浏览器，功能不受影响。
