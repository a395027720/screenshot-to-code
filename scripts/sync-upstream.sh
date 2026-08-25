#!/usr/bin/env bash
# 同步 screenshot-to-code 上游代码 + 保留本地 MiniMax 定制化。
#
# 工作原理：
#   1. git fetch upstream
#   2. git diff upstream/main..HEAD > patch   （抓出所有本地定制）
#   3. git reset --hard upstream/main         （重置到上游最新）
#   4. git apply --3way patch                 （在新代码上重放定制；--3way 自动处理冲突）
#   5. commit
#   6. npm run up                             （用合并后的代码 rebuild 容器）
#
# 用法：
#   ./scripts/sync-upstream.sh
#
# 前置条件：
#   - upstream remote 指向 abi/screenshot-to-code
#   - 本地 master 包含你想保留的定制化 commit
set -euo pipefail

cd "$(dirname "$0")/.."

# 前置检查
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "错误：未配置 'upstream' remote。"
  echo "执行：git remote add upstream https://github.com/abi/screenshot-to-code.git"
  exit 1
fi

PATCH_FILE="$(mktemp -t s2c-sync-XXXXXX.patch)"
# shellcheck disable=SC2064
trap "rm -f $PATCH_FILE" EXIT

echo "==> [1/5] 拉 upstream 最新代码"
git fetch upstream

echo "==> [2/5] 抓取本地定制化（diff upstream/main..HEAD）"
git diff upstream/main..HEAD > "$PATCH_FILE"
LOCAL_COMMIT_COUNT=$(git rev-list --count upstream/main..HEAD)
echo "      本地 commit 数：$LOCAL_COMMIT_COUNT"
echo "      patch 大小：    $(wc -l < "$PATCH_FILE") 行"

if [ "$LOCAL_COMMIT_COUNT" -eq 0 ]; then
  echo "错误：本地没有 commit 可保留，拒绝重置。"
  echo "      （本地 master 已经和 upstream/main 同步）"
  exit 1
fi

echo "==> [3/5] git reset --hard upstream/main"
git reset --hard upstream/main

echo "==> [4/5] 应用定制化 patch（3-way merge）"
if ! git apply --3way "$PATCH_FILE"; then
  echo ""
  echo "!! 3-way merge 失败，回退到普通 apply。"
  echo "   文件里可能出现冲突标记 <<<<<<<。解决后执行："
  echo "     git add . && git commit -m 'apply local customizations'"
  if git apply "$PATCH_FILE"; then
    echo "   普通 apply 成功 —— 请检查是否有冲突标记。"
  else
    echo "错误：patch 应用失败。Patch 保存在：$PATCH_FILE"
    echo "      手动解决后执行：git add . && git commit -m 'apply local customizations'"
    exit 1
  fi
fi

echo "==> [5/5] git add + commit"
git add -A
if git diff --cached --quiet; then
  echo "      无内容可提交（patch 可能为空或已经应用过）"
else
  git commit -m "local: MiniMax 定制化（基于 upstream/main）"
  echo "      已提交：$(git rev-parse --short HEAD)"
fi

echo ""
echo "==> 同步完成。Patch 文件已删除（脚本退出时清理）。"
echo "    下一步：  npm run up     （rebuild 容器）"
echo "    或者先验证：npm run ps"
