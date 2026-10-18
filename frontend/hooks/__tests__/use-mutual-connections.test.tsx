/**
 * useMutualConnections — the ONE reader of `/api/graph/mutuals/:id`.
 * MutualConnectionsRow and WarmIntroRequestButton both mount it on a profile,
 * so concurrent readers must collapse onto a single request, and a
 * signed-out viewer must never fire the auth-only call.
 *
 * Run: vitest run hooks/__tests__/use-mutual-connections.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { MutualConnectionsResult } from "@/lib/services/graph-service";
import { useMutualConnections } from "../queries/use-mutual-connections";

const auth = vi.hoisted(() => ({ user: { id: "viewer-1" } as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));

const RESULT: MutualConnectionsResult = {
  fromUserId: "viewer-1",
  toUserId: "target-1",
  mutualCount: 1,
  mutuals: [{ userId: "m-1", name: "Mia Mutual", avatarUrl: null, headline: "Recruiter" }],
  isDirectConnection: false,
};

const mutuals = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/graph-service", () => ({ graphService: { mutuals } }));

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useMutualConnections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "viewer-1" };
    mutuals.mockResolvedValue(RESULT);
  });

  it("collapses two readers of the same target onto one request", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrapperFor(client);
    const row = renderHook(() => useMutualConnections("target-1"), { wrapper });
    const button = renderHook(() => useMutualConnections("target-1"), { wrapper });

    await waitFor(() => expect(row.result.current.data).toEqual(RESULT));
    await waitFor(() => expect(button.result.current.data).toEqual(RESULT));
    expect(mutuals).toHaveBeenCalledTimes(1);
    expect(mutuals).toHaveBeenCalledWith("target-1");
  });

  it("does not fetch for a signed-out viewer", () => {
    auth.user = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useMutualConnections("target-1"), { wrapper: wrapperFor(client) });

    expect(result.current.isLoading).toBe(false);
    expect(mutuals).not.toHaveBeenCalled();
  });

  it("does not fetch when the caller disables it (own profile)", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useMutualConnections("target-1", false), { wrapper: wrapperFor(client) });

    expect(mutuals).not.toHaveBeenCalled();
  });
});
