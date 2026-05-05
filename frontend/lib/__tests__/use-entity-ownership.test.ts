/**
 * Tests for useEntityOwnership — the single-source-of-truth predicate
 * every entity card (CompanyCard, JobCard, ResumeCard, PeopleCard,
 * EntityVideos) uses to decide owner affordances.
 *
 * Pinning:
 *   • Backend-classified ownership wins over derived match.
 *   • SuperAdmin acting as themselves gets a global admin-override
 *     `isOwner: true` so admin affordances appear on every entity.
 *   • Admin-override is suppressed during impersonation (server token is
 *     target's, would 403) and during persona preview (the whole point
 *     is to see the previewed role's UI).
 *   • Plain owner / team-member predicate matching still works.
 *
 * Run: vitest run lib/__tests__/use-entity-ownership.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";

const { authMock, personaPreviewMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  personaPreviewMock: { current: null as string | null },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMock(),
}));

vi.mock("@/providers/PersonaPreviewProvider", async () => {
  const { createContext } = await import("react");
  const PersonaPreviewContext = createContext<{ personaPreview: string | null } | null>(null);
  return { PersonaPreviewContext };
});

import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { PersonaPreviewContext } from "@/providers/PersonaPreviewProvider";

const ANON = { user: null, isSuperAdmin: false, isImpersonating: false };
const JOBSEEKER = (id = "u1") => ({ user: { id, role: "job_seeker" }, isSuperAdmin: false, isImpersonating: false });
const SUPERADMIN = (id = "sa1") => ({ user: { id, role: "super_admin" }, isSuperAdmin: true, isImpersonating: false });
const SUPERADMIN_IMPERSONATING = (id = "sa1") => ({ user: { id, role: "job_seeker" }, isSuperAdmin: true, isImpersonating: true });

function withPreview(personaPreview: string | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      PersonaPreviewContext.Provider,
      { value: personaPreview === null ? null : { personaPreview } },
      children,
    );
  };
}

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

    it("treats ownership='tracked' as tracked, not owner — for non-SA viewers", () => {
      authMock.mockReturnValue(JOBSEEKER());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone", ownership: "tracked" }),
      );
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isTracked).toBe(true);
    });
  });

  describe("SuperAdmin admin-override", () => {
    it("acting as themselves: SA sees every entity as owned", () => {
      authMock.mockReturnValue(SUPERADMIN());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else" }),
      );
      expect(result.current.isOwner).toBe(true);
    });

    it("admin-override flips an API-tracked row to isOwner=true while keeping isTracked=true", () => {
      authMock.mockReturnValue(SUPERADMIN());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else", ownership: "tracked" }),
      );
      expect(result.current.isOwner).toBe(true);
      expect(result.current.isTracked).toBe(true);
    });

    it("during impersonation: admin-override is suppressed (server token is target's)", () => {
      authMock.mockReturnValue(SUPERADMIN_IMPERSONATING());
      const { result } = renderHook(() =>
        useEntityOwnership({ ownerUserId: "someone-else" }),
      );
      expect(result.current.isOwner).toBe(false);
    });

    it("during persona preview: admin-override is suppressed so SA sees the previewed role's UI", () => {
      authMock.mockReturnValue(SUPERADMIN());
      const { result } = renderHook(
        () => useEntityOwnership({ ownerUserId: "someone-else" }),
        { wrapper: withPreview("job_seeker") },
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
