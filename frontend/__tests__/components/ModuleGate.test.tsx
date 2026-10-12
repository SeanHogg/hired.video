import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ModuleGate } from "@/components/ModuleGate";
import { __resetModuleStatusCache } from "@/lib/hooks/useModuleStatus";

vi.mock("@/lib/api-client", () => {
  return {
    apiClient: {
      get: vi.fn(),
    },
  };
});

import { apiClient } from "@/lib/api-client";

function setApiResponse(statuses: Array<{ slug: string; name: string; isActive: boolean }>) {
  (apiClient.get as any).mockResolvedValue({
    success: true,
    data: statuses,
    timestamp: new Date().toISOString(),
  });
}

function setApiError() {
  (apiClient.get as any).mockRejectedValue(new Error("network down"));
}

describe("ModuleGate", () => {
  beforeEach(() => {
    __resetModuleStatusCache();
    (apiClient.get as any).mockReset();
  });

  it("renders children when the module is active", async () => {
    setApiResponse([{ slug: "ads", name: "Ads", isActive: true }]);
    render(
      <MemoryRouter>
        <ModuleGate slug="ads">
          <div>ads-page</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("ads-page")).toBeInTheDocument());
  });

  it("renders the loading fallback while the status fetch is in flight", () => {
    (apiClient.get as any).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <ModuleGate slug="ads" loadingFallback={<div>loading-sentinel</div>}>
          <div>ads-page</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    expect(screen.getByText("loading-sentinel")).toBeInTheDocument();
    expect(screen.queryByText("ads-page")).not.toBeInTheDocument();
  });

  it("renders disabledFallback when the module is inactive", async () => {
    setApiResponse([{ slug: "ads", name: "Ads", isActive: false }]);
    render(
      <MemoryRouter>
        <ModuleGate slug="ads" disabledFallback={<div>module-off</div>}>
          <div>ads-page</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("module-off")).toBeInTheDocument());
    expect(screen.queryByText("ads-page")).not.toBeInTheDocument();
  });

  it("redirects to redirectTo when the module is inactive and no fallback is supplied", async () => {
    setApiResponse([{ slug: "ads", name: "Ads", isActive: false }]);
    render(
      <MemoryRouter initialEntries={["/ads"]}>
        <Routes>
          <Route
            path="/ads"
            element={
              <ModuleGate slug="ads" redirectTo="/home-page">
                <div>ads-page</div>
              </ModuleGate>
            }
          />
          <Route path="/home-page" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("home-page")).toBeInTheDocument());
    expect(screen.queryByText("ads-page")).not.toBeInTheDocument();
  });

  it("treats unknown slugs as active (opt-in enforcement matches backend)", async () => {
    setApiResponse([{ slug: "ads", name: "Ads", isActive: true }]);
    render(
      <MemoryRouter>
        <ModuleGate slug="not-curated">
          <div>shown</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("shown")).toBeInTheDocument());
  });

  it("fails open when the status endpoint errors", async () => {
    setApiError();
    render(
      <MemoryRouter>
        <ModuleGate slug="ads">
          <div>shown-on-error</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("shown-on-error")).toBeInTheDocument());
  });

  it("only fetches the status map once across multiple gates", async () => {
    setApiResponse([
      { slug: "ads", name: "Ads", isActive: true },
      { slug: "community", name: "Community", isActive: true },
    ]);
    render(
      <MemoryRouter>
        <ModuleGate slug="ads">
          <div>a</div>
        </ModuleGate>
        <ModuleGate slug="community">
          <div>b</div>
        </ModuleGate>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("a")).toBeInTheDocument();
      expect(screen.getByText("b")).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
});
