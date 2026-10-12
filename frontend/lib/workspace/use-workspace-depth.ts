/**
 * useWorkspaceDepth — the viewer's Simple | Advanced choice, shared by every
 * workspace (kits and studio formats alike). Remembered per browser (until
 * the viewer picks, each surface opens at its own `fallback`);
 * `?depth=simple|advanced` on the URL wins for that visit (and is
 * remembered). Switching keeps the document, the selection, the playhead and
 * the open slide-out — nothing in the frame remounts, entries are appended.
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEPTH_PARAM, DEPTH_STORAGE_KEY, parseDepth, type WorkspaceDepth } from "./workspace-depth";

function readStored(): WorkspaceDepth | null {
  try {
    return parseDepth(window.localStorage.getItem(DEPTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function store(depth: WorkspaceDepth): void {
  try {
    window.localStorage.setItem(DEPTH_STORAGE_KEY, depth);
  } catch {
    // Private mode: the choice holds for this visit.
  }
}

export function useWorkspaceDepth(fallback: WorkspaceDepth = "simple") {
  const [searchParams] = useSearchParams();
  const [depth, setDepthState] = useState<WorkspaceDepth>(() => {
    const fromUrl = parseDepth(searchParams.get(DEPTH_PARAM));
    if (fromUrl) store(fromUrl);
    return fromUrl ?? readStored() ?? fallback;
  });

  const setDepth = useCallback((next: WorkspaceDepth) => {
    store(next);
    setDepthState(next);
  }, []);

  /** Show Advanced for THIS visit without changing the viewer's choice —
   *  a format that opens on an Advanced tool (a podcast's recorder). */
  const raise = useCallback(() => setDepthState("advanced"), []);

  return { depth, advanced: depth === "advanced", setDepth, raise };
}

export type WorkspaceDepthControls = ReturnType<typeof useWorkspaceDepth>;
