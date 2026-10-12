/**
 * No feature lost: every feature of the kit and the studio editor names a
 * home the workspace registry has, at the depth it is reachable; every
 * registry tool / ⋯ row is the home of something; Advanced only APPENDS;
 * and every registered rail tool and slot panel MOUNTS content in the frame
 * (not just a registry row). Written over the registry: a new entry is
 * covered by the loops and fails until it has a mount below.
 */
import { createElement as h, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import i18n from "i18next";
import { ResumeContentSchema } from "@shared/resume";
import { readVideoPlan } from "@shared/video-plan";
import { renderWithAppProviders } from "@/__tests__/test-render";
import WorkspaceLeftPanel, { type WorkspaceTool } from "@/components/workspace/WorkspaceLeftPanel";
import RightSlot from "@/components/workspace/RightSlot";
import { iconTabPanelId } from "@/components/ui/icon-tab-bar";
import ChatActionChips from "@/components/workspace/ChatActionChips";
import StructurePicker from "@/components/build/StructurePicker";
import SectionsPanel from "@/components/build/SectionsPanel";
import MediaPanel from "@/components/build/MediaPanel";
import StoryPanel from "@/components/build/StoryPanel";
import WidgetPalette from "@/components/studio/v2/WidgetPalette";
import LayersPanel from "@/components/studio/v2/LayersPanel";
import { defaultWidget, emptyScene } from "@/lib/studio/editor-v2/canvas-state";
import { MUSIC_TRACKS } from "@/lib/studio/music-catalog";
import { WORKSPACE_WIDE_QUERY } from "@/hooks/use-media-query";
import type { RightSlotState } from "@/lib/workspace/use-right-slot";
import { WORKSPACE_FEATURES, type FeatureHome } from "@/lib/workspace/feature-inventory";
import {
  CANVAS_SURFACE_IDS,
  HEADER_CONTROL_IDS,
  HOME_SECTION_IDS,
  MORE_ITEMS,
  RAIL_TOOLS,
  SLOT_PANEL_IDS,
  SLOT_WIDTH_PX,
  STRIP_CONTENT_IDS,
  moreItemsFor,
  railToolsFor,
  type RailToolId,
  type SlotPanelId,
} from "@/lib/workspace/workspace-panels";

const IDS: Record<Exclude<FeatureHome["region"], "stepper">, readonly string[]> = {
  rail: RAIL_TOOLS.map((tool) => tool.id),
  slot: SLOT_PANEL_IDS,
  more: MORE_ITEMS.map((item) => item.id),
  header: HEADER_CONTROL_IDS,
  canvas: CANVAS_SURFACE_IDS,
  strip: STRIP_CONTENT_IDS,
  home: HOME_SECTION_IDS,
};

/** The depth a home is reachable at (rail / ⋯ rows carry their own). */
function homeDepth(home: FeatureHome): "simple" | "advanced" {
  if (home.region === "rail") return RAIL_TOOLS.find((tool) => tool.id === home.id)!.depth;
  if (home.region === "more") return MORE_ITEMS.find((item) => item.id === home.id)!.depth;
  return "simple";
}

describe("workspace feature parity", () => {
  it("lists the boards' 42 features, each once", () => {
    expect(WORKSPACE_FEATURES).toHaveLength(42);
    expect(new Set(WORKSPACE_FEATURES.map((f) => f.id)).size).toBe(42);
  });

  it.each(WORKSPACE_FEATURES.map((f) => [f.id, f] as const))("%s has a home in the registry", (_id, feature) => {
    expect(feature.homes.length).toBeGreaterThan(0);
    for (const home of feature.homes) {
      if (home.region === "stepper") continue;
      expect(IDS[home.region]).toContain(home.id);
    }
  });

  it("a Simple feature is reachable in Simple", () => {
    for (const feature of WORKSPACE_FEATURES.filter((f) => f.depth === "simple")) {
      expect(feature.homes.some((home) => homeDepth(home) === "simple"), feature.id).toBe(true);
    }
  });

  it("names the ROADMAP gap of every feature that isn't built yet — and only those", () => {
    const planned = WORKSPACE_FEATURES.filter((f) => f.planned).map((f) => [f.id, f.planned]);
    expect(planned).toEqual([]);
  });

  it("lists the shipped #2350 / #2351 features as built, each with a home", () => {
    const shipped = ["themeByDate", "resumeLineInspector", "documentElements", "letterToneStyles", "kitSceneDrillIn"];
    for (const id of shipped) {
      const feature = WORKSPACE_FEATURES.find((f) => f.id === id);
      expect(feature, id).toBeDefined();
      expect(feature?.planned, id).toBeUndefined();
      expect(feature?.homes.length, id).toBeGreaterThan(0);
    }
  });

  it("every rail tool and ⋯ row is the home of a feature (no orphan chrome)", () => {
    const homes = WORKSPACE_FEATURES.flatMap((f) => f.homes);
    for (const tool of RAIL_TOOLS) expect(homes.some((h) => h.region === "rail" && h.id === tool.id), tool.id).toBe(true);
    for (const item of MORE_ITEMS) expect(homes.some((h) => h.region === "more" && h.id === item.id), item.id).toBe(true);
  });
});

describe("Advanced only appends", () => {
  it("keeps every Simple rail tool in place and adds the rest after them", () => {
    const simple = railToolsFor("simple").map((tool) => tool.id);
    const advanced = railToolsFor("advanced").map((tool) => tool.id);
    expect(advanced.slice(0, simple.length)).toEqual(simple);
    expect(advanced).toEqual(["chat", "design", "sections", "media", "scenes", "elements", "layers"]);
  });

  it("keeps every Simple ⋯ row in place and adds Embed, Editing / Reviewing, Invite at the end", () => {
    const simple = moreItemsFor("simple").map((item) => item.id);
    const advanced = moreItemsFor("advanced").map((item) => item.id);
    expect(advanced.slice(0, simple.length)).toEqual(simple);
    expect(advanced.slice(simple.length)).toEqual(["embed", "reviewing", "invite"]);
  });
});

// ── Every registered panel mounts content ─────────────────────────────────
const noop = () => {};
const CONTENT = ResumeContentSchema.parse({
  basics: { name: "Ada Lovelace", label: "Engineer" },
  work: [{ name: "Analytical Engines", position: "Lead", startDate: "2020-01", highlights: ["Shipped the first program"] }],
  skills: [{ name: "Mathematics" }],
});
const SCENE = { ...emptyScene("Hook"), widgets: [defaultWidget("text")] };

/** The panel each rail tool shows on a kit (the real component useKitTools
 *  renders there, with minimal props). A `Record`, so a new rail tool in the
 *  registry is a compile error here until it names what it mounts. */
const RAIL_MOUNTS: Record<RailToolId, () => ReactElement> = {
  chat: () =>
    h(
      "ul",
      null,
      h(ChatActionChips, {
        context: { surface: "kit", stage: "create", page: "resume", can: { generate: false } },
        handlers: { tool: noop, prompt: noop, generate: noop },
      }),
    ),
  design: () => h(StructurePicker, { value: null, recommended: "chronological", onChange: noop }),
  sections: () => h(SectionsPanel, { content: CONTENT, onEdit: noop }),
  media: () => h(MediaPanel, { content: CONTENT, music: MUSIC_TRACKS[0]?.id ?? "", onChange: noop, onMusicChange: noop }),
  scenes: () =>
    h(StoryPanel, { plan: readVideoPlan(CONTENT), themeId: null, onToggle: noop, onOpenScene: noop, onEditSource: noop }),
  elements: () =>
    h(WidgetPalette, {
      section: "widgets",
      mediaKind: "video",
      activeSceneId: SCENE.id,
      onInsert: noop,
      onInsertLinkedContent: noop,
      onCaptureScreenshot: noop,
      onAddImageWidget: noop,
      onAddVideoWidget: noop,
    }),
  layers: () => h(LayersPanel, { scene: SCENE, selectedWidgetId: null, onSelectWidget: noop, onReorderLayers: noop }),
};

const realMatchMedia = window.matchMedia;

describe("every registered workspace panel mounts content", () => {
  beforeEach(() => {
    // A wide screen: the rail's panel column and the slide-out slot.
    window.matchMedia = ((query: string) => ({
      matches: query === WORKSPACE_WIDE_QUERY,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it.each(RAIL_TOOLS.map((tool) => [tool.id, tool] as const))("rail tool %s has a translated label", (_id, tool) => {
    expect(i18n.exists(tool.labelKey), tool.labelKey).toBe(true);
  });

  it.each(MORE_ITEMS.map((item) => [item.id, item] as const))("⋯ row %s has a translated label", (_id, item) => {
    expect(i18n.exists(item.labelKey), item.labelKey).toBe(true);
  });

  it.each(RAIL_TOOLS.map((tool) => [tool.id, tool] as const))("rail tool %s mounts its panel under its heading", (id, tool) => {
    const mount: (() => ReactElement) | undefined = RAIL_MOUNTS[id];
    expect(mount, `no mount for rail tool "${id}"`).toBeTypeOf("function");
    const label = i18n.t(tool.labelKey);
    // Only this tool has content, so the rail opens it.
    const tools: WorkspaceTool[] = railToolsFor("advanced").map((def) => ({
      id: def.id,
      label: i18n.t(def.labelKey),
      icon: def.icon,
      content: def.id === id ? mount() : null,
    }));
    const { container } = renderWithAppProviders(
      h(WorkspaceLeftPanel, { tools, active: id, onChange: noop, sheetOpen: false, onSheetOpenChange: noop, idPrefix: "p" }),
    );
    const rail = container.querySelector('[data-region="rail"]') as HTMLElement;
    expect(within(rail).getAllByText(label).length).toBeGreaterThan(0);
    const panel = document.getElementById(iconTabPanelId("p", id)) as HTMLElement;
    expect(panel, `rail tool "${id}" has no panel`).not.toBeNull();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent?.trim().length ?? 0, `rail tool "${id}" rendered an empty panel`).toBeGreaterThan(0);
  });

  it.each(SLOT_PANEL_IDS.map((id) => [id] as const))("slot panel %s mounts its content under its title", (id: SlotPanelId) => {
    // The slot's bodies are surface pages (a scene's inspector, Post, a tool
    // page); the frame must show whichever one is active, titled, at its width.
    const slot: RightSlotState = {
      active: id,
      widthPx: SLOT_WIDTH_PX[id],
      close: noop,
      reopenTarget: null,
      reopen: noop,
      openInspector: noop,
    };
    const panels = Object.fromEntries(
      SLOT_PANEL_IDS.map((pid) => [pid, { title: `${pid} title`, content: h("p", null, `${pid} body`) }]),
    );
    renderWithAppProviders(h(RightSlot, { slot, panels }));
    expect(screen.getAllByText(`${id} title`).length).toBeGreaterThan(0);
    expect(screen.getByText(`${id} body`).closest("[hidden]")).toBeNull();
    expect(SLOT_WIDTH_PX[id]).toBeGreaterThan(0);
  });
});
