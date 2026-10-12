import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";

function renderAt(path: string, enabled?: boolean) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>home-page</div>} />
        <Route
          path="/post-a-job"
          element={
            <HiringRouteGate enabled={enabled}>
              <div>post-a-job-page</div>
            </HiringRouteGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HiringRouteGate", () => {
  it("redirects hiring routes home while hiring personas are off (live switch)", () => {
    renderAt("/post-a-job");
    expect(screen.getByText("home-page")).toBeTruthy();
    expect(screen.queryByText("post-a-job-page")).toBeNull();
  });

  it("renders the route when the switch is on", () => {
    renderAt("/post-a-job", true);
    expect(screen.getByText("post-a-job-page")).toBeTruthy();
  });
});
