/**
 * #990 — "Review my whole résumé in XYZ". The steps walk every entry in page
 * order; the person's Apply / Skip decisions are applied as ONE change, so
 * on /build the whole pass is ONE Undo step (one commit on the open draft);
 * a line edited since the pass read it is never overwritten; the cursor
 * survives a reload.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";

vi.mock("@/lib/services/xyz-rewrite-service", () => ({
  xyzRewriteService: {
    highlights: vi.fn(async (bullets: string[]) => bullets.map((b) => `XYZ: ${b}`)),
    text: vi.fn(async (kind: string, original: string) => (kind === "position" ? original : `XYZ: ${original}`)),
  },
}));
vi.mock("@/lib/hooks/use-pro-gate-state", () => ({
  useProGateState: () => ({ requirePro: () => true, sheet: { reason: null, onClose: () => {} } }),
}));
// Keep the real module (lib/i18n/i18n.ts, reached through resume-content →
// resume-exporters, needs `initReactI18next`); only `t` is stubbed.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { applyXyzDecisions, xyzSteps, type XyzDecision } from "@/lib/build/xyz/xyz-review";
import { useXyzReview } from "@/lib/build/xyz/use-xyz-review";
import { registerResumeDraft, unregisterResumeDraft, type ResumeDraftHandle } from "@/lib/tools/resume-draft-bridge";

const RESUME_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

/** Shaped like a parsed director résumé. */
const resume = (): ResumeContent =>
  ({
    basics: { name: "Ana Ruiz", summary: "IT leader." },
    work: [
      {
        id: "w1",
        name: "Northwind Health",
        position: "Director of IT",
        summary: "Ran IT for a 2,000-seat network.",
        highlights: ["Responsible for vendor management", "Migrated 40 apps to Azure"],
        startDate: "2019-03",
        endDate: "",
      },
      { id: "w2", name: "Acme Clinics", position: "IT Manager", summary: "", highlights: [], startDate: "2014", endDate: "2019" },
    ],
    volunteer: [{ id: "v1", organization: "Code for Good", position: "Mentor", summary: "Mentored bootcamp grads.", highlights: [] }],
    projects: [{ id: "p1", name: "Telehealth rollout", description: "Launched telehealth in 9 clinics.", highlights: ["Trained 300 staff"] }],
  }) as unknown as ResumeContent;

describe("xyzSteps", () => {
  it("walks work, volunteer, projects in order: bullets, then summary, then title", () => {
    expect(xyzSteps(resume()).map((s) => s.id)).toEqual([
      "work.0.highlights",
      "work.0.summary",
      "work.0.position",
      "work.1.position",
      "volunteer.0.summary",
      "volunteer.0.position",
      "projects.0.highlights",
      "projects.0.description",
    ]);
  });

  it("an empty résumé has no steps", () => {
    expect(xyzSteps({ basics: { name: "" } } as unknown as ResumeContent)).toEqual([]);
  });
});

describe("applyXyzDecisions", () => {
  const steps = xyzSteps(resume());
  const applied = (id: string, value: string | string[]): [string, XyzDecision] => [
    id,
    { status: "applied", value, original: steps.find((s) => s.id === id)!.original },
  ];

  it("writes every applied step, skips the rest, never mutates its input", () => {
    const before = resume();
    const decisions = Object.fromEntries([
      applied("work.0.highlights", ["Cut vendor spend 18% by renegotiating 12 contracts", "  "]),
      ["work.0.summary", { status: "skipped" }],
      applied("projects.0.description", "Launched telehealth in 9 clinics, serving 4,000 visits a month."),
    ]) as Record<string, XyzDecision>;
    const after = applyXyzDecisions(before, decisions);
    expect(after.work?.[0].highlights).toEqual(["Cut vendor spend 18% by renegotiating 12 contracts"]);
    expect(after.work?.[0].summary).toBe("Ran IT for a 2,000-seat network.");
    expect(after.projects?.[0].description).toBe("Launched telehealth in 9 clinics, serving 4,000 visits a month.");
    expect(before.work?.[0].highlights).toEqual(["Responsible for vendor management", "Migrated 40 apps to Azure"]);
  });

  it("leaves a line the person edited since the pass read it", () => {
    const edited = resume();
    edited.work![0].summary = "Hand-edited summary.";
    const decisions = Object.fromEntries([applied("work.0.summary", "XYZ summary")]);
    expect(applyXyzDecisions(edited, decisions).work?.[0].summary).toBe("Hand-edited summary.");
  });

  it("returns the same object when nothing applies", () => {
    const content = resume();
    expect(applyXyzDecisions(content, { "work.0.summary": { status: "skipped" } })).toBe(content);
  });
});

describe("useXyzReview — the pass is ONE Undo step", () => {
  let draft: ResumeContent;
  let handle: ResumeDraftHandle;
  // Typed like the handle's commit (next, undo label) so call args destructure.
  const commit = vi.fn((next: ResumeContent, _label?: string) => {
    draft = next;
  });

  beforeEach(() => {
    localStorage.clear();
    commit.mockClear();
    draft = resume();
    handle = { resumeId: RESUME_ID, getContent: () => draft, commit };
    registerResumeDraft(handle);
  });
  afterEach(() => unregisterResumeDraft(handle));

  it("applies three decisions with a single commit on the open draft", async () => {
    const { result } = renderHook(() => useXyzReview(RESUME_ID));
    await waitFor(() => expect(result.current.steps.length).toBe(8));
    act(() => result.current.start());

    // Step 1: bullets — apply the rewrite as suggested.
    await waitFor(() => expect(result.current.suggestion?.status).toBe("ready"));
    act(() => result.current.decide(["Cut vendor spend 18% across 12 contracts", "Migrated 40 apps to Azure in 9 months"]));
    // Step 2: summary — apply an edited rewrite.
    await waitFor(() => expect(result.current.current?.id).toBe("work.0.summary"));
    act(() => result.current.decide("Led IT for a 2,000-seat healthcare network."));
    // Step 3: title — skip.
    await waitFor(() => expect(result.current.current?.id).toBe("work.0.position"));
    act(() => result.current.decide(null));
    expect(commit).not.toHaveBeenCalled();

    await act(() => result.current.finish());
    expect(commit).toHaveBeenCalledTimes(1);
    const [next, label] = commit.mock.calls[0];
    expect(label).toBe("ai:xyz-review");
    expect(next.work?.[0].highlights).toEqual(["Cut vendor spend 18% across 12 contracts", "Migrated 40 apps to Azure in 9 months"]);
    expect(next.work?.[0].summary).toBe("Led IT for a 2,000-seat healthcare network.");
    expect(next.work?.[0].position).toBe("Director of IT");
    expect(result.current.finished).toEqual({ applied: 2 });
    expect(result.current.started).toBe(false);
  });

  it("Cancel all writes nothing", async () => {
    const { result } = renderHook(() => useXyzReview(RESUME_ID));
    await waitFor(() => expect(result.current.steps.length).toBe(8));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.suggestion?.status).toBe("ready"));
    act(() => result.current.decide(["Rewritten"]));
    act(() => result.current.cancelAll());
    expect(result.current.started).toBe(false);
    expect(result.current.cursor).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it("a reload resumes at the same step with the decisions kept", async () => {
    const first = renderHook(() => useXyzReview(RESUME_ID));
    await waitFor(() => expect(first.result.current.steps.length).toBe(8));
    act(() => first.result.current.start());
    await waitFor(() => expect(first.result.current.suggestion?.status).toBe("ready"));
    act(() => first.result.current.decide(null));
    first.unmount();

    const again = renderHook(() => useXyzReview(RESUME_ID));
    await waitFor(() => expect(again.result.current.steps.length).toBe(8));
    expect(again.result.current.started).toBe(true);
    expect(again.result.current.cursor).toBe(1);
    expect(again.result.current.decisions["work.0.highlights"]).toEqual({ status: "skipped" });
  });
});
