/**
 * CanvasEditToolbar — floating Cut / Copy / Paste + shortcuts cluster in the
 * canvas's bottom-left corner (ZoomControl sits bottom-right), shown under
 * Advanced. Undo / Redo live in the workspace header (one history, one
 * place).
 *
 * Buttons self-disable when the op is a no-op. Keyboard shortcuts via
 * `useStudioShortcuts` fire the same handlers whether or not this toolbar
 * shows — the buttons are an affordance, not the only path.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ClipboardPaste, Copy, Keyboard, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ShortcutSettings from "@/components/studio/nle/ShortcutSettings";

interface CanvasEditToolbarProps {
  /** Clipboard slice from `useCanvasClipboard`. */
  clipboard: {
    copy: () => boolean;
    cut: () => boolean;
    paste: () => boolean;
    hasClipboard: boolean;
    clipboardKind: "widget" | "scene" | null;
  };
  className?: string;
  /** The studio's rebindable shortcuts (a kit's keys are fixed). */
  showShortcuts?: boolean;
}

export default function CanvasEditToolbar({ clipboard, className, showShortcuts = true }: CanvasEditToolbarProps) {
  const { t } = useTranslation();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const mod = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
  const cut = t("workspace.edit.cut", { key: `${mod}+X` });
  const copy = t("workspace.edit.copy", { key: `${mod}+C` });
  const paste = clipboard.clipboardKind
    ? t(clipboard.clipboardKind === "scene" ? "workspace.edit.pasteScene" : "workspace.edit.pasteElement", { key: `${mod}+V` })
    : t("workspace.edit.paste", { key: `${mod}+V` });
  const shortcuts = t("workspace.edit.shortcuts");

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-[0_4px_14px_-8px_hsl(var(--foreground)/0.4)]",
        className,
      )}
    >
      <Button variant="ghost" size="sm" onClick={clipboard.cut} aria-label={cut} title={cut} className="h-7 w-7 p-0">
        <Scissors className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" onClick={clipboard.copy} aria-label={copy} title={copy} className="h-7 w-7 p-0">
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={clipboard.paste}
        disabled={!clipboard.hasClipboard}
        aria-label={paste}
        title={paste}
        className="h-7 w-7 p-0"
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
      </Button>
      {showShortcuts && (
        <>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <Button variant="ghost" size="sm" onClick={() => setShortcutsOpen(true)} aria-label={shortcuts} title={shortcuts} className="h-7 w-7 p-0">
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
            <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("workspace.edit.shortcutsTitle")}</DialogTitle>
              </DialogHeader>
              <ShortcutSettings />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
