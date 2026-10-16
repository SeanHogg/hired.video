/**
 * The job-seeker vs recruiter/employer tool audience split follows the persona
 * switch. With the hiring side ON (HIRING_PERSONAS_ENABLED=true, restored
 * 2026-10-16) the split is live: recruiter / employer-tagged tools bucket as
 * "recruiter_employer" and drop out of a job seeker's "For me" views. With the
 * split off every tool collapses to "universal".
 */
import { describe, it, expect } from "vitest";
import {
  TOOLS_CATALOG,
  TOOL_AUDIENCE_SPLIT_ENABLED,
  audienceForRole,
  getCatalogToolsForEntity,
  getToolAudience,
  isToolInAudience,
} from "@/data/tools-catalog";

const HIRE_TAGGED = ["interview-templates"];

describe("tools catalog audience — hiring side on", () => {
  it("the audience split is on", () => {
    expect(TOOL_AUDIENCE_SPLIT_ENABLED).toBe(true);
  });

  it("recruiter/employer-tagged tools bucket as recruiter_employer", () => {
    for (const id of HIRE_TAGGED) {
      const tool = TOOLS_CATALOG.find((t) => t.id === id);
      expect(tool, id).toBeDefined();
      expect(getToolAudience(tool!), id).toBe("recruiter_employer");
    }
  });

  it("roles map to their narrowing bucket; others see everything", () => {
    expect(audienceForRole("job_seeker")).toBe("job_seeker");
    expect(audienceForRole("recruiter")).toBe("recruiter_employer");
    expect(audienceForRole("employer")).toBe("recruiter_employer");
    for (const role of ["creator", "admin", null, undefined]) {
      expect(audienceForRole(role)).toBeNull();
    }
  });

  it("recruiter/employer-tagged tools are hidden from a job seeker, shown to a recruiter", () => {
    for (const id of HIRE_TAGGED) {
      const tool = TOOLS_CATALOG.find((t) => t.id === id)!;
      expect(isToolInAudience(tool, "job_seeker"), id).toBe(false);
      expect(isToolInAudience(tool, "recruiter_employer"), id).toBe(true);
    }
  });

  it("a job seeker's resume action menu excludes the hiring-only tools", () => {
    const menu = getCatalogToolsForEntity("resume", "0b1e7c2a-5d3f-4a8e-9c61-2f4d8e7a1b30", "job_seeker");
    const ids = new Set(menu.map((t) => t.id));
    for (const id of HIRE_TAGGED) expect(ids.has(id), id).toBe(false);
    expect(menu.length).toBeLessThan(TOOLS_CATALOG.length);
  });

  it("with the split off, every tool is universal and no role narrows", () => {
    for (const tool of TOOLS_CATALOG) {
      expect(getToolAudience(tool, false), tool.id).toBe("universal");
    }
    for (const role of ["job_seeker", "recruiter", "employer", "creator", "admin", null, undefined]) {
      expect(audienceForRole(role, false)).toBeNull();
    }
    const hire = TOOLS_CATALOG.find((t) => t.id === "interview-templates")!;
    expect(isToolInAudience(hire, "job_seeker", false)).toBe(true);
  });
});
