/**
 * CanvasEditToolbar — floating Undo / Redo / Cut / Copy / Paste cluster
 * mounted in the canvas-stage's bottom-left corner (mirroring ZoomControl
 * on the bottom-right). Lifted out of the editor header so that bar can
 * stay focused on identity / transport / publish (#647) — the edit
 * operations now sit next to the work surface they act on.
 *
 * Buttons self-disable when the corresponding op is a no-op. Keyboard
 * shortcuts via `useStudioShortcuts` continue to fire the same handlers
 * regardless of whether this toolbar is visible — the buttons are an
 * affordance, not the only path.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ClipboardPaste,
  Copy,
  Keyboard,
  Redo2,
  Scissors,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ShortcutSettings from "@/components/studio/nle/ShortcutSettings";

interface CanvasEditToolbarProps {
  /** History slice from `useCanvasHistory` — the toolbar reads canUndo /
   *  canRedo directly so consumers don't recompute them. */
  history: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
  /** Clipboard slice from `useCanvasClipboard`. */
  clipboard: {
    copy: () => boolean;
    cut: () => boolean;
    paste: () => boolean;
    hasClipboard: boolean;
    clipboardKind: "widget" | "scene" | null;
  };
  className?: string;
}

export default function CanvasEditToolbar({
  history,
  clipboard,
  className,
}: CanvasEditToolbarProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const modKey =
    typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent)
      ? "⌘"
      : "Ctrl";
  const pasteHint = clipboard.clipboardKind
    ? `Paste ${clipboard.clipboardKind} (${modKey}+V)`
    : `Paste (${modKey}+V)`;

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-md border border-border bg-card/95 px-1.5 py-1 shadow-sm backdrop-blur",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={history.undo}
        disabled={!history.canUndo}
        aria-label={`Undo (${modKey}+Z)`}
        title={`Undo (${modKey}+Z)`}
        className="h-7 w-7 p-0"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={history.redo}
        disabled={!history.canRedo}
        aria-label={`Redo (Shift+${modKey}+Z)`}
        title={`Redo (Shift+${modKey}+Z)`}
        className="h-7 w-7 p-0"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        onClick={clipboard.cut}
        aria-label={`Cut (${modKey}+X)`}
        title={`Cut (${modKey}+X)`}
        className="h-7 w-7 p-0"
      >
        <Scissors className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={clipboard.copy}
        aria-label={`Copy (${modKey}+C)`}
        title={`Copy (${modKey}+C)`}
        className="h-7 w-7 p-0"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={clipboard.paste}
        disabled={!clipboard.hasClipboard}
        aria-label={pasteHint}
        title={pasteHint}
        className="h-7 w-7 p-0"
      >
        <ClipboardPaste className="h-3.5 w-3.5" />
      </Button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShortcutsOpen(true)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        className="h-7 w-7 p-0"
      >
        <Keyboard className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editor shortcuts</DialogTitle>
          </DialogHeader>
          <ShortcutSettings />
        </DialogContent>
      </Dialog>
    </div>
  );
}
