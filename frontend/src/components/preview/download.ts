import { HTTP_BACKEND_URL } from "../../config";
import { normalizeBabelCdn } from "../../lib/babelCdn";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const downloadCode = async (code: string, filename: string) => {
  try {
    const response = await fetch(`${HTTP_BACKEND_URL}/api/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        baseUrl: window.location.href,
      }),
    });

    if (!response.ok) {
      throw new Error(`Export failed with status ${response.status}`);
    }

    const assetCount = Number(response.headers.get("X-Export-Assets") ?? "0");
    if (assetCount === 0) {
      downloadBlob(
        new Blob([normalizeBabelCdn(code)], { type: "text/html" }),
        filename
      );
      return;
    }

    const blob = await response.blob();
    downloadBlob(blob, filename.replace(/\.html$/, ".zip"));
  } catch (error) {
    console.warn("导出接口不可用，回退为直接下载 index.html", error);
    downloadBlob(
      new Blob([normalizeBabelCdn(code)], { type: "text/html" }),
      filename
    );
  }
};

export const pickDirectoryFromSystem = async (): Promise<string | null> => {
  const response = await fetch(`${HTTP_BACKEND_URL}/api/pick-directory`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorBody: { detail?: string } | null = await response
      .json()
      .catch(() => null);
    throw new Error(errorBody?.detail ?? `选择目录失败，状态码 ${response.status}`);
  }

  const data: { directory?: string | null } = await response.json();
  return data.directory ?? null;
};

export const saveCodeToDirectory = async (
  code: string,
  directory: string,
  filename: string
): Promise<string[]> => {
  const response = await fetch(`${HTTP_BACKEND_URL}/api/export-save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      baseUrl: window.location.href,
      directory,
      filename,
    }),
  });

  if (!response.ok) {
    const errorBody: { detail?: string } | null = await response
      .json()
      .catch(() => null);
    throw new Error(errorBody?.detail ?? `保存失败，状态码 ${response.status}`);
  }

  const data: { files?: string[] } = await response.json();
  return data.files ?? [];
};
