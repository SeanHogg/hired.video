/**
 * The kit's media binding (#2153): an image / video dropped on a résumé
 * entry on the kit page binds to it — the overlay keeps a `mediaBinding`
 * and the résumé content gets the matching `metaData` row — and removing
 * the element drops exactly that row. Drops that don't land on an entry
 * (bare paper, the letter, a stale id) stay plain elements.
 *
 * Run: vitest run lib/workspace/kit/__tests__/use-kit-document-layers.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useContentHistory } from "@/lib/build/use-content-history";
import { useKitHistory } from "../use-kit-history";
import type { ResumeContent } from "@shared/resume";
import { OWNER_ID, PROJECT_ID, WORK_STRIPE_ID, resumeFixture } from "@/lib/studio/document/__tests__/resume-fixture";
import { kitPageOverlays } from "../kit-document";
import { EDITOR_SHEET_GAP, planePageTop, planeSpan } from "@/lib/studio/document/overlay-plane";
import { useKitDocumentLayers, type KitResumeBinding } from "../use-kit-document-layers";

vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    getProject: vi.fn(async (id: string) => ({ data: { id, documentState: null } })),
    saveDraft: vi.fn(async () => ({ data: null })),
  },
}));

/** use-studio-project-row reads through React Query — a fresh client per hook. */
function queryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const IMAGE_URL = "https://media.hired.video/u/5715588f/stripe-dashboard.png";
const VIDEO_URL = "https://media.hired.video/u/5715588f/demo.webm";

/** The kit's résumé host: content held like the content history holds it. */
function host(userId: string | null = OWNER_ID) {
  const box: { content: ResumeContent } = { content: resumeFixture() };
  const commit = vi.fn((next: ResumeContent) => {
    box.content = next;
  });
  const binding = (): KitResumeBinding => ({ content: box.content, commit, userId });
  return { box, commit, binding };
}

async function mountLayers(h: ReturnType<typeof host>) {
  const hook = renderHook(({ resume }) => useKitDocumentLayers({ projectId: "proj-1", resumeId: "res-1", title: "Kit", resume }), {
    initialProps: { resume: h.binding() },
    wrapper: queryWrapper(),
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

describe("useKitDocumentLayers media binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a drop on a résumé entry binds the element and writes ONE metaData row", async () => {
    const h = host();
    const before = h.box.content;
    const { result, rerender } = await mountLayers(h);
    act(() => result.current.insertMedia("resume", "image", IMAGE_URL, { x: 0.5, y: 0.3 }, { referenceId: WORK_STRIPE_ID }));
    rerender({ resume: h.binding() });

    const [overlay] = kitPageOverlays(result.current.state, "resume");
    expect(overlay.mediaBinding).toEqual({ referenceId: WORK_STRIPE_ID, itemType: "work" });
    expect(h.commit).toHaveBeenCalledTimes(1);
    const rows = h.box.content.metaData ?? [];
    expect(rows).toHaveLength((before.metaData ?? []).length + 1);
    expect(rows.find((r) => r.id === overlay.widget.id)).toMatchObject({ referenceId: WORK_STRIPE_ID, url: IMAGE_URL, userId: OWNER_ID });
    // Nothing else in the résumé changed.
    expect(h.box.content.work).toBe(before.work);
    expect(h.box.content.skillEvidence).toBe(before.skillEvidence);
  });

  it("removing a bound element drops exactly its row", async () => {
    const h = host();
    const original = h.box.content.metaData;
    const { result, rerender } = await mountLayers(h);
    act(() => result.current.insertMedia("resume", "video", VIDEO_URL, { x: 0.4, y: 0.6 }, { referenceId: PROJECT_ID }));
    rerender({ resume: h.binding() });
    const id = kitPageOverlays(result.current.state, "resume")[0].widget.id;

    act(() => result.current.remove("resume", id));
    expect(kitPageOverlays(result.current.state, "resume")).toHaveLength(0);
    expect(h.commit).toHaveBeenCalledTimes(2);
    expect(h.box.content.metaData).toEqual(original);
  });

  it("a drop on bare paper, the letter, or a stale entry id stays unbound", async () => {
    const h = host();
    const { result } = await mountLayers(h);
    act(() => {
      result.current.insertMedia("resume", "image", IMAGE_URL, { x: 0.1, y: 0.1 });
      result.current.insertMedia("letter", "image", IMAGE_URL, { x: 0.1, y: 0.1 }, { referenceId: WORK_STRIPE_ID });
      result.current.insertMedia("resume", "image", IMAGE_URL, { x: 0.2, y: 0.2 }, { referenceId: "deleted-entry" });
    });
    const all = [...kitPageOverlays(result.current.state, "resume"), ...kitPageOverlays(result.current.state, "letter")];
    expect(all).toHaveLength(3);
    expect(all.every((o) => !o.mediaBinding)).toBe(true);
    expect(h.commit).not.toHaveBeenCalled();
    // Removing an unbound element never touches the résumé.
    act(() => result.current.remove("resume", all[0].widget.id));
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("without a signed-in owner the drop is a plain element", async () => {
    const h = host(null);
    const { result } = await mountLayers(h);
    act(() => result.current.insertMedia("resume", "image", IMAGE_URL, { x: 0.5, y: 0.5 }, { referenceId: WORK_STRIPE_ID }));
    expect(kitPageOverlays(result.current.state, "resume")[0].mediaBinding).toBeUndefined();
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("places through the shared plane rule: centred on the drop, stored in page units", async () => {
    const h = host();
    const { result } = await mountLayers(h);
    act(() => result.current.reportPages("resume", 2));
    // Halfway down page 2 on the editor plane (below the gutter).
    const at = { x: 0.5, y: (planePageTop(1, EDITOR_SHEET_GAP) + 0.5) / planeSpan(2, EDITOR_SHEET_GAP) };
    act(() => result.current.insertMedia("resume", "image", IMAGE_URL, at));
    const { position } = kitPageOverlays(result.current.state, "resume")[0].widget;
    // Stored in page units: centred at 1.5 (the middle of page 2).
    expect(position.y + position.height / 2).toBeCloseTo(1.5, 5);
  });
});

describe("media binding is ONE undo step (kit journal)", () => {
  /** The kit's wiring in small: one journal over the content history and
   *  the layers, the layers binding through the content history. */
  function useKit() {
    const kit = useKitHistory();
    const [content, setContent] = useState<ResumeContent>(resumeFixture);
    const history = useContentHistory({ content, draftKey: "draft", apply: setContent, onStep: () => kit.record("content") });
    const layers = useKitDocumentLayers({
      projectId: "proj-1",
      resumeId: "res-1",
      title: "Kit",
      onStep: () => kit.record("layers"),
      resume: { content, commit: history.commit, userId: OWNER_ID, batch: kit.batch },
    });
    kit.register("content", history);
    kit.register("layers", layers);
    return { kit, content, layers };
  }

  it("one Undo reverts the element AND its metaData row; Redo brings both back", async () => {
    const { result } = renderHook(useKit, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.layers.ready).toBe(true));
    const before = result.current.content.metaData;
    act(() => result.current.layers.insertMedia("resume", "image", IMAGE_URL, { x: 0.5, y: 0.3 }, { referenceId: WORK_STRIPE_ID }));
    expect(kitPageOverlays(result.current.layers.state, "resume")).toHaveLength(1);
    expect(result.current.content.metaData).toHaveLength((before ?? []).length + 1);

    act(() => result.current.kit.undo());
    expect(kitPageOverlays(result.current.layers.state, "resume")).toHaveLength(0);
    expect(result.current.content.metaData).toEqual(before);
    expect(result.current.kit.canUndo).toBe(false);

    act(() => result.current.kit.redo());
    expect(kitPageOverlays(result.current.layers.state, "resume")).toHaveLength(1);
    expect(result.current.content.metaData).toHaveLength((before ?? []).length + 1);
  });

  it("removing a bound element is one step too: one Undo restores both", async () => {
    const { result } = renderHook(useKit, { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.layers.ready).toBe(true));
    act(() => result.current.layers.insertMedia("resume", "image", IMAGE_URL, { x: 0.5, y: 0.3 }, { referenceId: WORK_STRIPE_ID }));
    const bound = result.current.content.metaData;
    const id = kitPageOverlays(result.current.layers.state, "resume")[0].widget.id;
    act(() => result.current.layers.remove("resume", id));
    expect(kitPageOverlays(result.current.layers.state, "resume")).toHaveLength(0);

    act(() => result.current.kit.undo());
    expect(kitPageOverlays(result.current.layers.state, "resume")).toHaveLength(1);
    expect(result.current.content.metaData).toEqual(bound);
  });
});
