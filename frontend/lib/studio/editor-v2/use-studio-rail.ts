/**
 * The studio rail's state: the format's tabbed left panel
 * (useFocusLeftPanel), which host-rendered rail tool (Design, Layers) is
 * showing, and the Advanced depth the rail's tools need. The composition
 * into the workspace rail's tools — each format's tabs in a registry slot
 * (lib/workspace/studio-tool-slots.ts), Advanced's tools appended — is
 * `composeStudioRail` (components/studio/v2/editor). Lifted out of
 * StudioEditorV2.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { railToolsFor, type RailToolId } from "@/lib/workspace/workspace-panels";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import { useFocusLeftPanel, type WidgetsMode } from "@/lib/studio/use-focus-left-panel";

/** A rail tool the host renders itself rather than a format tab. */
export interface HostRailTool {
  label: string;
  content: ReactNode;
}

export type HostRailTools = Partial<Record<RailToolId, HostRailTool>>;

export function useStudioRail(
  depth: WorkspaceDepthControls,
  initialWidgetsMode: WidgetsMode,
  /** The format opens on its recorder or full timeline (podcast, voice,
   *  `?capture=`): show Advanced for this visit — those tools live there. */
  raiseOnMount: boolean,
) {
  const { raise: raiseDepth } = depth;
  // Mount-time defaults only. (Was the editor's first effect, ahead of the
  // viewport / entry-param hooks' effects; none of those read the depth, so
  // running it here, first among the rail's effects, is order-neutral.)
  useEffect(() => {
    if (raiseOnMount) raiseDepth();
  }, []);
  const leftPanel = useFocusLeftPanel(initialWidgetsMode);
  // A rail tool the host renders itself (Design, Layers) rather than a
  // format tab; null = the format's own tab (useFocusLeftPanel) is showing.
  const [hostRailTool, setHostRailTool] = useState<RailToolId | null>(null);
  // Dropping to Simple lets go of an Advanced-only one (Layers), so raising
  // Advanced again opens the format's own tab, not a stale pick.
  useEffect(() => {
    if (hostRailTool && !railToolsFor(depth.depth).some((tool) => tool.id === hostRailTool)) setHostRailTool(null);
  }, [depth.depth, hostRailTool]);
  // Widgets / Actions are Advanced's Elements tool: asking for them
  // (the recorder, a voiceover) shows Advanced.
  const { showWidgets } = leftPanel;
  const showLeftWidgets = useCallback(
    (mode: WidgetsMode) => {
      setHostRailTool(null);
      showWidgets(mode);
      raiseDepth();
    },
    [showWidgets, raiseDepth],
  );

  return { leftPanel, showLeftWidgets, hostRailTool, setHostRailTool };
}

export type StudioRail = ReturnType<typeof useStudioRail>;
