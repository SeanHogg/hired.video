/**
 * Field-mapping contract for `authService.updateProfile`.
 *
 * The writer translates between the frontend `UserProfile` field names and
 * the server's DTO field names (bio↔summary, github↔gitHub, profilePicture↔
 * avatar). When ProfileAudit started passing `summary` directly, that field
 * was silently dropped because nothing in the writer or the type system
 * caught the mismatch — these tests exist so it never happens again.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

import { authService } from "../auth-service";
import { apiClient } from "../../api-client";

vi.mock("../../api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
}));

const mockedPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // The writer calls `normalizeAndPersist` on the response and that reads
  // various optional fields; an empty DTO is a valid input — every field
  // has a default in the normalizer.
  mockedPut.mockResolvedValue({ data: {} });
});

function lastPayload(): Record<string, unknown> {
  expect(mockedPut).toHaveBeenCalledTimes(1);
  const call = mockedPut.mock.calls[0];
  expect(call[0]).toBe("/api/users/me");
  return call[1] as Record<string, unknown>;
}

describe("authService.updateProfile field mapping", () => {
  describe("bio ↔ summary alias", () => {
    it("forwards `bio` as the server's `summary`", async () => {
      await authService.updateProfile({ bio: "About me" });
      expect(lastPayload()).toEqual({ summary: "About me" });
    });

    it("forwards `summary` directly (the server's name)", async () => {
      await authService.updateProfile({ summary: "About me" });
      expect(lastPayload()).toEqual({ summary: "About me" });
    });

    it("prefers `summary` over `bio` when both are passed", async () => {
      await authService.updateProfile({ bio: "from bio", summary: "from summary" });
      expect(lastPayload()).toEqual({ summary: "from summary" });
    });
  });

  describe("renamed server fields", () => {
    it("maps `github` to server's `gitHub`", async () => {
      await authService.updateProfile({ github: "https://github.com/x" });
      const p = lastPayload();
      expect(p).toEqual({ gitHub: "https://github.com/x" });
      expect(p).not.toHaveProperty("github");
    });

    it("maps `profilePicture` to server's `avatar`", async () => {
      await authService.updateProfile({ profilePicture: "https://cdn/me.jpg" });
      const p = lastPayload();
      expect(p).toEqual({ avatar: "https://cdn/me.jpg" });
      expect(p).not.toHaveProperty("profilePicture");
    });
  });

  describe("pass-through fields", () => {
    it("forwards headline, currentRole, and currentCompany unchanged", async () => {
      await authService.updateProfile({
        headline: "Staff Engineer",
        currentRole: "Backend Lead",
        currentCompany: "Acme",
      });
      expect(lastPayload()).toEqual({
        headline: "Staff Engineer",
        currentRole: "Backend Lead",
        currentCompany: "Acme",
      });
    });

    it("forwards skills array unchanged", async () => {
      await authService.updateProfile({ skills: ["go", "react"] });
      expect(lastPayload()).toEqual({ skills: ["go", "react"] });
    });
  });

  describe("ProfileAudit's apply payload", () => {
    // Regression: ProfileAudit was sending `summary` directly and the writer
    // was silently dropping it because only `bio` was mapped. After the fix,
    // this exact shape must reach the server with all three fields populated.
    it("forwards headline + summary + currentRole as the server expects", async () => {
      await authService.updateProfile({
        headline: "Builder of things",
        summary: "I ship things.",
        currentRole: "Founder",
      });
      expect(lastPayload()).toEqual({
        headline: "Builder of things",
        summary: "I ship things.",
        currentRole: "Founder",
      });
    });
  });

  describe("absent fields", () => {
    it("does not include keys that were not passed", async () => {
      await authService.updateProfile({ headline: "Only this" });
      const p = lastPayload();
      expect(p).toEqual({ headline: "Only this" });
      expect(Object.keys(p)).toEqual(["headline"]);
    });

    it("sends an empty payload when called with no fields", async () => {
      await authService.updateProfile({});
      expect(lastPayload()).toEqual({});
    });
  });
});
