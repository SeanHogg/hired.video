import { describe, expect, it } from "vitest";
import { ResumeContentSchema } from "@shared/resume";
import { resumeMomentDates } from "../resume-moment-dates";

const resume = (work: object[], education: object[] = []) => ResumeContentSchema.parse({ basics: { name: "Dana Okafor" }, work, education });

describe("resumeMomentDates", () => {
  it("reads the current job start and the latest graduation", () => {
    const d = resumeMomentDates(
      resume(
        [
          { name: "Beaumont", position: "Nurse", startDate: "2014-03", endDate: "2021-12" },
          { name: "Hinge Health", position: "Designer", startDate: "2022-01-10" },
        ],
        [{ institution: "Wayne State", endDate: "2013-05" }, { institution: "MSU", endDate: "2021-05-15" }],
      ),
    );
    expect(d.currentJobStart).toBe("2022-01-10");
    expect(d.latestGraduation).toBe("2021-05-15");
  });
  it("finds a current school role and military service", () => {
    const d = resumeMomentDates(
      resume([
        { name: "Grand Rapids Public Schools", position: "Middle-school science teacher", startDate: "2019-08" },
        { name: "U.S. Army", position: "Signal officer", startDate: "2010-01", endDate: "2014-01" },
      ]),
    );
    expect(d.schoolRole).toBe(true);
    expect(d.veteran).toBe(true);
  });
  it("never reads a fact into a lookalike word", () => {
    const d = resumeMomentDates(
      resume([
        { name: "Acme", position: "Principal Engineer", startDate: "2020-01" },
        { name: "Navy Federal Credit Union", position: "Analyst", startDate: "2016-01", endDate: "2019-12" },
      ]),
    );
    expect(d.schoolRole).toBe(false);
    expect(d.veteran).toBe(false);
  });
});
