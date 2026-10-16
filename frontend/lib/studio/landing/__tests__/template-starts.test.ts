/**
 * #3161 / ROADMAP #821 — TEMPLATE_STARTS includes a film tab whose matcher
 * returns only category === "film" templates.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG, type TemplateDef } from "@/lib/studio/templates/catalog";
import { TEMPLATE_STARTS, templatesForStart } from "../template-starts";

describe("TEMPLATE_STARTS film tab (#3161 / #821)", () => {
  it("includes a film tab that matches category === \"film\"", () => {
    const film = TEMPLATE_STARTS.find((start) => start.id === "film");
    expect(film).toBeDefined();
    expect(film?.labelKey).toBe("studio.landing.templateStart.film");
    expect(film?.matches({ category: "film" } as TemplateDef)).toBe(true);
    expect(film?.matches({ category: "promote" } as TemplateDef)).toBe(false);
  });

  it("templatesForStart(\"film\") returns only category===\"film\" templates", () => {
    const catalog: TemplateDef[] = [
      { id: "self_tape", category: "film" } as unknown as TemplateDef,
      { id: "personal_brand", category: "promote" } as unknown as TemplateDef,
      { id: "monologue", category: "film" } as unknown as TemplateDef,
      { id: "sizzle", category: "showcase" } as unknown as TemplateDef,
    ];
    const film = templatesForStart("film", catalog);
    expect(film.map((t) => t.id)).toEqual(["self_tape", "monologue"]);
    expect(film.every((t) => t.category === "film")).toBe(true);
  });

  it("live catalog film start is non-empty and film-only", () => {
    const film = templatesForStart("film");
    expect(film.length).toBeGreaterThan(0);
    expect(film.every((t) => t.category === "film")).toBe(true);
    expect(TEMPLATE_CATALOG.some((t) => t.category === "film")).toBe(true);
  });
});
