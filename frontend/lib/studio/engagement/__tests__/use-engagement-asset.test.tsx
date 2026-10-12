/**
 * Engagement asset source selection (#1586): the owner listings in the
 * editor / owner preview, the ONE public read for a signed-out viewer or a
 * viewer surface — decided in one place (engagement-audience), never by a
 * prop the consumer threads through.
 *
 * Run: vitest run lib/studio/engagement/__tests__/use-engagement-asset.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ apiReady: true, authLoading: false }));
vi.mock("@/lib/auth", () => ({
  useApiReady: () => h.apiReady,
  useAuth: () => ({ isLoading: h.authLoading }),
}));

const svc = vi.hoisted(() => ({
  listVideoForms: vi.fn(),
  getChapters: vi.fn(),
  listThumbnails: vi.fn(),
  getProjectComments: vi.fn(),
  getPublicEngagementAssets: vi.fn(),
}));
vi.mock("@/lib/services/studio-features-service", () => svc);

import { EngagementAudienceProvider, resolveEngagementAudience } from "../engagement-audience";
import {
  isPlayableForm,
  playableEngagementAsset,
  selectEngagementAsset,
  useEngagementAsset,
  usePlayableEngagementAsset,
  usePlayableFormRows,
} from "../use-engagement-asset";

const PROJECT_ID = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const CHAPTER = {
  id: "a2b9e4c1-5d7f-4e2a-8c3b-6f1d0e9a7b55",
  projectId: PROJECT_ID,
  title: "Results",
  startSeconds: 42.5,
  thumbnailUrl: null,
  orderIndex: 2,
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
const FORM = {
  id: "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44",
  projectId: PROJECT_ID,
  title: "Get the full case study",
  description: null,
  positionSeconds: 1,
  fields: [{ key: "email", label: "Work email", type: "email", required: true }],
  requireToContinue: true,
  redirectUrl: null,
  submitButtonText: "Send it to me",
  isActive: true,
  formType: "lead_capture",
};
const INACTIVE_FORM = { ...FORM, id: "8c7b6a59-4837-4261-9504-f3e2d1c0b9a8", title: "Old survey", isActive: false };
const REPLY = { ...ROOT_COMMENT, id: "f0e1d2c3-b4a5-4968-8776-655443322110", parentId: ROOT_COMMENT.id, body: "Done." };

function wrapper(audience?: "owner" | "public") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrap({ children }: { children: ReactNode }) {
    const tree = <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return audience ? <EngagementAudienceProvider value={audience}>{tree}</EngagementAudienceProvider> : tree;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.apiReady = true;
  h.authLoading = false;
  svc.getChapters.mockResolvedValue([CHAPTER]);
  svc.listVideoForms.mockResolvedValue([FORM, INACTIVE_FORM]);
  svc.getProjectComments.mockResolvedValue([ROOT_COMMENT, REPLY]);
  svc.getPublicEngagementAssets.mockResolvedValue({ forms: [], chapters: [CHAPTER], thumbnails: [] });
});

describe("resolveEngagementAudience", () => {
  it("keeps the declared audience for a signed-in viewer", () => {
    expect(resolveEngagementAudience("owner", { loading: false, signedIn: true })).toBe("owner");
    expect(resolveEngagementAudience("public", { loading: false, signedIn: true })).toBe("public");
  });

  it("forces public for a signed-out viewer, even inside the editor's default", () => {
    expect(resolveEngagementAudience("owner", { loading: false, signedIn: false })).toBe("public");
  });

  it("is undecided while auth bootstraps", () => {
    expect(resolveEngagementAudience("owner", { loading: true, signedIn: false })).toBeUndefined();
  });
});

describe("useEngagementAsset — source selection", () => {
  it("reads the owner listing in the editor (signed in, default audience)", async () => {
    const { result } = renderHook(() => useEngagementAsset("chapter-marker", PROJECT_ID, CHAPTER.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual({ kind: "chapter-marker", chapter: CHAPTER }));
    expect(svc.getChapters).toHaveBeenCalledWith(PROJECT_ID);
    expect(svc.getPublicEngagementAssets).not.toHaveBeenCalled();
  });

  it("reads the public listing for a signed-out viewer", async () => {
    h.apiReady = false;
    const { result } = renderHook(() => useEngagementAsset("chapter-marker", PROJECT_ID, CHAPTER.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual({ kind: "chapter-marker", chapter: CHAPTER }));
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledWith(PROJECT_ID);
    expect(svc.getChapters).not.toHaveBeenCalled();
  });

  it("reads the public listing for a signed-in viewer on a public surface", async () => {
    const { result } = renderHook(() => useEngagementAsset("chapter-marker", PROJECT_ID, CHAPTER.id), { wrapper: wrapper("public") });
    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(svc.getPublicEngagementAssets).toHaveBeenCalledTimes(1);
    expect(svc.getChapters).not.toHaveBeenCalled();
  });

  it("resolves a review pin to null on a public surface without any request", () => {
    h.apiReady = false;
    const { result } = renderHook(() => useEngagementAsset("review-pin", PROJECT_ID, ROOT_COMMENT.id), { wrapper: wrapper() });
    expect(result.current).toBeNull();
    expect(svc.getProjectComments).not.toHaveBeenCalled();
    expect(svc.getPublicEngagementAssets).not.toHaveBeenCalled();
  });

  it("stays loading (no request) while auth bootstraps", () => {
    h.apiReady = false;
    h.authLoading = true;
    const { result } = renderHook(() => useEngagementAsset("chapter-marker", PROJECT_ID, CHAPTER.id), { wrapper: wrapper() });
    expect(result.current).toBeUndefined();
    expect(svc.getChapters).not.toHaveBeenCalled();
    expect(svc.getPublicEngagementAssets).not.toHaveBeenCalled();
  });

  it("is null when the bound id isn't in the public listing (deleted / inactive form)", async () => {
    h.apiReady = false;
    const { result } = renderHook(
      () => useEngagementAsset("video-form", PROJECT_ID, "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44"),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe("inactive forms in the owner audience", () => {
  it("the editor card still loads an inactive form (so it can say it's turned off)", async () => {
    const { result } = renderHook(() => useEngagementAsset("video-form", PROJECT_ID, INACTIVE_FORM.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual({ kind: "video-form", form: INACTIVE_FORM }));
  });

  it("playback resolves an active form", async () => {
    const { result } = renderHook(() => usePlayableEngagementAsset("video-form", PROJECT_ID, FORM.id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual({ kind: "video-form", form: FORM }));
  });

  it("playback resolves an inactive form to null (it would 404 on submit)", async () => {
    const { result } = renderHook(() => usePlayableEngagementAsset("video-form", PROJECT_ID, INACTIVE_FORM.id), { wrapper: wrapper() });
    await waitFor(() => expect(svc.listVideoForms).toHaveBeenCalledWith(PROJECT_ID));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("playback gates only on active forms", async () => {
    const { result } = renderHook(() => usePlayableFormRows(PROJECT_ID), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual([FORM]));
  });

  it("isPlayableForm / playableEngagementAsset: only an explicit isActive=false is unplayable", () => {
    expect(isPlayableForm({ isActive: true })).toBe(true);
    expect(isPlayableForm({})).toBe(true); // public rows carry no flag
    expect(isPlayableForm({ isActive: false })).toBe(false);
    expect(playableEngagementAsset({ kind: "chapter-marker", chapter: CHAPTER })).toEqual({ kind: "chapter-marker", chapter: CHAPTER });
    expect(playableEngagementAsset(undefined)).toBeUndefined();
  });
});

describe("selectEngagementAsset (pure)", () => {
  it("returns a review thread's root with its replies", () => {
    expect(selectEngagementAsset("review-pin", [ROOT_COMMENT, REPLY], ROOT_COMMENT.id)).toEqual({
      kind: "review-pin",
      root: ROOT_COMMENT,
      replies: [REPLY],
    });
  });

  it("is null for an id that isn't listed", () => {
    expect(selectEngagementAsset("chapter-marker", [CHAPTER], "missing")).toBeNull();
  });
});
