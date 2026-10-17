import { describe, it, expect, vi, beforeEach } from "vitest";

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../../lib/api-client", () => ({
  apiClient: { get, post, put, delete: del },
}));

// Import after vi.mock so the service binds to the mocked apiClient.
import { userService } from "../../lib/services/user-service";

const baseConn = {
  id: "018c80ee-2f99-42bd-a029-869a3c97ee7c",
  fromUserId: "9f14dee7-0fd2-4862-82d1-8d5e087945d5",
  toUserId: "6f6bcee7-3b76-4c10-a7be-675d0b566c64",
  status: "pending" as const,
  createdAt: "2026-04-15T00:23:43.368Z",
  updatedAt: "2026-04-15T00:23:43.368Z",
};

describe("userService connection methods", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    del.mockReset();
  });

  describe("sendConnectionRequest", () => {
    it("POSTs to /api/users/connections with the request body", async () => {
      post.mockResolvedValueOnce({ data: baseConn });
      const result = await userService.sendConnectionRequest({
        toUserId: baseConn.toUserId,
        message: "Hi!",
      });
      expect(post).toHaveBeenCalledTimes(1);
      const [path, body] = post.mock.calls[0]!;
      expect(path).toBe("/api/users/connections");
      expect(body).toEqual({ toUserId: baseConn.toUserId, message: "Hi!" });
      expect(result.id).toBe(baseConn.id);
      expect(result.status).toBe("pending");
    });
  });

  describe("getConnectionStatus", () => {
    it("hits /connections/status with both user ids as query params", async () => {
      get.mockResolvedValueOnce({ data: { connected: true, ...baseConn } });
      const res = await userService.getConnectionStatus(
        baseConn.fromUserId,
        baseConn.toUserId,
      );
      expect(get).toHaveBeenCalledTimes(1);
      const path = get.mock.calls[0]![0] as string;
      expect(path).toContain("/api/users/connections/status");
      expect(path).toContain(`fromUserId=${baseConn.fromUserId}`);
      expect(path).toContain(`toUserId=${baseConn.toUserId}`);
      expect(res.connected).toBe(true);
      if (res.connected) {
        expect(res.id).toBe(baseConn.id);
      }
    });

    it("returns { connected: false } when no connection exists", async () => {
      get.mockResolvedValueOnce({ data: { connected: false, status: "none" } });
      const res = await userService.getConnectionStatus("a", "b");
      expect(res.connected).toBe(false);
    });
  });

  describe("acceptConnectionRequest", () => {
    it("PUTs /api/users/connections/:id/accept", async () => {
      put.mockResolvedValueOnce({ data: null });
      await userService.acceptConnectionRequest(baseConn.id);
      expect(put).toHaveBeenCalledWith(
        `/api/users/connections/${baseConn.id}/accept`,
      );
    });
  });

  describe("rejectConnectionRequest", () => {
    it("DELETEs /api/users/connections/:id", async () => {
      del.mockResolvedValueOnce({ data: null });
      await userService.rejectConnectionRequest(baseConn.id);
      expect(del).toHaveBeenCalledTimes(1);
      const path = del.mock.calls[0]![0] as string;
      // Hono routes are case-sensitive and apiClient sends paths verbatim,
      // so the path must match the backend route byte-for-byte.
      expect(path).toBe(`/api/users/connections/${baseConn.id}`);
    });
  });

  describe("getPendingConnectionRequests", () => {
    it("GETs /api/users/me/connections/pending", async () => {
      get.mockResolvedValueOnce({ data: [baseConn] });
      const list = await userService.getPendingConnectionRequests();
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0]![0]).toBe(
        "/api/users/me/connections/pending",
      );
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe(baseConn.id);
    });
  });
});
