#!/bin/bash

cd "$(dirname "$0")" || exit 1

if [ ! -f backend/web/index.html ]; then
  echo "未检测到前端构建产物，开始构建（需要 node/pnpm）..."
  (
    cd frontend || exit 1
    pnpm install --frozen-lockfile && pnpm build &&
      rm -rf ../backend/web && cp -R dist ../backend/web
  )
  if [ $? -ne 0 ]; then
    echo ""
    echo "前端构建失败"
    read -r -p "按回车键关闭窗口"
    exit 1
  fi
fi

cd backend || exit 1
if ! command -v poetry >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
fi

if command -v poetry >/dev/null 2>&1; then
  poetry run python app_launcher.py
  status=$?
elif [ -x .venv/bin/python ]; then
  .venv/bin/python app_launcher.py
  status=$?
else
  echo "未找到 poetry 或 .venv，请先安装依赖"
  read -r -p "按回车键关闭窗口"
  exit 1
fi

# Ctrl+C(130) 与正常退出不算错误，其余情况保留窗口以便查看报错
if [ $status -ne 0 ] && [ $status -ne 130 ]; then
  echo ""
  echo "启动失败，退出码 $status"
  read -r -p "按回车键关闭窗口"
fi
