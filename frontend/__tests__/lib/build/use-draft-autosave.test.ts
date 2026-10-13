/**
 * useDraftAutosave — the kit draft ↔ résumé row sync: debounced updates,
 * a flush when the page is left, a re-save of a restored draft, an existing
 * résumé written back with its OWN design until a new one is picked, and the
 * picked design (incl. dropping a legacy studio layout) once it is. Since
 * #1494 it runs on the shared useServerAutosave: autosave version rows for
 * real accounts, the unsaved-work registry, and the cross-tab conflict.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ResumeContent } from "@shared/resume";
import type { IntakeSource } from "@/lib/build/use-resume-intake";
import type { ResumeDesign } from "@/lib/resume-design";

const updateResumeData = vi.fn((_id: string, _updates: { data: ResumeContent }) => Promise.resolve({}));
const createResume = vi.fn(() => Promise.resolve({ id: "created-resume-1" }));
const createVersion = vi.fn((_id: string, _opts: { isAutosave?: boolean }) => Promise.resolve());

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: {
    updateResumeData: (id: string, updates: { data: ResumeContent }) => updateResumeData(id, updates),
    createResume: () => createResume(),
    createVersion: (id: string, opts: { isAutosave?: boolean }) => createVersion(id, opts),
  },
}));
const auth = vi.hoisted(() => ({ isGuest: false }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "user-1" }, isGuest: auth.isGuest }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// The cross-tab channel is a module singleton: a spy lets a test play the
// other tab. The offline queue is a no-op here (covered by its own test).
const channel = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }));
vi.mock("@/lib/autosave/autosave-channel", () => ({
  announceAutosave: () => {},
  onRemoteAutosave: (key: string, cb: () => void) => {
    channel.listeners.set(key, cb);
    return () => channel.listeners.delete(key);
  },
}));
vi.mock("@/lib/autosave/offline-save-queue", () => ({
  offlineSaveQueue: { enqueue: async () => {}, remove: async () => {}, claim: () => () => {}, flush: async () => 0 },
  isOfflineFailure: () => false,
}));

import { SAVE_DEBOUNCE_MS, VERSION_INTERVAL_MS, useDraftAutosave } from "@/lib/build/use-draft-autosave";
import { hasUnsavedWork } from "@/hooks/use-unsaved-work";

const RESUME_ID = "3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11";
const existing: IntakeSource = { kind: "existing", title: "Sean Hogg", resumeId: RESUME_ID };

function resume(summary: string, meta?: Record<string, unknown>): ResumeContent {
  return {
    basics: { name: "Sean Hogg", summary },
    work: [{ id: "seed-work-002", name: "Alliance Inspection Management", position: "CIO" }],
    ...(meta ? { meta } : {}),
  } as unknown as ResumeContent;
}

interface Props {
  content: ResumeContent | null;
  design: ResumeDesign | null;
}

function setup(initial: Props, autoPersist = true, source: IntakeSource = existing) {
  return renderHook((props: Props) => useDraftAutosave({ ...props, source, autoPersist }), {
    initialProps: initial,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  updateResumeData.mockClear();
  createResume.mockClear();
  createVersion.mockClear();
  channel.listeners.clear();
  auth.isGuest = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftAutosave", () => {
  it("does not write an adopted résumé that hasn't changed", () => {
    setup({ content: resume("v0"), design: null });
    act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2));
    expect(updateResumeData).not.toHaveBeenCalled();
  });

  it("debounces a burst of edits into one write of the latest content", async () => {
    const hook = setup({ content: resume("v0"), design: null });
    for (const text of ["v1", "v2", "v3"]) {
      hook.rerender({ content: resume(text), design: null });
      act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS / 4));
    }
    expect(updateResumeData).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(updateResumeData).toHaveBeenCalledTimes(1);
    expect(updateResumeData.mock.calls[0][0]).toBe(RESUME_ID);
    expect((updateResumeData.mock.calls[0][1].data.basics as { summary: string }).summary).toBe("v3");
    expect(hook.result.current.saveState).toBe("saved");
  });

  it("keeps an untouched résumé's own design (legacy layout) when saving content", async () => {
    const meta = { template: "hired-default", documentLayout: { templateId: "x" } };
    const hook = setup({ content: resume("v0", meta), design: null });
    hook.rerender({ content: resume("v1", meta), design: null });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(updateResumeData.mock.calls[0][1].data.meta).toEqual(meta);
  });

  it("writes a picked design and drops the legacy layout", async () => {
    const content = resume("v0", { template: "hired-default", documentLayout: { templateId: "x" } });
    const hook = setup({ content, design: null });
    hook.rerender({ content, design: { templateId: "hired-default", structure: "functional" } });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    const meta = updateResumeData.mock.calls[0][1].data.meta as Record<string, unknown>;
    expect(meta.structure).toBe("functional");
    expect(meta.documentLayout).toBeUndefined();
  });

  it("flushes a pending save when the page is left", () => {
    const hook = setup({ content: resume("v0"), design: null });
    hook.rerender({ content: resume("typed just now"), design: null });
    expect(updateResumeData).not.toHaveBeenCalled();
    hook.unmount();
    expect(updateResumeData).toHaveBeenCalledTimes(1);
    expect((updateResumeData.mock.calls[0][1].data.basics as { summary: string }).summary).toBe("typed just now");
  });

  it("flushes on pagehide (tab closed / navigated away)", () => {
    const hook = setup({ content: resume("v0"), design: null });
    hook.rerender({ content: resume("v1"), design: null });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(updateResumeData).toHaveBeenCalledTimes(1);
  });

  it("never copies a résumé opened by id once it loads (the kit's /studio/:id open) — regression 2026-10-12", async () => {
    // A kit opened at /studio/<projectId> mounts with no draft, then the
    // résumé arrives as an adopted ("existing") source in ONE render.
    const hook = renderHook(
      (props: { content: ResumeContent | null; source: IntakeSource | null }) =>
        useDraftAutosave({ ...props, design: null, autoPersist: true }),
      { initialProps: { content: null as ResumeContent | null, source: null as IntakeSource | null } },
    );
    hook.rerender({ content: resume("v0"), source: existing });
    // Same render: it already names the opened résumé's own row.
    expect(hook.result.current.savedResumeId).toBe(RESUME_ID);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    });
    expect(createResume).not.toHaveBeenCalled();
    expect(hook.result.current.savedResumeId).toBe(RESUME_ID);
  });

  it("re-saves a restored draft of an existing résumé once", async () => {
    setup({ content: resume("edited before reload"), design: null }, false);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(updateResumeData).toHaveBeenCalledTimes(1);
  });

  it("creates a new résumé (signed in) with the picked design, then updates it", async () => {
    const source: IntakeSource = { kind: "file", name: "Sean Hogg Resume.pdf" };
    const design = { templateId: "hired-default", structure: "hybrid" as const };
    const hook = setup({ content: resume("v0"), design }, true, source);
    await act(async () => {
      await Promise.resolve();
    });
    expect(createResume).toHaveBeenCalledTimes(1);
    hook.rerender({ content: resume("v1"), design });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(updateResumeData).toHaveBeenCalledTimes(1);
    expect(updateResumeData.mock.calls[0][0]).toBe("created-resume-1");
  });

  it("holds the unsaved-work registry from the edit until the row is written", async () => {
    const hook = setup({ content: resume("v0"), design: null });
    hook.rerender({ content: resume("v1"), design: null });
    expect(hasUnsavedWork()).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(hasUnsavedWork()).toBe(false);
  });

  it("writes an autosave version row after a stretch of editing (#1494)", async () => {
    const hook = setup({ content: resume("v0"), design: null });
    hook.rerender({ content: resume("v1"), design: null });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    });
    expect(createVersion).not.toHaveBeenCalled(); // the row write is not a version
    await act(async () => {
      vi.advanceTimersByTime(VERSION_INTERVAL_MS);
    });
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledWith(RESUME_ID, { isAutosave: true });
  });

  it("keeps versioning during non-stop typing, at most once per interval", async () => {
    const hook = setup({ content: resume("v0"), design: null });
    // A keystroke burst every 5 s for a minute: the row saves on each pause,
    // versions land on the interval rather than never.
    for (let i = 1; i <= 12; i++) {
      hook.rerender({ content: resume(`v${i}`), design: null });
      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
    }
    expect(createVersion.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(createVersion.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("does not version a guest's résumé", async () => {
    auth.isGuest = true;
    const hook = setup({ content: resume("v0"), design: null });
    hook.rerender({ content: resume("v1"), design: null });
    await act(async () => {
      vi.advanceTimersByTime(VERSION_INTERVAL_MS * 2);
    });
    expect(updateResumeData).toHaveBeenCalledTimes(1);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("stops writing and reports a conflict when another tab saves the same résumé", async () => {
    const hook = setup({ content: resume("v0"), design: null });
    const otherTabSaved = channel.listeners.get(`resume:${RESUME_ID}`);
    expect(otherTabSaved).toBeDefined();
    act(() => otherTabSaved?.());
    hook.rerender({ content: resume("v1"), design: null });
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    });
    expect(updateResumeData).not.toHaveBeenCalled();
    expect(hook.result.current.saveState).toBe("conflict");
  });
});
