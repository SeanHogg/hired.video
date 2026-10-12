/**
 * useRightSlot — the workspace's ONE right slide-out. It shows one panel at
 * a time, by priority: a tool page (672px) the visitor opened, else the Post
 * panel, else the inspector for what is selected. ✕ closes whatever shows;
 * the edge tab reopens what was closed last (the inspector, or Post at the
 * last stage) — a canvas click reopens the inspector.
 *
 * The tool and Post states are owned by their own hooks (the journey's tool
 * panel, usePostVideo / the studio's share state) — this hook decides which
 * one the slot shows and routes ✕ / reopen to the right owner, so the three
 * never fight over the space.
 */
import { useCallback, useState } from "react";
import { SLOT_WIDTH_PX, type SlotPanelId } from "./workspace-panels";

interface Args {
  tool: { open: boolean; close: () => void };
  post: { open: boolean; show: () => void; close: () => void } | null;
  /** The page has inspector content for the current selection. */
  hasInspector: boolean;
  /** Start with the inspector open (wide screens) or closed (phones: it
   *  reopens on a canvas tap / the edge tab). */
  initialInspectorOpen: boolean;
}

export function useRightSlot({ tool, post, hasInspector, initialInspectorOpen }: Args) {
  const [inspectorOpen, setInspectorOpen] = useState(initialInspectorOpen);
  const [lastClosed, setLastClosed] = useState<"inspector" | "post">("inspector");

  const active: SlotPanelId | null = tool.open
    ? "tool"
    : post?.open
      ? "post"
      : inspectorOpen && hasInspector
        ? "inspector"
        : null;

  const closeTool = tool.close;
  const closePost = post?.close;
  const close = useCallback(() => {
    if (active === "tool") closeTool();
    else if (active === "post") {
      closePost?.();
      setLastClosed("post");
    } else if (active === "inspector") {
      setInspectorOpen(false);
      setLastClosed("inspector");
    }
  }, [active, closeTool, closePost]);

  const showPost = post?.show;
  const reopenTarget: "inspector" | "post" | null =
    active !== null ? null : lastClosed === "post" && showPost ? "post" : hasInspector ? "inspector" : null;
  const reopen = useCallback(() => {
    if (reopenTarget === "post") showPost?.();
    else setInspectorOpen(true);
  }, [reopenTarget, showPost]);

  return {
    active,
    /** Width of what shows (0 when closed). */
    widthPx: active ? SLOT_WIDTH_PX[active] : 0,
    close,
    /** What the edge tab reopens (null → no edge tab). */
    reopenTarget,
    reopen,
    /** A click on the canvas: show the inspector for the new selection. */
    openInspector: useCallback(() => setInspectorOpen(true), []),
  };
}

export type RightSlotState = ReturnType<typeof useRightSlot>;
