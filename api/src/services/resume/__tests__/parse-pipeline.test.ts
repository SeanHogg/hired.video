/**
 * runResumeParse tests — the résumé parse pipeline behind POST /api/resumes/parse.
 *
 * Happy path (one complete model pass → no backfill, previews + stages
 * streamed, item ids minted), boundaries (only the MISSING sections are
 * backfilled, and concurrently; a refinement slower than its budget is
 * skipped instead of holding the result), exceptions (every model call
 * failing still returns the regex pre-parse).
 *
 * The model port is a fake routed by system prompt, so no network.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/parse-pipeline.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ResumeParseEvent } from "../../../../../shared/resume-parse-stream.js";
import { runResumeParse, type ResumeParsePorts } from "../parsePipeline.js";

/** Mirrors a real pasted résumé: header block, dated roles with bullets, education, skills. */
const RESUME_TEXT = [
  "Jess Rivera",
  "Senior Product Designer",
  "jess.rivera@example.com | (416) 555-0142 | Toronto, ON",
  "",
  "EXPERIENCE",
  "Acme Health — Senior Product Designer",
  "Jan 2021 – Present",
  "• Led the redesign of the patient portal, lifting task completion 18%",
  "• Built the design system used by 6 product teams",
  "Northwind Labs — Product Designer",
  "Mar 2017 – Dec 2020",
  "• Shipped onboarding flows for 2M users",
  "",
  "EDUCATION",
  "University of Toronto — BSc, Design, 2013 – 2017",
  "",
  "SKILLS",
  "Figma, User Research, Prototyping, Design Systems, Accessibility, HTML/CSS",
].join("\n");

const COMPLETE_ONE_PASS = {
  basics: { name: "Jess Rivera", label: "Senior Product Designer", email: "jess.rivera@example.com" },
  work: [
    { name: "Acme Health", position: "Senior Product Designer", startDate: "2021-01", endDate: "Present", highlights: ["Led the redesign"] },
    { name: "Northwind Labs", position: "Product Designer", startDate: "2017-03", endDate: "2020-12", highlights: [] },
  ],
  education: [{ institution: "University of Toronto", area: "Design", studyType: "BSc", startDate: "2013", endDate: "2017" }],
  skills: [{ name: "Skills", keywords: ["Figma", "User Research", "Prototyping", "Design Systems", "Accessibility", "HTML/CSS"] }],
};

type Route = "one-pass" | `section:${string}` | "dates";

function routeOf(systemPrompt: string): Route {
  if (systemPrompt.startsWith("You are a strict structured-extractor")) return "one-pass";
  if (systemPrompt.startsWith("You are a focused date extractor")) return "dates";
  const section = /Extract (?:ONLY|ALL) ([a-z]+)/i.exec(systemPrompt)?.[1]?.toLowerCase() ?? "?";
  const key = { the: "basics", work: "work", education: "education", skills: "skills", certifications: "certificates", awards: "awards", volunteer: "volunteer", projects: "projects" }[section] ?? section;
  return `section:${key}`;
}

/** A model fake: per-route handlers, records every call and peak concurrency. */
function fakeModel(handlers: Partial<Record<Route, () => Promise<unknown> | unknown>>) {
  const calls: Route[] = [];
  let inFlight = 0;
  let peak = 0;
  const callAI: ResumeParsePorts["callAI"] = async (systemPrompt) => {
    const route = routeOf(systemPrompt);
    calls.push(route);
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 5));
      const handler = handlers[route];
      if (!handler) throw new Error(`no handler for ${route}`);
      return JSON.stringify(await handler());
    } finally {
      inFlight--;
    }
  };
  return { callAI, calls, peak: () => peak };
}

function collect() {
  const events: ResumeParseEvent[] = [];
  return { events, onEvent: (e: ResumeParseEvent) => events.push(e) };
}

describe("runResumeParse — happy path", () => {
  it("returns the one-pass result without backfilling when it is complete", async () => {
    const model = fakeModel({ "one-pass": () => COMPLETE_ONE_PASS });
    const { events, onEvent } = collect();

    const result = await runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null }, { onEvent });

    assert.deepEqual(model.calls, ["one-pass"], "no section backfill, no date rescan (all dates present)");
    assert.equal((result.basics as { name: string }).name, "Jess Rivera");
    assert.equal((result.work as unknown[]).length, 2);
    for (const item of result.work as Array<{ id?: string }>) assert.ok(item.id, "work items carry a minted id");
  });

  it("streams the regex pre-parse first, then the structured draft, then refinement", async () => {
    const model = fakeModel({ "one-pass": () => COMPLETE_ONE_PASS });
    const { events, onEvent } = collect();

    await runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null }, { onEvent });

    assert.deepEqual(
      events.map((e) => (e.type === "stage" ? `stage:${e.stage}` : e.type)),
      ["preview", "stage:structure", "preview", "stage:refine"],
    );
    const first = events[0] as Extract<ResumeParseEvent, { type: "preview" }>;
    assert.ok(Object.keys(first.content).length > 0, "pre-parse preview is real content, before any model call");
  });

  it("enriches skills through the injected extractor when few were found", async () => {
    const sparse = { ...COMPLETE_ONE_PASS, skills: [{ name: "Skills", keywords: ["Figma"] }] };
    const model = fakeModel({ "one-pass": () => sparse });
    let asked = 0;

    const result = await runResumeParse(RESUME_TEXT, {
      callAI: model.callAI,
      extractSkills: async () => {
        asked++;
        return [
          { name: "Figma", category: "tool" },
          { name: "User Research", category: "domain" },
        ];
      },
    });

    assert.equal(asked, 1);
    const keywords = (result.skills as Array<{ name: string; keywords?: string[] }>).flatMap((s) => [s.name, ...(s.keywords ?? [])]);
    assert.ok(keywords.includes("User Research"), "extracted skill merged in");
  });
});

describe("runResumeParse — boundaries", () => {
  it("backfills ONLY the sections the one-pass result left empty, concurrently", async () => {
    // No name → incomplete; work + education + skills are present.
    const noName = { ...COMPLETE_ONE_PASS, basics: { name: "" } };
    const model = fakeModel({
      "one-pass": () => noName,
      "section:basics": () => ({ basics: { name: "Jess Rivera", email: "jess.rivera@example.com" } }),
      "section:certificates": () => ({ certificates: [] }),
      "section:awards": () => ({ awards: [] }),
      "section:volunteer": () => ({ volunteer: [] }),
      "section:projects": () => ({ projects: [] }),
    });

    const result = await runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null });

    const sections = model.calls.filter((c) => c.startsWith("section:")).sort();
    assert.deepEqual(sections, [
      "section:awards", "section:basics", "section:certificates", "section:projects", "section:volunteer",
    ]);
    assert.ok(model.peak() > 1, "backfill prompts run in parallel");
    assert.ok(model.peak() <= 4, "…but no more than the concurrency cap");
    assert.equal((result.basics as { name: string }).name, "Jess Rivera");
  });

  it("ships without a refinement that outlives its budget", async () => {
    const undated = {
      ...COMPLETE_ONE_PASS,
      work: [{ name: "Acme Health", position: "Senior Product Designer", startDate: "", endDate: "", highlights: [] }],
    };
    const model = fakeModel({
      "one-pass": () => undated,
      dates: () => new Promise(() => {}), // never settles
    });

    const started = Date.now();
    const result = await runResumeParse(
      RESUME_TEXT,
      { callAI: model.callAI, extractSkills: null },
      { refineBudgetMs: 50 },
    );

    assert.ok(Date.now() - started < 1_000, "returned on budget, not on the stuck call");
    assert.ok(model.calls.includes("dates"));
    assert.equal((result.work as Array<{ name: string }>)[0].name, "Acme Health");
  });

  it("fills missing dates from the rescan without overwriting present ones", async () => {
    const halfDated = {
      ...COMPLETE_ONE_PASS,
      work: [
        { name: "Acme Health", position: "Senior Product Designer", startDate: "2021-01", endDate: "", highlights: [] },
      ],
    };
    const model = fakeModel({
      "one-pass": () => halfDated,
      dates: () => ({ dates: [{ section: "work", index: 0, startDate: "1999-01", endDate: "Present" }] }),
    });

    const result = await runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null });
    const [role] = result.work as Array<{ startDate: string; endDate: string }>;
    assert.equal(role.startDate, "2021-01", "existing start date kept");
    assert.equal(role.endDate, "Present", "missing end date filled");
  });
});

function abortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

describe("runResumeParse — exceptions", () => {
  it("returns the regex pre-parse when every model call fails", async () => {
    const model = fakeModel({});

    const result = await runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null });

    assert.equal(model.calls[0], "one-pass");
    assert.equal(model.calls.filter((c) => c.startsWith("section:")).length, 8, "every section was tried");
    assert.ok(Object.keys(result).length > 0, "regex content, not an empty résumé");
  });

  it("does not backfill sections when the one-pass call is aborted", async () => {
    const model = fakeModel({
      "one-pass": async () => {
        throw abortError();
      },
    });

    await assert.rejects(
      () => runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null }),
      (err: unknown) => err instanceof Error && err.name === "AbortError",
    );
    assert.deepEqual(model.calls, ["one-pass"], "closed tab must not spend tokens on 8 section prompts");
  });

  it("stops section backfill when a section call is aborted", async () => {
    const model = fakeModel({
      "one-pass": async () => {
        throw new Error("gateway down");
      },
      "section:basics": async () => {
        throw abortError();
      },
      "section:work": async () => {
        throw abortError();
      },
      "section:education": async () => {
        throw abortError();
      },
      "section:skills": async () => {
        throw abortError();
      },
      "section:certificates": async () => {
        throw abortError();
      },
      "section:awards": async () => {
        throw abortError();
      },
      "section:volunteer": async () => {
        throw abortError();
      },
      "section:projects": async () => {
        throw abortError();
      },
    });

    await assert.rejects(
      () => runResumeParse(RESUME_TEXT, { callAI: model.callAI, extractSkills: null }),
      (err: unknown) => err instanceof Error && err.name === "AbortError",
    );
    const sections = model.calls.filter((c) => c.startsWith("section:"));
    assert.ok(sections.length < 8, `abort must not try every section (tried ${sections.length})`);
  });
});
