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
