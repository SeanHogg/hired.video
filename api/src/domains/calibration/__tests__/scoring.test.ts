import { describe, expect, it } from "vitest";
import { computeCalibrationDeltas } from "../scoring.js";
import type { CalibrationSubmissionRow } from "../../../repositories/calibrationRepository.js";

const sub = (
  applicationId: string,
  ratings: Record<string, number | null>,
  overrides: Partial<CalibrationSubmissionRow> = {},
): CalibrationSubmissionRow =>
  ({
    id: `${applicationId}-${Math.random()}`,
    sessionId: "s1",
    evaluatorUserId: "u1",
    applicationId,
    overallRecommendation: null,
    overallScore: null,
    ratings,
    notes: null,
    submittedAt: new Date(),
    ...overrides,
  }) as CalibrationSubmissionRow;

describe("computeCalibrationDeltas", () => {
  it("returns delta as the difference between calibration mean and real mean", () => {
    const result = computeCalibrationDeltas({
      candidates: ["app1"],
      calibrationSubmissions: [
        sub("app1", { "attr-tech": 4, "attr-comm": 3 }),
        sub("app1", { "attr-tech": 4, "attr-comm": 4 }),
      ],
      realRatingsByApplication: {
        app1: [
          { attributeId: "attr-tech", rating: 3 },
          { attributeId: "attr-tech", rating: 3 },
          { attributeId: "attr-comm", rating: 3 },
        ],
      },
    });
    const tech = result["app1"].find((r) => r.attributeId === "attr-tech")!;
    const comm = result["app1"].find((r) => r.attributeId === "attr-comm")!;
    expect(tech.calibrationMean).toBe(4);
    expect(tech.realMean).toBe(3);
    expect(tech.delta).toBe(1);
    expect(comm.calibrationMean).toBe(3.5);
    expect(comm.realMean).toBe(3);
    expect(comm.delta).toBe(0.5);
  });

  it("returns null delta when one side has no samples", () => {
    const result = computeCalibrationDeltas({
      candidates: ["app1"],
      calibrationSubmissions: [sub("app1", { "attr-tech": 4 })],
      realRatingsByApplication: { app1: [] },
    });
    expect(result["app1"][0].realMean).toBeNull();
    expect(result["app1"][0].delta).toBeNull();
  });

  it("filters null ratings out of the mean", () => {
    const result = computeCalibrationDeltas({
      candidates: ["app1"],
      calibrationSubmissions: [
        sub("app1", { "attr-tech": 4 }),
        sub("app1", { "attr-tech": null }),
        sub("app1", { "attr-tech": 2 }),
      ],
      realRatingsByApplication: {
        app1: [{ attributeId: "attr-tech", rating: 3 }],
      },
    });
    const row = result["app1"][0];
    expect(row.calibrationMean).toBe(3);
    expect(row.calibrationSamples).toBe(2);
  });

  it("handles multiple candidates independently", () => {
    const result = computeCalibrationDeltas({
      candidates: ["app1", "app2"],
      calibrationSubmissions: [
        sub("app1", { "attr-tech": 5 }),
        sub("app2", { "attr-tech": 1 }),
      ],
      realRatingsByApplication: {
        app1: [{ attributeId: "attr-tech", rating: 3 }],
        app2: [{ attributeId: "attr-tech", rating: 4 }],
      },
    });
    expect(result["app1"][0].delta).toBe(2);
    expect(result["app2"][0].delta).toBe(-3);
  });
});
