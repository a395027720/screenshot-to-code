export function OnboardingNote() {
  return (
    <div className="flex flex-col space-y-4 bg-green-700 p-2 rounded text-stone-200 text-sm">
      <span>
        使用 Screenshot to Code，请先{" "}
        <a
          className="inline underline hover:opacity-70"
          href="https://buy.stripe.com/8wM6sre70gBW1nqaEE"
          target="_blank"
        >
          购买点数（36 美元可生成 100 次）
        </a>
        ，或自备具备 GPT4 视觉能力的 OpenAI API 密钥。{" "}
        <a
          href="https://github.com/abi/screenshot-to-code/blob/main/Troubleshooting.md"
          className="inline underline hover:opacity-70"
          target="_blank"
        >
          参考这份说明获取密钥。
        </a>{" "}
        获取后粘贴到设置对话框（左上角齿轮图标）中即可。密钥仅保存在你的浏览器本地，不会被存储到我们的服务器。
      </span>
    </div>
  );
}
