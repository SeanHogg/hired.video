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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import StoryboardEditor from "@/components/StoryboardEditor";
import type { VideoScript } from "@/types/video-script";

// studio-service mocks for the closure-stale image-add regression test below.
// uploadSceneImage's promise is held by `uploadResolve` so the test can
// inspect intermediate state (optimistic blob URL) before resolving with the
// final CDN URL — this is the exact race the bug fix targets.
let uploadResolve: ((url: string) => void) | null = null;
vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    uploadSceneImage: vi.fn(() =>
      new Promise<{ data: { url: string } }>((resolve) => {
        uploadResolve = (url: string) => resolve({ data: { url } });
      }),
    ),
    uploadSceneAudio: vi.fn(),
    generateImage: vi.fn(),
  },
}));

beforeEach(() => {
  uploadResolve = null;
});

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
  it("surfaces aspect, resolution, motion, transition, font, background, and music as chips", () => {
    render(<StoryboardEditor script={makeScript()} onScriptChange={vi.fn()} />);
    const banner = screen.getByText(/applies to all scenes/i).parentElement!;
    expect(within(banner).getByText("9:16")).toBeInTheDocument();
    expect(within(banner).getByText("1080p")).toBeInTheDocument();
    expect(within(banner).getByText("cinematic")).toBeInTheDocument();
    expect(within(banner).getByText("fade")).toBeInTheDocument();
    expect(within(banner).getByText("Inter")).toBeInTheDocument();
    expect(within(banner).getByText("gradient")).toBeInTheDocument();
    expect(within(banner).getByText("Uplifting Pop")).toBeInTheDocument();
  });

  it("trims a multi-family CSS font fallback chain to the first family", () => {
    render(
      <StoryboardEditor
        script={makeScript({
          theme: {
            colorPalette: ["#000"],
            fontFamily: "Poppins, Inter, sans-serif",
            motion: "moderate",
            transition: "cut",
            background: "solid",
          },
        })}
        onScriptChange={vi.fn()}
      />,
    );
    const banner = screen.getByText(/applies to all scenes/i).parentElement!;
    expect(within(banner).getByText("Poppins")).toBeInTheDocument();
    expect(within(banner).getByText("cut")).toBeInTheDocument();
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

describe("SceneCard image-add (closure-stale regression)", () => {
  // Wrap StoryboardEditor in a controlled host so onScriptChange actually
  // updates the script prop — that's what causes the SceneCard to re-render
  // with a fresh `scene` and was the precondition for the bug.
  function ControlledHost({ initial }: { initial: VideoScript }) {
    const [script, setScript] = useState(initial);
    return (
      <StoryboardEditor
        script={script}
        onScriptChange={setScript}
      />
    );
  }

  it("preserves the optimistically-added image when the upload promise resolves later", async () => {
    const user = userEvent.setup();
    // jsdom doesn't ship URL.createObjectURL — stub directly via assignment.
    const createSpy = vi.fn((_blob: Blob) => "blob:mock");
    (URL as unknown as { createObjectURL: typeof createSpy }).createObjectURL = createSpy;
    (URL as unknown as { revokeObjectURL: (_: string) => void }).revokeObjectURL = () => {};

    // Single scene with NO existing elements so the new image is the only one.
    const script: VideoScript = {
      video: {
        duration: 6,
        fps: 30,
        resolution: "1080p",
        aspect: "16:9",
        theme: {
          colorPalette: ["#7c3aed"],
          fontFamily: "Inter",
          motion: "moderate",
          transition: "fade",
          background: "gradient",
        },
      },
      scenes: [{ id: "s1", start: 0, duration: 6, type: "intro", sceneElements: [] }],
    };

    const { container } = render(<ControlledHost initial={script} />);

    // The hidden file input — there's no role for it, so reach into the DOM.
    const fileInput = container.querySelector('input[type="file"][accept^="image/"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(["x"], "stock.png", { type: "image/png" });
    await user.upload(fileInput, file);

    // Optimistic blob-URL element pushed; not yet replaced by the final CDN URL.
    expect(createSpy).toHaveBeenCalled();
    expect(uploadResolve).toBeTruthy();

    // Resolve the upload — this is the moment the closure-stale bug fired
    // and clobbered the optimistic addition. With the sceneRef fix the
    // element should still be there afterwards, with its URL swapped to
    // the persistent CDN URL.
    uploadResolve!("https://cdn/stock.png");

    // Wait a microtask for the .then chain to run + React to re-render.
    await new Promise((r) => setTimeout(r, 0));

    // The scene gallery row should still show one image element (not zero).
    // SceneElementsGallery renders an "image" chip for image kinds — pull
    // any image element by its data attribute or alt text. The simplest
    // structural check: the optimistic blob URL is gone, the CDN URL is
    // attached to an <img> somewhere, OR the element count chip reads "1".
    const imgs = container.querySelectorAll("img");
    const cdnImg = Array.from(imgs).find((i) => i.getAttribute("src") === "https://cdn/stock.png");
    expect(cdnImg).toBeTruthy();
  });
});

describe("SceneCard click-to-toggle selection", () => {
  it("focuses an unfocused scene when its card is clicked", async () => {
    const user = userEvent.setup();
    const onSceneFocus = vi.fn();
    render(
      <StoryboardEditor
        script={makeScript()}
        onScriptChange={vi.fn()}
        focusedSceneId={undefined}
        onSceneFocus={onSceneFocus}
      />,
    );
    const cards = screen.getAllByRole("button", { name: "Select scene" });
    await user.click(cards[0]);
    expect(onSceneFocus).toHaveBeenCalledWith("s1");
  });

  it("clears focus (passes null) when the already-focused scene is clicked again", async () => {
    const user = userEvent.setup();
    const onSceneFocus = vi.fn();
    render(
      <StoryboardEditor
        script={makeScript()}
        onScriptChange={vi.fn()}
        focusedSceneId="s1"
        onSceneFocus={onSceneFocus}
      />,
    );
    const focusedCard = screen.getByRole("button", { name: "Deselect scene" });
    await user.click(focusedCard);
    expect(onSceneFocus).toHaveBeenCalledWith(null);
  });
});
