/**
 * Game seeds — per-template `GameState` factories for `mediaKind: "game"`
 * projects. Parallel to `frontend/lib/studio/editor-v2/template-seeds.ts`
 * (which seeds `CanvasState` for Timeline kinds).
 *
 * Each entry returns a fresh `GameState` populated with the level /
 * sprite shape the chosen game template starts from. The PRD §1.2
 * canvas-runtime extensibility model puts game on equal footing with
 * Timeline kinds — every kind gets its own seed registry, dispatched
 * by `seedTemplate(template)` in `lib/studio/template-dispatch.ts`.
 *
 * Phase 1 ships placeholder seeds (single level + a sprite or two with
 * stub behavior ids). Phase 2 (the Phaser integration, #927) wires
 * those behaviors to actual game logic.
 */

import {
  emptyGameState,
  type GameState,
} from "@shared/game-state";
import type { ContentTemplate } from "@/components/studio/templates/catalog";

export function seedGameFromTemplate(
  templateId: string | null | undefined,
): GameState {
  if (!templateId) return emptyGameState();
  const seed = GAME_SEEDS[templateId as ContentTemplate];
  if (!seed) return emptyGameState();
  return seed();
}

// ───────────────────────────────────────────────────────────────────────────
// Per-template seeds. Each returns a fresh GameState; placeholder sprite
// `assetId` values reference assets the user will replace (mirrors how
// Timeline templates ship with placeholder text the user edits).
// ───────────────────────────────────────────────────────────────────────────

const GAME_SEEDS: Partial<Record<ContentTemplate, () => GameState>> = {
  endless_runner: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 60 });
    base.levels[0] = {
      id: "level-1",
      label: "Run!",
      backgroundColor: "#0ea5e9",
      sprites: [
        {
          id: "player",
          assetId: "placeholder:player",
          x: 120,
          y: 480,
          width: 64,
          height: 96,
          behavior: "platformer-player",
          params: { jumpPower: 600, runSpeed: 280 },
        },
        {
          id: "ground",
          assetId: "placeholder:tile-ground",
          x: 0,
          y: 600,
          width: 1280,
          height: 120,
          behavior: "static",
        },
        {
          id: "obstacle-1",
          assetId: "placeholder:obstacle",
          x: 800,
          y: 528,
          width: 48,
          height: 72,
          behavior: "scroll-left",
          params: { speed: 280 },
        },
      ],
    };
    return base;
  },

  quiz_game: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 30 });
    base.levels = [
      {
        id: "menu",
        label: "Title screen",
        backgroundColor: "#1e1b4b",
        sprites: [
          {
            id: "title",
            assetId: "placeholder:text-title",
            x: 240,
            y: 200,
            width: 800,
            height: 120,
            behavior: "static",
            params: { text: "PUB QUIZ NIGHT" },
          },
          {
            id: "start-button",
            assetId: "placeholder:button",
            x: 480,
            y: 440,
            width: 320,
            height: 80,
            behavior: "button-goto-level",
            params: { targetLevelId: "q1", label: "Start" },
          },
        ],
        nextLevelId: "q1",
      },
      {
        id: "q1",
        label: "Question 1",
        backgroundColor: "#0f172a",
        sprites: [
          {
            id: "question",
            assetId: "placeholder:text-question",
            x: 120,
            y: 120,
            width: 1040,
            height: 120,
            behavior: "static",
            params: {
              text: "Which planet has the most moons?",
            },
          },
          {
            id: "answer-a",
            assetId: "placeholder:button",
            x: 120,
            y: 320,
            width: 480,
            height: 80,
            behavior: "quiz-answer",
            params: { text: "A. Jupiter", correct: false },
          },
          {
            id: "answer-b",
            assetId: "placeholder:button",
            x: 680,
            y: 320,
            width: 480,
            height: 80,
            behavior: "quiz-answer",
            params: { text: "B. Saturn", correct: true },
          },
        ],
      },
    ];
    base.startLevelId = "menu";
    return base;
  },

  memory_match: () => {
    const base = emptyGameState({ width: 1280, height: 720, fps: 30 });
    base.levels[0] = {
      id: "board",
      label: "Memory board",
      backgroundColor: "#064e3b",
      sprites: [
        // 4×4 grid of card slots — placeholder, the Phaser integration
        // will shuffle pairs at boot.
        ...Array.from({ length: 16 }, (_, i) => ({
          id: `card-${i}`,
          assetId: "placeholder:card-back",
          x: 280 + (i % 4) * 180,
          y: 100 + Math.floor(i / 4) * 140,
          width: 140,
          height: 120,
          behavior: "memory-card",
          params: { pairId: Math.floor(i / 2) },
        })),
      ],
    };
    return base;
  },
};
