/**
 * Engagement widgets are interactive during playback (#1586): form submit
 * (with the requireToContinue gate), chapter jump, thumbnail click-through
 * and the review-thread popover — plus the self-gates (no project, no
 * zones) and the signed-out viewer of a public project, who reads the ONE
 * public engagement read and gets no review controls.
 *
 * Run: vitest run __tests__/components/video/EngagementZonesOverlay.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { EngagementZone } from "@/lib/studio/engagement/engagement-zones";

const h = vi.hoisted(() => ({ apiReady: true, authLoading: false }));

vi.mock("@/lib/auth", () => ({
  useApiReady: () => h.apiReady,
  useAuth: () => ({ isLoading: h.authLoading }),
}));

const PROJECT_ID = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const FORM = {
  id: "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44",
  projectId: PROJECT_ID,
  title: "Get the full case study",
  description: null,
  positionSeconds: 1,
  fields: [
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "role", label: "Your role", type: "select", required: false, options: ["Recruiter", "Hiring manager"] },
  ],
  requireToContinue: true,
  redirectUrl: null,
  submitButtonText: "Send it to me",
  isActive: true,
  formType: "lead_capture",
};
const CHAPTER = {
  id: "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55",
  projectId: PROJECT_ID,
  title: "Results",
  startSeconds: 42.5,
  thumbnailUrl: null,
  orderIndex: 2,
};
const THUMB = {
  id: "c4d5e6f7-0819-4a2b-9c3d-4e5f60718293",
  projectId: PROJECT_ID,
  imageUrl: "https://cdn.hired.video/thumbs/abc.jpg",
  storageKey: "thumbs/abc.jpg",
  sourceTimeSec: 3,
  headlineText: "Watch the demo",
  score: 0.82,
  isSelected: true,
  createdAt: "2026-10-01T12:00:00.000Z",
};
const ROOT_COMMENT = {
  id: "e1f2a3b4-c5d6-4e7f-8091-a2b3c4d5e6f7",
  projectId: PROJECT_ID,
  parentId: null,
  authorUserId: "u_1",
  authorName: "Dana Reviewer",
  authorEmail: null,
  body: "Tighten this intro.",
  timestampSec: 6,
  resolved: false,
  createdAt: "2026-10-02T09:00:00.000Z",
};

const svc = vi.hoisted(() => ({
  listVideoForms: vi.fn(),
  getChapters: vi.fn(),
  listThumbnails: vi.fn(),
  getProjectComments: vi.fn(),
  getPublicEngagementAssets: vi.fn(),
  submitVideoForm: vi.fn(),
}));
vi.mock("@/lib/services/studio-features-service", () => svc);

vi.mock("@/components/studio/ReviewCommentsDialog", () => ({
  default: ({ focusCommentId }: { focusCommentId?: string }) => (
    <div data-testid="review-dialog" data-focus={focusCommentId} />
  ),
}));

import EngagementZonesOverlay, { type EngagementPlaybackControls } from "@/components/video/EngagementZonesOverlay";
import { EngagementAudienceProvider } from "@/lib/studio/engagement/engagement-audience";

function zone(kind: EngagementZone["kind"], assetId: string, startSec: number, endSec: number): EngagementZone {
  return { key: `${kind}:${assetId}`, kind, assetId, startSec, endSec, x: 0.1, y: 0.5, w: 0.8, h: 0.3 };
}

function playbackAt(playhead: number, isPlaying = false): EngagementPlaybackControls {
  return { playhead, isPlaying, play: vi.fn(), pause: vi.fn(), seek: vi.fn() };
}

function renderOverlay(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** What GET /api/studio/projects/:id/engagement/public returns for this
 *  project — viewer-safe projections, no review comments. */
const PUBLIC_ASSETS = {
  forms: [
    {
      id: FORM.id,
      projectId: PROJECT_ID,
      title: FORM.title,
      description: null,
      positionSeconds: 1,
      fields: FORM.fields,
      requireToContinue: true,
      redirectUrl: null,
      submitButtonText: FORM.submitButtonText,
      formType: "lead_capture",
    },
  ],
  chapters: [CHAPTER],
  thumbnails: [{ id: THUMB.id, projectId: PROJECT_ID, imageUrl: THUMB.imageUrl, sourceTimeSec: 3, headlineText: THUMB.headlineText, isSelected: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.apiReady = true;
  h.authLoading = false;
  svc.getPublicEngagementAssets.mockResolvedValue(PUBLIC_ASSETS);
  svc.listVideoForms.mockResolvedValue([FORM]);
  svc.getChapters.mockResolvedValue([CHAPTER]);
  svc.listThumbnails.mockResolvedValue([THUMB]);
  svc.getProjectComments.mockResolvedValue([ROOT_COMMENT, { ...ROOT_COMMENT, id: "reply-1", parentId: ROOT_COMMENT.id }]);
  svc.submitVideoForm.mockResolvedValue({ id: "sub_1", redirectUrl: null });
});

describe("EngagementZonesOverlay", () => {
  it("jumps to the chapter's start and keeps playing on click", async () => {
    const playback = playbackAt(6);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("chapter-marker", CHAPTER.id, 5, 10)]} projectId={PROJECT_ID} playback={playback} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Jump to chapter: Results" }));
    expect(playback.seek).toHaveBeenCalledWith(42.5);
    expect(playback.play).toHaveBeenCalled();
  });

  it("gates a requireToContinue form: pauses, opens it, submits the answers and resumes", async () => {
    const playback = playbackAt(2, true);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("video-form", FORM.id, 1, 4)]} projectId={PROJECT_ID} playback={playback} />,
    );
    expect(await screen.findByText("Get the full case study")).toBeInTheDocument();
    expect(playback.pause).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "sam@acme.com" } });
    fireEvent.change(screen.getByLabelText(/Your role/), { target: { value: "Recruiter" } });
    fireEvent.click(screen.getByRole("button", { name: "Send it to me" }));

    await waitFor(() =>
      expect(svc.submitVideoForm).toHaveBeenCalledWith(FORM.id, {
        answers: { email: "sam@acme.com", role: "Recruiter" },
        timestampSec: 2,
      }),
    );
    await waitFor(() => expect(playback.play).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Get the full case study")).not.toBeInTheDocument());
  });

  it("keeps the form open with an error when the submission is rejected", async () => {
    svc.submitVideoForm.mockRejectedValueOnce(new Error("Required field missing: email"));
    const playback = playbackAt(2);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("video-form", FORM.id, 1, 4)]} projectId={PROJECT_ID} playback={playback} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open form: Get the full case study" }));
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "sam@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send it to me" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(playback.play).not.toHaveBeenCalled();
  });

  it("links a thumbnail stamp to the parent video", async () => {
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("thumbnail-stamp", THUMB.id, 0, 3)]} projectId={PROJECT_ID} playback={playbackAt(1)} />,
    );
    const link = await screen.findByRole("link", { name: /Watch video/ });
    expect(link).toHaveAttribute("href", `/v/${PROJECT_ID}`);
  });

  it("opens the review thread with its root selected", async () => {
    const playback = playbackAt(6);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("review-pin", ROOT_COMMENT.id, 5, 8)]} projectId={PROJECT_ID} playback={playback} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open review thread from Dana Reviewer" }));
    expect(playback.pause).toHaveBeenCalled();
    expect(await screen.findByTestId("review-dialog")).toHaveAttribute("data-focus", ROOT_COMMENT.id);
  });

  it("renders nothing outside a zone window or without a project", async () => {
    const zones = [zone("chapter-marker", CHAPTER.id, 5, 10)];
    const { unmount } = renderOverlay(
      <EngagementZonesOverlay zones={zones} projectId={PROJECT_ID} playback={playbackAt(12)} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    renderOverlay(<EngagementZonesOverlay zones={zones} projectId={null} playback={playbackAt(6)} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(svc.getChapters).not.toHaveBeenCalled();
    expect(svc.getPublicEngagementAssets).not.toHaveBeenCalled();
  });

  it("waits for auth to bootstrap before fetching anything", () => {
    h.apiReady = false;
    h.authLoading = true;
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("chapter-marker", CHAPTER.id, 5, 10)]} projectId={PROJECT_ID} playback={playbackAt(6)} />,
    );
    expect(svc.getChapters).not.toHaveBeenCalled();
    expect(svc.getPublicEngagementAssets).not.toHaveBeenCalled();
  });
});

describe("EngagementZonesOverlay — signed-out viewer of a public project", () => {
  beforeEach(() => {
    h.apiReady = false;
  });

  it("jumps to a chapter from the public read, never calling the owner listings", async () => {
    const playback = playbackAt(6);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("chapter-marker", CHAPTER.id, 5, 10)]} projectId={PROJECT_ID} playback={playback} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Jump to chapter: Results" }));
    expect(playback.seek).toHaveBeenCalledWith(42.5);
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledWith(PROJECT_ID);
    expect(svc.getChapters).not.toHaveBeenCalled();
  });

  it("gates and submits a required form anonymously", async () => {
    const playback = playbackAt(2, true);
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("video-form", FORM.id, 1, 4)]} projectId={PROJECT_ID} playback={playback} />,
    );
    expect(await screen.findByText("Get the full case study")).toBeInTheDocument();
    expect(playback.pause).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Work email/), { target: { value: "sam@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send it to me" }));
    await waitFor(() =>
      expect(svc.submitVideoForm).toHaveBeenCalledWith(FORM.id, { answers: { email: "sam@acme.com" }, timestampSec: 2 }),
    );
    expect(svc.listVideoForms).not.toHaveBeenCalled();
  });

  it("serves every kind from ONE public request per project", async () => {
    renderOverlay(
      <EngagementZonesOverlay
        zones={[
          zone("chapter-marker", CHAPTER.id, 0, 10),
          zone("thumbnail-stamp", THUMB.id, 0, 10),
          zone("video-form", FORM.id, 20, 30),
        ]}
        projectId={PROJECT_ID}
        playback={playbackAt(1)}
      />,
    );
    expect(await screen.findByRole("button", { name: "Jump to chapter: Results" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Watch video/ })).toBeInTheDocument();
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledTimes(1);
  });

  it("renders no review control and never requests review comments", async () => {
    renderOverlay(
      <EngagementZonesOverlay
        zones={[zone("review-pin", ROOT_COMMENT.id, 5, 8), zone("chapter-marker", CHAPTER.id, 5, 8)]}
        projectId={PROJECT_ID}
        playback={playbackAt(6)}
      />,
    );
    await screen.findByRole("button", { name: "Jump to chapter: Results" });
    expect(screen.queryByRole("button", { name: /Open review thread/ })).toBeNull();
    expect(svc.getProjectComments).not.toHaveBeenCalled();
  });

  it("renders nothing when the project is private (public read 404s)", async () => {
    svc.getPublicEngagementAssets.mockRejectedValue(new Error("Resource not found"));
    renderOverlay(
      <EngagementZonesOverlay zones={[zone("chapter-marker", CHAPTER.id, 5, 10)]} projectId={PROJECT_ID} playback={playbackAt(6)} />,
    );
    await waitFor(() => expect(svc.getPublicEngagementAssets).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EngagementZonesOverlay — signed-in viewer on a public surface", () => {
  it("uses the public read, not the owner listings", async () => {
    renderOverlay(
      <EngagementAudienceProvider value="public">
        <EngagementZonesOverlay zones={[zone("chapter-marker", CHAPTER.id, 5, 10)]} projectId={PROJECT_ID} playback={playbackAt(6)} />
      </EngagementAudienceProvider>,
    );
    expect(await screen.findByRole("button", { name: "Jump to chapter: Results" })).toBeInTheDocument();
    expect(svc.getChapters).not.toHaveBeenCalled();
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledWith(PROJECT_ID);
  });
});
