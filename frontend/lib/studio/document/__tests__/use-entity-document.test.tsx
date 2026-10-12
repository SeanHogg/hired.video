/**
 * #274/#275 — which canvas design an entity page shows: the owner sees their
 * own (draft or public); a visitor sees only a PUBLIC design authored by one
 * of the entity's owners — never a stranger's project linked to the entity,
 * never a document of another kind.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const svc = vi.hoisted(() => ({
  findDocumentProject: vi.fn(),
  getPublicProjects: vi.fn(),
  updateProjectVisibility: vi.fn(),
  loadDocumentEntity: vi.fn(),
}));
vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    findDocumentProject: svc.findDocumentProject,
    getPublicProjects: svc.getPublicProjects,
    updateProjectVisibility: svc.updateProjectVisibility,
  },
}));
vi.mock("../document-entity", () => ({ loadDocumentEntity: svc.loadDocumentEntity }));

import { useEntityDocument } from "../use-entity-document";

const OWNER = "u-owner";
const JOB_ID = "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d";
const subject = { kind: "job" as const, id: JOB_ID };
const jobDoc = { entityKind: "job", entityId: JOB_ID, pages: [{ id: "p", blocks: [], overlays: [] }] };
const JOB_CONTENT = {
  title: "Staff Product Manager",
  description: "Own the merchant onboarding funnel end to end, partnering with design and data weekly.",
};

function project(id: string, userId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId,
    mediaKind: "document",
    isPublic: true,
    updateDateTime: "2026-10-01T00:00:00Z",
    documentState: jobDoc,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.loadDocumentEntity.mockResolvedValue({ content: JOB_CONTENT });
});

describe("useEntityDocument", () => {
  it("a visitor sees the owner's public design with the job's live content", async () => {
    svc.getPublicProjects.mockResolvedValue({ data: [project("p-owner", OWNER)] });
    const { result } = renderHook(() => useEntityDocument({ subject, isOwner: false, authorIds: [OWNER] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.doc?.project.id).toBe("p-owner");
    expect(result.current.doc?.content).toEqual(JOB_CONTENT);
    expect(svc.loadDocumentEntity).toHaveBeenCalledWith(expect.objectContaining({ entityId: JOB_ID }));
  });

  it("a stranger's public project linked to the job never shows (security)", async () => {
    svc.getPublicProjects.mockResolvedValue({ data: [project("p-stranger", "u-someone-else")] });
    const { result } = renderHook(() => useEntityDocument({ subject, isOwner: false, authorIds: [OWNER] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.doc).toBeNull();
  });

  it("a linked document of another kind is not this entity's design (boundary)", async () => {
    svc.getPublicProjects.mockResolvedValue({
      data: [project("p-article", OWNER, { documentState: { ...jobDoc, entityKind: "article" } })],
    });
    const { result } = renderHook(() => useEntityDocument({ subject, isOwner: false, authorIds: [OWNER] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.doc).toBeNull();
  });

  it("the owner reads their own project (drafts too) and can show it to visitors", async () => {
    svc.findDocumentProject.mockResolvedValue(project("p-draft", OWNER, { isPublic: false }));
    svc.updateProjectVisibility.mockResolvedValue({});
    const { result } = renderHook(() => useEntityDocument({ subject, isOwner: true, authorIds: [OWNER] }));
    await waitFor(() => expect(result.current.doc?.project.id).toBe("p-draft"));
    expect(svc.getPublicProjects).not.toHaveBeenCalled();
    let issues: string[] = ["not run"];
    await act(async () => {
      issues = await result.current.setPublic(true);
    });
    expect(issues).toEqual([]);
    expect(svc.updateProjectVisibility).toHaveBeenCalledWith("p-draft", true);
    expect(result.current.doc?.project.isPublic).toBe(true);
  });

  it("showing a company page missing its required fields is blocked (publish tier)", async () => {
    const companyDoc = { ...jobDoc, entityKind: "company", entityId: "c1" };
    svc.findDocumentProject.mockResolvedValue(project("p-co", OWNER, { isPublic: false, documentState: companyDoc }));
    svc.loadDocumentEntity.mockResolvedValue({ content: { name: "Northwind Labs", industry: "", size: "" } });
    const { result } = renderHook(() =>
      useEntityDocument({ subject: { kind: "company", id: "c1" }, isOwner: true, authorIds: [OWNER] }),
    );
    await waitFor(() => expect(result.current.doc?.project.id).toBe("p-co"));
    let issues: string[] = [];
    await act(async () => {
      issues = await result.current.setPublic(true);
    });
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(svc.updateProjectVisibility).not.toHaveBeenCalled();
    // Hiding never validates.
    await act(async () => {
      await result.current.setPublic(false);
    });
    expect(svc.updateProjectVisibility).toHaveBeenCalledWith("p-co", false);
  });

  it("a failed read shows no design instead of breaking the page (error case)", async () => {
    svc.getPublicProjects.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useEntityDocument({ subject, isOwner: false, authorIds: [OWNER] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.doc).toBeNull();
  });
});
