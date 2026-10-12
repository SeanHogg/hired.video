/**
 * RightSlot — the workspace's ONE right slide-out (the inspector, the Post
 * panel or a tool page — useRightSlot picks which). It slides over the
 * canvas edge, closes with ✕ (or Escape), and when closed leaves a labelled
 * edge tab ("This scene", "Post"…) that reopens what was closed. The frame
 * pads the canvas so the page re-centres in what stays visible. On phones it
 * is a bottom sheet (PhoneSheet).
 *
 * Every panel the host passes stays MOUNTED (hidden when not showing): the
 * Post panel holds its saved project and a post in flight, and a tool page
 * keeps what was typed into it. A panel can drill in (Advanced properties):
 * its `onBack` shows ‹ and its `kicker` names the parent.
 */
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Settings2, X } from "lucide-react";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import type { RightSlotState } from "@/lib/workspace/use-right-slot";
import type { SlotPanelId } from "@/lib/workspace/workspace-panels";
import { cn } from "@/lib/utils";
import PhoneSheet from "./PhoneSheet";
import { useEscape } from "@/hooks/use-escape";

export interface SlotPanel {
  /** Mono eyebrow over the title ("THIS SCENE"); the parent's name when
   *  drilled in. Already translated. */
  kicker?: string;
  title: string;
  description?: string;
  /** Drilled in: ‹ goes back to the parent. */
  onBack?: () => void;
  content: ReactNode;
}

interface RightSlotProps {
  slot: RightSlotState;
  panels: Partial<Record<SlotPanelId, SlotPanel | null>>;
}

export default function RightSlot({ slot, panels }: RightSlotProps) {
  const { t } = useTranslation();
  const wide = useIsWideWorkspace();
  const { active, close, reopen, reopenTarget, widthPx } = slot;
  const shown = active ? panels[active] : null;
  const edge = reopenTarget ? panels[reopenTarget] : null;

  useEscape(active !== null && wide, close);

  const bodies = (Object.keys(panels) as SlotPanelId[]).map((id) => {
    const panel = panels[id];
    if (!panel) return null;
    return (
      <div key={id} hidden={id !== active} className={cn("min-h-0 flex-1 flex-col overflow-y-auto", id === active ? "flex" : "hidden")}>
        {panel.content}
      </div>
    );
  });

  if (!wide) {
    return (
      <PhoneSheet open={!!shown} onClose={close} title={shown?.title ?? ""} kicker={shown?.kicker} onBack={shown?.onBack}>
        {bodies}
      </PhoneSheet>
    );
  }

  return (
    <>
      <aside
        data-region="slot"
        aria-label={shown?.title}
        hidden={!shown}
        style={{ width: widthPx || undefined }}
        className={cn(
          "absolute inset-y-0 right-0 z-30 max-w-full flex-col border-l border-border bg-card shadow-[-18px_0_40px_-24px_hsl(var(--ink)/0.45)] animate-in slide-in-from-right-8 duration-200",
          shown ? "flex" : "hidden",
        )}
      >
        {shown && (
          <div className="flex flex-none items-start gap-1 border-b border-border py-2 pl-2 pr-1.5">
            {shown.onBack ? (
              <button
                type="button"
                onClick={shown.onBack}
                aria-label={t("actions.back")}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <span className="w-2 flex-none" />
            )}
            <div className="flex min-w-0 flex-1 flex-col py-1">
              {shown.kicker && (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{shown.kicker}</span>
              )}
              <h2 className="truncate text-sm font-semibold text-foreground">{shown.title}</h2>
              {shown.description && <p className="line-clamp-2 text-xs text-muted-foreground">{shown.description}</p>}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("actions.close")}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {bodies}
      </aside>
      {!shown && edge && (
        <button
          type="button"
          onClick={reopen}
          aria-label={t("workspace.slot.reopen", { panel: edge.kicker ?? edge.title })}
          className="absolute right-0 top-4 z-20 flex w-8 flex-col items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-card py-3 text-[12px] font-semibold text-primary shadow-sm hover:bg-muted"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span style={{ writingMode: "vertical-rl" }}>{edge.kicker ?? edge.title}</span>
        </button>
      )}
    </>
  );
}
