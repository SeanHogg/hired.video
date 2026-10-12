/**
 * The /studio deep-link table + `useStudioLandingEntry`'s pending logic.
 *
 * Pinning:
 *   • No deep-link params → never pending, nothing runs.
 *   • A handler that ends without a project (unknown `?contentTemplate=`,
 *     missing `?template=` file, create() → null) clears pending AND replaces
 *     the URL to /studio — the loading shell can't get stuck.
 *   • A successful handler replace-navigates to /studio/<id> (+ forwarded
 *     editor seed params).
 *   • When the create seam navigated elsewhere itself (anon editor / kit),
 *     the URL is left alone.
 *   • Deep-link params arriving on the already-mounted page still run.
 *
 * Run: vitest run lib/studio/landing/__tests__/studio-landing-entry.test.tsx
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { StudioProject } from "@/lib/services/studio-service";
import type { CreateStudioDraft } from "../types";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  slugToBuiltinId: vi.fn(),
  loadTemplate: vi.fn(),
  findDocumentProject: vi.fn(),
  getJobById: vi.fn(),
  getCompanyProfileById: vi.fn(),
  getMine: vi.fn(),
  getBySlug: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/templates/registry", () => ({ slugToBuiltinId: mocks.slugToBuiltinId }));
vi.mock("@/lib/studio/load-template", () => ({ loadTemplate: mocks.loadTemplate }));
vi.mock("@/lib/services/studio-service", () => ({
  studioService: { findDocumentProject: mocks.findDocumentProject },
}));
vi.mock("@/lib/services/job-service", () => ({ jobService: { getJobById: mocks.getJobById } }));
vi.mock("@/lib/services/company-service", () => ({
  companyService: { getCompanyProfileById: mocks.getCompanyProfileById },
}));
vi.mock("@/lib/services/article-service", () => ({ articleService: { getMine: mocks.getMine } }));
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { getBySlug: mocks.getBySlug, getBySlugOrId: mocks.getBySlug },
}));
vi.mock("@/lib/studio/editor-v2/document-state", () => ({
  createJobDocumentState: (jobId: string) => ({ entityId: jobId }),
  createBoundDocumentState: (entityKind: string, id: string) => ({ entityKind, entityId: id }),
}));
vi.mock("@/lib/studio/document/document-from-article", () => ({
  articleToDocumentState: () => ({}),
}));

import { useStudioLandingEntry } from "../use-studio-landing-entry";
import { entryKey, matchEntry } from "../entry/table";

const create = vi.fn<CreateStudioDraft>();
const project = (id: string) => ({ id }) as StudioProject;

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({
      pending: useStudioLandingEntry(create),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    { wrapper },
  );
}

const pathOf = (r: { current: { location: { pathname: string; search: string } } }) =>
  `${r.current.location.pathname}${r.current.location.search}`;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  create.mockReset();
  // Built-in ids in the real registry are underscored slugs.
  mocks.slugToBuiltinId.mockImplementation((slug: string) =>
    slug === "podcast-trailer" ? "podcast_trailer" : null,
  );
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("deep-link table", () => {
  it("no deep-link params → no handler, no key", () => {
    expect(matchEntry(new URLSearchParams(""))).toBeNull();
    expect(matchEntry(new URLSearchParams("q=resume"))).toBeNull();
    expect(entryKey(new URLSearchParams("q=resume"))).toBeNull();
  });

  it("keeps the old precedence order", () => {
    const id = (qs: string) => matchEntry(new URLSearchParams(qs))?.id;
    expect(id("projectId=p1&new=1")).toBe("projectId");
    expect(id("editResume=r1&editJob=j1")).toBe("legacyResume");
    expect(id("editJob=j1&contentTemplate=podcast-trailer")).toBe("edit:job");
    expect(id("editArticle=a1")).toBe("edit:article");
    expect(id("editCompany=c1&contentTemplate=podcast-trailer")).toBe("edit:company");
    expect(id("contentTemplate=podcast-trailer&new=1")).toBe("contentTemplate");
    expect(id("template=basic&studioTemplate=x")).toBe("template");
    expect(id("studioTemplate=x&new=1")).toBe("studioTemplate");
    expect(id("subject=resume:r1")).toBe("blank");
    expect(id("capture=screen")).toBe("blank");
  });

  it("an unknown contentTemplate falls through to later entries, else to the fallback", () => {
    expect(matchEntry(new URLSearchParams("contentTemplate=foo&new=1"))?.id).toBe("blank");
    expect(matchEntry(new URLSearchParams("contentTemplate=foo"))?.id).toBe("unresolved");
    expect(matchEntry(new URLSearchParams("subject=not-a-subject"))?.id).toBe("unresolved");
  });
});

describe("useStudioLandingEntry", () => {
  it("no deep-link params → not pending, nothing runs", async () => {
    const { result } = setup("/studio");
    expect(result.current.pending).toBe(false);
    await act(async () => {});
    expect(create).not.toHaveBeenCalled();
    expect(pathOf(result)).toBe("/studio");
  });

  it("unknown ?contentTemplate= → pending cleared + URL replaced to /studio", async () => {
    const { result } = setup("/studio?contentTemplate=foo");
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(pathOf(result)).toBe("/studio");
    expect(create).not.toHaveBeenCalled();
  });

  it("missing ?template= file → pending cleared + URL replaced to /studio", async () => {
    mocks.loadTemplate.mockResolvedValue(null);
    const { result } = setup("/studio?template=nope");
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(pathOf(result)).toBe("/studio");
    expect(mocks.loadTemplate).toHaveBeenCalledWith("nope");
    expect(create).not.toHaveBeenCalled();
  });

  it("studio template without a script → toast, pending cleared, URL replaced", async () => {
    mocks.getBySlug.mockResolvedValue({ name: "T", videoScript: null });
    const { result } = setup("/studio?studioTemplate=empty");
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(pathOf(result)).toBe("/studio");
  });

  it("résumé studio template → the career kit wearing it, no studio project minted", async () => {
    mocks.getBySlug.mockResolvedValue({
      id: "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88",
      listingSlug: "clinical-blue-two-column-3fa9c1d2",
      name: "Clinical Blue, two column",
      mediaKind: "document",
      documentKind: "resume",
      videoScript: { entityKind: "resume", entityId: null, templateId: "healthcare-clinical-blue", pages: [] },
    });
    const { result } = setup("/studio?studioTemplate=clinical-blue-two-column-3fa9c1d2");
    await waitFor(() =>
      expect(pathOf(result)).toBe("/studio/new?start=resume&design=clinical-blue-two-column-3fa9c1d2"),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("create() → null without navigating → pending cleared + URL replaced", async () => {
    create.mockResolvedValue(null);
    const { result } = setup("/studio?new=1");
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(create).toHaveBeenCalledTimes(1);
    expect(pathOf(result)).toBe("/studio");
  });

  it("job deep link with a linked project → navigates to it", async () => {
    mocks.findDocumentProject.mockResolvedValue(project("existing"));
    const { result } = setup("/studio?editJob=j1");
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(pathOf(result)).toBe("/studio/existing"));
    expect(mocks.findDocumentProject).toHaveBeenCalledWith({ kind: "job", id: "j1" });
    expect(create).not.toHaveBeenCalled();
  });

  it("job deep link, first edit → mints a linked document project and navigates", async () => {
    mocks.findDocumentProject.mockResolvedValue(null);
    mocks.getJobById.mockResolvedValue({ title: "Staff Engineer" });
    create.mockResolvedValue(project("p1"));
    const { result } = setup("/studio?editJob=j1");
    await waitFor(() => expect(pathOf(result)).toBe("/studio/p1"));
    expect(create).toHaveBeenCalledWith({
      kind: "document",
      documentState: { entityId: "j1" },
      name: "Staff Engineer",
      subjects: [{ kind: "job", id: "j1" }],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("company deep link, first edit → mints a company document linked to it (#1915)", async () => {
    mocks.findDocumentProject.mockResolvedValue(null);
    mocks.getCompanyProfileById.mockResolvedValue({ id: "c1", data: { name: "Northwind Labs" } });
    create.mockResolvedValue(project("p2"));
    const { result } = setup("/studio?editCompany=c1");
    await waitFor(() => expect(pathOf(result)).toBe("/studio/p2"));
    expect(create).toHaveBeenCalledWith({
      kind: "document",
      documentState: { entityKind: "company", entityId: "c1" },
      name: "Northwind Labs",
      subjects: [{ kind: "company", id: "c1" }],
    });
  });

  it("job load failure → toast, pending cleared, URL replaced", async () => {
    mocks.findDocumentProject.mockRejectedValue(new Error("boom"));
    const { result } = setup("/studio?editJob=j1");
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "boom" }));
    expect(pathOf(result)).toBe("/studio");
  });

  it("forwards the editor seed params onto the new project URL", async () => {
    create.mockResolvedValue(project("p3"));
    const { result } = setup("/studio?capture=screen&utm=x");
    await waitFor(() => expect(pathOf(result)).toBe("/studio/p3?capture=screen"));
  });

  it("leaves the URL alone when the create seam navigated elsewhere itself", async () => {
    create.mockImplementation(async () => {
      window.history.pushState({}, "", "/studio/new?contentTemplate=podcast_trailer");
      return null;
    });
    const { result } = setup("/studio?contentTemplate=podcast-trailer");
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current.pending).toBe(true);
    expect(pathOf(result)).toBe("/studio?contentTemplate=podcast-trailer");
  });

  it("runs a deep link that arrives on the already-mounted page", async () => {
    create.mockResolvedValue(project("p2"));
    const { result } = setup("/studio");
    expect(result.current.pending).toBe(false);
    act(() => result.current.navigate("/studio?new=1"));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(pathOf(result)).toBe("/studio/p2"));
    expect(create).toHaveBeenCalledWith({ kind: "blank", subjects: undefined });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
