/**
 * The game format's surface (#939, 3D worlds per
 * [[project_3d_world_game_studio]]): Levels + Sprites tabs, the AI sprite
 * generator (or the 3D world agent), the game / 3D properties inspector with
 * challenges, and header Playtest. The canvas is in ./game-canvas.
 */
import { Gamepad2, Map as MapIcon } from "lucide-react";
import LevelsRail from "@/components/studio/game/LevelsRail";
import SpritePalette from "@/components/studio/game/SpritePalette";
import GamePropertiesPanel from "@/components/studio/game/GamePropertiesPanel";
import EntityPaletteLeft from "@/components/studio/game/world-3d/EntityPaletteLeft";
import Game3DPropertiesPanel from "@/components/studio/game/world-3d/Game3DPropertiesPanel";
import ChallengesPanel from "@/components/studio/game/world-3d/ChallengesPanel";
import AIAgentPanel from "@/components/studio/game/world-3d/AIAgentPanel";
import MediaAiPromptPanel from "@/components/studio/ai/MediaAiPromptPanel";
import { savedProjectIdFromRoute } from "@/lib/studio/editor-v2/use-studio-project-lifecycle";
import type { GameSurfaceCtx, StudioFormatSurface } from "../types";
import { sceneImageGenerator } from "../shared";

export const gameSurface: StudioFormatSurface<GameSurfaceCtx> = {
  leftTabs: (ctx) => {
    const { t } = ctx;
    const { gameState, setGameState, activeLevelId, setGameSelection } = ctx.game;
    if (!gameState) return [];
    return [
      {
        id: "scenes",
        label: t("studio.editor.panelLevels"),
        icon: MapIcon,
        content: (
          <LevelsRail
            gameState={gameState}
            onChange={setGameState}
            activeLevelId={activeLevelId}
            onSelect={(levelId) => setGameSelection({ kind: "level", levelId })}
          />
        ),
      },
      {
        id: "widgets",
        label: t("studio.editor.sectionSprites"),
        icon: Gamepad2,
        content: (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* 3D worlds get primitive shapes above the shared sprite library. */}
            {gameState.engine === "world-3d" && (
              <>
                <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("studio.editor.sectionPieces")}
                </div>
                <div className="max-h-[40%] min-h-0 overflow-y-auto border-b border-border">
                  <EntityPaletteLeft />
                </div>
              </>
            )}
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {gameState.engine === "world-3d"
                ? t("studio.editor.sectionSpritesAssets")
                : t("studio.editor.sectionSprites")}
            </div>
            <div className="min-h-0 flex-1">
              <SpritePalette
                gameState={gameState}
                onChange={setGameState}
                activeLevelId={activeLevelId}
                onSelectSprite={(spriteId) => {
                  if (spriteId && activeLevelId) {
                    setGameSelection({ kind: "sprite", levelId: activeLevelId, spriteId });
                  }
                }}
              />
            </div>
          </div>
        ),
      },
    ];
  },
  aiGenerator: (ctx) => {
    const { gameState, setGameState, handleGameAiGenerated } = ctx.game;
    if (!gameState) return sceneImageGenerator(ctx);
    return gameState.engine === "world-3d" ? (
      <AIAgentPanel projectId={savedProjectIdFromRoute(ctx.routeProjectId)} onApplyState={setGameState} />
    ) : (
      <MediaAiPromptPanel
        kindNoun="sprite"
        placeholder={ctx.t("studio.editorV2.aiPromptPlaceholderSprite")}
        onGenerated={(result, prompt) => handleGameAiGenerated(result, prompt)}
      />
    );
  },
  inspector: (ctx) => {
    const { t } = ctx;
    const { gameState, setGameState, gameSelection, setGameSelection } = ctx.game;
    // Type narrowing only: format-runtime `hasInspector` already requires it.
    if (!gameState) return null;
    return {
      title: t("studio.editorV2.panelProperties"),
      content: (
        <>
          {gameState.engine === "world-3d" ? (
            <Game3DPropertiesPanel gameState={gameState} onChange={setGameState} selection={gameSelection} onSelectionChange={setGameSelection} />
          ) : (
            <GamePropertiesPanel gameState={gameState} onChange={setGameState} selection={gameSelection} onSelectionChange={setGameSelection} />
          )}
          {/* 3D worlds: the challenges editor under the properties. */}
          {gameState.engine === "world-3d" && (
            <section aria-label={t("studio.game3d.challenges")} className="border-t border-border p-3">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{t("studio.game3d.challenges")}</h3>
              <ChallengesPanel gameState={gameState} onChange={setGameState} />
            </section>
          )}
        </>
      ),
    };
  },
  preview: (ctx) => ({
    label: ctx.gamePlaying ? ctx.t("studio.editorV2.stop") : ctx.t("studio.editorV2.playtest"),
    onClick: () => ctx.setGamePlaying((p) => !p),
    pressed: ctx.gamePlaying,
  }),
};
