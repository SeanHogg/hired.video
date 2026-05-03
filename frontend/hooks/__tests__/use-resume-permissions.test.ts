/**
 * Tests for useResumePermissions — single source of truth for "what can
 * the viewer do with this resume".
 *
 * Pinning the gating rules so future refactors don't accidentally let
 * non-owners export, embed, or use Gaps.
 *
 * Run: vitest run hooks/__tests__/use-resume-permissions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { permsMock } = vi.hoisted(() => ({
  permsMock: vi.fn(),
}));

vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => permsMock(),
}));

import { useResumePermissions } from "@/hooks/use-resume-permissions";
import type { Resume } from "@/types/resume";

const JOB_SEEKER_PERMS = {
  isAdmin: false,
  isSuperAdmin: false,
  isRecruiter: false,
  isEmployer: false,
  isJobSeeker: true,
};
const RECRUITER_PERMS = { ...JOB_SEEKER_PERMS, isRecruiter: true, isJobSeeker: false };
const EMPLOYER_PERMS = { ...JOB_SEEKER_PERMS, isEmployer: true, isJobSeeker: false };
const ADMIN_PERMS = { ...JOB_SEEKER_PERMS, isAdmin: true, isJobSeeker: false };

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return { id: "r1", isOwner: false, ...overrides } as Resume;
}

describe("useResumePermissions", () => {
  beforeEach(() => {
    permsMock.mockReset();
  });

  it("returns all-false permissions when the resume is null (loading state)", () => {
    permsMock.mockReturnValue(JOB_SEEKER_PERMS);
    const { result } = renderHook(() => useResumePermissions(null));
    expect(result.current.isViewer).toBe(false);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canExport).toBe(false);
    expect(result.current.canEmbed).toBe(false);
    expect(result.current.canViewGaps).toBe(false);
  });

  // ─── Owner ─────────────────────────────────────────────────────────
  describe("owner viewing their own resume", () => {
    it("can do everything", () => {
      permsMock.mockReturnValue(JOB_SEEKER_PERMS);
      const { result } = renderHook(() =>
        useResumePermissions(makeResume({ isOwner: true })),
      );
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canEditTemplate).toBe(true);
      expect(result.current.canAssignTemplate).toBe(true);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canEmbed).toBe(true);
      expect(result.current.canViewGaps).toBe(true);
      expect(result.current.canDelete).toBe(true);
      expect(result.current.canPromoteToMaster).toBe(true);
    });
  });

  // ─── Job seeker viewing someone else's resume ──────────────────────
  describe("job seeker viewing someone else's resume", () => {
    it("can NOT edit, export, embed, view gaps, or delete — bug regression", () => {
      permsMock.mockReturnValue(JOB_SEEKER_PERMS);
      const { result } = renderHook(() =>
        useResumePermissions(makeResume({ isOwner: false })),
      );
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canEditTemplate).toBe(false);
      expect(result.current.canExport).toBe(false);
      expect(result.current.canEmbed).toBe(false);
      expect(result.current.canViewGaps).toBe(false);
      expect(result.current.canDelete).toBe(false);
      expect(result.current.canPromoteToMaster).toBe(false);
    });
  });

  // ─── Recruiter ─────────────────────────────────────────────────────
  describe("recruiter viewing a candidate's resume", () => {
    it("CAN export and view gaps; canNOT edit/embed/delete", () => {
      permsMock.mockReturnValue(RECRUITER_PERMS);
      const { result } = renderHook(() =>
        useResumePermissions(makeResume({ isOwner: false })),
      );
      expect(result.current.canExport).toBe(true);
      expect(result.current.canViewGaps).toBe(true);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canEmbed).toBe(false);
      expect(result.current.canDelete).toBe(false);
    });
  });

  // ─── Employer ──────────────────────────────────────────────────────
  describe("employer viewing a candidate's resume", () => {
    it("CAN export; canNOT view gaps, edit, embed, delete", () => {
      permsMock.mockReturnValue(EMPLOYER_PERMS);
      const { result } = renderHook(() =>
        useResumePermissions(makeResume({ isOwner: false })),
      );
      expect(result.current.canExport).toBe(true);
      expect(result.current.canViewGaps).toBe(false);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canEmbed).toBe(false);
    });
  });

  // ─── Admin ─────────────────────────────────────────────────────────
  describe("admin viewing any resume", () => {
    it("has owner-equivalent privileges for support / debug", () => {
      permsMock.mockReturnValue(ADMIN_PERMS);
      const { result } = renderHook(() =>
        useResumePermissions(makeResume({ isOwner: false })),
      );
      expect(result.current.canEdit).toBe(true);
      expect(result.current.canExport).toBe(true);
      expect(result.current.canEmbed).toBe(true);
    });
  });
});
