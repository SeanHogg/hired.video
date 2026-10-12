/**
 * useKitPanel — what a kit's left panel shows: one rail tool (Chat, Design,
 * Sections, Media, + Advanced's Scenes, Elements, Layers) or, on top of
 * Sections, the editor for ONE résumé section.
 *
 * The section editor opens from either side of the workspace — a row in
 * Sections or the pencil on a section of the rendered page — so this state
 * lives here, not inside the panel. Keys from the page go through
 * `resolveEditableSection`; a block with no fields falls back to the
 * Sections list instead of opening an empty editor.
 */
import { useCallback, useState } from "react";
import { resolveEditableSection } from "@/lib/build/editable-sections";
import type { RailToolId } from "./workspace-panels";

export function useKitPanel() {
  const [tool, setTool] = useState<RailToolId>("chat");
  const [editing, setEditing] = useState<string | null>(null);

  const show = useCallback((next: RailToolId) => {
    setEditing(null);
    setTool(next);
  }, []);

  const editSection = useCallback((key: string | null | undefined) => {
    setTool("sections");
    setEditing(resolveEditableSection(key) ?? null);
  }, []);

  /** Back from the section editor to the Sections list. */
  const closeEditor = useCallback(() => {
    setEditing(null);
    setTool("sections");
  }, []);

  const reset = useCallback(() => {
    setEditing(null);
    setTool("chat");
  }, []);

  return { tool, editing, show, editSection, closeEditor, reset };
}
