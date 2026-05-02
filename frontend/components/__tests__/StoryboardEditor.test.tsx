/**
 * Studio storyboard regression tests.
 *
 * Covers the two UX gaps the audit flagged in the storyboard view:
 *   1. Scene cards had no way to collapse — every scene's element gallery
 *      was always rendered, which made any 5-plus-scene project a wall of
 *      controls. The header chevron toggle hides the body but keeps the
 *      header (type / duration / reorder) visible.
 *   2. The render-affecting global settings (aspect, resolution, motion,
 *      background, music) live in collapsible sidebar accordions and
 *      were invisible from the storyboard. The summary header pins the
 *      current values above the scene grid so the user can confirm what
 *      will actually render.
 *
 * Run: vitest run components/__tests__/StoryboardEditor.test.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoryboardEditor from "@/components/StoryboardEditor";
import type { VideoScript } from "@/types/video-script";

function makeScript(overrides: Partial<VideoScript["video"]> = {}): VideoScript {
  return {
    video: {
      duration: 12,
      fps: 30,
      resolution: "1080p",
      aspect: "9:16",
      theme: {
        colorPalette: ["#7c3aed", "#2563eb"],
        fontFamily: "Inter",
        motion: "cinematic",
        transition: "fade",
        background: "gradient",
      },
      audio: { track: "uplifting", label: "Uplifting Pop", volume: 0.6 },
      ...overrides,
    },
    scenes: [
      {
        id: "s1",
        start: 0,
        duration: 6,
        type: "intro",
        sceneElements: [
          {
            id: "el-title",
            kind: "text",
            text: "Hello world",
            box: { x: 5, y: 38, w: 90, h: 24 },
            fontSize: 36,
            fontWeight: "bold",
            color: "#ffffff",
            align: "center",
            verticalAlign: "middle",
            z: 0,
          },
        ],
      },
      { id: "s2", start: 6, duration: 6, type: "achievement" },
    ],
  };
}

describe("GlobalSettingsHeader", () => {
  it("surfaces aspect, resolution, motion, background, and music as chips", () => {
    render(<StoryboardEditor script={makeScript()} onScriptChange={vi.fn()} />);
    const banner = screen.getByText(/applies to all scenes/i).parentElement!;
    expect(within(banner).getByText("9:16")).toBeInTheDocument();
    expect(within(banner).getByText("1080p")).toBeInTheDocument();
    expect(within(banner).getByText("cinematic")).toBeInTheDocument();
    expect(within(banner).getByText("gradient")).toBeInTheDocument();
    expect(within(banner).getByText("Uplifting Pop")).toBeInTheDocument();
  });

  it("falls back to 'None' when no audio is configured", () => {
    render(<StoryboardEditor script={makeScript({ audio: undefined })} onScriptChange={vi.fn()} />);
    const banner = screen.getByText(/applies to all scenes/i).parentElement!;
    expect(within(banner).getByText("None")).toBeInTheDocument();
  });

  it("labels a custom uploaded background as 'custom' rather than the preset", () => {
    render(
      <StoryboardEditor
        script={makeScript({
          theme: {
            colorPalette: ["#000"],
            fontFamily: "Inter",
            motion: "moderate",
            transition: "cut",
            background: "gradient",
            customBackground: "https://cdn/bg.jpg",
          },
        })}
        onScriptChange={vi.fn()}
      />,
    );
    const banner = screen.getByText(/applies to all scenes/i).parentElement!;
    expect(within(banner).getByText("custom")).toBeInTheDocument();
  });
});

describe("SceneCard collapse", () => {
  it("renders the body (AI Image / element gallery) by default", () => {
    render(<StoryboardEditor script={makeScript()} onScriptChange={vi.fn()} />);
    // The "AI Image" button only exists inside the expanded scene body.
    expect(screen.getAllByRole("button", { name: /AI Image/i }).length).toBeGreaterThan(0);
  });

  it("hides the body when the user clicks the collapse chevron", async () => {
    const user = userEvent.setup();
    render(<StoryboardEditor script={makeScript()} onScriptChange={vi.fn()} />);
    const toggles = screen.getAllByRole("button", { name: /collapse scene/i });
    expect(toggles.length).toBeGreaterThan(0);

    const beforeCount = screen.getAllByRole("button", { name: /AI Image/i }).length;
    await user.click(toggles[0]);
    const afterCount = screen.queryAllByRole("button", { name: /AI Image/i }).length;
    expect(afterCount).toBe(beforeCount - 1);
  });

  it("shows an element-count summary when collapsed if the scene has elements", async () => {
    const user = userEvent.setup();
    render(<StoryboardEditor script={makeScript()} onScriptChange={vi.fn()} />);
    const toggles = screen.getAllByRole("button", { name: /collapse scene/i });
    await user.click(toggles[0]);
    // First scene has one text element → summary reads "1 element".
    expect(screen.getByText("1 element")).toBeInTheDocument();
  });

  it("does not change the script when toggled (collapse is local UI only)", async () => {
    const user = userEvent.setup();
    const onScriptChange = vi.fn();
    render(<StoryboardEditor script={makeScript()} onScriptChange={onScriptChange} />);
    const toggles = screen.getAllByRole("button", { name: /collapse scene/i });
    await user.click(toggles[0]);
    expect(onScriptChange).not.toHaveBeenCalled();
  });
});
