/**
 * Regression test for the "invisible launch-video pill" bug.
 *
 * MetaBadge uses Button variant="outline", which is `bg-background` (white)
 * with no explicit text color. When rendered inside a hero/gradient that
 * sets an inherited white text color (text-primary-foreground), the label
 * becomes white-on-white. The fix pins `text-foreground` on the Button so
 * the label stays readable on any parent.
 *
 * Run: vitest run components/__tests__/MetaBadge.test.tsx
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetaBadge } from "@/components/MetaBadge";
import { MetaType } from "@/types/resume";
import type { ResumeSectionMeta } from "@/types/resume";

const makeMeta = (overrides: Partial<ResumeSectionMeta> = {}): ResumeSectionMeta => ({
  id: "m1",
  referenceId: "b1",
  name: "Intro Video",
  metaType: MetaType.VideoMP4,
  url: "https://example.com/video.mp4",
  description: "",
  ...overrides,
}) as ResumeSectionMeta;

describe("MetaBadge", () => {
  it("pins an explicit text-foreground class on the trigger button", () => {
    render(<MetaBadge meta={makeMeta()} />);
    const btn = screen.getByRole("button", { name: /Intro Video/i });
    expect(btn.className).toMatch(/text-foreground/);
  });

  it("renders the provided name as the button label", () => {
    render(<MetaBadge meta={makeMeta({ name: "My Demo Reel" })} />);
    expect(
      screen.getByRole("button", { name: /My Demo Reel/i }),
    ).toBeInTheDocument();
  });

  it("falls back to a type-derived label when name is missing", () => {
    render(<MetaBadge meta={makeMeta({ name: "" })} />);
    // A video meta without a name should read "Video"
    expect(screen.getByRole("button", { name: /Video/i })).toBeInTheDocument();
  });
});
