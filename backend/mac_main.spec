# -*- mode: python ; coding: utf-8 -*-
import os

import playwright

# playwright 的 driver（node + package）以数据文件方式打入 _MEIPASS/playwright/driver，
# 运行时 compute_driver_executable() 通过 inspect.getfile(playwright) 定位到该目录。
# Axure 功能用 channel="chrome" 驱动系统 Chrome，不需要 playwright 自带浏览器。
playwright_driver = os.path.join(os.path.dirname(playwright.__file__), "driver")

hiddenimports = [
    # uvicorn 运行时按配置字符串动态导入这些子模块
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # websockets 由 uvicorn 的 websockets_impl 动态导入
    "websockets",
    "websockets.legacy.server",
    # email.mime 子模块为标准库动态导入
    "email.mime.base",
    "email.mime.multipart",
    "email.mime.text",
    "email.mime.message",
    "email.mime.nonmultipart",
    "email.mime.image",
    "email.mime.application",
    # playwright python 端
    "playwright",
    "playwright.async_api",
    # pywebview 原生窗口：cocoa 后端由 guilib 在运行时动态导入，
    # UniformTypeIdentifiers 在文件对话框分支内延迟导入
    "webview",
    "webview.platforms",
    "webview.platforms.cocoa",
    "objc",
    "AppKit",
    "Foundation",
    "WebKit",
    "Cocoa",
    "Quartz",
    "Security",
    "UniformTypeIdentifiers",
    "PyObjCTools",
    "PyObjCTools.AppHelper",
    # 本项目自身模块（入口 app_launcher -> main 静态可达，这里补充保险）
    "static_web",
    "routes",
    "ws",
]

# 分析步骤，收集所需的文件和依赖项
a = Analysis(
    ["app_launcher.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("./web", "web"),  # 前端构建产物，static_web.py 通过 sys._MEIPASS/web 读取
        (playwright_driver, "playwright/driver"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ScreenshotToCode",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

app = BUNDLE(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Screenshot to Code.app",
    icon="assets/icon.icns",
    bundle_identifier="com.screenshot-to-code.desktop",
)
