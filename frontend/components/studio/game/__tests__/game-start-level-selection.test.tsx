/**
 * Regression: opening a game whose `startLevelId` does NOT resolve to an
 * existing level (e.g. a seed that overwrote `levels[0]` without updating
 * `startLevelId`) used to hang the editor in an infinite render loop —
 * the default-selection effect picked `{kind:"level", levelId:<dangling>}`,
 * GamePropertiesPanel couldn't find that level and reset selection to
 * `canvas` during render, the effect re-fired, ad infinitum (the right
 * panel + sprites panel "flashed infinitely").
 *
 * Guard 1: every built-in 2D seed's `startLevelId` resolves to a real
 *   level (data invariant — `findStartLevel` always returns levels[0]
 *   at worst, but the persisted id should be correct).
 * Guard 2: the default-selection effect + GamePropertiesPanel converge
 *   (no "Maximum update depth exceeded") even when fed a gameState whose
 *   `startLevelId` is dangling.
 */
import { describe, it, expect } from "vitest";
import { useEffect, useState } from "react";
import { render } from "@testing-library/react";
import { seedGameFromTemplate } from "@/lib/studio/game/game-seeds";
import { findStartLevel } from "@/lib/studio/game/runtime";
import GamePropertiesPanel from "@/components/studio/game/GamePropertiesPanel";
import type { GameSelection } from "@/components/studio/game/GamePropertiesPanel";
import type { GameState } from "@shared/game-state";

const SEEDS_2D = ["endless_runner", "quiz_game", "memory_match"] as const;

describe("game start-level selection", () => {
  it("every 2D seed's startLevelId resolves to an existing level", () => {
    for (const tpl of SEEDS_2D) {
      const gs = seedGameFromTemplate(tpl);
      const ids = gs.levels.map((l) => l.id);
      expect(ids, `${tpl} levels`).toContain(gs.startLevelId);
    }
  });

  // Mirrors StudioEditorV2's default-selection effect: it must select a
  // level that actually exists, so GamePropertiesPanel never has to reset
  // selection mid-render.
  function GameEditorHarness({ initial }: { initial: GameState }) {
    const [gameState] = useState(initial);
    const [selection, setSelection] = useState<GameSelection>({ kind: "canvas" });
    useEffect(() => {
      if (selection.kind !== "canvas") return;
      const startId = findStartLevel(gameState)?.id;
      if (startId) setSelection({ kind: "level", levelId: startId });
    }, [gameState, selection.kind]);
    return (
      <GamePropertiesPanel
        gameState={gameState}
        onChange={() => {}}
        selection={selection}
        onSelectionChange={setSelection}
      />
    );
  }

  it("converges with a dangling startLevelId (no infinite render loop)", () => {
    // memory_match historically shipped startLevelId="level-1" with the
    // only level id="board" — the exact dangling case.
    const gs = { ...seedGameFromTemplate("memory_match"), startLevelId: "does-not-exist" };
    expect(() => render(<GameEditorHarness initial={gs} />)).not.toThrow();
  });
});
