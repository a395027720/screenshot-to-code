import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { pickDirectoryFromSystem, saveCodeToDirectory } from "./download";

const LAST_DIR_KEY = "last-save-directory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  filename: string;
}

function SaveToPathDialog({ open, onOpenChange, code, filename }: Props) {
  const [directory, setDirectory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDirectory(localStorage.getItem(LAST_DIR_KEY) ?? "");
    }
  }, [open]);

  async function handleSave() {
    const trimmed = directory.trim();
    if (!trimmed) {
      toast.error("请输入保存目录");
      return;
    }
    setIsSaving(true);
    try {
      const files = await saveCodeToDirectory(code, trimmed, filename);
      localStorage.setItem(LAST_DIR_KEY, trimmed);
      toast.success(`已保存 ${files.length} 个文件到 ${trimmed}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePick() {
    setIsSaving(true);
    try {
      const picked = await pickDirectoryFromSystem();
      if (picked) {
        setDirectory(picked);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "选择目录失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存到指定路径</DialogTitle>
          <DialogDescription>
            选择目录，或输入本机路径（目录不存在时自动创建），将 {filename}
            及提取的素材写入。
          </DialogDescription>
        </DialogHeader>
        <Input
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          placeholder="如 ~/Desktop/export 或 /Users/me/projects/demo"
          data-testid="save-path-input"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { label: "桌面", path: "~/Desktop" },
            { label: "下载", path: "~/Downloads" },
            { label: "文档", path: "~/Documents" },
          ].map((item) => (
            <Button
              key={item.path}
              variant="outline"
              size="sm"
              onClick={() => setDirectory(item.path)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-5 text-gray-500 dark:text-zinc-400">
          系统对话框不可用或选择失败时，可使用上方快捷目录或手动输入路径。
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handlePick}
            disabled={isSaving}
            data-testid="save-path-picker"
          >
            选择目录…
          </Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="save-path-confirm">
            {isSaving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveToPathDialog;
