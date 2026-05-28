/**
 * Tests for the declarative page-context registry — the replacement for
 * the hand-maintained `detectContextFromRoute` switch (gap #1621).
 *
 * Covers: every previously-recognized route still resolves to the same
 * contextType (no regression), the newly-added studio/content surfaces
 * resolve, specificity ordering (create/edit beats view beats list),
 * and the general fallback for unmatched routes.
 */

import { describe, it, expect } from "vitest";
import {
  PAGE_CONTEXT_RULES,
  detectContextType,
} from "../page-context-registry";

describe("page-context-registry", () => {
  describe("regression — routes the old switch recognized", () => {
    const cases: Array<[string, string]> = [
      ["/dashboard", "dashboard"],
      ["/resumes/new", "resume-create"],
      ["/resumes/create", "resume-create"],
      ["/resumes/edit/abc", "resume-edit"],
      ["/resumes/abc/edit", "resume-edit"],
      ["/resumes/abc123", "resume-view"],
      ["/resumes", "resume-list"],
      ["/jobs/new", "job-create"],
      ["/jobs/edit/xyz", "job-edit"],
      ["/jobs/xyz/edit", "job-edit"],
      ["/jobs/xyz", "job-view"],
      ["/jobs", "job-list"],
      ["/profile/edit", "profile-edit"],
      ["/settings", "profile-edit"],
      ["/profile/abc", "profile-view"],
      ["/people/abc", "profile-view"],
      ["/tasks", "tasks"],
      ["/outreach", "outreach"],
      ["/messages", "messaging"],
      ["/messages/123", "messaging"],
      ["/search", "search"],
      ["/people", "search"],
      ["/companies", "search"],
      ["/", "search"],
      ["/index", "search"],
    ];
    it.each(cases)("%s → %s", (path, expected) => {
      expect(detectContextType(path)).toBe(expected);
    });
  });

  describe("new studio + content surfaces (gap #1621)", () => {
    const cases: Array<[string, string]> = [
      ["/studio", "studio"],
      ["/studio/editor", "studio"],
      ["/studio/preview/abc", "studio"],
      ["/articles/new", "article-edit"],
      ["/articles/my-slug/edit", "article-edit"],
      ["/articles/my-slug", "article-view"],
      ["/blog/some-post", "article-view"],
      ["/course-authoring", "course-author"],
      ["/courses/review-queue", "course-author"],
      ["/courses/c1/author", "course-author"],
      ["/courses/c1", "course-learn"],
      ["/learning", "learning"],
      ["/interview", "interview-practice"],
      ["/interview/practice", "interview-practice"],
      ["/companies/new", "company-edit"],
      ["/companies/acme/edit", "company-edit"],
      ["/companies/acme", "company-view"],
      ["/post-a-job", "job-create"],
    ];
    it.each(cases)("%s → %s", (path, expected) => {
      expect(detectContextType(path)).toBe(expected);
    });
  });

  describe("specificity ordering", () => {
    it("create beats the view/list catch-alls", () => {
      expect(detectContextType("/resumes/new")).toBe("resume-create");
      expect(detectContextType("/jobs/create")).toBe("job-create");
    });
    it("edit beats view", () => {
      expect(detectContextType("/resumes/abc/edit")).toBe("resume-edit");
      expect(detectContextType("/companies/acme/edit")).toBe("company-edit");
    });
    it("company browse (list) is search, company detail is company-view", () => {
      expect(detectContextType("/companies")).toBe("search");
      expect(detectContextType("/companies/acme")).toBe("company-view");
    });
  });

  describe("general fallback", () => {
    const unmatched = [
      "/pricing",
      "/login",
      "/admin/users",
      "/guides/getting-started",
      "/help",
      "/affiliate-program",
    ];
    it.each(unmatched)("%s → general", (path) => {
      expect(detectContextType(path)).toBe("general");
    });
  });

  it("every rule resolves to a valid contextType string", () => {
    for (const rule of PAGE_CONTEXT_RULES) {
      expect(typeof rule.contextType).toBe("string");
      expect(rule.test).toBeInstanceOf(RegExp);
    }
  });
});
