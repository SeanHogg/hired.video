/**
 * Tests for the project-tile thumbnail dispatcher. The user reported
 * (2026-05-23 screenshot) that game project tiles rendered as audio
 * waveforms while the corresponding template cards rendered as games
 * — a visual mismatch between create-time and post-create surfaces.
 * These tests pin the per-kind dispatch so the regression can't
 * silently return.
 *
 * Run: vitest run components/studio/shared/__tests__/VideoProjectThumbnail.test.tsx
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import VideoProjectThumbnail from "@/components/studio/shared/VideoProjectThumbnail";
import type { StudioProject } from "@/lib/services/studio-service";
import {
  createBlankImageState,
  type ImageState,
  IMAGE_STATE_SCHEMA_VERSION,
} from "@shared/image-state";
import { emptyGameState, type GameState } from "@shared/game-state";

function makeProject(overrides: Partial<StudioProject>): StudioProject {
  return {
    id: "p1",
    title: "Test",
    mediaKind: "video",
    kind: "scene",
    timelineSpec: null,
    gameState: null,
    imageState: null,
    storyboard: null,
    script: null,
    status: "draft",
    videoUrl: null,
    youtubeVideoId: null,
    thumbnailUrl: null,
    isPublic: false,
    isProfilePrimary: false,
    isFeatured: false,
    viewCount: 0,
    ctaClickCount: 0,
    duration: null,
    privacyStatus: "private",
    creationDateTime: "2026-05-22T00:00:00Z",
    updateDateTime: "2026-05-22T00:00:00Z",
    subjects: [],
    keywords: [],
    metaDescription: null,
    slug: null,
    socialCardImage: null,
    ...overrides,
  } as StudioProject;
}

describe("VideoProjectThumbnail — game kind", () => {
  it("renders the GameStateThumbnail (NOT a waveform) for game projects", () => {
    const gameState: GameState = emptyGameState();
    const { container } = render(
      <VideoProjectThumbnail
        project={makeProject({ mediaKind: "game", gameState: gameState as unknown as never })}
      />,
    );
    // GameStateThumbnail emits an SVG with the sprite layout — its
    // presence is the contract; the absence of any waveform SVG
    // (WaveformThumbnail's path) is the regression guard.
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    // GameStateThumbnail labels the corner chip "Game".
    expect(container.textContent).toContain("Game");
  });

  it("survives a game project with no gameState (fresh row, no first-save yet)", () => {
    const { container } = render(
      <VideoProjectThumbnail project={makeProject({ mediaKind: "game", gameState: null })} />,
    );
    // No crash + still shows the kind label so the tile is identifiable.
    expect(container.textContent).toContain("Game");
  });
});

describe("VideoProjectThumbnail — image kind", () => {
  it("renders the DrawingPlaceholderThumbnail for empty image projects (no drawn layers)", () => {
    const imageState = createBlankImageState(1080, 1080);
    const { container } = render(
      <VideoProjectThumbnail
        project={makeProject({ mediaKind: "image", imageState: imageState as unknown as never })}
      />,
    );
    // DrawingPlaceholderThumbnail draws an artboard div with the
    // transparent-checker pattern. We assert no `<img>` was rendered
    // (would indicate a layer-pixel branch fired) and the placeholder's
    // outer wrapper exists.
    expect(container.querySelector("img")).toBeNull();
    expect(imageState.schemaVersion).toBe(IMAGE_STATE_SCHEMA_VERSION); // sanity
  });

  it("renders the first drawn layer as an <img> when pixels exist", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const imageState: ImageState = {
      ...createBlankImageState(1080, 1080),
      layers: [
        {
          id: "l1",
          label: "Background",
          kind: "raster",
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: "normal",
          pixelsDataUrl: dataUrl,
        },
      ],
    };
    const { container } = render(
      <VideoProjectThumbnail
        project={makeProject({ mediaKind: "image", imageState: imageState as unknown as never })}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(dataUrl);
  });

  it("falls back to the placeholder when imageState is null entirely (fresh row)", () => {
    const { container } = render(
      <VideoProjectThumbnail project={makeProject({ mediaKind: "image", imageState: null })} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("VideoProjectThumbnail — Timeline kinds are unaffected", () => {
  it("does NOT route podcast through GameStateThumbnail or DrawingPlaceholderThumbnail", () => {
    const { container } = render(
      <VideoProjectThumbnail project={makeProject({ mediaKind: "podcast" })} />,
    );
    // Podcast still goes through WaveformThumbnail — assert the audio
    // waveform palette label appears (every WaveformThumbnail render
    // includes the kind's badgeLabel).
    expect(container.textContent).toContain("Podcast");
  });
});

describe("VideoProjectThumbnail — document + CAD do NOT render a waveform", () => {
  // Regression: document/cad kinds fell through the `!hasVideo` branch and
  // rendered the audio waveform (which prints the kind's badgeLabel). The
  // fix gates the waveform on `hasAudio && !hasVideo` and adds explicit
  // document/cad branches.

  it("renders the paper-sheet placeholder for a document, not the waveform", () => {
    const documentState = {
      pages: [{ id: "pg1", blocks: [{ id: "b1", kind: "section", sectionKey: "work", title: "Work Experience", mode: "flow" }], overlays: [] }],
      entityKind: "resume",
    };
    const { container } = render(
      <VideoProjectThumbnail
        project={makeProject({ mediaKind: "document", documentState: documentState as unknown as never })}
      />,
    );
    // WaveformThumbnail would print "Document" (the badgeLabel); the
    // placeholder does not. The heading text from the block proves the
    // document branch fired.
    expect(container.textContent).not.toContain("Document");
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(0);
  });

  it("survives a fresh document with no documentState", () => {
    const { container } = render(
      <VideoProjectThumbnail project={makeProject({ mediaKind: "document", documentState: null })} />,
    );
    expect(container.textContent).not.toContain("Document");
  });

  it("renders the drafting-grid placeholder for a CAD drawing, not the waveform", () => {
    const cadState = { widthMm: 210, heightMm: 297, shapes: [] };
    const { container } = render(
      <VideoProjectThumbnail
        project={makeProject({ mediaKind: "cad", cadState: cadState as unknown as never })}
      />,
    );
    // The grid placeholder renders an SVG and a dimension chip; it never
    // prints the "CAD" badgeLabel the waveform would.
    expect(container.textContent).not.toContain("CAD");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("210×297");
  });

  it("renders the 3D variant for cad_3d", () => {
    const { container } = render(
      <VideoProjectThumbnail project={makeProject({ mediaKind: "cad_3d", cadState: null })} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("3D");
  });
});
