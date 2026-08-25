---
name: sync-screenshot-to-code
description: 同步 screenshot-to-code 上游 abi/screenshot-to-code 代码，同时保留本地 MiniMax 定制化。当用户提到 sync、拉上游、更新代码、merge upstream、拉新版本、upstream 更新了 时使用。
---

# 同步 screenshot-to-code

拉取 `abi/screenshot-to-code` 上游最新代码，自动重新应用本地的 MiniMax 定制化。

## 何时调用

用户说以下任一意图时触发：
- "sync"、"拉上游"、"upstream 更新"、"merge upstream"、"拉最新代码"、"更新代码"
- 想把上游改动合到本地
- 提到 abi/screenshot-to-code 出了新 commit 想要

**不要**用于普通本地编辑、调试、或非版本控制任务。

## 工作流程

1. **确认意图** — 问一次用户是否现在 sync（这会改写本地状态）
2. **检查 remote** — 确认 `upstream` 指向 `abi/screenshot-to-code`，没有就帮用户加上
3. **跑 sync 脚本** — 在项目根执行 `npm run sync`
4. **检查 patch 规模** — 在 apply 之前，看 patch 行数和文件数（脚本会打印）。如果太大（>500 行 或 >30 文件），说明本地跟 upstream 分叉严重，**先停下跟用户确认**。

5. **真正的 MiniMax 定制化** — 冲突解决时保留这些**最小集**：
   - `backend/llm.py` — `MINIMAX_M3` 枚举 + `OPENAI_COMPATIBLE_MODELS` tuple + `Union` import
   - `backend/routes/generate_code.py` — 用 `OPENAI_COMPATIBLE_MODELS` tuple 判断 + `custom_model` 流程
   - `frontend/src/lib/models.ts` — `MINIMAX_M3` 项 + description
   - `frontend/src/App.tsx` — 默认模型改成 `MINIMAX_M3`、加上 `customModel` 字段
   - `frontend/src/types.ts` — `customModel: string | null` 字段
   - `frontend/src/components/settings/ModelSettingsSection.tsx` — 模型下拉框（新文件）
   - `frontend/src/components/settings/GenerationSettings.tsx` — 引入并使用 ModelSettingsSection
   - `frontend/src/components/settings/SettingsDialog.tsx` — OpenAI Base URL 字段
   - `frontend/src/components/core/StackLabel.tsx` — 容错 `?.components ?? [stack]`
   - `docker-compose.yml` — 前端端口 `8888:5173`
   - `package.json` — `npm run` 脚本（含 `sync`）

   **不要**列 `backend/prompts/types.py` 或 `frontend/src/lib/stacks.ts` —— 官方本来就没有 Vue+Antd，patch 里不会出现。

6. **Rebuild 容器** — sync 成功后跑 `npm run up` 用合并代码重新构建 Docker 镜像
7. **验证** — `curl localhost:8888` 和 `curl localhost:7001` 确认服务可用

## 脚本原理

bash 脚本（`scripts/sync-upstream.sh`）用一个巧妙的方法避免维护 sed/patch 文件：

1. `git diff upstream/main..HEAD > patch` — 把**所有**本地定制抓成 diff
2. `git reset --hard upstream/main` — 丢弃本地独有状态
3. `git apply --3way patch` — 在上游最新代码上重放 diff
4. 提交结果

意思是：
- **不用**维护 `customizations/` 模板目录
- **不用**手写 sed
- 以后加新定制（只要 commit 到 master）也自动保留
- 冲突时 `--3way` 先尝试三方合并，失败再回退到普通 apply + 手动解决

## 冲突解决提示

如果 `git apply` 产生冲突标记，最常见原因是上游移动或重命名了你定制化相邻的代码行。常见冲突点：
- `backend/llm.py`（如果上游在 `MINIMAX_M3` 附近加了新枚举项）
- `frontend/src/lib/models.ts`（新模型描述）
- `frontend/src/App.tsx`（如果上游重构了 defaults 块）

解决冲突时，**永远保留你的 MiniMax 相关行**，接受上游的其他改动。

## 边界情况

- 如果本地 master 已经和 upstream/main 同步（没有本地 commit），脚本会拒绝重置（安全检查）
- 如果 `upstream` remote 没配置，脚本会告诉用户怎么加
- 临时 patch 文件在脚本退出时（成功或失败）自动删除
