/**
 * Tests for the shared resume-rewrite pipeline.
 *
 * Both consumers depend on this:
 *   • `useApplyToResume` — interactive hook, renders Apply badges per row
 *     in the tools/* pages.
 *   • `apply_resume_rewrite` tool runner — invoked by the AI coach when
 *     the LLM proposes a single bullet/summary rewrite.
 *
 * The matcher is intentionally tolerant (LLMs strip bullet glyphs,
 * re-wrap, and smart-quote even when told to quote verbatim) so the
 * tests pin the surprising shapes that should still match — and the
 * shapes that should NOT, so we don't accidentally over-replace.
 *
 * Run: vitest run lib/tools/__tests__/apply-rewrite.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResumeContent } from "@shared/resume";

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: {
    getResumeById: vi.fn(),
    updateResumeData: vi.fn(),
  },
}));

import { resumeService } from "@/lib/services/resume-service";
import {
  applyResumeRewrite,
  findRewriteTargets,
  looseEquals,
} from "../apply-rewrite";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HIGHLIGHT_A = "Shipped onboarding redesign that lifted activation 18%.";
const HIGHLIGHT_B = "Mentored 5 junior engineers across two cycles.";

function contentWithWork(): ResumeContent {
  return {
    work: [
      {
        name: "Acme",
        position: "Senior Engineer",
        url: "",
        summary: "Owned platform.",
        startDate: "2022-01",
        endDate: "",
        highlights: [HIGHLIGHT_A, HIGHLIGHT_B],
      },
    ],
  } as unknown as ResumeContent;
}

// ═══════════════════════════════════════════════════════════════════════════
// looseEquals — fuzzy matcher
// ═══════════════════════════════════════════════════════════════════════════

describe("looseEquals", () => {
  it("matches identical strings", () => {
    expect(looseEquals("Shipped X", "Shipped X")).toBe(true);
  });

  it("ignores leading bullet glyphs the LLM commonly preserves", () => {
    // Models echo the bullet character even when told to quote text only.
    expect(looseEquals("• Shipped onboarding redesign", "Shipped onboarding redesign")).toBe(true);
    expect(looseEquals("- Shipped onboarding redesign", "Shipped onboarding redesign")).toBe(true);
    expect(looseEquals("▸ Shipped onboarding redesign", "Shipped onboarding redesign")).toBe(true);
  });

  it("collapses whitespace", () => {
    expect(looseEquals("a   b\nc", "a b c")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looseEquals("HELLO world", "hello WORLD")).toBe(true);
  });

  it("accepts containment in either direction when both strings are long enough", () => {
    // The LLM sometimes truncates a bullet to fit a token budget. A
    // 90% prefix should still resolve to the same row.
    const long = "Shipped onboarding redesign that lifted activation eighteen percent.";
    const truncated = "Shipped onboarding redesign that lifted activation";
    expect(looseEquals(long, truncated)).toBe(true);
    expect(looseEquals(truncated, long)).toBe(true);
  });

  it("does NOT match unrelated short strings just because one is a prefix", () => {
    // The 12-char threshold blocks tiny prefixes from matching everything.
    expect(looseEquals("Built X", "Built")).toBe(false);
  });

  it("returns false for empty input on either side", () => {
    expect(looseEquals("", "anything")).toBe(false);
    expect(looseEquals("anything", "")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// findRewriteTargets — collection across resume sections
// ═══════════════════════════════════════════════════════════════════════════

describe("findRewriteTargets", () => {
  it("returns [] when the original text matches nothing", () => {
    const hits = findRewriteTargets(contentWithWork(), "Wrote Haskell at NASA");
    expect(hits).toEqual([]);
  });

  it("locates a matching work highlight by index", () => {
    const hits = findRewriteTargets(contentWithWork(), HIGHLIGHT_B);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].location).toBe("work[0].highlights[1]");
  });

  it("locates a matching work summary", () => {
    const content = {
      work: [
        {
          name: "Acme",
          summary: "Owned platform.",
          highlights: [],
        },
      ],
    } as unknown as ResumeContent;
    const hits = findRewriteTargets(content, "Owned platform.");
    expect(hits[0]?.location).toBe("work[0].summary");
  });

  it("locates a matching project highlight", () => {
    const content = {
      projects: [
        { name: "p1", highlights: ["Built widget framework adopted org-wide"] },
      ],
    } as unknown as ResumeContent;
    const hits = findRewriteTargets(content, "Built widget framework adopted org-wide");
    expect(hits[0]?.location).toBe("projects[0].highlights[0]");
  });

  it("locates a matching volunteer highlight", () => {
    const content = {
      volunteer: [
        { organization: "v1", highlights: ["Tutored under-resourced students for two summers"] },
      ],
    } as unknown as ResumeContent;
    const hits = findRewriteTargets(
      content,
      "Tutored under-resourced students for two summers",
    );
    expect(hits[0]?.location).toBe("volunteer[0].highlights[0]");
  });

  it("locates a matching basics.summary", () => {
    const content = {
      basics: { summary: "Senior engineer with a bias for shipping." },
    } as unknown as ResumeContent;
    const hits = findRewriteTargets(content, "Senior engineer with a bias for shipping.");
    expect(hits[0]?.location).toBe("basics.summary");
  });

  it("preference order: highlights before summaries when both could match", () => {
    // If the same text appears as both a work summary and a highlight,
    // the first hit returned should be the highlight (the bullet form
    // most rewrites target).
    const SHARED = "Owned the customer-facing reliability program for two years.";
    const content = {
      work: [
        {
          name: "Acme",
          summary: SHARED,
          highlights: [SHARED],
        },
      ],
    } as unknown as ResumeContent;
    const hits = findRewriteTargets(content, SHARED);
    expect(hits[0]?.location).toBe("work[0].highlights[0]");
  });

  it("apply() mutates the working copy in place at the right slot", () => {
    const content = contentWithWork();
    const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
    const hits = findRewriteTargets(content, HIGHLIGHT_A);
    expect(hits.length).toBeGreaterThan(0);
    hits[0].apply(next, "REPLACED");
    expect(next.work?.[0]?.highlights?.[0]).toBe("REPLACED");
    // The other highlight in the same role is untouched.
    expect(next.work?.[0]?.highlights?.[1]).toBe(HIGHLIGHT_B);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyResumeRewrite — full fetch → mutate → persist pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("applyResumeRewrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { ok: false, reason: 'no_resume' } when no resumeId is bound", async () => {
    const out = await applyResumeRewrite(undefined, "x", "y");
    expect(out).toEqual({ ok: false, reason: "no_resume" });
    expect(resumeService.getResumeById).not.toHaveBeenCalled();
  });

  it("returns 'no_match' without touching the API when the original text isn't on the resume", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: contentWithWork(),
    });

    const out = await applyResumeRewrite("r1", "Wrote Haskell at NASA", "irrelevant");

    expect(out).toEqual({ ok: false, reason: "no_match" });
    expect(resumeService.updateResumeData).not.toHaveBeenCalled();
  });

  it("applies the first hit and persists the mutated content", async () => {
    const original = contentWithWork();
    (resumeService.getResumeById as any).mockResolvedValue({ content: original });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await applyResumeRewrite("r1", HIGHLIGHT_A, "Shipped activation lift, full credit.");

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.location).toBe("work[0].highlights[0]");

    expect(resumeService.updateResumeData).toHaveBeenCalledTimes(1);
    const [id, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    expect(id).toBe("r1");
    expect(payload.data.work[0].highlights[0]).toBe("Shipped activation lift, full credit.");
    // The OTHER highlight in the same role must not be clobbered.
    expect(payload.data.work[0].highlights[1]).toBe(HIGHLIGHT_B);
    // The original content object must not have been mutated.
    expect(original.work?.[0]?.highlights?.[0]).toBe(HIGHLIGHT_A);
  });

  it("invalidates the resume + resumes query keys when a queryClient is provided", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({ content: contentWithWork() });
    (resumeService.updateResumeData as any).mockResolvedValue({});
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as any;

    await applyResumeRewrite("r1", HIGHLIGHT_A, "improved", queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["resumes"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["resume", "r1"] });
  });

  it("returns 'save_failed' with an error message when persistence throws", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({ content: contentWithWork() });
    (resumeService.updateResumeData as any).mockRejectedValue(new Error("boom"));

    const out = await applyResumeRewrite("r1", HIGHLIGHT_A, "improved");
    expect(out).toEqual({ ok: false, reason: "save_failed", message: "boom" });
  });

  it("returns 'save_failed' when the resume row has no content", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({ content: undefined });
    const out = await applyResumeRewrite("r1", "x", "y");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("save_failed");
      expect(out.message).toMatch(/unavailable/i);
    }
  });

  it("only writes one location even if the same text appears in multiple slots", async () => {
    // The matcher would surface multiple hits for the same string, but
    // the pipeline applies the FIRST hit only. This guards against the
    // "LLM gives one rewrite → we accidentally clobber every duplicate
    // bullet" failure mode.
    const SHARED = "Owned the customer-facing reliability program for two years.";
    (resumeService.getResumeById as any).mockResolvedValue({
      content: {
        work: [
          { name: "A", summary: SHARED, highlights: [SHARED] },
          { name: "B", summary: SHARED, highlights: [SHARED] },
        ],
      },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await applyResumeRewrite("r1", SHARED, "REPLACED");
    expect(out.ok).toBe(true);

    const [, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    const replacedCount =
      [
        payload.data.work[0].summary,
        payload.data.work[0].highlights[0],
        payload.data.work[1].summary,
        payload.data.work[1].highlights[0],
      ].filter((v: string) => v === "REPLACED").length;
    expect(replacedCount).toBe(1);
  });
});
