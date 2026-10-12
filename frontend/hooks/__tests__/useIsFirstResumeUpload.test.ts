import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { getUserResumesMock } = vi.hoisted(() => ({
  getUserResumesMock: vi.fn(),
}));

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { getUserResumes: getUserResumesMock },
}));

import { useIsFirstResumeUpload } from "@/hooks/useIsFirstResumeUpload";

describe("useIsFirstResumeUpload", () => {
  beforeEach(() => {
    getUserResumesMock.mockReset();
  });

  it("starts undefined while the count is loading", () => {
    getUserResumesMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useIsFirstResumeUpload());
    expect(result.current).toBeUndefined();
  });

  it("returns true when the user has no resumes", async () => {
    getUserResumesMock.mockResolvedValue([]);
    const { result } = renderHook(() => useIsFirstResumeUpload());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("returns false when the user already has resumes", async () => {
    getUserResumesMock.mockResolvedValue([{ id: "r1" }]);
    const { result } = renderHook(() => useIsFirstResumeUpload());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("falls back to false when the fetch errors — never block the upload", async () => {
    getUserResumesMock.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useIsFirstResumeUpload());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
