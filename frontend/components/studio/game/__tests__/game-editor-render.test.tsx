/**
 * Render-smoke for the 2D game editor surfaces. Seeds the built-in game
 * templates and mounts each editor component the studio shell renders
 * for a `mediaKind: "game"` project, across the selection states the
 * right-rail can be in. Guards against render-time crashes (e.g. a
 * use-before-declaration TDZ) in the game editor path that unit tests of
 * the pure reducers don't exercise.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { seedGameFromTemplate } from "@/lib/studio/game/game-seeds";
import GameStage from "@/components/studio/game/GameStage";
import GamePropertiesPanel from "@/components/studio/game/GamePropertiesPanel";
import LevelsRail from "@/components/studio/game/LevelsRail";
import SpritePalette from "@/components/studio/game/SpritePalette";
import type { GameSelection } from "@/lib/studio/game/game-selection";

const noop = () => {};

const TEMPLATES = ["quiz_game", "memory_match", "endless_runner"] as const;

describe("2D game editor render smoke", () => {
  for (const tpl of TEMPLATES) {
    it(`renders the editor surfaces for ${tpl}`, () => {
      const gs = seedGameFromTemplate(tpl);
      const levelId = gs.startLevelId ?? gs.levels[0]?.id ?? null;
      const spriteId = gs.levels[0]?.sprites[0]?.id ?? null;

      const selections: GameSelection[] = [
        { kind: "canvas" },
        ...(levelId ? [{ kind: "level", levelId } as GameSelection] : []),
        ...(levelId && spriteId
          ? [{ kind: "sprite", levelId, spriteId } as GameSelection]
          : []),
      ];

      for (const selection of selections) {
        render(
          <GamePropertiesPanel
            gameState={gs}
            onChange={noop}
            selection={selection}
            onSelectionChange={noop}
          />,
        );
      }

      render(
        <LevelsRail gameState={gs} onChange={noop} activeLevelId={levelId} onSelect={noop} />,
      );
      render(
        <SpritePalette
          gameState={gs}
          onChange={noop}
          activeLevelId={levelId}
          onSelectSprite={noop}
        />,
      );
      render(<GameStage gameState={gs} zoom={0.56} mode="edit" activeLevelId={levelId} />);
      // Play mode boots the runtime loop (runGame's rAF tick), which runs
      // the visual-block interpreter (block-interp.js, #1007) — a path the
      // edit-mode mount doesn't exercise. Guards the sibling JS runtime
      // files against the same use-before-declaration class of bug.
      render(<GameStage gameState={gs} zoom={0.56} mode="play" activeLevelId={levelId} />);

      expect(gs.levels.length).toBeGreaterThan(0);
    });
  }
});
