/**
 * Engagement tab: visible scene boundaries + Chapter toolset seed.
 *
 * Run: vitest run components/engagement/__tests__/EngagementTab.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EngagementTab from "../EngagementTab";

const getProject = vi.fn();

vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    getProject: (...args: unknown[]) => getProject(...args),
  },
}));

vi.mock("@/components/studio/shared/EngagementToolset", () => ({
  default: (props: {
    sceneBoundaries?: Array<{ title: string; start: number }>;
    durationSec?: number;
    videoUrl?: string | null;
  }) => (
    <div data-testid="engagement-toolset">
      {JSON.stringify({
        sceneBoundaries: props.sceneBoundaries,
        durationSec: props.durationSec,
        videoUrl: props.videoUrl,
      })}
    </div>
  ),
}));

vi.mock("@/components/studio/shared/EngagementResultsPanel", () => ({
  default: () => <div data-testid="engagement-results" />,
}));

function bgClip(opts: {
  id: string;
  startFrame: number;
  durationFrames: number;
  label: string;
}) {
  return {
    id: opts.id,
    sourceId: "",
    startFrame: opts.startFrame,
    durationFrames: opts.durationFrames,
    sourceInFrame: 0,
    effects: [
      {
        kind: "canvas-v2:background",
        params: { label: opts.label, sceneId: opts.id, color: "#0f172a" },
      },
    ],
  };
}

const timelineSpec = {
  fps: 30,
  tracks: [
    {
      id: "v1",
      kind: "video",
      clips: [
        bgClip({ id: "s1", startFrame: 0, durationFrames: 90, label: "Hook" }),
        bgClip({ id: "s2", startFrame: 90, durationFrames: 150, label: "Proof" }),
      ],
    },
  ],
};

describe("EngagementTab", () => {
  beforeEach(() => {
    getProject.mockReset();
  });

  it("renders scene boundaries from timelineSpec and seeds the toolset", async () => {
    render(
      <EngagementTab
        project={{
          id: "proj-1",
          videoUrl: "https://cdn.example/v.mp4",
          timelineSpec,
        }}
      />,
    );

    expect(await screen.findAllByText("Hook")).not.toHaveLength(0);
    expect(screen.getAllByText("Proof").length).toBeGreaterThan(0);
    const toolset = await screen.findByTestId("engagement-toolset");
    const payload = JSON.parse(toolset.textContent ?? "{}") as {
      sceneBoundaries: Array<{ title: string; start: number }>;
      durationSec: number;
      videoUrl: string;
    };
    expect(payload.sceneBoundaries).toEqual([
      { title: "Hook", start: 0 },
      { title: "Proof", start: 3 },
    ]);
    expect(payload.durationSec).toBe(8);
    expect(payload.videoUrl).toBe("https://cdn.example/v.mp4");
    expect(getProject).not.toHaveBeenCalled();
    expect(screen.getByTestId("engagement-results")).toBeInTheDocument();
  });

  it("lazy-loads getProject when the list DTO has no seed source", async () => {
    getProject.mockResolvedValue({
      data: {
        id: "proj-2",
        videoUrl: null,
        script: {
          scenes: [
            { title: "Intro", duration: 5 },
            { title: "Close", duration: 4 },
          ],
        },
      },
    });

    render(<EngagementTab project={{ id: "proj-2" }} />);

    expect(screen.getByTestId("scene-boundary-loading")).toBeInTheDocument();
    expect(await screen.findAllByText("Intro")).not.toHaveLength(0);
    expect(screen.getAllByText("Close").length).toBeGreaterThan(0);
    expect(getProject).toHaveBeenCalledWith("proj-2");
    const toolset = await screen.findByTestId("engagement-toolset");
    const payload = JSON.parse(toolset.textContent ?? "{}") as {
      sceneBoundaries: Array<{ title: string; start: number }>;
      durationSec: number;
    };
    expect(payload.sceneBoundaries.map((b) => b.title)).toEqual([
      "Intro",
      "Close",
    ]);
    expect(payload.durationSec).toBe(9);
  });

  it("shows the empty track when getProject fails", async () => {
    getProject.mockRejectedValue(new Error("offline"));
    render(<EngagementTab project={{ id: "proj-3" }} />);
    expect(await screen.findByTestId("scene-boundary-track")).toHaveTextContent(
      /no scene boundaries/i,
    );
  });
});
