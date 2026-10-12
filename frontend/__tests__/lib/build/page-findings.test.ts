/**
 * Page findings — the latest scoring runs' findings anchored to the exact
 * lines of the draft they criticise: a Roast rewrite whose `original` is a
 * truncated prefix of a bullet anchors the whole bullet; a quote inside a
 * longer summary anchors just its sentence (and the rewrite replaces only
 * that); scorer quotes match across case / whitespace / smart quotes; a
 * missing email is flagged only when a run says so and the page has none;
 * anything that can't be anchored is dropped; a stale rewrite never writes.
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { applyFindingRewrite, locateQuote, pageFindings } from "@/lib/build/page-findings";
import type { ToolRun } from "@/lib/build/use-tool-runs";

const SUMMARY =
  "Strategic business partner and hands-on technology executive with 20+ years of experience generating business value, agility, innovation, and transformation. Led IT for inspection, education and SaaS businesses.";
const QA_BULLET = "Revamped Quality Assurance (Full Test Management, Continuous Testing with API Automation).";
const LEADERSHIP_BULLET = "Revamped IT Leadership (structured meetings, action items, OKRs, Revenue Ops focus).";

function resume(overrides: { email?: string } = {}): ResumeContent {
  return ResumeContentSchema.parse({
    basics: {
      name: "Sean Hogg",
      label: "Director Engineering / CIO / CTO",
      email: overrides.email ?? "",
      url: "https://hirefractionaltalent.com/free",
      summary: SUMMARY,
    },
    work: [
      {
        id: "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c",
        name: "Alliance Inspection Management (AiM)",
        position: "VP of Technology / CIO (Interim)",
        startDate: "2021-07",
        highlights: [
          "20% reduction in YoY operating costs ($1.79M) by modernizing IT processes and renegotiating contracts.",
          "90% reduction in attrition by establishing a people-first performance culture.",
          QA_BULLET,
          LEADERSHIP_BULLET,
        ],
      },
      {
        id: "seed-work-cnb-2019",
        name: "Career Now Brands (CNB)",
        position: "EVP Product & Technology",
        highlights: ["Increased annual project completion rate by over 175% while reducing operating costs from $4M to $1.7M."],
      },
    ],
  });
}

let nextId = 1;
function done(toolId: string, raw: unknown, at = nextId): ToolRun {
  const id = nextId++;
  return { id, at, toolId, status: "done", result: { raw } };
}

const roast = (raw: Partial<{ improvedExamples: unknown; weaknesses: unknown; fixes: unknown }>) =>
  done("resume-roast", { score: 61, strengths: [], weaknesses: [], roast: "…", fixes: [], improvedExamples: [], ...raw });

describe("pageFindings — Roast rewrites", () => {
  it("anchors a truncated original to the whole bullet it prefixes, and applying replaces that bullet", () => {
    const content = resume();
    const improved = "Cut escaped defects 40% by standing up continuous API test automation.";
    const findings = pageFindings(
      [roast({ improvedExamples: [{ original: "Revamped Quality Assurance (Full Test Management…)", improved }] })],
      content,
    );
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f).toMatchObject({ source: "roast", kind: "rewrite", labelKey: "build.findings.flag.roastRewrite" });
    expect(f.anchor).toMatchObject({
      path: "work.0.highlights.2",
      section: "work",
      itemId: "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c",
      field: "highlights",
      start: 0,
      end: QA_BULLET.length,
    });
    expect(f.rewrite).toEqual({ before: QA_BULLET, after: improved });

    const next = applyFindingRewrite(content, f);
    expect(next?.work?.[0].highlights[2]).toBe(improved);
    expect(next?.work?.[0].highlights[3]).toBe(LEADERSHIP_BULLET);
    expect(content.work?.[0].highlights[2]).toBe(QA_BULLET); // input untouched
  });

  it("anchors a quote inside the summary to its sentence and rewrites only that sentence", () => {
    const content = resume();
    const original = "strategic  business partner and hands-on technology executive with 20+ years of experience…";
    const improved = "Technology executive who cut IT operating cost 20% ($1.79M) while lifting delivery 57%→85%.";
    const [f] = pageFindings([roast({ improvedExamples: [{ original, improved }] })], content);
    expect(f.anchor.path).toBe("basics.summary");
    expect(f.rewrite?.before).toBe(SUMMARY.slice(0, SUMMARY.indexOf(".") + 1));

    const next = applyFindingRewrite(content, f);
    expect(next?.basics?.summary).toBe(`${improved} Led IT for inspection, education and SaaS businesses.`);
  });

  it("does not double the full stop when the quote leaves it off", () => {
    const content = resume();
    const [f] = pageFindings(
      [roast({ improvedExamples: [{ original: "Revamped IT Leadership (structured meetings, action items, OKRs, Revenue Ops focus)", improved: "Installed an OKR cadence across IT and Revenue Ops." }] })],
      content,
    );
    expect(f.anchor).toMatchObject({ path: "work.0.highlights.3", start: 0, end: LEADERSHIP_BULLET.length });
    expect(applyFindingRewrite(content, f)?.work?.[0].highlights[3]).toBe("Installed an OKR cadence across IT and Revenue Ops.");
  });

  it("drops a bullet marker the model put in front of the rewrite", () => {
    const [f] = pageFindings([roast({ improvedExamples: [{ original: QA_BULLET, improved: "• Cut escaped defects 40%." }] })], resume());
    expect(f.rewrite?.after).toBe("Cut escaped defects 40%.");
  });

  it("applies the visitor's edit of the rewrite instead of the suggestion", () => {
    const content = resume();
    const [f] = pageFindings([roast({ improvedExamples: [{ original: QA_BULLET, improved: "Suggested rewrite." }] })], content);
    expect(applyFindingRewrite(content, f, "  My own wording.  ")?.work?.[0].highlights[2]).toBe("My own wording.");
  });

  it("refuses an empty edit", () => {
    const content = resume();
    const [f] = pageFindings([roast({ improvedExamples: [{ original: QA_BULLET, improved: "Suggested rewrite." }] })], content);
    expect(applyFindingRewrite(content, f, "   ")).toBeNull();
  });

  it("keeps one rewrite per line", () => {
    const findings = pageFindings(
      [
        roast({
          improvedExamples: [
            { original: QA_BULLET, improved: "First rewrite." },
            { original: "Revamped Quality Assurance (Full Test", improved: "Second rewrite." },
          ],
        }),
      ],
      resume(),
    );
    expect(findings.filter((f) => f.kind === "rewrite")).toHaveLength(1);
    expect(findings[0].rewrite?.after).toBe("First rewrite.");
  });
});

describe("pageFindings — scorer / optimizer recommendations", () => {
  it("anchors a quoted phrase across case, whitespace and smart quotes, with its severity and category", () => {
    const findings = pageFindings(
      [
        done("ai-resume-scorer", {
          overallScore: 71,
          recommendations: [
            {
              severity: "important",
              category: "ats",
              title: "Swap weak verbs",
              description: "Lines like “revamped IT   leadership (structured meetings” read as filler to ATS.",
            },
          ],
        }),
      ],
      resume(),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      source: "scorer",
      kind: "issue",
      severity: "important",
      labelKey: "build.findings.flag.ats",
      anchor: { path: "work.0.highlights.3", field: "highlights" },
    });
    expect(findings[0].title).toContain("Swap weak verbs");
    expect(findings[0].rewrite).toBeUndefined();
  });

  it("falls back to minor + the Tip label for an unknown severity / category", () => {
    const [f] = pageFindings(
      [done("resume-optimizer", { recommendations: [{ severity: "urgent", category: "vibes", title: 'Quantify "90% reduction in attrition"' }] })],
      resume(),
    );
    expect(f).toMatchObject({ source: "optimizer", severity: "minor", labelKey: "build.findings.flag.tip", anchor: { path: "work.0.highlights.1" } });
  });
});

describe("pageFindings — missing contact fields", () => {
  const scorer = () => done("ai-resume-scorer", { weaknesses: ["No contact email anywhere on the page."], recommendations: [] });

  it("flags a missing email on the header when a run says so", () => {
    const findings = pageFindings([scorer()], resume());
    expect(findings).toEqual([
      expect.objectContaining({
        kind: "missing",
        severity: "critical",
        labelKey: "build.findings.flag.addEmail",
        anchor: expect.objectContaining({ path: "basics", field: "email", text: "" }),
      }),
    ]);
  });

  it("says nothing when the email is there", () => {
    expect(pageFindings([scorer()], resume({ email: "sean@example.com" }))).toEqual([]);
  });
});

describe("pageFindings — boundaries and no-match", () => {
  it("drops findings that can't be anchored", () => {
    const findings = pageFindings(
      [
        roast({
          improvedExamples: [{ original: "Managed a team of 400 engineers across four continents.", improved: "x" }],
          weaknesses: ["The summary is generic.", 'Too short: "Led"'],
        }),
      ],
      resume(),
    );
    expect(findings).toEqual([]);
  });

  it("ignores running / failed runs, non-scoring tools and unshaped results", () => {
    const runs: ToolRun[] = [
      { id: 900, at: 1, toolId: "resume-roast", status: "running" },
      { id: 901, at: 2, toolId: "resume-roast", status: "failed", message: null },
      done("summarize-resume", { weaknesses: [`"${QA_BULLET}"`] }),
      done("ai-resume-scorer", "not an object"),
    ];
    expect(pageFindings(runs, resume())).toEqual([]);
    expect(pageFindings([], resume())).toEqual([]);
  });

  it("uses only the latest finished run of each tool", () => {
    const older = roast({ improvedExamples: [{ original: QA_BULLET, improved: "Old rewrite." }] });
    const newer = roast({ improvedExamples: [{ original: LEADERSHIP_BULLET, improved: "New rewrite." }] });
    const findings = pageFindings([older, newer], resume());
    expect(findings.map((f) => f.anchor.path)).toEqual(["work.0.highlights.3"]);
    expect(findings[0].id).toBe(`${newer.id}:0`);
  });

  it("never applies a rewrite to a line that changed since", () => {
    const content = resume();
    const [f] = pageFindings([roast({ improvedExamples: [{ original: QA_BULLET, improved: "Rewrite." }] })], content);
    const edited = structuredClone(content);
    edited.work![0].highlights[2] = "Built a QA function from scratch.";
    expect(applyFindingRewrite(edited, f)).toBeNull();
  });

  it("locateQuote rejects quotes below the minimum length", () => {
    expect(locateQuote(resume(), "Revamped", 12)).toBeNull();
    expect(locateQuote(resume(), "Revamped")?.field.path).toBe("work.0.highlights.2");
  });
});

describe("pageFindings — the analyzer's structured actions (#374 / #2344)", () => {
  it("turns an apply_resume_rewrite action into a rewrite the page can Apply in place", () => {
    const content = resume();
    const [f] = pageFindings(
      [
        done("ai-resume-scorer", {
          recommendations: [
            {
              severity: "critical",
              category: "impact",
              title: "Lead with the outcome",
              description: "The QA bullet lists activities.",
              actionId: "apply_resume_rewrite",
              actionArgs: { original: QA_BULLET, improved: "Cut escaped defects 60% by building test management and API automation." },
            },
          ],
        }),
      ],
      content,
    );
    expect(f).toMatchObject({
      kind: "rewrite",
      severity: "critical",
      labelKey: "build.findings.flag.impact",
      rewrite: { before: QA_BULLET, after: "Cut escaped defects 60% by building test management and API automation." },
      anchor: { path: "work.0.highlights.2" },
    });
    expect(f.action).toBeUndefined();
    expect(applyFindingRewrite(content, f)?.work?.[0].highlights[2]).toBe(
      "Cut escaped defects 60% by building test management and API automation.",
    );
  });

  it("anchors a wand action by its quoted line (no prose quote needed) and carries the wand", () => {
    const [f] = pageFindings(
      [
        done("resume-optimizer", {
          recommendations: [
            {
              severity: "important",
              category: "impact",
              title: "Add a metric",
              description: "This bullet has no measurable result.",
              actionId: "add_bullet_metric",
              actionArgs: { original: LEADERSHIP_BULLET },
            },
          ],
        }),
      ],
      resume(),
    );
    expect(f).toMatchObject({ kind: "issue", anchor: { path: "work.0.highlights.3" } });
    expect(f.action).toEqual({
      toolId: "add_bullet_metric",
      labelKey: "wands.action.add_bullet_metric",
      args: { original: LEADERSHIP_BULLET },
    });
  });

  it("ignores an invalid action and falls back to the prose quote", () => {
    const [f] = pageFindings(
      [
        done("ai-resume-scorer", {
          recommendations: [
            {
              severity: "minor",
              category: "content",
              title: 'Quantify "90% reduction in attrition"',
              description: "",
              actionId: "make_it_pop",
              actionArgs: { original: "x" },
            },
          ],
        }),
      ],
      resume(),
    );
    expect(f).toMatchObject({ kind: "issue", anchor: { path: "work.0.highlights.1" } });
    expect(f.action).toBeUndefined();
  });

  it("drops a rewrite action whose line is not on the page", () => {
    const findings = pageFindings(
      [
        done("ai-resume-scorer", {
          recommendations: [
            {
              severity: "important",
              category: "content",
              title: "Rewrite",
              description: "",
              actionId: "apply_resume_rewrite",
              actionArgs: { original: "A bullet this résumé never had.", improved: "Something else entirely." },
            },
          ],
        }),
      ],
      resume(),
    );
    expect(findings).toEqual([]);
  });
});
