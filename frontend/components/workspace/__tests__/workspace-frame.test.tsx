/**
 * No layout shift: the workspace frame renders the SAME regions with the
 * SAME sizes in Simple and Advanced, the header's controls keep their order,
 * and Advanced only appends rail tools after the Simple ones. A kit never
 * shows the header's Post (it posts from its stepper).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/__tests__/test-render";
import WorkspaceFrame from "../WorkspaceFrame";
import WorkspaceHeader from "../WorkspaceHeader";
import WorkspaceLeftPanel, { type WorkspaceTool } from "../WorkspaceLeftPanel";
import WorkspaceStrip from "../WorkspaceStrip";
import RightSlot from "../RightSlot";
import { railToolsFor, RAIL_WIDTH_PX, STRIP_HEIGHT_PX, type WorkspaceSurface } from "@/lib/workspace/workspace-panels";
import type { WorkspaceDepth } from "@/lib/workspace/workspace-depth";
import type { RightSlotState } from "@/lib/workspace/use-right-slot";

// The app's verification notice reads auth; layout is what's under test.
vi.mock("@/components/auth/EmailVerificationBanner", () => ({ EmailVerificationBanner: () => null }));

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  // A wide (lg+) screen: rail beside the canvas, slide-out slot.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const closedSlot: RightSlotState = {
  active: null,
  widthPx: 0,
  close: () => {},
  reopenTarget: null,
  reopen: () => {},
  openInspector: () => {},
};

function Frame({ depth, surface = "kit" }: { depth: WorkspaceDepth; surface?: WorkspaceSurface }) {
  const tools: WorkspaceTool[] = railToolsFor(depth).map((def) => ({
    id: def.id,
    label: def.id,
    icon: def.icon,
    content: <p>{def.id} panel</p>,
  }));
  return (
    <WorkspaceFrame
      label="workspace"
      header={
        <WorkspaceHeader
          surface={surface}
          backHref="/studio"
          title={<span>Title</span>}
          saveStatus={<span>Saved</span>}
          history={{ undo: () => {}, redo: () => {}, canUndo: true, canRedo: false }}
          preview={{ label: "Preview", onClick: () => {} }}
          depth={{ depth, advanced: depth === "advanced", setDepth: () => {}, raise: () => {} }}
          moreActions={{ details: { onSelect: () => {} } }}
          post={{ label: "Post", onClick: () => {} }}
        />
      }
      rail={<WorkspaceLeftPanel tools={tools} active="chat" onChange={() => {}} sheetOpen={false} onSheetOpenChange={() => {}} idPrefix="t" />}
      canvas={<div>canvas</div>}
      strip={
        <WorkspaceStrip label="Timeline" ariaLabel="Timeline" expandable={depth === "advanced"}>
          rows
        </WorkspaceStrip>
      }
      slot={<RightSlot slot={closedSlot} panels={{}} />}
      slotWidthPx={0}
    />
  );
}

function regions(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-region]")).map((el) => el.getAttribute("data-region") ?? "");
}

function headerButtons(): string[] {
  const header = document.querySelector('[data-region="header"]') as HTMLElement;
  return within(header)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
}

describe("workspace frame — Simple and Advanced are the same frame", () => {
  it("renders the same regions, in the same order, at the same sizes", () => {
    const simple = renderWithProviders(<Frame depth="simple" />);
    const simpleRegions = regions(simple.container);
    const simpleRail = (simple.container.querySelector('[data-region="rail"]') as HTMLElement).style.width;
    const simpleStrip = (simple.container.querySelector('[data-region="strip"]') as HTMLElement).style.height;
    simple.unmount();

    const advanced = renderWithProviders(<Frame depth="advanced" />);
    expect(regions(advanced.container)).toEqual(simpleRegions);
    expect(simpleRegions).toEqual(expect.arrayContaining(["header", "rail", "canvas", "strip"]));
    expect(simpleRail).toBe(`${RAIL_WIDTH_PX}px`);
    expect((advanced.container.querySelector('[data-region="rail"]') as HTMLElement).style.width).toBe(simpleRail);
    expect(simpleStrip).toBe(`${STRIP_HEIGHT_PX}px`);
    expect((advanced.container.querySelector('[data-region="strip"]') as HTMLElement).style.height).toBe(simpleStrip);
  });

  it("keeps the header's buttons in the same order", () => {
    const simple = renderWithProviders(<Frame depth="simple" surface="studio" />);
    const before = headerButtons();
    simple.unmount();
    renderWithProviders(<Frame depth="advanced" surface="studio" />);
    expect(headerButtons()).toEqual(before);
  });

  it("appends Advanced's rail tools after the Simple ones", () => {
    const simple = renderWithProviders(<Frame depth="simple" />);
    const simpleTabs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"));
    simple.unmount();
    renderWithProviders(<Frame depth="advanced" />);
    const advancedTabs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"));
    expect(advancedTabs.slice(0, simpleTabs.length)).toEqual(simpleTabs);
    expect(advancedTabs.length).toBeGreaterThan(simpleTabs.length);
  });

  it("never shows the header's Post on a kit (it posts from the stepper)", () => {
    renderWithProviders(<Frame depth="simple" surface="kit" />);
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
  });

  it("shows Post in the header for a studio format", () => {
    renderWithProviders(<Frame depth="simple" surface="studio" />);
    expect(screen.getByRole("button", { name: "Post" })).toBeTruthy();
  });
});
