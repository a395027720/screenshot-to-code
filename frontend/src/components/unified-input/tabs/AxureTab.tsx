import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { Cross1Icon } from "@radix-ui/react-icons";
import { toast } from "react-hot-toast";
import { HTTP_BACKEND_URL } from "../../../config";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { DesignSystemSelectorProps } from "../../settings/DesignSystemSelector";
import { Stack } from "../../../lib/stacks";
import ScreenshotToCodeControls from "../ScreenshotToCodeControls";

interface AxurePage {
  name: string;
  url: string;
  image: string;
}

interface AxureSelection {
  pageName: string;
  scope: string;
  image: string;
}

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type DragMode =
  | { kind: "new" }
  | { kind: "move"; startX: number; startY: number; origin: CropRect }
  | { kind: "resize"; handle: HandleId; origin: CropRect };

const MAX_SELECTIONS = 5;
const MIN_CROP_SIZE = 8;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type HandleId = (typeof HANDLES)[number];
const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};
const HANDLE_POSITIONS: Record<HandleId, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function pageHintFromUrl(url: string): string | null {
  try {
    const params = new URL(url).searchParams;
    return params.get("p") || params.get("page");
  } catch {
    return null;
  }
}

function findDeepLinkedPage(url: string, pages: AxurePage[]): number | null {
  const hint = pageHintFromUrl(url);
  if (!hint) {
    return null;
  }
  const index = pages.findIndex(
    (page) => page.name === hint || page.name.endsWith(`/${hint}`),
  );
  return index === -1 ? null : index;
}

interface Props {
  doCreate: (
    images: string[],
    inputMode: "image" | "video",
    textPrompt?: string,
    isAssetExtractionEnabled?: boolean,
  ) => void;
  stack: Stack;
  setStack: (stack: Stack) => void;
  designSystem: DesignSystemSelectorProps;
}

function SpinnerIcon({ className = "h-4 w-4 animate-spin" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function AxureTab({ doCreate, stack, setStack, designSystem }: Props) {
  const [axureUrl, setAxureUrl] = useState("");
  const [password, setPassword] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pages, setPages] = useState<AxurePage[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selections, setSelections] = useState<AxureSelection[]>([]);
  const [textPrompt, setTextPrompt] = useState("");
  const [isAssetExtractionEnabled, setIsAssetExtractionEnabled] =
    useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragModeRef = useRef<DragMode | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const zoomAnchorRef = useRef<{
    rx: number;
    ry: number;
    px: number;
    py: number;
  } | null>(null);

  async function parsePrototype() {
    const trimmedUrl = axureUrl.trim();

    if (!trimmedUrl) {
      toast.error("请输入原型链接");
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const trimmedPassword = password.trim();
      const response = await fetch(`${HTTP_BACKEND_URL}/api/axure/parse`, {
        method: "POST",
        body: JSON.stringify({
          url: trimmedUrl,
          password: trimmedPassword ? trimmedPassword : null,
          page: pageHintFromUrl(trimmedUrl),
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody: { detail?: string } | null = await response
          .json()
          .catch(() => null);
        throw new Error(errorBody?.detail ?? "解析原型失败，请稍后重试。");
      }

      const data: { pages?: AxurePage[] } = await response.json();
      const parsedPages = Array.isArray(data.pages) ? data.pages : [];
      setPages(parsedPages);
      setPreviewIndex(findDeepLinkedPage(trimmedUrl, parsedPages));
      setIsCropping(false);
      setCropRect(null);
      setZoom(1);
      setSelections([]);
      if (parsedPages.length === 0) {
        setParseError("未解析到任何设计页面。");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "解析原型失败，请稍后重试。";
      setParseError(message);
    } finally {
      setIsParsing(false);
    }
  }

  function openPreview(index: number) {
    setPreviewIndex(index);
    setIsCropping(false);
    setCropRect(null);
    setZoom(1);
  }

  function cropPoint(event: React.MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - box.left, 0), box.width),
      y: Math.min(Math.max(event.clientY - box.top, 0), box.height),
    };
  }

  function onCropMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const point = cropPoint(event);
    if (spaceHeld) {
      const box = scrollBoxRef.current;
      if (box) {
        panRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: box.scrollLeft,
          scrollTop: box.scrollTop,
        };
      }
      return;
    }
    const handle = (event.target as HTMLElement).dataset.handle as
      | HandleId
      | undefined;
    if (handle && cropRect) {
      dragModeRef.current = { kind: "resize", handle, origin: cropRect };
      return;
    }
    if (
      cropRect &&
      point.x >= cropRect.left &&
      point.x <= cropRect.left + cropRect.width &&
      point.y >= cropRect.top &&
      point.y <= cropRect.top + cropRect.height
    ) {
      dragModeRef.current = {
        kind: "move",
        startX: point.x,
        startY: point.y,
        origin: cropRect,
      };
      return;
    }
    dragModeRef.current = { kind: "new" };
    dragStartRef.current = point;
    setCropRect(null);
  }

  function onCropMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (pan) {
      const box = scrollBoxRef.current;
      if (box) {
        box.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
        box.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
      }
      return;
    }
    const mode = dragModeRef.current;
    if (!mode) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const point = cropPoint(event);
    if (mode.kind === "new") {
      const start = dragStartRef.current;
      if (!start) {
        return;
      }
      setCropRect({
        left: Math.min(start.x, point.x),
        top: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });
      return;
    }
    if (mode.kind === "move") {
      const left = Math.min(
        Math.max(mode.origin.left + (point.x - mode.startX), 0),
        box.width - mode.origin.width,
      );
      const top = Math.min(
        Math.max(mode.origin.top + (point.y - mode.startY), 0),
        box.height - mode.origin.height,
      );
      setCropRect({ ...mode.origin, left, top });
      return;
    }
    let left = mode.origin.left;
    let top = mode.origin.top;
    let right = mode.origin.left + mode.origin.width;
    let bottom = mode.origin.top + mode.origin.height;
    const px = Math.min(Math.max(point.x, 0), box.width);
    const py = Math.min(Math.max(point.y, 0), box.height);
    if (mode.handle.includes("w")) {
      left = Math.min(px, right - MIN_CROP_SIZE);
    }
    if (mode.handle.includes("e")) {
      right = Math.max(px, left + MIN_CROP_SIZE);
    }
    if (mode.handle.includes("n")) {
      top = Math.min(py, bottom - MIN_CROP_SIZE);
    }
    if (mode.handle.includes("s")) {
      bottom = Math.max(py, top + MIN_CROP_SIZE);
    }
    setCropRect({ left, top, width: right - left, height: bottom - top });
  }

  function onCropMouseUp() {
    const mode = dragModeRef.current;
    dragModeRef.current = null;
    dragStartRef.current = null;
    panRef.current = null;
    if (mode?.kind === "new") {
      setCropRect((rect) =>
        rect && rect.width < MIN_CROP_SIZE && rect.height < MIN_CROP_SIZE
          ? null
          : rect,
      );
    }
  }

  function cropRegionToDataUrl(rect: CropRect): string | null {
    const img = previewImgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      return null;
    }
    const displayed = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / displayed.width;
    const scaleY = img.naturalHeight / displayed.height;
    const sx = Math.round(rect.left * scaleX);
    const sy = Math.round(rect.top * scaleY);
    const sw = Math.max(Math.round(rect.width * scaleX), 1);
    const sh = Math.max(Math.round(rect.height * scaleY), 1);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function addSelection(pageName: string, scope: string, image: string | null) {
    if (!image) {
      toast.error("截图裁剪失败，请重试。");
      return;
    }
    if (selections.length >= MAX_SELECTIONS) {
      toast.error(`最多可选择 ${MAX_SELECTIONS} 个区域，请先移除一个再添加。`);
      return;
    }
    setSelections([...selections, { pageName, scope, image }]);
  }

  function addWholePage() {
    const page = previewIndex !== null ? pages[previewIndex] : null;
    if (!page) {
      return;
    }
    addSelection(page.name, "整页", page.image);
  }

  function addCroppedRegion() {
    const page = previewIndex !== null ? pages[previewIndex] : null;
    if (!page || !cropRect) {
      return;
    }
    const image = cropRegionToDataUrl(cropRect);
    const scope = `区域 ${Math.round(cropRect.width)}×${Math.round(cropRect.height)}`;
    addSelection(page.name, scope, image);
    setCropRect(null);
  }

  function changeZoom(delta: number) {
    setZoom((current) =>
      Math.min(Math.max(current + delta, MIN_ZOOM), MAX_ZOOM),
    );
  }

  useEffect(() => {
    if (!isCropping) {
      return;
    }
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCropping(false);
        setCropRect(null);
        return;
      }
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isCropping]);

  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!isCropping || !box) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      zoomAnchorRef.current = {
        rx: (box.scrollLeft + px) / box.scrollWidth,
        ry: (box.scrollTop + py) / box.scrollHeight,
        px,
        py,
      };
      setZoom((current) =>
        Math.min(
          Math.max(current * Math.exp(-event.deltaY * 0.002), MIN_ZOOM),
          MAX_ZOOM,
        ),
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [isCropping]);

  useLayoutEffect(() => {
    const box = scrollBoxRef.current;
    const anchor = zoomAnchorRef.current;
    if (!box || !anchor) {
      return;
    }
    zoomAnchorRef.current = null;
    box.scrollLeft = anchor.rx * box.scrollWidth - anchor.px;
    box.scrollTop = anchor.ry * box.scrollHeight - anchor.py;
  }, [zoom]);

  function removeSelection(index: number) {
    setSelections(selections.filter((_, i) => i !== index));
  }

  function handleGenerate() {
    if (selections.length === 0) {
      return;
    }
    doCreate(
      selections.map((selection) => selection.image),
      "image",
      textPrompt,
      isAssetExtractionEnabled,
    );
  }

  const handleTextKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleGenerate();
    }
  };

  const previewPage = previewIndex !== null ? pages[previewIndex] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 dark:border-zinc-800 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
            <LuLayoutGrid className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
              解析 Axure 原型
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-zinc-400">
              粘贴 Axure 原型分享链接，解析后点击页面预览并截图，即可生成代码。
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <label
              htmlFor="axure-url"
              className="block text-xs font-medium text-gray-600 dark:text-zinc-300"
            >
              原型链接
            </label>
            <Input
              id="axure-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.axshare.com"
              onChange={(event) => setAxureUrl(event.target.value)}
              value={axureUrl}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isParsing) {
                  event.preventDefault();
                  parsePrototype();
                }
              }}
              className="h-11 w-full"
              data-testid="axure-url-input"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label
                htmlFor="axure-password"
                className="block text-xs font-medium text-gray-600 dark:text-zinc-300"
              >
                访问密码
              </label>
              <Input
                id="axure-password"
                type="password"
                autoComplete="off"
                placeholder="可选，加密原型需填写"
                onChange={(event) => setPassword(event.target.value)}
                value={password}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isParsing) {
                    event.preventDefault();
                    parsePrototype();
                  }
                }}
                className="h-11 w-full"
                data-testid="axure-password-input"
              />
            </div>
            <Button
              onClick={parsePrototype}
              disabled={isParsing}
              className="h-11 w-full sm:w-36"
              size="lg"
              data-testid="axure-parse"
            >
              {isParsing && <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />}
              {isParsing ? "正在解析…" : "解析原型"}
            </Button>
          </div>

          {parseError && (
            <p
              className="text-xs leading-5 text-red-600 dark:text-red-400"
              data-testid="axure-parse-error"
            >
              {parseError}
            </p>
          )}
        </div>
      </div>

      {isParsing && (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-zinc-400">
          <SpinnerIcon />
          正在解析原型页面…
        </div>
      )}

      {!isParsing && pages.length > 0 && previewIndex === null && (
        <div className="w-full max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-zinc-400">
            <span>共 {pages.length} 个页面，点击页面进入预览</span>
            <span data-testid="axure-selected-count">
              已选 {selections.length}/{MAX_SELECTIONS}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((page, index) => {
              const isDisabled = !page.image;
              return (
                <button
                  key={`${page.name}-${index}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => openPreview(index)}
                  className={`relative rounded-lg border border-gray-200 p-2 text-left transition hover:border-gray-300 dark:border-zinc-700 dark:hover:border-zinc-500 ${
                    isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                  data-testid={`axure-page-${index}`}
                >
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-zinc-800">
                    {page.image ? (
                      <img
                        src={page.image}
                        alt={page.name}
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-zinc-500">
                        截图失败，不可选择
                      </span>
                    )}
                  </div>
                  <span
                    className="mt-1.5 block truncate text-xs text-gray-700 dark:text-zinc-200"
                    title={page.name}
                  >
                    {page.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isParsing && previewPage && (
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-zinc-800 sm:px-5">
            <span
              className="truncate text-sm font-medium text-gray-900 dark:text-zinc-100"
              title={previewPage.name}
            >
              {previewPage.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreviewIndex(null);
                setIsCropping(false);
                setCropRect(null);
              }}
              data-testid="axure-preview-back"
            >
              返回页面列表
            </Button>
          </div>

          <div className="space-y-3 px-4 py-4 sm:px-5">
            <iframe
              src={previewPage.url}
              title={previewPage.name}
              className="h-[420px] w-full rounded-lg border border-gray-200 bg-white dark:border-zinc-700"
              data-testid="axure-preview-frame"
            />
            <p className="text-xs leading-5 text-gray-500 dark:text-zinc-400">
              可在上方框内实时浏览页面（如关闭弹窗）。确认后点击「全屏截图」进入全屏框选。
            </p>
            <Button
              onClick={() => {
                setIsCropping(true);
                setCropRect(null);
                setZoom(1);
              }}
              disabled={!previewPage.image}
              className="w-full sm:w-40"
              data-testid="axure-capture"
            >
              全屏截图
            </Button>
          </div>
        </div>
      )}

      {previewPage && isCropping && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900"
          data-testid="axure-crop-modal"
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-zinc-700">
            <span
              className="truncate text-sm font-medium text-gray-900 dark:text-zinc-100"
              title={previewPage.name}
            >
              {previewPage.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeZoom(-ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                aria-label="缩小"
                data-testid="axure-zoom-out"
              >
                −
              </Button>
              <span className="w-12 text-center text-xs text-gray-500 dark:text-zinc-400">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeZoom(ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                aria-label="放大"
                data-testid="axure-zoom-in"
              >
                ＋
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCropping(false);
                  setCropRect(null);
                }}
                data-testid="axure-crop-close"
              >
                关闭（Esc）
              </Button>
            </div>
          </div>

          <div
            ref={scrollBoxRef}
            className="flex-1 overflow-auto bg-zinc-100 p-4 dark:bg-zinc-800"
          >
            <div
              className={`relative mx-auto bg-white shadow-sm ${
                spaceHeld ? "cursor-grab" : "cursor-crosshair"
              }`}
              style={{ width: `${zoom * 100}%` }}
              onMouseDown={onCropMouseDown}
              onMouseMove={onCropMouseMove}
              onMouseUp={onCropMouseUp}
              onMouseLeave={onCropMouseUp}
              data-testid="axure-crop-view"
            >
              <img
                ref={previewImgRef}
                src={previewPage.image}
                alt={previewPage.name}
                draggable={false}
                className="block w-full select-none"
              />
              {cropRect && (
                <div
                  className="pointer-events-auto absolute cursor-grab border-2 border-blue-500 bg-blue-500/10"
                  style={{
                    left: cropRect.left,
                    top: cropRect.top,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                >
                  {HANDLES.map((handle) => (
                    <div
                      key={handle}
                      data-handle={handle}
                      className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-blue-600 bg-white"
                      style={{
                        left: HANDLE_POSITIONS[handle].left,
                        top: HANDLE_POSITIONS[handle].top,
                        cursor: HANDLE_CURSORS[handle],
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 px-4 py-3 dark:border-zinc-700">
            <p className="mr-auto text-xs text-gray-500 dark:text-zinc-400">
              拖拽框选区域，可多次框选；拖选框内部移动、拖控制点调整大小；按住空格拖动画布，Cmd/Ctrl+滚轮缩放。
            </p>
            <Button onClick={addWholePage} data-testid="axure-add-whole">
              整页加入生成
            </Button>
            <Button
              onClick={addCroppedRegion}
              disabled={!cropRect}
              data-testid="axure-add-region"
            >
              加入生成（所选区域）
            </Button>
          </div>
        </div>
      )}

      {selections.length > 0 && (
        <div className="w-full max-w-2xl">
          <div className="mb-2 text-xs text-gray-500 dark:text-zinc-400">
            已选 {selections.length}/{MAX_SELECTIONS} 个生成目标
          </div>
          <div className="flex flex-wrap gap-2">
            {selections.map((selection, index) => (
              <div
                key={`${selection.pageName}-${index}`}
                className="relative flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                data-testid={`axure-selection-${index}`}
              >
                <img
                  src={selection.image}
                  alt={selection.pageName}
                  className="h-12 w-20 rounded object-cover object-top"
                />
                <div className="pr-4 text-xs">
                  <div
                    className="max-w-[10rem] truncate text-gray-700 dark:text-zinc-200"
                    title={selection.pageName}
                  >
                    {selection.pageName}
                  </div>
                  <div className="text-gray-400 dark:text-zinc-500">
                    {selection.scope}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSelection(index)}
                  className="absolute right-1 top-1 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"
                  aria-label="移除该选择"
                >
                  <Cross1Icon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScreenshotToCodeControls
        textPrompt={textPrompt}
        onTextPromptChange={setTextPrompt}
        textInputRef={textInputRef}
        onTextInputKeyDown={handleTextKeyDown}
        stack={stack}
        setStack={setStack}
        designSystem={designSystem}
        showAssetExtraction
        isAssetExtractionEnabled={isAssetExtractionEnabled}
        onAssetExtractionChange={setIsAssetExtractionEnabled}
        onGenerate={handleGenerate}
        actionLabel="生成代码"
        isActionDisabled={selections.length === 0}
        actionTestId="axure-generate"
      />
    </div>
  );
}

export default AxureTab;
