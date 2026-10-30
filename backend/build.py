# -*- coding: utf-8 -*-
"""客户端打包编排脚本。

用法（在 backend/ 目录、poetry 虚拟环境中执行）：
    poetry run python build.py                     # 完整流程：前端 + pyinstaller + dmg
    poetry run python build.py -t frontend         # 只构建前端到 backend/web
    poetry run python build.py -t production       # 前端 + pyinstaller（mac 上追加 dmg）
    poetry run python build.py -t dmg -v 0.1.0     # 只打 dmg（需已有 dist/mac-release 产物）

Windows 版需在 Windows 机器上执行本脚本（pyinstaller 不支持跨平台交叉编译）。
"""
import argparse
import os
import platform
import shlex
import shutil
import subprocess
from pathlib import Path

APP_NAME = "Screenshot to Code"
DMG_BASENAME = "ScreenshotToCode"


def run_cmd(cmd: str, split=False):
    """
    Run command in shell
    """
    final_cmd: str | list[str] = cmd
    if split:
        final_cmd = shlex.split(cmd)
    return subprocess.run(final_cmd, shell=True)


def build_frontend():
    """构建前端并把 dist 拷贝到 backend/web（FastAPI 内嵌 SPA 的数据源）"""
    if os.name == "nt":
        run_cmd("cd ../frontend && pnpm build", split=True)
    else:
        run_cmd("cd ../frontend && COREPACK_HOME=/tmp/corepack-home pnpm build", split=False)

    dist_dir = Path("../frontend/dist")
    if not dist_dir.exists():
        raise FileNotFoundError(f"前端构建产物不存在: {dist_dir.resolve()}")

    web_path = Path("./web")
    if web_path.exists():
        shutil.rmtree(web_path)
    shutil.copytree(dist_dir, web_path)
    print(f"前端构建完成，已拷贝到 {web_path.resolve()}")


def build_production(version):
    system_name = platform.system().lower()
    if system_name == "darwin":
        platform_name = "mac"
    elif system_name == "windows":
        platform_name = "windows"
    else:
        raise ValueError("Unsupported platform")

    build_frontend()

    if platform_name == "mac":
        run_cmd(
            "pyinstaller --noconfirm --clean mac_main.spec --distpath dist/mac-release",
            split=False,
        )
        build_dmg(version)
    else:
        run_cmd(
            "pyinstaller --noconfirm --clean main.spec --distpath dist/release",
            split=False,
        )
        print(f"Windows 产物在 dist/release/{APP_NAME}/，可整体拷贝分发")


def build_dmg(version):
    """在 mac 上用 dmgbuild 生成 DMG（本项目暂无图标文件，跳过图标参数）"""
    system_name = platform.system().lower()
    if system_name != "darwin":
        print("DMG 只能在 macOS 上生成，跳过")
        return

    app_path = Path(f"./dist/mac-release/{APP_NAME}.app")
    if not app_path.exists():
        print(f"未找到 {app_path}，请先执行 production 构建")
        return

    dmg_filepath = Path(f"./dist/[mac]-{DMG_BASENAME}-v{version}.dmg")
    if dmg_filepath.exists():
        os.remove(dmg_filepath)
    result = run_cmd(
        f'dmgbuild -s mac_dmg.py "{APP_NAME} v{version}" "{dmg_filepath}"',
        split=False,
    )
    if result.returncode != 0 or not dmg_filepath.exists():
        print(f"DMG 生成失败（dmgbuild exit={result.returncode}）")
        return
    print(f"Created {dmg_filepath.name} at {dmg_filepath.resolve()}")


parser = argparse.ArgumentParser(description="Build software.")
parser.add_argument(
    "-v", "--version", default="0.2.0", help="version number, default: 0.2.0"
)
parser.add_argument(
    "-t",
    "--type",
    default="production",
    help="build type: production(p) or frontend(f) or dmg(d)",
)
args = parser.parse_args()
if args.type == "p" or args.type == "production":
    build_production(args.version)
elif args.type == "f" or args.type == "frontend":
    build_frontend()
elif args.type == "d" or args.type == "dmg":
    build_dmg(args.version)
else:
    raise ValueError(f"Unknown build type: {args.type}")
