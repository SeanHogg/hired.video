/**
 * Tests for the canvas-runtime dispatch seam (#931). The router is
 * tiny by design — every per-kind decision lives in the host (which
 * supplies the surface node) and the router just picks. These tests
 * pin the picking rules so a future runtime can plug in without
 * accidentally regressing the existing kinds.
 *
 * Run: vitest run components/studio/v2/__tests__/CanvasRouter.test.tsx
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CanvasRouter from "../CanvasRouter";

describe("CanvasRouter — per-mediaKind dispatch", () => {
  const surfaces = {
    timeline: <div data-testid="surface-timeline">timeline</div>,
    game: <div data-testid="surface-game">game</div>,
    image: <div data-testid="surface-image">image</div>,
  };

  it("mounts the timeline surface for video kind", () => {
    render(<CanvasRouter mediaKind="video" surfaces={surfaces} />);
    expect(screen.getByTestId("surface-timeline")).toBeTruthy();
    expect(screen.queryByTestId("surface-game")).toBeNull();
    expect(screen.queryByTestId("surface-image")).toBeNull();
  });

  it.each(["video", "podcast", "voice", "animation", "comic"] as const)(
    "mounts the timeline surface for %s kind",
    (kind) => {
      render(<CanvasRouter mediaKind={kind} surfaces={surfaces} />);
      expect(screen.getByTestId("surface-timeline")).toBeTruthy();
    },
  );

  it("mounts the game surface for game kind", () => {
    render(<CanvasRouter mediaKind="game" surfaces={surfaces} />);
    expect(screen.getByTestId("surface-game")).toBeTruthy();
    expect(screen.queryByTestId("surface-timeline")).toBeNull();
  });

  it("mounts the image surface for image kind", () => {
    render(<CanvasRouter mediaKind="image" surfaces={surfaces} />);
    expect(screen.getByTestId("surface-image")).toBeTruthy();
    expect(screen.queryByTestId("surface-timeline")).toBeNull();
  });

  it("falls back to timeline when a per-kind override is omitted", () => {
    // Host didn't supply a game surface — router should mount timeline.
    render(
      <CanvasRouter
        mediaKind="game"
        surfaces={{ timeline: <div data-testid="surface-timeline">timeline</div> }}
      />,
    );
    expect(screen.getByTestId("surface-timeline")).toBeTruthy();
  });
});
