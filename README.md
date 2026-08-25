# screenshot-to-code

借助 AI 将截图、模型稿、Figma 设计稿以及屏幕录制视频转换为整洁可用的代码。最简单的体验方式是访问 <a href="https://screenshottocode.com/?utm_source=github&utm_medium=readme&utm_campaign=oss_readme&utm_content=top_cta" target="_blank" rel="noopener noreferrer">官方在线版 screenshottocode.com →</a>


https://github.com/user-attachments/assets/ec08a5e6-9606-41c5-b03a-1bf47dfeba75


支持的技术栈：

- HTML + Tailwind
- HTML + CSS
- React + Tailwind
- Vue + Tailwind
- Bootstrap
- Ionic + Tailwind

默认 AI 模型：

- Gemini 3 Flash Preview 和 Gemini 3.1 Pro Preview —— 表现最佳的模型
- GPT-5.5 和 GPT-5.4 Mini
- Claude Opus 4.6、Claude Opus 4.8
- MiniMax M3 —— 本地化默认模型（OpenAI 兼容接口）
- z-image-turbo（通过 Replicate）用于图片生成

更多示例见下方 [示例](#-示例) 一节。

Screenshot to Code 也支持录制网站的实际操作过程，并据此生成可交互的原型。

![google in app quick 3](https://github.com/abi/screenshot-to-code/assets/23818/8758ffa4-9483-4b9b-bb66-abd6d1594c33)

## 🛠 快速开始

根据自己的需求选择对应方式：

- **本地运行**：适合想要定制、自托管或参与开发。
- **使用在线版**：最快的试用方式，无需本地环境配置。<a href="https://screenshottocode.com/?utm_source=github&utm_medium=readme&utm_campaign=oss_readme&utm_content=getting_started_cta" target="_blank" rel="noopener noreferrer">打开在线版 →</a>

本地运行需要 API 密钥以及后端 / 前端两套环境。应用由 React/Vite 前端和 FastAPI 后端组成。

### API 密钥

至少需要 **一个** 模型提供商的密钥（OpenAI、Anthropic 或 Gemini）。
**强烈建议同时配置 Gemini 与 Replicate 以获得最佳的截图转代码质量** —— Gemini 负责素材提取（复用截图里的真实 logo / 图片），Replicate 负责图片生成、抠图与图片编辑。四个密钥都配置齐全时效果最好，也可以在每次生成时同时对比多个模型。

| 密钥 | 是否必需 | 用途 |
|-----|-----------|-----------------|
| `OPENAI_API_KEY` | 三者之一 | GPT 代码生成变体（GPT-5.5、GPT-5.4 Mini） |
| `ANTHROPIC_API_KEY` | 三者之一 | Claude 代码生成变体（Opus 5、Opus 4.8、Fable 5、Sonnet 4.6） |
| `GEMINI_API_KEY` | 三者之一 —— **强烈建议** | Gemini 代码生成变体（3 Flash、3.1 Pro）；从截图中提取真实素材；视频模式必需 |
| `REPLICATE_API_KEY` | **强烈建议** | 图片编辑、抠图以及基于 Replicate 的图片生成 —— 不配置则 `edit_images` 与 `remove_backgrounds` 不可用 |

密钥越多，应用会自动为每次生成挑选更强的模型组合；只配置一个时则只能使用对应提供商的模型。

如果想使用 Ollama 开源模型运行（由于效果较差不推荐），请[参考此评论](https://github.com/abi/screenshot-to-code/issues/354#issuecomment-2435479853)。

启动后端（使用 Poetry 管理依赖；如未安装请先 `pip install --upgrade poetry`）：

```bash
cd backend
echo "OPENAI_API_KEY=sk-your-key" > .env
echo "ANTHROPIC_API_KEY=your-key" >> .env
echo "GEMINI_API_KEY=your-key" >> .env
echo "REPLICATE_API_KEY=r8_your-key" >> .env
poetry install
# 为「截图预览」工具安装 Chromium 浏览器。
# 在 Linux 上，请使用 `poetry run playwright install --with-deps chromium`
# 一并安装所需的系统依赖（需要 sudo/apt）。
poetry run playwright install chromium
poetry env activate
# 运行打印出来的命令，例如 source /path/to/venv/bin/activate
poetry run uvicorn main:app --reload --port 7001
```

也可以在前端的「设置」对话框中配置 OpenAI、Anthropic 和 Gemini 密钥（加载应用后点击齿轮图标）。Replicate 必须在 `backend/.env` 中以 `REPLICATE_API_KEY` 配置。「设置」对话框也会显示当前后端是否支持 **截图预览**。

> **截图预览**（可选）让 Agent 在无头浏览器中渲染自己生成的页面并直观检查效果。一旦安装了 Chromium（上面的 `playwright install chromium` 步骤，或 Docker 镜像中已自动安装）即自动启用。如果缺少 Chromium，应用只会跳过该工具，「设置」对话框会显示当前是否可用。

启动前端：

```bash
cd frontend
pnpm install
pnpm dev
```

浏览器访问 http://localhost:5173 即可使用应用。

如果想把后端跑在其它端口，请在 `frontend/.env.local` 中修改 `VITE_WS_BACKEND_URL`。

## Docker

如果已安装 Docker，在仓库根目录运行：

```bash
echo "OPENAI_API_KEY=sk-your-key" > .env
docker-compose up -d --build
```

应用将启动在 http://localhost:5173。注意此方式不适合开发调试，因为文件变更不会触发重新构建。

## 🙋‍♂️ 常见问题

- **启动后端时遇到错误怎么办？** [试试这个](https://github.com/abi/screenshot-to-code/issues/3#issuecomment-1814777959)。如果仍然无法解决，请提交 Issue。
- **如何获取 OpenAI API 密钥？** 见 https://github.com/abi/screenshot-to-code/blob/main/Troubleshooting.md
- **如何配置 OpenAI 代理？** 如果你无法直接访问 OpenAI API（例如因为地区限制），可以尝试使用 VPN，或者将 OpenAI Base URL 配置为代理地址。在 `backend/.env` 中设置 `OPENAI_BASE_URL`，也可以在「设置」对话框中直接配置。URL 中需要包含 `v1` 路径，例如：`https://xxx.xxxxx.xxx/v1`。
- **如何修改前端连接的后端地址？** 在 `frontend/.env.local` 中配置 `VITE_HTTP_BACKEND_URL` 与 `VITE_WS_BACKEND_URL`。例如，设置 `VITE_HTTP_BACKEND_URL=http://124.10.20.1:7001`。
- **运行后端时出现 UTF-8 错误？** 在 Windows 上，用 Notepad++ 打开 `.env` 文件，然后在「编码」菜单中选择 UTF-8。
- **如何反馈建议？** 对于建议、功能需求和 Bug 反馈，欢迎提交 Issue，或在 [Twitter](https://twitter.com/_abi_) 上联系我。

## 📚 示例

**纽约时报**

| 原始                                                                                                                                                        | 复刻                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img width="1238" alt="Screenshot 2023-11-20 at 12 54 03 PM" src="https://github.com/user-attachments/assets/6b0ae86c-1b0f-4598-a578-c7b62205b3e2"> | <img width="1435" height="737" alt="Screenshot 2026-06-15 at 3 06 37 PM" src="https://github.com/user-attachments/assets/48f0ab94-5fdc-41e7-ad6e-b4ad7ef69ae1" /> |


**Instagram**

https://github.com/user-attachments/assets/a335a105-f9cc-40e6-ac6b-64e5390bfc21

**Hacker News**



https://github.com/user-attachments/assets/205cb5c7-9c3c-438d-acd4-26dfe6e077e5
