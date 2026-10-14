/**
 * #2363 / board #3166 — the studio home's "Start with" chips. The remaining
 * Wave-1 check was live-browser: `/studio?for=actor` leads with Video, and
 * `/for/recent-graduates` then `/studio` leads with Résumé. Pin both here
 * (plus the role fallback) so the chooser, not just the pure resolver, owns
 * those URLs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ user: null as { role?: string } | null }));

vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/studio/job-post-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/studio/job-post-access")>();
  return { ...actual, useJobPostAccess: () => "sign-in" as const };
});
vi.mock("@/components/studio/landing/CreateDocumentDialog", () => ({
  default: () => null,
}));

import CreateIntentChooser from "../CreateIntentChooser";
import { rememberLandingSource } from "../create-intent-memory";

function renderChooser(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CreateIntentChooser />
    </MemoryRouter>,
  );
}

function suggestedChip() {
  return screen.getByText("(suggested for you)").closest("a, button");
}

describe("CreateIntentChooser (#2363)", () => {
  beforeEach(() => {
    auth.user = null;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("/studio?for=actor leads with Video", () => {
    renderChooser("/studio?for=actor");
    const chip = suggestedChip();
    expect(chip).toHaveTextContent("Video");
    expect(chip).toHaveAttribute("href", "/studio?contentTemplate=basic");
  });

  it("/for/recent-graduates then /studio leads with Résumé", () => {
    rememberLandingSource("recent-graduates");
    renderChooser("/studio");
    const chip = suggestedChip();
    expect(chip).toHaveTextContent("Résumé + cover letter");
    expect(chip?.tagName).toBe("BUTTON");
  });

  it("a creator with no landing signal leads with Video", () => {
    auth.user = { role: "creator" };
    renderChooser("/studio");
    expect(suggestedChip()).toHaveTextContent("Video");
  });

  it("a job seeker with no landing signal leads with Résumé", () => {
    auth.user = { role: "job_seeker" };
    renderChooser("/studio");
    expect(suggestedChip()).toHaveTextContent("Résumé + cover letter");
  });
});
