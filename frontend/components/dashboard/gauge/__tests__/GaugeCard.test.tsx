/**
 * Render test for the speedometer card — proves the dial actually mounts
 * and emits an <svg> with the score, needle and CTA (the piece earlier
 * only type-checked, never browser-rendered). jsdom is enough to catch a
 * render-time throw or an empty SVG.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { GaugeCard } from "../GaugeCard";
import type { GaugeModel } from "@/lib/dashboard/gauge";

const model: GaugeModel = {
  title: "Job-Readiness Score",
  score: 42,
  benchmark: 70,
  benchmarkLabel: "Job-ready",
  levels: [
    { name: "Getting Started", min: 0 },
    { name: "Job Ready", min: 40 },
    { name: "Top Talent", min: 90 },
  ],
  caption: "Readiness",
  hint: "Keep applying to climb toward Top Talent.",
  action: { label: "Apply to jobs", href: "/jobs" },
};

function renderCard(m: GaugeModel) {
  return render(
    <MemoryRouter>
      <GaugeCard model={m} />
    </MemoryRouter>,
  );
}

describe("GaugeCard", () => {
  it("mounts and renders an SVG dial with a needle and the score", () => {
    const { container } = renderCard(model);

    // The speedometer SVG carries role="img" (the lucide title icon does
    // not), so select it specifically rather than the first <svg>.
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    // Needle (polygon) + at least one arc path → the dial actually drew.
    expect(svg!.querySelector("polygon")).not.toBeNull();
    expect(svg!.querySelector("path")).not.toBeNull();

    // Score readout is inside the SVG.
    expect(svg!.textContent).toContain("42");
  });

  it("shows the title, current tier, hint and a working CTA", () => {
    renderCard(model);

    expect(screen.getByText("Job-Readiness Score")).toBeTruthy();
    // score 42 → current tier "Job Ready" (min 40)
    expect(screen.getByText("Job Ready")).toBeTruthy();
    expect(screen.getByText("Keep applying to climb toward Top Talent.")).toBeTruthy();

    const cta = screen.getByRole("link", { name: "Apply to jobs" });
    expect(cta.getAttribute("href")).toBe("/jobs");
  });

  it("clamps an out-of-range score without throwing", () => {
    const { container } = renderCard({ ...model, score: 250 });
    // Needle angle is clamped; the readout shows the raw model score but
    // the component renders rather than crashing.
    expect(container.querySelector("svg polygon")).not.toBeNull();
  });
});
