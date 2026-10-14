/**
 * #3161 / ROADMAP #821 — CategoryRail self-gates: empty catalog → nothing;
 * film templates → heading + those cards. StudioLanding mounts it above
 * the generic Templates catalog without a host length check.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TemplateDef } from "@/lib/studio/templates/catalog";
import type { CreateStudioDraft } from "@/lib/studio/landing/types";

vi.mock("@/lib/studio/landing/use-template-actions", () => ({
  useTemplateActions: () => ({ openTemplate: vi.fn(), previewTemplate: vi.fn() }),
}));
vi.mock("@/components/studio/landing/BuiltinTemplateCard", () => ({
  default: ({ template }: { template: { id: string; label: string } }) => (
    <article>{template.label}</article>
  ),
}));

import CategoryRail from "../CategoryRail";

const create = vi.fn() as unknown as CreateStudioDraft;
const here = dirname(fileURLToPath(import.meta.url));

function def(partial: Pick<TemplateDef, "id" | "category"> & { label?: string }): TemplateDef {
  return { label: partial.id, ...partial } as TemplateDef;
}

describe("CategoryRail (#3161 / #821)", () => {
  it("self-gates: renders nothing when the catalog has no film templates", () => {
    const { container } = render(
      <CategoryRail
        category="film"
        headingKey="studio.landing.categoryRail.film"
        create={create}
        catalog={[def({ id: "personal_brand", category: "promote", label: "Personal brand" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Film & Acting")).toBeNull();
  });

  it("renders the heading and only templates in the requested category", () => {
    render(
      <CategoryRail
        category="film"
        headingKey="studio.landing.categoryRail.film"
        create={create}
        catalog={[
          def({ id: "self_tape", category: "film", label: "Self-tape audition" }),
          def({ id: "personal_brand", category: "promote", label: "Personal brand" }),
          def({ id: "monologue", category: "film", label: "Monologue" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Film & Acting" })).toBeInTheDocument();
    expect(screen.getByText("Self-tape audition")).toBeInTheDocument();
    expect(screen.getByText("Monologue")).toBeInTheDocument();
    expect(screen.queryByText("Personal brand")).toBeNull();
  });

  it("StudioLanding mounts CategoryRail above TemplatesSection with no host length check", () => {
    const src = readFileSync(join(here, "../../../../pages/studio/StudioLanding.tsx"), "utf8");
    expect(src).not.toMatch(/filmTemplates\.length/);
    expect(src).not.toMatch(/category === ['"]film['"].*&&\s*</);
    const rail = src.indexOf("<CategoryRail");
    const templates = src.indexOf("<TemplatesSection");
    expect(rail, "StudioLanding must mount <CategoryRail>").toBeGreaterThan(-1);
    expect(templates, "StudioLanding must mount <TemplatesSection>").toBeGreaterThan(-1);
    expect(rail, "film rail must sit above the generic catalog").toBeLessThan(templates);
    expect(src).toMatch(/category=["']film["']/);
  });
});
