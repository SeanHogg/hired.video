/**
 * Unit tests for the Value Proposition wizard payload builders.
 *
 * The wizard has three input modes for the Job step (paste / file /
 * existing — plus URL extraction which is handled the same as paste once
 * the URL is fetched), three for the Resume step (existing / paste /
 * file), and a free-form Company step (name / mission / values). These
 * tests pin the request shape produced for each combination, plus the
 * tool-run record shape that's posted to /api/tool-runs.
 *
 * The bug that motivated this file: the Generate button raised a 500
 * because /api/tool-runs received a `jobId` for an existing posted job
 * but the route's ownership check referenced a non-existent column. The
 * tests below pin the contract on the *frontend* side — id-only when the
 * source is "existing", content-only otherwise — so the route's
 * ownership logic is only exercised on real existing-record IDs.
 */

import { describe, it, expect } from "vitest";
import {
  buildGenerateInput,
  buildRecordRunArgs,
  scaleConfidenceScore,
  type CompanyData,
  type JobData,
  type ResumeData,
} from "../value-proposition-payload";
import type { ValuePropositionResponse } from "@/lib/services/value-proposition-service";

const JOB_ID = "11111111-1111-1111-1111-111111111111";
const RESUME_ID = "22222222-2222-2222-2222-222222222222";
const JOB_TEXT = "Senior FE engineer at Acme. Stack: TS / React / GraphQL.";
const RESUME_TEXT = "8 years TS / React. Led platform team at Globex.";

const company: CompanyData = {
  name: "Acme",
  mission: "Make work meaningful",
  values: "Curiosity, ownership, kindness",
};

function jobOf(source: JobData["source"]): JobData {
  return source === "existing"
    ? { jobId: JOB_ID, source }
    : { jobContent: JOB_TEXT, source };
}

function resumeOf(source: ResumeData["source"]): ResumeData {
  return source === "existing"
    ? { resumeId: RESUME_ID, source }
    : { resumeContent: RESUME_TEXT, source };
}

const sampleResult: ValuePropositionResponse = {
  valueProposition: "Strong fit",
  executiveSummary: "Aligned",
  keyStrengths: ["a", "b"],
  alignmentPoints: ["x", "y"],
  callToAction: "Move forward",
  confidenceScore: 0.82,
};

describe("buildGenerateInput — Job × Resume input mode matrix", () => {
  // 4 job sources × 3 resume sources = 12 combinations. Each combination
  // must produce id-only OR content-only for each side, never both.

  const jobSources: JobData["source"][] = ["url", "paste", "file", "existing"];
  const resumeSources: ResumeData["source"][] = ["existing", "paste", "file"];

  for (const j of jobSources) {
    for (const r of resumeSources) {
      it(`job:${j} × resume:${r} → only the matching field is set`, () => {
        const input = buildGenerateInput(jobOf(j), resumeOf(r), company);

        if (j === "existing") {
          expect(input.jobId).toBe(JOB_ID);
          expect(input.jobContent).toBeUndefined();
        } else {
          expect(input.jobId).toBeUndefined();
          expect(input.jobContent).toBe(JOB_TEXT);
        }

        if (r === "existing") {
          expect(input.resumeId).toBe(RESUME_ID);
          expect(input.resumeContent).toBeUndefined();
        } else {
          expect(input.resumeId).toBeUndefined();
          expect(input.resumeContent).toBe(RESUME_TEXT);
        }
      });
    }
  }

  it("propagates every company field verbatim (name / mission / values)", () => {
    const input = buildGenerateInput(jobOf("existing"), resumeOf("existing"), company);
    expect(input.companyName).toBe("Acme");
    expect(input.companyMission).toBe("Make work meaningful");
    expect(input.companyValues).toBe("Curiosity, ownership, kindness");
  });

  it("leaves company fields undefined when the user submits an empty form", () => {
    const input = buildGenerateInput(jobOf("paste"), resumeOf("paste"), {});
    expect(input.companyName).toBeUndefined();
    expect(input.companyMission).toBeUndefined();
    expect(input.companyValues).toBeUndefined();
  });
});

describe("scaleConfidenceScore", () => {
  it("scales 0..1 → 0..100 with rounding", () => {
    expect(scaleConfidenceScore({ confidenceScore: 0.82 })).toBe(82);
    expect(scaleConfidenceScore({ confidenceScore: 0.005 })).toBe(1);
    expect(scaleConfidenceScore({ confidenceScore: 0 })).toBe(0);
    expect(scaleConfidenceScore({ confidenceScore: 1 })).toBe(100);
  });

  it("returns null when the response had no numeric score", () => {
    expect(scaleConfidenceScore({ confidenceScore: undefined as any })).toBeNull();
    expect(scaleConfidenceScore({ confidenceScore: null as any })).toBeNull();
  });
});

describe("buildRecordRunArgs — what gets posted to /api/tool-runs", () => {
  it("attaches jobId only for existing jobs (the route checks ownership against it)", () => {
    const args = buildRecordRunArgs(jobOf("existing"), resumeOf("paste"), sampleResult);
    expect(args.jobId).toBe(JOB_ID);
    expect(args.jobDescription).toBeUndefined();
  });

  it("attaches jobDescription (not jobId) when the job came from paste / url / file", () => {
    for (const src of ["paste", "url", "file"] as const) {
      const args = buildRecordRunArgs(jobOf(src), resumeOf("existing"), sampleResult);
      expect(args.jobId).toBeUndefined();
      expect(args.jobDescription).toBe(JOB_TEXT);
    }
  });

  it("attaches resumeId only for existing resumes", () => {
    const existing = buildRecordRunArgs(jobOf("paste"), resumeOf("existing"), sampleResult);
    expect(existing.resumeId).toBe(RESUME_ID);

    for (const src of ["paste", "file"] as const) {
      const args = buildRecordRunArgs(jobOf("paste"), resumeOf(src), sampleResult);
      expect(args.resumeId).toBeUndefined();
    }
  });

  it("formats the summary with the scaled confidence percentage", () => {
    const args = buildRecordRunArgs(jobOf("existing"), resumeOf("existing"), sampleResult);
    expect(args.score).toBe(82);
    expect(args.summary).toBe("Value proposition (confidence 82%)");
  });

  it("falls back to a generic summary when the result has no confidence score", () => {
    const args = buildRecordRunArgs(
      jobOf("paste"),
      resumeOf("paste"),
      { ...sampleResult, confidenceScore: undefined as any },
    );
    expect(args.score).toBeNull();
    expect(args.summary).toBe("Value proposition generated");
  });

  it("normalises the API response into NormalizedToolRunResult so history can render it", () => {
    const args = buildRecordRunArgs(jobOf("existing"), resumeOf("existing"), sampleResult);
    // The result is mapped into the shared shape the tool-run history
    // panel reads: `summary` / `strengths` / `recommendations` / `raw`.
    // The original payload is preserved on `raw` for round-trip use.
    expect(args.result).toEqual({
      overallScore: 82,
      summary: "Aligned",
      strengths: ["a", "b"],
      recommendations: [
        { title: "Value Proposition", description: "Strong fit" },
        { title: "Alignment", description: "x" },
        { title: "Alignment", description: "y" },
        { title: "Call to Action", description: "Move forward" },
      ],
      raw: sampleResult,
    });
  });
});
