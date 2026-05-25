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
import { MEDIA_KINDS } from "@shared/media-kinds";
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
    // Animation is excluded from this list because its runtime (added
    // alongside the canvas-runtime extensibility pass) owns its OWN
    // state shape (`animationState`) — same architectural pattern as
    // game and image. The exhaustiveness test below still covers it.
    const kinds = ["video", "podcast", "voice", "comic"] as const;

    for (const kind of kinds) {
      it(`returns timelineSpec (not gameState / imageState) for ${kind}`, () => {
        const result = seedTemplate(makeTemplate({ mediaKind: kind }));
        expect(result.timelineSpec).toBeDefined();
        expect(result.gameState).toBeUndefined();
        expect(result.imageState).toBeUndefined();
      });
    }
  });

  // Regression: prior to this fix the switch had no `image` case, so
  // selecting any `drawing_*` template from the chooser dropdown crashed
  // with "Cannot read properties of undefined (reading 'name')". The
  // dispatcher returned undefined and the caller dereferenced
  // `seed.name`. These tests pin the image branch.
  describe("image kind", () => {
    it("returns imageState (not timelineSpec / gameState) so <CanvasRouter> mounts <DrawingStage>", () => {
      const result = seedTemplate(
        makeTemplate({ id: "drawing_blank" as TemplateDef["id"], mediaKind: "image" }),
      );
      expect(result.imageState).toBeDefined();
      expect(result.timelineSpec).toBeUndefined();
      expect(result.gameState).toBeUndefined();
    });

    it("uses the per-template dimensions registered in image-seeds.ts", () => {
      // drawing_social_square = 1080×1080
      const square = seedTemplate(
        makeTemplate({ id: "drawing_social_square" as TemplateDef["id"], mediaKind: "image" }),
      );
      expect(square.imageState?.width).toBe(1080);
      expect(square.imageState?.height).toBe(1080);

      // drawing_og_card = 1200×630
      const og = seedTemplate(
        makeTemplate({ id: "drawing_og_card" as TemplateDef["id"], mediaKind: "image" }),
      );
      expect(og.imageState?.width).toBe(1200);
      expect(og.imageState?.height).toBe(630);
    });

    it("falls back to a 1024×1024 blank canvas when the template id has no image seed", () => {
      // Defensive — a future image template added to the catalog
      // without a matching IMAGE_SEEDS entry still produces a usable
      // project (same fallback the game-seed registry uses).
      const result = seedTemplate(
        makeTemplate({ id: "basic" as TemplateDef["id"], mediaKind: "image" }),
      );
      expect(result.imageState?.width).toBe(1024);
      expect(result.imageState?.height).toBe(1024);
    });

    it("ships at least one fully-formed layer so the runtime renders on first paint", () => {
      const result = seedTemplate(
        makeTemplate({ id: "drawing_blank" as TemplateDef["id"], mediaKind: "image" }),
      );
      expect(result.imageState?.layers.length).toBeGreaterThan(0);
      expect(result.imageState?.activeLayerId).toBeTruthy();
    });
  });

  // Exhaustiveness regression: lock that EVERY mediaKind in MEDIA_KINDS
  // produces a non-throwing dispatch with `name` populated. Prior to
  // this fix, `image` was in `MEDIA_KINDS` but missing from the switch,
  // so the dispatcher returned undefined → `seed.name` crashed in the
  // caller. This test fails the build the next time someone adds a
  // mediaKind without a matching dispatch branch.
  describe("exhaustiveness — every shipping mediaKind must dispatch", () => {
    for (const kind of MEDIA_KINDS) {
      it(`does not crash + names the project for mediaKind=${kind}`, () => {
        const result = seedTemplate(makeTemplate({ mediaKind: kind, defaultName: `Test ${kind}` }));
        expect(result.name).toBe(`Test ${kind}`);
        // At least one state-shaped field must be populated; which one
        // depends on the kind. Asserting the OR-shape catches "switch
        // returned bare { name }" regressions.
        const r = result as typeof result & { animationState?: unknown; cadState?: unknown };
        const hasSomePayload =
          result.timelineSpec !== undefined ||
          result.gameState !== undefined ||
          result.imageState !== undefined ||
          r.animationState !== undefined ||
          r.cadState !== undefined;
        expect(hasSomePayload).toBe(true);
      });
    }
  });
});
