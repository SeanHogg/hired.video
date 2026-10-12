/** `/v/:id` permanently redirects to `/m/:id` (#1218). */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LegacyPublicVideoRedirect from "../LegacyPublicVideoRedirect";

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/v/ats/:slug" element={<LegacyPublicVideoRedirect />} />
        <Route path="/v/:videoId" element={<LegacyPublicVideoRedirect />} />
        <Route path="/m/ats/:slug" element={<p>ats page</p>} />
        <Route path="/m/:videoId" element={<p>media page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LegacyPublicVideoRedirect", () => {
  it("redirects /v/<id> to /m/<id>", () => {
    at("/v/maria-alvarez-reel");
    expect(screen.getByText("media page")).toBeTruthy();
  });

  it("redirects /v/ats/<slug> to /m/ats/<slug>", () => {
    at("/v/ats/acme-pack");
    expect(screen.getByText("ats page")).toBeTruthy();
  });

  it("preserves query string on the canonical path", () => {
    at("/v/abc?utm=share");
    expect(screen.getByText("media page")).toBeTruthy();
  });
});
