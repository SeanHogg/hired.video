/**
 * Template-dispatch unit tests — the kind-aware seed dispatcher is the
 * single entry point every "new project from template" path goes through
 * (chooser, marketplace press-play, agent-tool hydrator). If a kind ever
 * lands in the wrong branch the user gets a draft with the wrong state
 * shape on disk → blank editor / broken playtest / mis-routed export.
 *
 * The dispatcher is type-driven (the `switch (template.mediaKind)` is
 * exhaustive), so these tests lock the runtime behavior for each branch:
 * the right field is populated, the wrong one isn't.
 *
 * Run: vitest run lib/studio/__tests__/template-dispatch.test.ts
 */

import { describe, it, expect } from "vitest";
import { seedTemplate } from "@/lib/studio/template-dispatch";
import type { TemplateDef } from "@/components/studio/templates/catalog";
import { FilePlus2 } from "lucide-react";
import type { ComponentType } from "react";

// Minimal IntakeForm stand-in — the dispatcher never reads it, so we keep
// the fixture lean rather than pull in the real intake components.
const NullIntake: ComponentType<any> = () => null;

function makeTemplate(overrides: Partial<TemplateDef>): TemplateDef {
  return {
    id: "basic" as TemplateDef["id"],
    label: "Test template",
    desc: "fixture",
    icon: FilePlus2,
    importMode: "none",
    purpose: "basic",
    category: "quick",
    mediaKind: "video",
    audiences: ["creator"],
    defaultName: "Fixture",
    defaultPrompt: "",
    firstTabLabel: "Description",
    IntakeForm: NullIntake,
    ...overrides,
  } as TemplateDef;
}

describe("seedTemplate", () => {
  it("propagates the template's defaultName so callers don't need a second lookup", () => {
    const result = seedTemplate(makeTemplate({ defaultName: "My Draft" }));
    expect(result.name).toBe("My Draft");
  });

  describe("game kind", () => {
    it("returns gameState (not timelineSpec) so the editor mounts <GameStage>", () => {
      const result = seedTemplate(
        makeTemplate({ id: "endless_runner" as TemplateDef["id"], mediaKind: "game" }),
      );
      expect(result.gameState).toBeDefined();
      expect(result.timelineSpec).toBeUndefined();
    });

    it("falls back to emptyGameState() when the template id has no game seed yet", () => {
      // Mirrors the seedGameFromTemplate('basic') path — id not in the
      // GAME_SEEDS registry, but the dispatcher still must produce a
      // valid GameState so the editor renders.
      const result = seedTemplate(
        makeTemplate({ id: "basic" as TemplateDef["id"], mediaKind: "game" }),
      );
      expect(result.gameState).toBeDefined();
      expect(result.gameState?.levels.length).toBeGreaterThan(0);
    });
  });

  describe("Timeline-runtime kinds", () => {
    const kinds = ["video", "podcast", "voice", "animation", "comic"] as const;

    for (const kind of kinds) {
      it(`returns timelineSpec (not gameState) for ${kind}`, () => {
        const result = seedTemplate(makeTemplate({ mediaKind: kind }));
        expect(result.timelineSpec).toBeDefined();
        expect(result.gameState).toBeUndefined();
      });
    }
  });
});
