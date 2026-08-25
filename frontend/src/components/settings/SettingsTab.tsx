import React, { useEffect, useState } from "react";
import { BsCheckCircleFill, BsExclamationTriangleFill } from "react-icons/bs";
import { AppTheme, EditorTheme, Settings } from "../../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/select";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { HTTP_BACKEND_URL, IS_RUNNING_ON_CLOUD } from "../../config";

interface Props {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  appTheme: AppTheme;
  setAppTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
}

function SettingsTab({ settings, setSettings, appTheme, setAppTheme }: Props) {
  // null = not yet known (loading / unreachable); otherwise the backend's answer.
  const [screenshotPreviewAvailable, setScreenshotPreviewAvailable] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${HTTP_BACKEND_URL}/api/capabilities`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.screenshot_preview === "boolean") {
          setScreenshotPreviewAvailable(data.screenshot_preview);
        }
      })
      .catch(() => {
        /* leave as null — don't show a false alarm if the backend is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = (theme: EditorTheme) => {
    setSettings((s) => ({
      ...s,
      editorTheme: theme,
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-4 lg:px-6 lg:py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            设置
          </h1>
        </div>

        <div className="mx-auto max-w-lg space-y-6">
          {/* Theme */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                主题
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-zinc-700">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    应用主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    跟随系统，可手动覆盖为浅色或深色
                  </p>
                </div>
                <Select
                  name="app-theme"
                  value={appTheme}
                  onValueChange={(value) => setAppTheme(value as AppTheme)}
                >
                  <SelectTrigger className="w-[140px]">
                    {appTheme === AppTheme.SYSTEM
                      ? "跟随系统"
                      : appTheme === AppTheme.LIGHT
                        ? "浅色"
                        : "深色"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AppTheme.SYSTEM}>跟随系统</SelectItem>
                    <SelectItem value={AppTheme.LIGHT}>浅色</SelectItem>
                    <SelectItem value={AppTheme.DARK}>深色</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    代码编辑器主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    需要刷新页面后生效
                  </p>
                </div>
                <Select
                  name="editor-theme"
                  value={settings.editorTheme}
                  onValueChange={(value) =>
                    handleThemeChange(value as EditorTheme)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <span>
                      {settings.editorTheme === EditorTheme.COBALT
                        ? "钴蓝"
                        : "浓缩"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EditorTheme.COBALT}>钴蓝</SelectItem>
                    <SelectItem value={EditorTheme.ESPRESSO}>浓缩</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                API 密钥
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  OpenAI API 密钥
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  仅保存在你的浏览器中，不会存储到服务器，会覆盖 .env 配置。
                </p>
                <Input
                  id="openai-api-key"
                  className="mt-2"
                  placeholder="OpenAI API 密钥"
                  value={settings.openAiApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      openAiApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              {!IS_RUNNING_ON_CLOUD && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    OpenAI Base URL（可选）
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    如果不想使用默认地址，可以替换为代理 URL。
                  </p>
                  <Input
                    id="openai-base-url"
                    className="mt-2"
                    placeholder="例如：https://api.openai.com/v1"
                    value={settings.openAiBaseURL || ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        openAiBaseURL: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {!IS_RUNNING_ON_CLOUD && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    单次生成的变体数（1-4）
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    每次生成多少个代码变体。变体越多消耗的 token 越多，迭代时可调小以节省成本。
                  </p>
                  <Input
                    id="num-variants"
                    type="number"
                    min={1}
                    max={4}
                    className="mt-2"
                    placeholder="4"
                    value={settings.numVariants}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setSettings((s) => ({
                        ...s,
                        numVariants: Number.isFinite(v)
                          ? Math.max(1, Math.min(4, v))
                          : 4,
                      }));
                    }}
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Anthropic API 密钥
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  仅保存在你的浏览器中，不会存储到服务器，会覆盖 .env 配置。
                </p>
                <Input
                  id="anthropic-api-key"
                  className="mt-2"
                  placeholder="Anthropic API 密钥"
                  value={settings.anthropicApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      anthropicApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Gemini API 密钥
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  仅保存在你的浏览器中，不会存储到服务器，会覆盖 .env 配置。
                </p>
                <Input
                  id="gemini-api-key"
                  className="mt-2"
                  placeholder="Gemini API 密钥"
                  value={settings.geminiApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      geminiApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              {!IS_RUNNING_ON_CLOUD && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Replicate API 密钥
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    仅保存在你的浏览器中，不会存储到服务器，会覆盖 .env 中用于图片生成和编辑的配置。
                  </p>
                  <Input
                    id="replicate-api-key"
                    className="mt-2"
                    placeholder="Replicate API 密钥"
                    value={settings.replicateApiKey || ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        replicateApiKey: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Image Generation */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                图片生成
              </h2>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-zinc-300">
                    占位图
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    开启后效果更有趣，但会消耗更多费用，如果想省钱可以关闭。
                  </p>
                </div>
                <Switch
                  id="image-generation"
                  checked={settings.isImageGenerationEnabled}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      isImageGenerationEnabled: checked,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Screenshot Preview (agent self-verification) */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                截图预览
              </h2>
            </div>
            <div className="p-4">
              {screenshotPreviewAvailable === false ? (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
                  <BsExclamationTriangleFill className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      截图预览不可用
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      后端未安装无头 Chromium，因此 Agent 无法渲染并直观地核对自己的输出。请使用{" "}
                      <code className="rounded bg-amber-100 px-1 py-0.5 font-mono dark:bg-amber-900/40">
                        playwright install chromium
                      </code>{" "}
                      安装，然后重启后端。
                    </p>
                  </div>
                </div>
              ) : screenshotPreviewAvailable === true ? (
                <div className="flex items-start gap-2.5">
                  <BsCheckCircleFill className="mt-0.5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm text-gray-700 dark:text-zinc-300">
                      可用
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      Agent 会在无头浏览器中渲染生成的页面，直观检查效果并修复布局问题。
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  正在检测后端能力…
                </p>
              )}
            </div>
          </div>

          {/* Screenshot by URL */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                通过 URL 截图
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                如果想直接使用 URL 而不自己截图，可以填入 ScreenshotOne 的 API 密钥。{" "}
                <a
                  href="https://screenshotone.com?via=screenshot-to-code"
                  className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                  target="_blank"
                >
                  免费获取每月 100 次截图额度。
                </a>
              </p>
              <Input
                id="screenshot-one-api-key"
                className="mt-3"
                placeholder="ScreenshotOne API 密钥"
                value={settings.screenshotOneApiKey || ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    screenshotOneApiKey: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsTab;
