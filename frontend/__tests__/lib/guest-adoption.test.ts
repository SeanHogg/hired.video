/**
 * readAfterGuestAdoption — a first read that fails while a just-signed-in
 * visitor's guest work is still being claimed is retried once, after the
 * claim; any other failure surfaces unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const claim = vi.hoisted(() => ({ inFlight: null as Promise<boolean> | null }));
vi.mock("@/lib/services/auth-service", () => ({
  authService: { adoptionInFlight: () => claim.inFlight },
}));

import { readAfterGuestAdoption } from "@/lib/guest-adoption";

const PROJECT = { id: "5cce4a18-42df-49df-8e1a-e14b14cf2ddf", name: "Sean Hogg" };
const notFound = Object.assign(new Error("Project not found"), { statusCode: 404 });

beforeEach(() => {
  claim.inFlight = null;
});

describe("readAfterGuestAdoption", () => {
  it("returns the first read when it works", async () => {
    const read = vi.fn().mockResolvedValue(PROJECT);
    await expect(readAfterGuestAdoption(read)).resolves.toBe(PROJECT);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("retries once the guest's work is claimed", async () => {
    claim.inFlight = Promise.resolve(true);
    const read = vi.fn().mockRejectedValueOnce(notFound).mockResolvedValueOnce(PROJECT);
    await expect(readAfterGuestAdoption(read)).resolves.toBe(PROJECT);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("surfaces the failure when no claim is in flight", async () => {
    const read = vi.fn().mockRejectedValue(notFound);
    await expect(readAfterGuestAdoption(read)).rejects.toBe(notFound);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("surfaces the failure when the claim itself did not land", async () => {
    claim.inFlight = Promise.resolve(false);
    const read = vi.fn().mockRejectedValue(notFound);
    await expect(readAfterGuestAdoption(read)).rejects.toBe(notFound);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
