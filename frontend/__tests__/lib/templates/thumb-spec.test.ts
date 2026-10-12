import { describe, it, expect } from "vitest";
import { THEME_ACCENT_BG, thumbLayoutFor, thumbSpecFor } from "@/lib/templates/thumb-spec";
import { TEMPLATE_PRESETS, type ResumeTemplateDescriptor } from "@/types/resume-template";

function preset(id: string): ResumeTemplateDescriptor {
  const d = TEMPLATE_PRESETS.find((p) => p.id === id);
  if (!d) throw new Error(`missing preset ${id}`);
  return d;
}

describe("thumbLayoutFor (real presets)", () => {
  it.each([
    ["hired-default", "hero"],
    ["actor-headshot-hero", "photo"],
    ["healthcare-clinical-blue", "sidebar"],
    ["risk-asphalt", "sidebar"],
    ["software-engineer-graphite", "two"],
    ["payroll-iron-gray", "two"],
    ["executive-taupe", "single"],
    ["intern-education-first", "single"],
  ])("%s → %s", (id, layout) => {
    expect(thumbLayoutFor(preset(id))).toBe(layout);
  });

  it("treats a hero document whose component block is disabled as photo-led", () => {
    const base = preset("hired-default");
    const d: ResumeTemplateDescriptor = {
      ...base,
      sections: base.sections.map((b) => (b.kind === "component" ? { ...b, enabled: false } : b)),
    };
    expect(thumbLayoutFor(d)).toBe("photo");
  });
});

describe("thumbSpecFor", () => {
  it("flags serif presets and resolves an accent for every preset", () => {
    for (const d of TEMPLATE_PRESETS) {
      const spec = thumbSpecFor(d);
      expect(spec.accentBg).toMatch(/^bg-/);
      expect(spec.serif).toBe(d.theme.fontFamily === "serif");
    }
    expect(thumbSpecFor(preset("executive-taupe")).serif).toBe(true);
  });

  it("falls back to the primary swatch for an unknown theme key", () => {
    const base = preset("creative-minimal");
    const d = { ...base, theme: { ...base.theme, themeKey: "retired-theme" } } as unknown as ResumeTemplateDescriptor;
    expect(thumbSpecFor(d).accentBg).toBe("bg-primary");
  });

  it("never maps a theme to a purple/violet swatch", () => {
    for (const cls of Object.values(THEME_ACCENT_BG)) {
      expect(cls).not.toMatch(/purple|violet/);
    }
  });
});
