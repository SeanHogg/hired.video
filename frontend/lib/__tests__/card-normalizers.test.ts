/**
 * Tests for card-normalizers — the layer that takes a canonical RawApiItem
 * (from card-feed) and produces the typed props each card component consumes.
 * These assertions protect the ResumeCard ownership/summary/privacy pipeline
 * end-to-end.
 *
 * Run: vitest run lib/__tests__/card-normalizers.test.ts
 */

import { describe, it, expect } from "vitest";

import { normalizeResumeData } from "@/lib/card-normalizers";
import type { CardContext, RawApiItem } from "@/types/normalized-cards";

const ctx = (overrides: Partial<CardContext> = {}): CardContext => ({
  section: "all",
  userContext: {
    userId: "user-1",
    role: "regular_user",
    permissions: [],
    isAuthenticated: true,
  },
  ...overrides,
});

const baseItem: RawApiItem = {
  id: "r1",
  type: "resume",
  name: "Resume One",
  title: "Resume One",
  summary: "This is the resume summary.",
  userId: "user-1",
  privacy: "public",
  isMaster: true,
  isActive: false,
  parentId: null,
  views: 3,
  createdAt: "2026-04-10T00:00:00Z",
  updatedAt: "2026-04-10T00:00:00Z",
};

describe("normalizeResumeData — summary", () => {
  it("prefers summary when present", () => {
    const out = normalizeResumeData(baseItem, ctx());
    expect(out.summary).toBe("This is the resume summary.");
  });

  it("falls back to description when summary missing", () => {
    const out = normalizeResumeData(
      { ...baseItem, summary: undefined, description: "fallback" },
      ctx(),
    );
    expect(out.summary).toBe("fallback");
  });

  it("does not leak any placeholder string", () => {
    const out = normalizeResumeData(
      { ...baseItem, summary: "", description: "" },
      ctx(),
    );
    expect(out.summary).toBe("");
    // Regression: the old code returned "No summary available"
    expect(out.summary).not.toMatch(/no summary/i);
  });
});

describe("normalizeResumeData — ownership", () => {
  it("marks owned when item.userId matches userContext.userId", () => {
    const out = normalizeResumeData(
      { ...baseItem, userId: "user-1" },
      ctx({
        userContext: {
          userId: "user-1",
          role: "regular_user",
          permissions: [],
          isAuthenticated: true,
        },
      }),
    );
    expect(out.ownership).toBe("owned");
  });

  it("marks tracked when item.userId does not match", () => {
    const out = normalizeResumeData(
      { ...baseItem, userId: "someone-else" },
      ctx(),
    );
    expect(out.ownership).toBe("tracked");
  });

  it("honours backend isOwner flag even when userContext is anonymous", () => {
    const out = normalizeResumeData(
      { ...baseItem, userId: undefined, isOwner: true },
      ctx({
        userContext: {
          userId: "",
          role: "regular_user",
          permissions: [],
          isAuthenticated: false,
        },
      }),
    );
    expect(out.ownership).toBe("owned");
  });

  it("passes userId through so downstream code can re-check ownership", () => {
    const out = normalizeResumeData(
      { ...baseItem, userId: "user-42" },
      ctx(),
    );
    expect(out.userId).toBe("user-42");
  });
});

describe("normalizeResumeData — privacy", () => {
  it("trusts an explicit privacy value from the backend", () => {
    const out = normalizeResumeData(
      { ...baseItem, privacy: "recruiter_only" },
      ctx(),
    );
    expect(out.privacy).toBe("recruiter_only");
  });

  it("defaults missing privacy to public (items come from public listings)", () => {
    const out = normalizeResumeData(
      { ...baseItem, privacy: undefined },
      ctx(),
    );
    expect(out.privacy).toBe("public");
  });

  it("marks private when isPublic is explicitly false", () => {
    const out = normalizeResumeData(
      { ...baseItem, privacy: undefined, isPublic: false },
      ctx(),
    );
    expect(out.privacy).toBe("private");
  });
});

describe("normalizeResumeData — flags", () => {
  it("carries isMaster / isActive / parentId through", () => {
    const out = normalizeResumeData(
      { ...baseItem, isMaster: true, isActive: true, parentId: "p1" },
      ctx(),
    );
    expect(out.isMaster).toBe(true);
    expect(out.isActive).toBe(true);
    expect(out.parentId).toBe("p1");
  });
});
