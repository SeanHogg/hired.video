/**
 * StripToolbar — the video strip's Advanced header tools (board dock:
 * "✂ ⧉ ⎘ · Layers · zoom"): clipboard (cut · copy · paste · duplicate the
 * selected element, else the selected scene), Layers (opens the Layers rail
 * tool) and timeline zoom (out · % · in · Fit). The clipboard actions answer
 * Ctrl/⌘ + X · C · V · D from the strip and the frame; Ctrl/⌘ + wheel zooms
 * while the strip has focus.
 *
 * Phones (below md) have no room for the row: the same actions — the same
 * handlers — sit in one ⋯ menu in the strip header instead.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Copy, CopyPlus, Layers, Maximize2, MoreHorizontal, Scissors, ZoomIn, ZoomOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StripClipboard } from "@/lib/build/use-strip-clipboard";
import type { StripZoom } from "@/lib/build/use-strip-zoom";

interface StripToolbarProps {
  clipboard: StripClipboard;
  zoom: StripZoom;
  /** Open the Layers rail tool. */
  onLayers: () => void;
}

const ICON =
  "flex h-11 w-11 flex-none items-center justify-center rounded-md text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

/** "Ctrl" or "⌘" for the shortcut hints. */
function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}

function ToolButton({ label, keys, onClick, disabled, children }: { label: string; keys?: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  const hint = keys ? `${label} (${keys})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={hint}
      aria-keyshortcuts={keys?.replace("⌘", "Meta").replace("Ctrl", "Control")}
      className={ICON}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />;

export default function StripToolbar({ clipboard, zoom, onLayers }: StripToolbarProps) {
  const { t } = useTranslation();
  const mod = modKey();
  const what = clipboard.target === "element" ? t("workspace.strip.clipboard.element") : t("workspace.strip.clipboard.scene");
  return (
    <>
      <StripToolsMenu clipboard={clipboard} zoom={zoom} onLayers={onLayers} what={what} />
      <div className="hidden items-center gap-0.5 md:flex">
        <div role="toolbar" aria-label={t("workspace.strip.clipboard.label", { what })} className="flex items-center gap-0.5">
          <ToolButton label={t("workspace.strip.clipboard.cut")} keys={`${mod}+X`} onClick={clipboard.cut} disabled={!clipboard.canCut}>
            <Scissors className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label={t("workspace.strip.clipboard.copy")} keys={`${mod}+C`} onClick={clipboard.copy}>
            <Copy className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label={t("workspace.strip.clipboard.paste")} keys={`${mod}+V`} onClick={clipboard.paste} disabled={!clipboard.canPaste}>
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          <ToolButton label={t("workspace.strip.clipboard.duplicate")} keys={`${mod}+D`} onClick={clipboard.duplicate} disabled={!clipboard.canDuplicate}>
            <CopyPlus className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
        </div>
        <Divider />
        <button
          type="button"
          onClick={onLayers}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
          {t("workspace.tool.layers")}
        </button>
        <Divider />
        <div role="toolbar" aria-label={t("workspace.strip.zoom.label")} className="flex items-center gap-0.5">
          <ToolButton label={t("studio.timeline.zoomOut")} onClick={zoom.zoomOut} disabled={!zoom.canZoomOut}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          <span aria-live="polite" className="w-10 text-center text-xs tabular-nums text-foreground">
            {Math.round(zoom.zoom * 100)}%
          </span>
          <ToolButton label={t("studio.timeline.zoomIn")} onClick={zoom.zoomIn} disabled={!zoom.canZoomIn}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          <button type="button" onClick={zoom.fit} className="min-h-11 min-w-11 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted">
            {t("build.canvas.fit")}
          </button>
        </div>
      </div>
    </>
  );
}

const MENU_ICON = "mr-2 h-4 w-4";

/** Phones: the toolbar's actions in one ⋯ menu (zoom steps keep it open). */
function StripToolsMenu({ clipboard, zoom, onLayers, what }: StripToolbarProps & { what: string }) {
  const { t } = useTranslation();
  const stay = (run: () => void) => (e: Event) => {
    e.preventDefault();
    run();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("workspace.strip.tools")} title={t("workspace.strip.tools")} className={`${ICON} md:hidden`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("workspace.strip.clipboard.label", { what })}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={clipboard.cut} disabled={!clipboard.canCut} className="min-h-11">
          <Scissors className={MENU_ICON} aria-hidden="true" />
          {t("workspace.strip.clipboard.cut")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={clipboard.copy} className="min-h-11">
          <Copy className={MENU_ICON} aria-hidden="true" />
          {t("workspace.strip.clipboard.copy")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={clipboard.paste} disabled={!clipboard.canPaste} className="min-h-11">
          <ClipboardPaste className={MENU_ICON} aria-hidden="true" />
          {t("workspace.strip.clipboard.paste")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={clipboard.duplicate} disabled={!clipboard.canDuplicate} className="min-h-11">
          <CopyPlus className={MENU_ICON} aria-hidden="true" />
          {t("workspace.strip.clipboard.duplicate")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLayers} className="min-h-11">
          <Layers className={MENU_ICON} aria-hidden="true" />
          {t("workspace.tool.layers")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("workspace.strip.zoom.label")} · {Math.round(zoom.zoom * 100)}%
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={stay(zoom.zoomOut)} disabled={!zoom.canZoomOut} className="min-h-11">
          <ZoomOut className={MENU_ICON} aria-hidden="true" />
          {t("studio.timeline.zoomOut")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={stay(zoom.zoomIn)} disabled={!zoom.canZoomIn} className="min-h-11">
          <ZoomIn className={MENU_ICON} aria-hidden="true" />
          {t("studio.timeline.zoomIn")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={stay(zoom.fit)} disabled={!zoom.canZoomOut} className="min-h-11">
          <Maximize2 className={MENU_ICON} aria-hidden="true" />
          {t("build.canvas.fit")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
