/**
 * Every AI tool is for everyone while the hiring personas are switched off
 * (HIRING_PERSONAS_ENABLED=false, job-seeker-only product). The recruiter /
 * employer `audienceRoles` tags stay in the catalog, but the audience axis
 * collapses to "universal" so /tools, the tool-page header related list and
 * the entity action menus never hide a tool from a job seeker.
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

const HIRE_TAGGED = ["interview-templates", "chrome-extension-recruiter"];

describe("tools catalog audience — job-seeker-only posture", () => {
  it("the audience split is off", () => {
    expect(TOOL_AUDIENCE_SPLIT_ENABLED).toBe(false);
  });

  it("every tool buckets as universal", () => {
    for (const tool of TOOLS_CATALOG) {
      expect(getToolAudience(tool), tool.id).toBe("universal");
    }
  });

  it("no role maps to a narrowing bucket", () => {
    for (const role of ["job_seeker", "recruiter", "employer", "creator", "admin", null, undefined]) {
      expect(audienceForRole(role)).toBeNull();
    }
  });

  it("recruiter/employer-tagged tools still exist and are visible to a job seeker", () => {
    for (const id of HIRE_TAGGED) {
      const tool = TOOLS_CATALOG.find((t) => t.id === id);
      expect(tool, id).toBeDefined();
      expect(isToolInAudience(tool!, "job_seeker")).toBe(true);
    }
  });

  it("a job seeker's resume action menu lists the whole catalog", () => {
    const menu = getCatalogToolsForEntity("resume", "0b1e7c2a-5d3f-4a8e-9c61-2f4d8e7a1b30", "job_seeker");
    expect(menu.length).toBe(TOOLS_CATALOG.length);
  });

  it("with the split on, the original bucketing returns", () => {
    const hire = TOOLS_CATALOG.find((t) => t.id === "interview-templates")!;
    expect(getToolAudience(hire, true)).toBe("recruiter_employer");
    expect(audienceForRole("job_seeker", true)).toBe("job_seeker");
    expect(isToolInAudience(hire, "job_seeker", true)).toBe(false);
  });
});
