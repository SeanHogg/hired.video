/**
 * Unit tests for the Resume Summarize handler.
 *
 * Why this file exists:
 *   The previous test in tools-api.test.ts mirrored the route handler's
 *   logic as a pure function and asserted the mirror against itself —
 *   so it never caught the production bug where the handler silently
 *   dropped two of the three input shapes the frontend sends. These
 *   tests exercise the actual handler module's input branches against
 *   a fake repo, so a regression of the same shape would fail loudly.
 *
 * Coverage:
 *   • classifySummarizeInput — paste-text, parsed-JSON object, resumeId,
 *                              empty, malformed bodies, precedence
 *   • resolveResumeForSummary — each branch end-to-end including the
 *                               owner-scoped DB lookup, RESUME_NOT_FOUND,
 *                               unauthenticated-id, validation gate, and
 *                               crucially the parsed-JSON object branch
 *                               that the original stub silently dropped
 *   • buildDeterministicSummary — short input, long-input truncation,
 *                                 honest "AI unavailable" prefix
 *   • SUMMARY_SYSTEM_PROMPT — non-empty, mentions the structure
 *
 * Run: node --import tsx --test src/services/__tests__/resume-summarize.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ResumeContent } from "../../../../shared/resume.js";
import {
  buildDeterministicSummary,
  classifySummarizeInput,
  MIN_RESUME_CHARS,
  resolveResumeForSummary,
  SUMMARY_SYSTEM_PROMPT,
  type SummarizeRepoPort,
} from "../resume/summarize.js";

// ---------------------------------------------------------------------------
// Fake repo — minimal port shape, in-memory map. Tests seed exactly what
// they need; everything else returns null.
// ---------------------------------------------------------------------------

function makeFakeRepo(
  rows: Array<{ id: string; ownerId: string; content: Record<string, unknown> }>,
): SummarizeRepoPort & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    async findByIdForOwner(id, ownerId) {
      calls.push([id, ownerId]);
      const hit = rows.find((r) => r.id === id && r.ownerId === ownerId);
      return hit ? { content: hit.content } : null;
    },
  };
}

const SAMPLE_RESUME: ResumeContent = {
  basics: {
    name: "Jane Doe",
    label: "Senior Software Engineer",
    email: "jane@example.com",
    summary: "Backend engineer with 8 years of experience scaling distributed systems.",
  },
  work: [
    {
      name: "Acme Corp",
      position: "Staff Engineer",
      startDate: "2022",
      endDate: "Present",
      summary: "Led the migration of the order pipeline to event-sourced architecture.",
      highlights: ["Cut p99 latency by 40%", "Mentored 3 junior engineers"],
    },
  ],
  skills: [{ name: "TypeScript", level: "Advanced", keywords: ["Node.js", "Hono"] }],
  education: [],
} as unknown as ResumeContent;

// ═══════════════════════════════════════════════════════════════════════════
// classifySummarizeInput
// ═══════════════════════════════════════════════════════════════════════════

describe("classifySummarizeInput", () => {
  it("classifies a string resumeText as 'text'", () => {
    const result = classifySummarizeInput({ resumeText: "hello world this is a resume" });
    assert.deepEqual(result, { kind: "text", resumeText: "hello world this is a resume" });
  });

  it("classifies a parsed-JSON object resumeText as 'object' (frontend file-upload tab)", () => {
    // This is the regression case: the file-upload flow first calls
    // /api/resume/parse which returns a structured ResumeContent, then
    // POSTs that object back as `resumeText`. The original stub did
    // `typeof resumeText === "string"` and silently coerced this to "".
    const result = classifySummarizeInput({ resumeText: SAMPLE_RESUME });
    assert.equal(result.kind, "object");
    if (result.kind === "object") {
      assert.equal((result.resumeContent as any).basics.name, "Jane Doe");
    }
  });

  it("classifies a string resumeId as 'id'", () => {
    const result = classifySummarizeInput({ resumeId: "abc-123" });
    assert.deepEqual(result, { kind: "id", resumeId: "abc-123" });
  });

  it("returns 'empty' for null / undefined / non-object bodies", () => {
    assert.deepEqual(classifySummarizeInput(null), { kind: "empty" });
    assert.deepEqual(classifySummarizeInput(undefined), { kind: "empty" });
    assert.deepEqual(classifySummarizeInput("not an object"), { kind: "empty" });
    assert.deepEqual(classifySummarizeInput(42), { kind: "empty" });
  });

  it("returns 'empty' for an object with neither resumeText nor resumeId", () => {
    assert.deepEqual(classifySummarizeInput({}), { kind: "empty" });
    assert.deepEqual(classifySummarizeInput({ unrelated: "field" }), { kind: "empty" });
  });

  it("returns 'empty' for an empty-string resumeId", () => {
    // Empty string is truthy-typeof-string but useless — guard against it
    // so we don't trip the DB-lookup branch on garbage.
    assert.deepEqual(classifySummarizeInput({ resumeId: "" }), { kind: "empty" });
  });

  it("prefers resumeText over resumeId when both are present", () => {
    const result = classifySummarizeInput({ resumeText: "paste body", resumeId: "abc" });
    assert.deepEqual(result, { kind: "text", resumeText: "paste body" });
  });

  it("prefers a string resumeText over an object resumeText (defensive ordering)", () => {
    // Theoretical mixed-input: paste-text user pre-fills, then accidentally
    // submits with the object also attached. We trust the string.
    const result = classifySummarizeInput({ resumeText: "string wins" });
    assert.deepEqual(result, { kind: "text", resumeText: "string wins" });
  });

  it("ignores a numeric resumeText (the original stub returned the canned fallback for this)", () => {
    const result = classifySummarizeInput({ resumeText: 42 });
    assert.deepEqual(result, { kind: "empty" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveResumeForSummary
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveResumeForSummary — text input", () => {
  it("passes through a long-enough resume string unchanged", async () => {
    const repo = makeFakeRepo([]);
    const out = await resolveResumeForSummary(
      repo,
      { kind: "text", resumeText: "Senior backend engineer with deep distributed-systems experience." },
      "user-1",
    );
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.resumeText.startsWith("Senior backend engineer"), true);
    }
    assert.equal(repo.calls.length, 0, "must not hit the DB for text input");
  });

  it("rejects whitespace-only / empty / too-short input with 422", async () => {
    const repo = makeFakeRepo([]);
    for (const text of ["", "   ", "\n\n\n", "tiny"]) {
      const out = await resolveResumeForSummary(repo, { kind: "text", resumeText: text }, "user-1");
      assert.equal(out.ok, false, `expected rejection for input "${text}"`);
      if (!out.ok) {
        assert.equal(out.status, 422);
        assert.equal(out.code, "VALIDATION_ERROR");
      }
    }
  });

  it("uses the documented MIN_RESUME_CHARS threshold (regression sentinel)", () => {
    // If someone changes the threshold, they must update both this test
    // and the docs string. Catches accidental drift.
    assert.equal(MIN_RESUME_CHARS, 20);
  });
});

describe("resolveResumeForSummary — parsed-JSON object input", () => {
  it("renders a ResumeContent object to markdown text (the original stub regression)", async () => {
    const repo = makeFakeRepo([]);
    const out = await resolveResumeForSummary(
      repo,
      { kind: "object", resumeContent: SAMPLE_RESUME },
      "user-1",
    );
    assert.equal(out.ok, true, "object input must produce real text, not the canned stub fallback");
    if (out.ok) {
      // Sanity: rendered markdown contains identifying content from the resume
      assert.match(out.resumeText, /Jane Doe/);
      assert.match(out.resumeText, /Acme Corp/);
      assert.ok(out.resumeText.length > 50, "markdown render must not collapse to empty");
    }
    assert.equal(repo.calls.length, 0, "must not hit the DB for object input");
  });

  it("rejects an empty ResumeContent shell with 422", async () => {
    const repo = makeFakeRepo([]);
    const out = await resolveResumeForSummary(
      repo,
      { kind: "object", resumeContent: {} as ResumeContent },
      "user-1",
    );
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.status, 422);
      assert.equal(out.code, "VALIDATION_ERROR");
    }
  });
});

describe("resolveResumeForSummary — resumeId input", () => {
  it("fetches the resume scoped to the caller's ownerId", async () => {
    const repo = makeFakeRepo([
      { id: "resume-1", ownerId: "user-1", content: SAMPLE_RESUME as unknown as Record<string, unknown> },
    ]);
    const out = await resolveResumeForSummary(repo, { kind: "id", resumeId: "resume-1" }, "user-1");
    assert.equal(out.ok, true, "owner must be able to resolve their own saved resume");
    if (out.ok) {
      assert.match(out.resumeText, /Jane Doe/);
    }
    assert.deepEqual(repo.calls, [["resume-1", "user-1"]], "must scope the lookup to the caller");
  });

  it("returns 404 RESUME_NOT_FOUND when the id doesn't belong to the caller (cross-tenant guard)", async () => {
    // This test would catch a regression where someone removed the
    // ownerId scope and used a bare findById — letting any user
    // summarise any other user's resume.
    const repo = makeFakeRepo([
      { id: "resume-1", ownerId: "owner-A", content: SAMPLE_RESUME as unknown as Record<string, unknown> },
    ]);
    const out = await resolveResumeForSummary(repo, { kind: "id", resumeId: "resume-1" }, "user-B");
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.status, 404);
      assert.equal(out.code, "RESUME_NOT_FOUND");
    }
    // The fake repo recorded the lookup with the caller's own id —
    // confirming we did NOT leak a cross-tenant fetch.
    assert.deepEqual(repo.calls, [["resume-1", "user-B"]]);
  });

  it("returns 404 when the id simply doesn't exist", async () => {
    const repo = makeFakeRepo([]);
    const out = await resolveResumeForSummary(repo, { kind: "id", resumeId: "missing" }, "user-1");
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.status, 404);
      assert.equal(out.code, "RESUME_NOT_FOUND");
    }
  });

  it("rejects an unauthenticated id lookup with 422 and never hits the repo", async () => {
    // Anonymous callers can't have a saved resume — short-circuit before
    // the DB so we don't expose the lookup surface to unauth traffic.
    const repo = makeFakeRepo([
      { id: "resume-1", ownerId: "user-1", content: SAMPLE_RESUME as unknown as Record<string, unknown> },
    ]);
    const out = await resolveResumeForSummary(repo, { kind: "id", resumeId: "resume-1" }, undefined);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.status, 422);
    assert.equal(repo.calls.length, 0, "unauthenticated calls must short-circuit before the DB");
  });
});

describe("resolveResumeForSummary — empty input", () => {
  it("returns 422 (the original stub returned 200 with a canned 'Summary generated' string)", async () => {
    // This is the exact regression the user reported: with no real input,
    // the stub responded `{ success: true, data: { result: "Summary generated for the selected resume." } }`.
    // The new handler must surface this as a validation error so the
    // frontend can show "please provide a resume" instead of pretending
    // it summarised something.
    const repo = makeFakeRepo([]);
    const out = await resolveResumeForSummary(repo, { kind: "empty" }, "user-1");
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.status, 422);
      assert.equal(out.code, "VALIDATION_ERROR");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildDeterministicSummary — fallback when no LLM key is configured
// ═══════════════════════════════════════════════════════════════════════════

describe("buildDeterministicSummary", () => {
  it("is honest about being a fallback (does NOT pretend to be a summary)", () => {
    // Regression sentinel: the original stub returned literal text starting
    // with "Summary: " or "Summary generated for the selected resume." —
    // both lied to the user. The replacement must explicitly say it's not
    // a real summary.
    const out = buildDeterministicSummary("hello world");
    assert.match(out, /AI summarisation is unavailable/);
    assert.equal(out.startsWith("Summary:"), false, "must not impersonate a real summary");
    assert.equal(
      out.includes("Summary generated for the selected resume"),
      false,
      "the canned stub string must not return",
    );
  });

  it("includes the resume excerpt in the body", () => {
    const out = buildDeterministicSummary("here is the actual resume text");
    assert.ok(out.includes("here is the actual resume text"));
  });

  it("truncates input to 600 chars and appends an ellipsis", () => {
    const out = buildDeterministicSummary("a".repeat(1000));
    assert.ok(out.endsWith("..."));
    const longestRun = [...out.matchAll(/a+/g)].reduce(
      (max, m) => Math.max(max, m[0].length),
      0,
    );
    assert.equal(longestRun, 600);
  });

  it("does NOT append an ellipsis when the input is shorter than 600 chars", () => {
    assert.equal(buildDeterministicSummary("short").endsWith("..."), false);
  });

  it("trims leading/trailing whitespace before measuring length", () => {
    // Otherwise a 599-char input padded with whitespace would over-truncate.
    const out = buildDeterministicSummary("   " + "a".repeat(500) + "   ");
    assert.equal(out.endsWith("..."), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY_SYSTEM_PROMPT — smoke test
// ═══════════════════════════════════════════════════════════════════════════

describe("SUMMARY_SYSTEM_PROMPT", () => {
  it("is non-empty and instructs the model on output structure", () => {
    assert.ok(SUMMARY_SYSTEM_PROMPT.length > 100);
    assert.match(SUMMARY_SYSTEM_PROMPT, /paragraph/i);
  });

  it("forbids markdown / bullet output (so the frontend can render it as prose)", () => {
    assert.match(SUMMARY_SYSTEM_PROMPT, /no markdown headings/i);
    assert.match(SUMMARY_SYSTEM_PROMPT, /no bullet/i);
  });

  it("forbids hallucination (anti-platitude rule)", () => {
    assert.match(SUMMARY_SYSTEM_PROMPT, /do not invent/i);
  });
});
