/**
 * #1915 — the job document carries every field the retired JobCreatePage
 * form wrote, and the AI coach's `apply_job_draft` fields land on it.
 */
import { describe, expect, it } from "vitest";
import { JobStatus, WorkSetting } from "@/lib/constants/enums";
import {
  contentToCreateJob,
  contentToUpdateJob,
  emptyJobContent,
  jobItemToContent,
  toEmploymentTypes,
  toSeniorities,
} from "../job-content";
import { applyJobDraftField, jobContentToDraftValues } from "../job-draft-fields";

// Shaped like GET /api/Job/:id (rowToJob) for an active hybrid posting.
const JOB_DTO = {
  id: "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d",
  title: "Staff Product Manager",
  company: "Northwind Labs",
  location: "Toronto, ON",
  description: "Own merchant onboarding end to end.",
  employmentType: "contract-to-hire",
  experienceLevel: "senior",
  salaryMin: 170000,
  salaryMax: 210000,
  salaryCurrency: "CAD",
  workSetting: "hybrid",
  onsiteDaysPerWeek: 2,
  remoteDaysPerWeek: 3,
  sector: "tech",
  responsibilities: ["Own the onboarding funnel"],
  requirements: ["6+ years in B2B product"],
  applyUrl: "https://careers.example.com/staff-pm",
  videoProjectId: "9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b",
  isActive: true,
};

describe("job content — the create form's fields", () => {
  it("reads every field, incl. the DTO's string work setting and its active state", () => {
    const c = jobItemToContent(JOB_DTO);
    expect(c).toMatchObject({
      company: "Northwind Labs",
      location: "Toronto, ON",
      salary: 170000,
      salaryMax: 210000,
      currency: "CAD",
      sector: "tech",
      workSetting: WorkSetting.Hybrid,
      onsiteDaysPerWeek: 2,
      remoteDaysPerWeek: 3,
      employmentType: ["contract-to-hire"],
      seniority: ["senior"],
      videoProjectId: JOB_DTO.videoProjectId,
      // An active posting reads as Open — a save never unpublishes it.
      status: JobStatus.Open,
    });
  });

  it("keeps contract-to-hire and the exec types as their own values; legacy numbers still read", () => {
    expect(toEmploymentTypes(["FullTime", "ContractToHire", "BoardSeat", "Fractional", "Advisor", "Interim"])).toEqual([
      "full-time",
      "contract-to-hire",
      "board-seat",
      "fractional",
      "advisor",
      "interim",
    ]);
    expect(toEmploymentTypes([0, 2])).toEqual(["full-time", "contract"]);
    expect(toSeniorities(["Mid", "LeadExecutive", "None", "mid"])).toEqual(["mid", "lead"]);
  });

  it("writes them back, sending the day split only for a hybrid role", () => {
    const hybrid = contentToUpdateJob(jobItemToContent(JOB_DTO));
    expect(hybrid).toMatchObject({
      company: "Northwind Labs",
      salaryMin: 170000,
      salaryMax: 210000,
      currency: "CAD",
      sector: "tech",
      workSetting: "Hybrid",
      onsiteDaysPerWeek: 2,
      employmentType: ["contract-to-hire"],
      seniority: ["senior"],
      status: "Open",
      videoProjectId: JOB_DTO.videoProjectId,
    });
    const remote = contentToUpdateJob({ ...jobItemToContent(JOB_DTO), workSetting: WorkSetting.Remote });
    expect(remote.onsiteDaysPerWeek).toBeUndefined();
    expect(remote.remoteDaysPerWeek).toBeUndefined();
    // Clearing the attached video sends null; never-loaded leaves it alone.
    expect(contentToUpdateJob({ ...jobItemToContent(JOB_DTO), videoProjectId: "" }).videoProjectId).toBeNull();
    expect(contentToUpdateJob({ ...jobItemToContent(JOB_DTO), videoProjectId: undefined }).videoProjectId).toBeUndefined();
  });

  it("an empty draft sends no blank company / sector / seniority (boundary)", () => {
    const update = contentToUpdateJob(emptyJobContent());
    expect(update.company).toBeUndefined();
    expect(update.sector).toBeUndefined();
    expect(update.currency).toBeUndefined();
    expect(update.seniority).toBeUndefined();
  });

  it("the first save carries every field and stays a Draft", () => {
    expect(contentToCreateJob({ ...jobItemToContent({}), title: "Staff PM", company: "Northwind Labs" })).toMatchObject({
      title: "Staff PM",
      company: "Northwind Labs",
      status: "Draft",
      employmentType: ["full-time"],
    });
  });
});

describe("apply_job_draft → the job document", () => {
  it("maps the coach's form vocabulary onto the canvas content", () => {
    let c = emptyJobContent();
    c = applyJobDraftField(c, "title", "Senior AI Engineer");
    c = applyJobDraftField(c, "responsibilities", "Ship the ranking model\n\n  Mentor two engineers ");
    c = applyJobDraftField(c, "employmentType", ["FullTime", "ContractToHire"]);
    c = applyJobDraftField(c, "seniority", ["Senior", "LeadExecutive"]);
    c = applyJobDraftField(c, "workSetting", "Hybrid");
    c = applyJobDraftField(c, "salaryMin", 180000);
    c = applyJobDraftField(c, "salaryMax", 230000);
    expect(c).toMatchObject({
      title: "Senior AI Engineer",
      responsibilities: ["Ship the ranking model", "Mentor two engineers"],
      employmentType: ["full-time", "contract-to-hire"],
      seniority: ["senior", "lead"],
      workSetting: WorkSetting.Hybrid,
      salary: 180000,
      salaryMax: 230000,
    });
    expect(jobContentToDraftValues(c)).toMatchObject({
      responsibilities: "Ship the ranking model\nMentor two engineers",
      salaryMin: 180000,
    });
  });

  it("ignores values it can't use (error case)", () => {
    const base = jobItemToContent(JOB_DTO);
    expect(applyJobDraftField(base, "workSetting", "On the moon")).toBe(base);
    expect(applyJobDraftField(base, "employmentType", ["Gig"])).toBe(base);
    expect(applyJobDraftField(base, "salaryMin", "lots")).toBe(base);
    expect(applyJobDraftField(base, "status", "Open")).toBe(base);
  });
});
