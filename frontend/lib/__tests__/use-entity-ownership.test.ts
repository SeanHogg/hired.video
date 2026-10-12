/**
 * Tests for useEntityOwnership — the single-source-of-truth predicate
 * every entity card (CompanyCard, JobCard, ResumeCard, PeopleCard,
 * EntityMedia) uses to decide owner affordances.
 *
 * Pinning:
 *   • Backend-classified ownership wins over derived match.
 *   • SuperAdmin acts as a regular user — no admin-override. To manage
 *     someone else's content the SA impersonates them, which makes the
 *     viewer's id the target's so the userId match path lights up.
 *   • Plain owner / team-member predicate matching still works.
 *
 * Run: vitest run lib/__tests__/use-entity-ownership.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMock(),
}));

import { useEntityOwnership } from "@/lib/use-entity-ownership";

const ANON = { user: null };
const JOBSEEKER = (id = "u1") => ({ user: { id, role: "job_seeker" } });
const SUPERADMIN = (id = "sa1") => ({ user: { id, role: "super_admin" } });
const SUPERADMIN_IMPERSONATING = (id = "sa1") => ({ user: { id, role: "job_seeker" } });

describe("useEntityOwnership", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  describe("explicit ownership classification from API", () => {
    it("treats ownership='owned' as owner regardless of viewer", () => {
      authMock.mockReturnValue(ANON);
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone", ownership: "owned" }),
      );
      expect(result.current.isOwner).toBe(true);
      expect(result.current.isTracked).toBe(false);
    });

    it("treats ownership='tracked' as tracked, not owner", () => {
      authMock.mockReturnValue(JOBSEEKER());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone", ownership: "tracked" }),
      );
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isTracked).toBe(true);
    });

    it("treats ownership='tracked' as tracked even when viewer is SA — no admin override", () => {
      authMock.mockReturnValue(SUPERADMIN());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else", ownership: "tracked" }),
      );
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isTracked).toBe(true);
    });
  });

  describe("SuperAdmin acts as a regular user", () => {
    it("SA viewing someone else's entity does NOT get isOwner=true", () => {
      authMock.mockReturnValue(SUPERADMIN());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else" }),
      );
      expect(result.current.isOwner).toBe(false);
    });

    it("SA viewing their own entity does match by userId like any user", () => {
      authMock.mockReturnValue(SUPERADMIN("sa1"));
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "sa1" }),
      );
      expect(result.current.isOwner).toBe(true);
    });

    it("SA impersonating the owner: viewer.id is the target's, so userId match lights up", () => {
      // Impersonation hands the auth user identity over to the target —
      // so when the SA is acting as the owner, plain userId comparison
      // returns isOwner=true. This is how admins reach owner affordances.
      authMock.mockReturnValue({
        user: { id: "owner-id", role: "job_seeker" },
        isSuperAdmin: true,
        isImpersonating: true,
      });
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "owner-id" }),
      );
      expect(result.current.isOwner).toBe(true);
    });

    it("SA impersonating someone other than the owner: still isOwner=false", () => {
      authMock.mockReturnValue(SUPERADMIN_IMPERSONATING());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else" }),
      );
      expect(result.current.isOwner).toBe(false);
    });
  });

  describe("plain-owner derivation (no admin override)", () => {
    it("anonymous viewer is never owner", () => {
      authMock.mockReturnValue(ANON);
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "u1" }),
      );
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("matches when viewer.id === ownerUserId", () => {
      authMock.mockReturnValue(JOBSEEKER("u1"));
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "u1" }),
      );
      expect(result.current.isOwner).toBe(true);
    });

    it("falls through to extra predicates (e.g. company team membership)", () => {
      authMock.mockReturnValue(JOBSEEKER("teammate"));
      const { result } = renderHook(() =>
        useEntityOwnership({
          ownerUserId: "owner-id",
          extraOwnerPredicates: [(viewerUserId) => viewerUserId === "teammate"],
        }),
      );
      expect(result.current.isOwner).toBe(true);
    });

    it("returns isOwner=false when nothing matches", () => {
      authMock.mockReturnValue(JOBSEEKER("u1"));
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else" }),
      );
      expect(result.current.isOwner).toBe(false);
    });
  });
});
