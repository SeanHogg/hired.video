/**
 * The studio rail for one render: the format's left tabs, each in its
 * registry slot (lib/workspace/studio-tool-slots.ts), plus the rail tools
 * the host renders itself (Design, Layers) — Advanced's tools appended. The
 * rail's state is `useStudioRail` (lib/studio/editor-v2).
 */
import type { TFunction } from "i18next";
import type { WorkspaceTool } from "@/components/workspace/WorkspaceLeftPanel";
import { railToolsFor, type RailToolId } from "@/lib/workspace/workspace-panels";
import { railSlotFor, tabForRailSlot, type StudioToolFamily } from "@/lib/workspace/studio-tool-slots";
import type { WorkspaceDepth } from "@/lib/workspace/workspace-depth";
import type { FocusLeftTab } from "@/lib/studio/use-focus-left-panel";
import type { HostRailTools, StudioRail } from "@/lib/studio/editor-v2/use-studio-rail";

export interface ComposedStudioRail {
  studioTools: WorkspaceTool[];
  activeTool: RailToolId;
  selectTool: (tool: RailToolId) => void;
}

export function composeStudioRail(
  t: TFunction,
  rail: StudioRail,
  depth: WorkspaceDepth,
  toolFamily: StudioToolFamily,
  leftTabs: FocusLeftTab[],
  hostTools: HostRailTools,
): ComposedStudioRail {
  const { leftPanel, hostRailTool, setHostRailTool } = rail;
  const activeLeftTab = leftTabs.some((tab) => tab.id === leftPanel.tab) ? leftPanel.tab : "ai";
  const studioTools: WorkspaceTool[] = railToolsFor(depth).map((def) => {
    const own = hostTools[def.id];
    if (own) return { id: def.id, label: own.label, icon: def.icon, content: own.content };
    const tab = leftTabs.find((candidate) => railSlotFor(toolFamily, candidate.id) === def.id);
    return { id: def.id, label: tab?.label ?? t(def.labelKey), icon: tab?.icon ?? def.icon, content: tab?.content ?? null };
  });
  const activeTool: RailToolId =
    hostRailTool && hostTools[hostRailTool] ? hostRailTool : (railSlotFor(toolFamily, activeLeftTab) ?? "chat");
  const selectTool = (tool: RailToolId) => {
    if (hostTools[tool]) {
      setHostRailTool(tool);
      return;
    }
    setHostRailTool(null);
    const tab = tabForRailSlot(toolFamily, tool);
    if (tab) leftPanel.setTab(tab);
  };
  return { studioTools, activeTool, selectTool };
}
