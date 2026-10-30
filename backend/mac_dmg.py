# -*- coding: utf-8 -*-
# dmgbuild 配置文件，用法见 build.py 的 build_dmg()：
#   dmgbuild -s mac_dmg.py "<卷名>" "<输出.dmg路径>"
# 应用名称
app_name = "Screenshot to Code"

version = "V0.2.0"
# 注意：dmgbuild 保留设置键 "filename" 会覆盖命令行传入的输出路径，
# 这里改名仅作记录，实际输出路径由 build.py 通过命令行指定。
dmg_filename = f"[mac]-{app_name}-{version}.dmg"

# 设置卷名
volume_name = f"{app_name} {version} installer"

# 目标应用路径
app_path = f"./dist/mac-release/{app_name}.app"

# 应用程序图标（DMG 卷图标）
icon = "./assets/icon.icns"

# DMG 的体积大小，根据实际应用大小调整
# 放入 .app 文件
files = [
    (app_path, f"{app_name}.app"),
]

symlinks = {"Applications": "/Applications"}

# DMG 详细配置
window_rect = ((200, 200), (590, 400))

icon_locations = {
    f"{app_name}.app": (160, 150),
    "Applications": (430, 150),
}

icon_size = 60
text_size = 12
format = "UDBZ"
