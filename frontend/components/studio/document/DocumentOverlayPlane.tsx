/**
 * DocumentOverlayPlane — the document stage's overlay plane: the studio's
 * OWN CanvasStage (the same widget renderer, selection, drag / resize /
 * rotate and drop handling as the video canvas) laid transparently over
 * every printed page of the sheet (lib/studio/document/overlay-plane.ts).
 *
 * The page underneath stays usable: only the elements take the pointer —
 * a click between them reaches the page (its lines, pencils, fields), and
 * clears the element selection. While something is dragged from a palette
 * the whole plane takes the drop. Read-only (`editor` absent), elements are
 * drawn and never take the pointer.
 *
 * Sized in page px inside the sheet (zoom 1): the sheet's own scale zooms it.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import CanvasStage, { type Selection } from "@/components/studio/v2/CanvasStage";
import type { Scene, WidgetKind, WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import { cn } from "@/lib/utils";
import { bindingAtPoint } from "@/lib/studio/document/resume-media-binding";

export interface DocumentOverlayEditor {
  selectedId: string | null;
  onSelect: (widgetId: string | null) => void;
  /** `position` in plane units (0..1 of the whole plane). */
  onMove: (widgetId: string, position: WidgetPosition) => void;
  onDelete: (widgetId: string) => void;
  onDropWidget?: (kind: WidgetKind, at: { x: number; y: number }) => void;
  /** `item` is the résumé item under the drop (its stable id), when the page
   *  marks one — so the host can bind the media to it (#2153,
   *  lib/studio/document/resume-media-binding.ts). */
  onDropMedia?: (url: string, kind: "image" | "video", at: { x: number; y: number }, item?: { referenceId: string }) => void;
  onDropLinked?: (kind: LinkedContentKind, id: string, at: { x: number; y: number }) => void;
}

interface Props {
  /** The elements, positions in plane units (hidden ones left out). */
  scene: Scene;
  width: number;
  /** Height of the whole plane in px (pages × page height). */
  height: number;
  editor?: DocumentOverlayEditor;
}

/** While a drag from outside is over the page, the plane takes the drop. */
function useDragOver(enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const on = (e: DragEvent) => {
      if (e.dataTransfer?.types.length) setDragging(true);
    };
    const off = () => setDragging(false);
    window.addEventListener("dragenter", on);
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off, true);
    return () => {
      window.removeEventListener("dragenter", on);
      window.removeEventListener("dragend", off);
      window.removeEventListener("drop", off, true);
    };
  }, [enabled]);
  return enabled && dragging;
}

/** The résumé item (by stable id) under a plane point (0..1 of the plane). */
function itemUnder(plane: HTMLElement | null, at: { x: number; y: number }): { referenceId: string } | undefined {
  if (!plane) return undefined;
  const r = plane.getBoundingClientRect();
  const referenceId = bindingAtPoint(r.left + at.x * r.width, r.top + at.y * r.height, plane.ownerDocument);
  return referenceId ? { referenceId } : undefined;
}

export default function DocumentOverlayPlane({ scene, width, height, editor }: Props) {
  const dragging = useDragOver(!!editor);
  const planeRef = useRef<HTMLDivElement>(null);
  if (scene.widgets.length === 0 && !editor) return null;
  const onDropMedia = editor?.onDropMedia;

  const selection: Selection =
    editor?.selectedId && scene.widgets.some((w) => w.id === editor.selectedId)
      ? { kind: "widget", sceneId: scene.id, widgetId: editor.selectedId }
      : { kind: "scene", sceneId: scene.id };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editor?.selectedId || (e.key !== "Delete" && e.key !== "Backspace")) return;
    const target = e.target as HTMLElement;
    // Typing in a field (incl. the page's plaintext-only inline edits) keeps its keys.
    if (target.isContentEditable || target.closest("input, textarea")) return;
    e.preventDefault();
    editor.onDelete(editor.selectedId);
  };

  return (
    <div
      ref={planeRef}
      data-doc-overlay-plane
      className={cn(
        "absolute left-0 top-0 z-10",
        // Only the elements take the pointer (unless a drop is coming).
        !dragging && "pointer-events-none [&_[role=application]]:pointer-events-none",
        !dragging && editor && "[&_[role=application]>*]:pointer-events-auto",
        "[&>[data-doc-surface]]:shadow-none",
      )}
      style={{ width, height }}
      onKeyDown={editor ? onKeyDown : undefined}
    >
      <CanvasStage
        scene={scene}
        canvasWidth={width}
        canvasHeight={height}
        zoom={1}
        mode="edit"
        selection={selection}
        onSelect={editor ? (next) => editor.onSelect(next.kind === "widget" ? next.widgetId : null) : undefined}
        onWidgetMove={editor?.onMove}
        onWidgetDrop={editor?.onDropWidget}
        onMediaDrop={onDropMedia && ((url, kind, at) => onDropMedia(url, kind, at, itemUnder(planeRef.current, at)))}
        onLinkedContentDrop={editor?.onDropLinked}
      />
    </div>
  );
}
