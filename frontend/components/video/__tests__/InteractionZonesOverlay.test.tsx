/**
 * InteractionZonesOverlay (#2312) — the one playback overlay, fed by the
 * plugin-declared interactions. A CTA click fires the existing cta-click
 * tracker with the UTM-baked URL; an engagement zone still works for the
 * public audience (one public read, never the owner listings).
 *
 * Run: vitest run components/video/__tests__/InteractionZonesOverlay.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ apiReady: true }));
vi.mock("@/lib/auth", () => ({
  useApiReady: () => h.apiReady,
  useAuth: () => ({ isLoading: false }),
}));

const svc = vi.hoisted(() => ({
  listVideoForms: vi.fn(),
  getChapters: vi.fn(),
  listThumbnails: vi.fn(),
  getProjectComments: vi.fn(),
  getPublicEngagementAssets: vi.fn(),
  recordProjectCtaClick: vi.fn(),
  submitVideoForm: vi.fn(),
}));
vi.mock("@/lib/services/studio-features-service", () => svc);

import {
  defaultWidget,
  emptyCanvasState,
  makeEngagementAssetWidget,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { EngagementAudienceProvider } from "@/lib/studio/engagement/engagement-audience";
import InteractionZonesOverlay from "../InteractionZonesOverlay";

const PROJECT_ID = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const JOB_URL = "https://hired.video/jobs/senior-product-designer-remote";
const BAKED_URL = `${JOB_URL}?utm_source=linkedin&utm_medium=video&utm_campaign=fall-launch-2026`;
const CHAPTER = {
  id: "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55",
  projectId: PROJECT_ID,
  title: "Results",
  startSeconds: 42.5,
  thumbnailUrl: null,
  orderIndex: 2,
};

/** One 5 s scene: a linked CTA and a chapter marker, both on screen. */
function state(): CanvasState {
  const s = emptyCanvasState({ width: 1080, height: 1920, fps: 30 });
  const cta = defaultWidget("cta");
  if (cta.params.kind === "cta") cta.params.data.ctaUrl = JOB_URL;
  s.scenes[0].widgets = [cta, makeEngagementAssetWidget({ assetKind: "chapter-marker", assetId: CHAPTER.id })];
  return s;
}

function playback() {
  return { playhead: 1, isPlaying: true, play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
}

function wrap(node: ReactNode, audience?: "public") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = <QueryClientProvider client={client}>{node}</QueryClientProvider>;
  return audience ? <EngagementAudienceProvider value={audience}>{tree}</EngagementAudienceProvider> : tree;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.apiReady = true;
  svc.getChapters.mockResolvedValue([CHAPTER]);
  svc.getPublicEngagementAssets.mockResolvedValue({ forms: [], chapters: [CHAPTER], thumbnails: [] });
  svc.recordProjectCtaClick.mockResolvedValue(undefined);
});

describe("InteractionZonesOverlay", () => {
  it("a CTA click fires the cta-click tracker with the public payload's UTM-baked URL and pauses", () => {
    const pb = playback();
    const baked = [{ startSec: 0, endSec: 5, x: 0.1, y: 0.1, w: 0.4, h: 0.15, url: BAKED_URL }];
    render(
      wrap(
        <InteractionZonesOverlay state={state()} playback={pb} ctaHotzones={baked} analyticsProjectId={PROJECT_ID} />,
        "public",
      ),
    );
    const link = screen.getByRole("link", { name: "Open call-to-action link" });
    expect(link.getAttribute("href")).toBe(BAKED_URL);
    fireEvent.click(link);
    expect(pb.pause).toHaveBeenCalled();
    expect(svc.recordProjectCtaClick).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ targetUrl: BAKED_URL }));
  });

  it("derives the CTA from the canvas when there is no public payload, and never tracks an editor preview", () => {
    render(wrap(<InteractionZonesOverlay state={state()} playback={playback()} />));
    const link = screen.getByRole("link", { name: "Open call-to-action link" });
    expect(link.getAttribute("href")).toBe(JOB_URL);
    fireEvent.click(link);
    expect(svc.recordProjectCtaClick).not.toHaveBeenCalled();
  });

  it("keeps engagement zones working for the public audience (public read only)", async () => {
    const pb = playback();
    render(wrap(<InteractionZonesOverlay state={state()} playback={pb} projectId={PROJECT_ID} />, "public"));
    const jump = await screen.findByRole("button", { name: /Results/ });
    fireEvent.click(jump);
    expect(pb.seek).toHaveBeenCalledWith(CHAPTER.startSeconds);
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledWith(PROJECT_ID);
    expect(svc.getChapters).not.toHaveBeenCalled();
    expect(svc.getProjectComments).not.toHaveBeenCalled();
  });

  it("works for a signed-out viewer too, and renders nothing outside every window", async () => {
    h.apiReady = false;
    const { container, rerender } = render(
      wrap(<InteractionZonesOverlay state={state()} playback={playback()} projectId={PROJECT_ID} />),
    );
    await screen.findByRole("button", { name: /Results/ });
    expect(svc.getChapters).not.toHaveBeenCalled();
    rerender(
      wrap(<InteractionZonesOverlay state={state()} playback={{ ...playback(), playhead: 6 }} projectId={PROJECT_ID} />),
    );
    await waitFor(() => expect(container.querySelector("a,button")).toBeNull());
  });
});
