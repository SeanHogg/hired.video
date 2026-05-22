/**
 * GameInspectorPlaceholder — right-rail content for `mediaKind: "game"`
 * projects in the editor. Surfaces the read-only summary the user can
 * verify (canvas dimensions, engine, level + sprite counts) and links
 * out to the Phase 2b gap (#939) for the full sprite-placement +
 * behavior-chip editor that hasn't shipped yet.
 *
 * Parallel to `<PropertiesPanel>` for Timeline-runtime projects — the
 * editor dispatches to one or the other based on
 * `mediaKindUsesCanvasStateAuthoring(currentMediaKind)` (#936). Lives
 * in its own file so future game-kind editor surfaces (a dedicated
 * "Game settings" sheet on the chooser card, a SuperAdmin inspector)
 * can reuse it without copy-paste.
 *
 * No interactive controls today — sprite placement, level reordering,
 * behavior editing all land in #939. The component is the placeholder
 * affordance that tells the user "yes, this is a game, and here's what
 * we know about it" so the right rail isn't empty and misleading.
 */
import { Gamepad2, ExternalLink } from "lucide-react";
import type { GameState } from "@shared/game-state";

interface Props {
  gameState: GameState | null;
}

export default function GameInspectorPlaceholder({ gameState }: Props) {
  if (!gameState) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
        <Gamepad2 className="h-8 w-8 text-fuchsia-500" />
        <p className="font-medium text-foreground">No game state yet</p>
        <p className="text-xs">Pick a game template to seed your first level.</p>
      </div>
    );
  }
  const totalSprites = gameState.levels.reduce((n, l) => n + l.sprites.length, 0);
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
      <header className="flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-fuchsia-500" />
        <h3 className="font-semibold">Game</h3>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field label="Canvas">
          {gameState.width} × {gameState.height}
        </Field>
        <Field label="FPS">{gameState.fps}</Field>
        <Field label="Engine">{gameState.engine}</Field>
        <Field label="Schema">v{gameState.schemaVersion}</Field>
        <Field label="Levels">{gameState.levels.length}</Field>
        <Field label="Sprites">{totalSprites}</Field>
        <Field label="Assets">{gameState.assets.length}</Field>
        <Field label="Start level">
          <span className="font-mono text-[10px]">{gameState.startLevelId}</span>
        </Field>
      </dl>

      <section className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <p className="mb-1 font-medium text-foreground">How to edit</p>
        <p className="text-muted-foreground">
          Sprite placement, level reordering, and behavior editing land in the
          Phase 2 upgrade. Today you can <strong>Playtest</strong> the game,
          <strong> Save</strong> the draft, and <strong>Export</strong> a
          self-contained HTML5 ZIP from the Save menu.
        </p>
        <a
          href="https://github.com/anthropics/claude-code/issues"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-fuchsia-600 hover:underline"
        >
          Roadmap #939
          <ExternalLink className="h-3 w-3" />
        </a>
      </section>

      <section className="rounded-md border border-border px-3 py-2 text-xs">
        <p className="mb-1 font-medium text-foreground">Levels</p>
        <ul className="space-y-1 text-muted-foreground">
          {gameState.levels.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                {l.label}
                {l.id === gameState.startLevelId && (
                  <span className="ml-1 text-[10px] uppercase tracking-widest text-emerald-600">start</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-[10px]">
                {l.sprites.length} {l.sprites.length === 1 ? "sprite" : "sprites"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </>
  );
}
