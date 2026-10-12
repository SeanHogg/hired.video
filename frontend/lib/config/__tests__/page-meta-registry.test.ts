/**
 * Tests for the unified page-meta registry (gaps #1621 + #1622) — the
 * replacement for the hand-maintained `detectContextFromRoute` switch
 * and the folded `page-context-registry`.
 *
 * Covers: contextType resolution (regression + new surfaces +
 * specificity + general fallback), and the new `seoKey` resolution that
 * lets dynamic/detail routes inherit a parent PAGE_SEO entry.
 */

import { describe, it, expect } from "vitest";
import {
  PAGE_META_RULES,
  detectContextType,
  getPageMeta,
  resolvePageSeoKey,
} from "../page-meta-registry";
import { PAGE_SEO } from "../../seo";

describe("page-meta-registry — contextType", () => {
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

  describe("new studio + content surfaces", () => {
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
});

describe("page-meta-registry — seoKey resolution", () => {
  it("dynamic/detail routes resolve to a parent PAGE_SEO key", () => {
    expect(resolvePageSeoKey("/studio/editor/abc")).toBe("/studio");
    expect(resolvePageSeoKey("/jobs/some-job-id")).toBe("/jobs");
    expect(resolvePageSeoKey("/resumes/abc/edit")).toBe("/resumes");
    expect(resolvePageSeoKey("/articles/my-post")).toBe("/articles");
    expect(resolvePageSeoKey("/companies/acme")).toBe("/companies");
    expect(resolvePageSeoKey("/people/jane")).toBe("/people");
    expect(resolvePageSeoKey("/courses/c1")).toBe("/learning");
  });

  it("uncovered tool + sector pages inherit their landing SEO", () => {
    expect(resolvePageSeoKey("/tools/some-new-tool")).toBe("/tools");
    expect(resolvePageSeoKey("/sectors/aerospace")).toBe("/sectors");
  });

  it("unmatched routes resolve to null (fall through to DEFAULT_SEO)", () => {
    expect(resolvePageSeoKey("/pricing")).toBe(null);
    expect(resolvePageSeoKey("/login")).toBe(null);
  });

  it("every non-null seoKey references a real PAGE_SEO entry (no dangling keys)", () => {
    for (const rule of PAGE_META_RULES) {
      if (rule.seoKey) {
        expect(
          PAGE_SEO[rule.seoKey],
          `seoKey "${rule.seoKey}" (rule ${rule.test}) is not a real PAGE_SEO key`,
        ).toBeDefined();
      }
    }
  });
});

describe("page-meta-registry — getPageMeta", () => {
  it("returns both contextType and seoKey", () => {
    expect(getPageMeta("/studio/editor")).toEqual({
      contextType: "studio",
      seoKey: "/studio",
    });
    expect(getPageMeta("/totally-unmatched")).toEqual({
      contextType: "general",
      seoKey: null,
    });
  });
});
