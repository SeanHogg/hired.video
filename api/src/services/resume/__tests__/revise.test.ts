/**
 * reviseResumeContent tests — the /build chat's in-place edit.
 *
 * Happy path (a punchier summary comes back and is kept), the guard rails
 * that hold whatever the model returns (name / contact / employers / dates are
 * restored; a dropped section comes back), and the exceptions (empty or
 * oversized instruction, the AI call throwing, a non-JSON reply). The fixture
 * mirrors a real parsed résumé (ids on work items, a current role with no
 * endDate, part-time employment).
 *
 * Run: node --import tsx --test src/services/resume/__tests__/revise.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  changedAreas,
  keepUnrequestedRemovals,
  parseReviseFocus,
  preserveIdentity,
  reviseResumeContent,
  REVISE_INSTRUCTION_MAX,
} from "../revise.js";

const RESUME = {
  basics: {
    name: "Sean Hogg",
    label: "CTO and Technology Leader",
    email: "sean@example.com",
    phone: "2485550176",
    url: "https://hired.video",
    summary: "CTO and Technology Leader with 25 years of experience driving business value.",
  },
  work: [
    {
      id: "7f1c2d9e-0000-4000-8000-000000000001",
      name: "BuilderForce.ai",
      position: "Chief Innovation Officer",
      startDate: "2025-12",
      employmentType: "part_time",
      highlights: ["Built an agentic coding platform used by 40 teams"],
    },
    {
      id: "7f1c2d9e-0000-4000-8000-000000000002",
      name: "OnTheClock",
      position: "Site Reliability / DevOps",
      startDate: "2024-04",
      endDate: "2024-11",
      highlights: ["Increased team size from 60 to 75"],
    },
  ],
  education: [],
  skills: [{ name: "Leadership", keywords: ["Strategy"] }],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("reviseResumeContent — happy path", () => {
  it("applies the model's rewrite and returns healed content", async () => {
    const revised = clone(RESUME);
    revised.basics.summary = "25 years turning technology into business results.";
    const result = await reviseResumeContent(RESUME, "make the summary punchier", async () =>
      JSON.stringify(revised),
    );
    assert.equal(result.ok, true);
    const content = (result as { ok: true; content: Record<string, any> }).content;
    assert.equal(content.basics.summary, "25 years turning technology into business results.");
  });

  it("sends the instruction and the current resume to the model", async () => {
    let seen = "";
    await reviseResumeContent(RESUME, "fit it on one page", async (_system, user) => {
      seen = user;
      return JSON.stringify(RESUME);
    });
    assert.match(seen, /fit it on one page/);
    assert.match(seen, /BuilderForce\.ai/);
  });
});

describe("reviseResumeContent — guard rails hold whatever the model returns", () => {
  it("restores name, contact details, employers and dates the model changed", async () => {
    const tampered = clone(RESUME) as Record<string, any>;
    tampered.basics.name = "S. Hogg";
    tampered.basics.email = "other@example.com";
    tampered.work[0].name = "Acme Corp";
    tampered.work[1].startDate = "2019-01";
    tampered.work[1].highlights = ["Grew the team from 60 to 75 people"];
    const result = await reviseResumeContent(RESUME, "tighten the bullets", async () => JSON.stringify(tampered));
    assert.equal(result.ok, true);
    const content = (result as { ok: true; content: Record<string, any> }).content;
    assert.equal(content.basics.name, "Sean Hogg");
    assert.equal(content.basics.email, "sean@example.com");
    assert.equal(content.work[0].name, "BuilderForce.ai");
    assert.equal(content.work[1].startDate, "2024-04");
    // The wording change the model was allowed to make survives.
    assert.deepEqual(content.work[1].highlights, ["Grew the team from 60 to 75 people"]);
  });

  it("brings back a section the model dropped", () => {
    const { skills: _dropped, ...withoutSkills } = clone(RESUME);
    const out = preserveIdentity(clone(RESUME), withoutSkills);
    assert.deepEqual(out.skills, RESUME.skills);
  });

  it("keeps work item ids so skill evidence stays bound", () => {
    const noIds = clone(RESUME) as Record<string, any>;
    for (const w of noIds.work) delete w.id;
    const out = preserveIdentity(clone(RESUME), noIds) as Record<string, any>;
    assert.equal(out.work[0].id, RESUME.work[0].id);
  });
});

describe("reviseResumeContent — exceptions", () => {
  it("rejects an empty instruction without calling the model", async () => {
    let called = false;
    const result = await reviseResumeContent(RESUME, "   ", async () => {
      called = true;
      return "{}";
    });
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "INVALID_INSTRUCTION");
    assert.equal(called, false);
  });

  it("rejects an instruction over the length cap", async () => {
    const result = await reviseResumeContent(RESUME, "x".repeat(REVISE_INSTRUCTION_MAX + 1), async () => "{}");
    assert.equal((result as { code: string }).code, "INVALID_INSTRUCTION");
  });

  it("reports AI_FAILED when the model call throws (gateway down, no fallback)", async () => {
    const result = await reviseResumeContent(RESUME, "make it punchier", async () => {
      throw new Error("Invalid or revoked tenant API key");
    });
    assert.equal((result as { code: string }).code, "AI_FAILED");
  });

  it("reports INVALID_OUTPUT when the reply is not JSON", async () => {
    const result = await reviseResumeContent(RESUME, "make it punchier", async () => "Sure! Here's a punchier resume.");
    assert.equal((result as { code: string }).code, "INVALID_OUTPUT");
  });
});

describe("reviseResumeContent — questions are answered, not applied", () => {
  it("returns the model's reply and no content when asked a question", async () => {
    const result = await reviseResumeContent(RESUME, 'how did you determine I "have a career break"?', async () =>
      JSON.stringify({ reply: "There's a 12-month gap between OnTheClock (Nov 2024) and BuilderForce.ai (Dec 2025)." }),
    );
    assert.deepEqual(result, {
      ok: true,
      reply: "There's a 12-month gap between OnTheClock (Nov 2024) and BuilderForce.ai (Dec 2025).",
    });
  });

  it("grounds the model in the workspace's reading — the gap and the rule behind it", async () => {
    // A long career before the break, so the pattern isn't early-career.
    const career = clone(RESUME) as Record<string, any>;
    career.work.push({
      id: "7f1c2d9e-0000-4000-8000-000000000003",
      name: "Ally Financial",
      position: "Chief Technology Officer",
      startDate: "2005-01",
      endDate: "2024-03",
      highlights: [],
    });
    let seen = "";
    await reviseResumeContent(career, "why skills-first?", async (_system, user) => {
      seen = user;
      return JSON.stringify({ reply: "ok" });
    });
    assert.match(seen, /Career pattern: gaps/);
    assert.match(seen, /Longest gap between dated roles: 12 months, with no dated role from 2024-12 to 2025-11/);
    assert.match(seen, /more than 9 months/);
    assert.match(seen, /Recommended structure: functional/);
  });

  it("treats a blank reply as an invalid output, not an answer", async () => {
    const result = await reviseResumeContent(RESUME, "why?", async () => JSON.stringify({ reply: "  " }));
    assert.equal(result.ok, false);
  });

  it("accepts a plain-text answer", async () => {
    const result = await reviseResumeContent(RESUME, "why skills-first?", async () => "Because of the 12-month gap.");
    assert.deepEqual(result, { ok: true, reply: "Because of the 12-month gap." });
  });

  it("never applies an edit to a question, even when the model returns a resume", async () => {
    // The prod failure: a question came back as a resume with the summary gone.
    const edited = clone(RESUME) as Record<string, any>;
    edited.basics.summary = "";
    let system = "";
    const result = await reviseResumeContent(
      RESUME,
      'how did you determine that this user "has a career break"?',
      async (s) => {
        system = s;
        return JSON.stringify(edited);
      },
    );
    assert.equal(result.ok, false);
    assert.equal("content" in result, false);
    assert.match(system, /cannot change the resume/);
  });
});

describe("reviseResumeContent — edits never lose what wasn't asked for", () => {
  it("puts back a summary and headline the model emptied", async () => {
    const edited = clone(RESUME) as Record<string, any>;
    edited.basics.summary = "";
    delete edited.basics.label;
    edited.work[1].highlights = ["Grew the team from 60 to 75 people"];
    const result = await reviseResumeContent(RESUME, "tighten the bullets", async () => JSON.stringify(edited));
    assert.equal(result.ok, true);
    const ok = result as { ok: true; content: Record<string, any>; changed: string[] };
    assert.equal(ok.content.basics.summary, RESUME.basics.summary);
    assert.equal(ok.content.basics.label, RESUME.basics.label);
    assert.deepEqual(ok.changed, ["work"]);
  });

  it("removes the summary when that is what was asked", () => {
    const edited = clone(RESUME) as Record<string, any>;
    edited.basics.summary = "";
    const out = keepUnrequestedRemovals(clone(RESUME), edited, "remove the summary") as Record<string, any>;
    assert.equal(out.basics.summary, "");
  });

  it("reports the areas a revision changed", () => {
    const edited = clone(RESUME) as Record<string, any>;
    edited.basics.label = "CTO";
    edited.skills = [{ name: "Leadership", keywords: ["Strategy", "Hiring"] }];
    assert.deepEqual(changedAreas(clone(RESUME), edited), ["headline", "skills"]);
    assert.deepEqual(changedAreas(clone(RESUME), clone(RESUME)), []);
  });
});

describe("reviseResumeContent — the video plan (meta.video)", () => {
  const WITH_PLAN = { ...clone(RESUME), meta: { template: "hired-default", video: { scenes: { skills: { off: true } } } } };

  it("applies a valid plan change and reports it as a video change", async () => {
    const edited = clone(WITH_PLAN) as Record<string, any>;
    edited.meta.video = { scenes: { skills: { off: true }, proof: { duration: 5 } } };
    const result = await reviseResumeContent(WITH_PLAN, "make the proof scene shorter", async () => JSON.stringify(edited), {
      view: "video",
      scene: "proof",
    });
    const ok = result as { ok: true; content: Record<string, any>; changed: string[] };
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.content.meta.video, { scenes: { skills: { off: true }, proof: { duration: 5 } } });
    assert.deepEqual(ok.changed, ["video"]);
  });

  it("keeps the plan when the model omits it, and keeps other metadata whatever it sends", () => {
    const revised = clone(RESUME) as Record<string, any>;
    revised.meta = { template: "something-else" };
    const out = preserveIdentity(clone(WITH_PLAN), revised) as Record<string, any>;
    assert.equal(out.meta.template, "hired-default");
    assert.deepEqual(out.meta.video, WITH_PLAN.meta.video);
  });

  it("rejects an invalid plan (out-of-range length) and keeps the old one", () => {
    const revised = clone(WITH_PLAN) as Record<string, any>;
    revised.meta.video = { scenes: { proof: { duration: 90 } } };
    const out = preserveIdentity(clone(WITH_PLAN), revised) as Record<string, any>;
    assert.deepEqual(out.meta.video, WITH_PLAN.meta.video);
  });

  it("tells the model what the owner is looking at and sends the current plan", async () => {
    let seen = "";
    await reviseResumeContent(WITH_PLAN, "make it shorter", async (_s, user) => {
      seen = user;
      return JSON.stringify(WITH_PLAN);
    }, { view: "video", scene: "proof" });
    assert.match(seen, /looking at the video, scene "proof"/);
    assert.match(seen, /Current video plan \(meta\.video\):\n\{"scenes":\{"skills":\{"off":true\}\}\}/);
  });

  it("hands the focused scene's director's notes to the model and keeps the owner's look", async () => {
    const DIRECTED = {
      ...clone(RESUME),
      meta: { video: { scenes: { proof: { notes: "Lead with the 30-engineer team.", background: "solid:#0f172a" } }, export: { fps: 24 } } },
    };
    let seen = "";
    const result = await reviseResumeContent(DIRECTED, "rewrite this", async (_s, user) => {
      seen = user;
      // The model rewrites the wording but drops the notes and swaps the look.
      return JSON.stringify({ ...clone(RESUME), meta: { video: { scenes: { proof: { title: "Built a 30-engineer team", background: "solid:#ffffff" } } } } });
    }, { view: "video", scene: "proof" });
    assert.match(seen, /director's notes for this scene: "Lead with the 30-engineer team\."/);
    const ok = result as { ok: true; content: Record<string, any> };
    assert.deepEqual(ok.content.meta.video, {
      scenes: { proof: { title: "Built a 30-engineer team", notes: "Lead with the 30-engineer team.", background: "solid:#0f172a" } },
      export: { fps: 24 },
    });
  });

  it("ignores an invalid focus", () => {
    assert.equal(parseReviseFocus({ view: "video", scene: "resume" }), undefined);
    assert.deepEqual(parseReviseFocus({ view: "page" }), { view: "page" });
  });
});

describe("reviseResumeContent — the model always reads the whole résumé", () => {
  // A real résumé carries hundreds of skill-evidence rows — far more than the
  // model's budget. They used to be sent and then sliced, cutting the résumé
  // off mid-education; the model then (rightly) refused to edit it.
  const EVIDENCE = Array.from({ length: 400 }, (_, i) => ({
    id: `e1a2b3c4-0000-4000-8000-${String(i).padStart(12, "0")}`,
    skillName: "Management",
    itemType: "work",
    referenceId: "7f1c2d9e-0000-4000-8000-000000000001",
    source: "derived",
    createdAt: "2026-05-03T13:29:37.836Z",
  }));
  const BIG = {
    ...clone(RESUME),
    education: [
      {
        id: "732ba8e0-926d-49ef-a96a-6c1d86221491",
        institution: "University of Windsor",
        area: "Computer Science",
        studyType: "Bachelor of Science (BSc)",
        startDate: "01/1999",
        endDate: "12/2004",
      },
    ],
    skillEvidence: EVIDENCE,
    meta: { template: "executive-taupe", video: { scenes: { skills: { off: true } } } },
  };

  it("sends every section, never the workspace bookkeeping, and never cuts the JSON", async () => {
    let seen = "";
    await reviseResumeContent(BIG, "sharpen the summary", async (_s, user) => {
      seen = user;
      return JSON.stringify(BIG);
    });
    const json = seen.slice(seen.indexOf("Current resume JSON:\n") + "Current resume JSON:\n".length);
    const sent = JSON.parse(json) as Record<string, unknown>;
    assert.equal(sent.skillEvidence, undefined);
    assert.equal(sent.meta, undefined);
    assert.equal((sent.education as Array<{ institution: string }>)[0].institution, "University of Windsor");
  });

  it("keeps skill evidence and metadata the model never saw", async () => {
    const edited = clone(BIG) as Record<string, any>;
    delete edited.skillEvidence;
    delete edited.meta;
    edited.basics.summary = "Technology executive who cut IT operating cost 43%.";
    const result = await reviseResumeContent(BIG, "sharpen the summary", async () => JSON.stringify(edited));
    const ok = result as { ok: true; content: Record<string, any> };
    assert.equal(ok.content.skillEvidence.length, EVIDENCE.length);
    assert.equal(ok.content.meta.template, "executive-taupe");
    assert.equal(ok.content.basics.summary, "Technology executive who cut IT operating cost 43%.");
  });

  it("applies a video-only reply and leaves the résumé exactly as it was", async () => {
    const plan = { scenes: { skills: { off: true }, hook: { title: "Sean Hogg, Technology Executive" } } };
    const result = await reviseResumeContent(
      BIG,
      "rewrite the opening scene",
      async () => JSON.stringify({ meta: { video: plan } }),
      { view: "video", scene: "hook" },
    );
    const ok = result as { ok: true; content: Record<string, any>; changed: string[] };
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.content.meta.video, plan);
    assert.equal(ok.content.basics.label, RESUME.basics.label);
    assert.equal(ok.content.basics.summary, RESUME.basics.summary);
    assert.deepEqual(
      ok.content.work.map((w: { highlights: string[] }) => w.highlights),
      RESUME.work.map((w) => w.highlights),
    );
    assert.deepEqual(ok.changed, ["video"]);
  });
});
