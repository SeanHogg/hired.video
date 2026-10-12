/**
 * The game format's runtime (#939): GameState, the editor selection
 * (canvas / level / sprite) with the derived active level + sprite, and the
 * AI-sprite insert. Lifted out of StudioEditorV2 so the editor composes
 * runtimes instead of owning them.
 */
import { useCallback, useState } from "react";
import type { GameState } from "@shared/game-state";
import type { GameSelection } from "@/lib/studio/game/game-selection";
import {
  addCustomSpriteAsset as gameAddCustomSpriteAsset,
  addSprite as gameAddSprite,
  updateSprite as gameUpdateSprite,
} from "@/lib/studio/game/game-state-edit";
import { findStartLevel } from "@/lib/studio/game/runtime";
import type { ImageGenResult } from "@/lib/services/image-gen-engine";
import { persistGeneratedImage } from "@/lib/studio/media-persistence";

export function useGameRuntime() {
  // Game-runtime state for `mediaKind: "game"` projects (#939 Phase 2b).
  // Same shape as `imageState` — local state hydrated from
  // `persistedProject.gameState`, edited via the shared shell (LevelsRail /
  // mirrored back through `handleSave`. Null for non-game projects (and
  // for game projects whose template seed hasn't reached the editor yet
  // on a brand-new draft). Per PRD §1.2 each canvas runtime owns its
  // own state model.
  const [gameState, setGameState] = useState<GameState | null>(null);
  // Game editor selection — `GameSelection` discriminated union:
  //   - { kind: "canvas" } → game settings panel
  //   - { kind: "level", levelId } → level inspector
  //   - { kind: "sprite", levelId, spriteId } → sprite inspector
  // Lifted to the editor shell so the canvas, levels rail, sprite
  // palette, and right-rail properties panel all read the same source.
  // Parallel to the Timeline editor's `Selection` model; the two
  // never co-exist because at most one runtime is mounted per
  // project. `activeLevelId` is derived from selection for runtime
  // convenience (the canvas needs a level id to render).
  const [gameSelection, setGameSelection] = useState<GameSelection>({ kind: "canvas" });
  const activeLevelId =
    gameSelection.kind === "level" || gameSelection.kind === "sprite"
      ? gameSelection.levelId
      : null;
  const selectedSpriteId =
    gameSelection.kind === "sprite" ? gameSelection.spriteId : null;

  // Game-kind AI-result handler — registers the generated PNG as a new
  // custom sprite asset and mints a fresh sprite on the active level.
  // Asset URL is the durable R2 CDN URL the route already persists, so
  // the runtime preloads it the same way it preloads user-uploaded
  // sprites. Per the cross-studio first-class AI rollout: game kind
  // gets the same prompt UX as drawing — type a prompt, get a sprite.
  const handleGameAiGenerated = useCallback(
    async (result: ImageGenResult, prompt: string) => {
      if (!gameState) return;
      // Asset URL — the server engine's R2 path, or the WebGPU engine's
      // blob uploaded first. Never a blob: URL, so the sprite survives a
      // reload (#563); a failed upload throws and the prompt shows it.
      const url = await persistGeneratedImage(result);
      const levelId = activeLevelId ?? findStartLevel(gameState)?.id;
      if (!levelId) return;
      const assetId = `ai-${Math.random().toString(36).slice(2, 10)}`;
      let next = gameAddCustomSpriteAsset(gameState, { id: assetId, url });
      const added = gameAddSprite(next, levelId, { behavior: null, assetId });
      // Stamp the assetId onto the sprite — addSprite's opts only carry
      // it as a hint, the sprite's `assetId` field is the SoT for the
      // runtime. updateSprite is the canonical mutator.
      next = gameUpdateSprite(added.state, levelId, added.sprite.id, { assetId });
      void prompt;
      setGameState(next);
      setGameSelection({ kind: "sprite", levelId, spriteId: added.sprite.id });
    },
    [gameState, activeLevelId],
  );

  return {
    gameState,
    setGameState,
    gameSelection,
    setGameSelection,
    activeLevelId,
    selectedSpriteId,
    handleGameAiGenerated,
  };
}
