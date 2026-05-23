/**
 * GameStateThumbnail — small game-shaped preview rendered from a
 * project's `GameState`. Used by `VideoProjectThumbnail` for game-kind
 * projects so the "My videos" grid tile reads as a GAME and not an
 * audio waveform (the prior placeholder).
 *
 * Renders the start level's `backgroundColor` + each sprite as a small
 * positioned rectangle, scaled into the thumbnail aspect. The result
 * captures the layout of the user's specific game — an endless runner
 * shows a player sprite + scrolling obstacles + ground, a quiz game
 * shows the question + 4 answer rects, a memory match shows the card
 * grid — derived from data, not bespoke per-template JSX.
 *
 * Per the DRY rule, this is the SINGLE component that previews a game
 * project at thumbnail scale. The template-card catalog thumbnails
 * (`TemplateThumb`'s game branches) keep their bespoke JSX because
 * they need richer marketing copy ("SCORE 0", "30 SEC", question
 * text). The project tile uses state-driven preview which faithfully
 * represents what the user has actually built.
 */

import type { GameState } from "@shared/game-state";

interface GameStateThumbnailProps {
  /** May be null when the project row pre-dates the gameState column,
   *  or when the editor hasn't completed first save yet. We render a
   *  best-effort placeholder in that case. */
  gameState: GameState | null;
  className?: string;
}

const FALLBACK_BACKGROUND = "#1e293b";

export default function GameStateThumbnail({
  gameState,
  className,
}: GameStateThumbnailProps) {
  // Pick the start level (or first level as fallback) and render its
  // backdrop + sprite positions. When no level exists yet we still
  // paint the kind-palette gradient so the tile reads as "game" rather
  // than a blank rectangle.
  const startLevel = gameState
    ? (gameState.levels.find((l) => l.id === gameState.startLevelId) ?? gameState.levels[0])
    : null;
  const backgroundColor = startLevel?.backgroundColor ?? FALLBACK_BACKGROUND;
  const width = gameState?.width ?? 1280;
  const height = gameState?.height ?? 720;

  return (
    <div
      className={className ?? "absolute inset-0 overflow-hidden"}
      style={{ backgroundColor }}
    >
      {/* Subtle floor line — gives the tile a "game world" read even
          for tiny / mostly-empty levels (the platformer's ground, the
          quiz's separator). 12% from the bottom is the sweet spot for
          both endless-runner ground + quiz-card baseline. */}
      <div
        className="absolute inset-x-0 h-px"
        style={{
          bottom: "12%",
          backgroundColor: "rgba(255,255,255,0.18)",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {startLevel?.sprites.map((sprite) => (
          <rect
            key={sprite.id}
            x={sprite.x}
            y={sprite.y}
            width={Math.max(8, sprite.width)}
            height={Math.max(8, sprite.height)}
            rx={4}
            fill="#fde68a"
            stroke="#1f2937"
            strokeWidth={Math.max(1, width / 280)}
            opacity={0.92}
          />
        ))}
      </svg>
      {/* "GAME" stamp — tiny corner chip in the same fuchsia the
          MediaKindBadge uses, so the tile reads as "game" even when
          the level is empty (no sprites yet). Self-contained — no
          MediaKindBadge mount because that one self-gates by kind
          and the tile already knows it's a game. */}
      <div className="absolute bottom-1 right-1 rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest text-white shadow-sm">
        Game
      </div>
    </div>
  );
}
