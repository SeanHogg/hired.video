/**
 * #2364 — every /for/:audience page ends in AudienceUploadStep. Pin the
 * closer itself: résumé intent is a KitDropZone that navigates to
 * /studio/new with the dropped file; video / job / company intents are
 * links to that audience's create-intent href.
 *
 * KitDropZone is stubbed — its drop/parse behaviour is covered in the kit
 * tests; what's under test here is the landing closer's hand-off.
 */
import type { ReactElement } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NEW_KIT_PATH } from "@/lib/build-entry";

vi.mock("@/components/workspace/kit/KitDropZone", () => ({
  default: function KitDropZoneMock({
    onStart,
    lead,
  }: {
    onStart: (entry: { file: File }) => void;
    lead?: string | null;
  }) {
    return (
      <button
        type="button"
        data-testid="kit-drop-zone"
        data-lead={lead ?? ""}
        onClick={() => onStart({ file: new File(["cv"], "cv.pdf") })}
      >
        drop zone
      </button>
    );
  },
}));

import { AudienceUploadStep } from "../AudienceUploadStep";

function Pathname() {
  const { pathname, state } = useLocation();
  return (
    <>
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="has-state">{state ? "yes" : "no"}</span>
    </>
  );
}

function renderStep(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/for/job_seeker"]}>
      {ui}
      <Pathname />
    </MemoryRouter>,
  );
}

describe("AudienceUploadStep (#2364)", () => {
  it("a résumé closer is a KitDropZone that opens /studio/new with the drop", () => {
    renderStep(<AudienceUploadStep intent="resume" />);
    expect(screen.getByText("Start with the résumé you already have")).toBeInTheDocument();
    const zone = screen.getByTestId("kit-drop-zone");
    expect(zone).toHaveAttribute("data-lead", "resume");
    expect(screen.getByTestId("pathname")).toHaveTextContent("/for/job_seeker");
    fireEvent.click(zone);
    expect(screen.getByTestId("pathname")).toHaveTextContent(NEW_KIT_PATH);
    expect(screen.getByTestId("has-state")).toHaveTextContent("yes");
  });

  it("a video closer links to the studio on the named template", () => {
    renderStep(<AudienceUploadStep intent="video" videoTemplate="self_tape" />);
    expect(screen.getByText("Bring the footage you already have")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload my footage" })).toHaveAttribute(
      "href",
      "/studio?contentTemplate=self_tape",
    );
    expect(screen.queryByTestId("kit-drop-zone")).not.toBeInTheDocument();
  });

  it("a job closer links to a new job document", () => {
    renderStep(<AudienceUploadStep intent="job" />);
    expect(screen.getByRole("link", { name: "Upload a job description" })).toHaveAttribute(
      "href",
      "/studio?contentTemplate=job_doc",
    );
  });

  it("a company closer links to a new company document", () => {
    renderStep(<AudienceUploadStep intent="company" />);
    expect(screen.getByRole("link", { name: "Create my company page" })).toHaveAttribute(
      "href",
      "/studio?contentTemplate=company_doc",
    );
  });
});
