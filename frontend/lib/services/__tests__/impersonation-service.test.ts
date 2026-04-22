import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { apiClient } from "../../api-client";
import {
  startImpersonation,
  endImpersonation,
  switchImpersonationRole,
  getActiveImpersonation,
} from "../impersonation-service";

vi.mock("../../api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("impersonation-service", () => {
  let mockApiClient: { get: Mock; post: Mock };

  beforeEach(() => {
    mockApiClient = apiClient as unknown as { get: Mock; post: Mock };
    vi.clearAllMocks();
  });

  describe("startImpersonation", () => {
    const response = {
      sessionId: "sess-1",
      token: "emu.jwt.token",
      user: { id: "u1", email: "target@example.com", name: "Target User" },
      role: "JobSeeker",
      startedAt: "2026-04-21T12:00:00Z",
      expiresAt: "2026-04-21T13:00:00Z",
    };

    it("POSTs to /api/admin/impersonate with the expected payload", async () => {
      mockApiClient.post.mockResolvedValue({ data: response });

      const result = await startImpersonation("u1", "debugging bug #123", true);

      expect(mockApiClient.post).toHaveBeenCalledWith("/api/admin/impersonate", {
        targetUserId: "u1",
        reason: "debugging bug #123",
        enableDebugger: true,
      });
      expect(result).toEqual(response);
    });

    it("defaults enableDebugger to false", async () => {
      mockApiClient.post.mockResolvedValue({ data: response });

      await startImpersonation("u1", "reason");

      expect(mockApiClient.post).toHaveBeenCalledWith("/api/admin/impersonate", {
        targetUserId: "u1",
        reason: "reason",
        enableDebugger: false,
      });
    });

    it("propagates api errors", async () => {
      mockApiClient.post.mockRejectedValue(new Error("409 CONFLICT"));

      await expect(startImpersonation("u1", "r")).rejects.toThrow("409 CONFLICT");
    });
  });

  describe("endImpersonation", () => {
    it("POSTs to /:id/end", async () => {
      mockApiClient.post.mockResolvedValue({ data: { sessionId: "sess-1", durationSeconds: 42, endedAt: "t" } });

      await endImpersonation("sess-1");

      expect(mockApiClient.post).toHaveBeenCalledWith("/api/admin/impersonate/sess-1/end");
    });

    it("propagates api errors", async () => {
      mockApiClient.post.mockRejectedValue(new Error("404 NOT_FOUND"));

      await expect(endImpersonation("sess-1")).rejects.toThrow("404 NOT_FOUND");
    });
  });

  describe("switchImpersonationRole", () => {
    it("POSTs role to /:id/switch-role and returns the new token/role", async () => {
      mockApiClient.post.mockResolvedValue({ data: { token: "new.jwt", role: "Recruiter" } });

      const result = await switchImpersonationRole("sess-1", "Recruiter");

      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/api/admin/impersonate/sess-1/switch-role",
        { role: "Recruiter" },
      );
      expect(result).toEqual({ token: "new.jwt", role: "Recruiter" });
    });
  });

  describe("getActiveImpersonation", () => {
    it("returns the active session object", async () => {
      mockApiClient.get.mockResolvedValue({ data: { id: "sess-1" } });

      const result = await getActiveImpersonation();

      expect(mockApiClient.get).toHaveBeenCalledWith("/api/admin/impersonate/active");
      expect(result).toEqual({ id: "sess-1" });
    });

    it("normalizes an empty/null body to null", async () => {
      mockApiClient.get.mockResolvedValue({ data: null });

      const result = await getActiveImpersonation();

      expect(result).toBeNull();
    });
  });
});
